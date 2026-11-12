import { expect, type Locator, type Page } from '@playwright/test';
import { pickChoiceButton, pickFrom } from './select';

// The steps the form journeys share: the builder's own questions, its save and publish, and the
// applicant's picks on the public page.

/** A date as the date field takes it (ddmmyyyy), some days from today. */
export function dayFromToday(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`;
}
export const digits = (n: number) =>
  Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

/** The Bengali and the English text of the chosen question, in the settings pane. */
export const questionTexts = (page: Page) => ({
  bn: page.getByRole('textbox', { name: /^লেবেল \(বাংলা\)/ }),
  en: page.getByRole('textbox', { name: /^লেবেল \(ইংরেজি\)/ }),
});

/**
 * A question of the project's own: its section chosen on the canvas, its type on the left. The
 * question is there at once, empty, with the cursor in its Bengali text; its texts and, for a
 * choice, its options are written in the settings pane.
 */
export async function ownQuestion(
  page: Page,
  sectionTitle: string,
  type: string,
  label: [string, string],
  options: [string, string][] = [],
) {
  await page.getByRole('button', { name: sectionTitle, exact: true }).click();
  await page.getByRole('tab', { name: 'প্রশ্ন যোগ' }).click();
  await page.getByRole('button', { name: `${type} প্রশ্ন যোগ করুন`, exact: true }).click();
  // no dialog: the settings pane shows the new question, ready to be typed
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const texts = questionTexts(page);
  await expect(texts.bn).toBeFocused();
  await expect(texts.bn).toHaveValue('');
  await texts.bn.fill(label[0]);
  await texts.en.fill(label[1]);
  for (const [i, [bn, en]] of options.entries()) {
    await page.getByRole('button', { name: 'অপশন যোগ করুন' }).click();
    await page.getByRole('textbox', { name: new RegExp(`^অপশন ${i + 1} \\(বাংলা\\)`) }).fill(bn);
    await page.getByRole('textbox', { name: new RegExp(`^অপশন ${i + 1} \\(ইংরেজি\\)`) }).fill(en);
  }
  // the canvas names the question by its text, as the chosen one
  await expect(
    page.getByRole('button', { name: `${label[0]} বদলান`, exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
}

/** Waits until the builder has saved the draft. */
export const saved = (page: Page) =>
  expect(page.getByTestId('form-head').getByText('সংরক্ষিত', { exact: true })).toBeVisible({
    timeout: 15_000,
  });

export async function publish(page: Page, versionNo: number) {
  await saved(page);
  await page.getByRole('button', { name: 'প্রকাশ করুন', exact: true }).click();
  const confirm = page.getByRole('alertdialog', { name: `সংস্করণ ${versionNo} প্রকাশ করবেন?` });
  await expect(confirm).toContainText('আগে জমা পড়া আবেদনগুলো তাদের নিজের সংস্করণেই থাকবে।');
  await confirm.getByRole('button', { name: 'সংস্করণ প্রকাশ করুন' }).click();
  await expect(confirm).toHaveCount(0);
}

/** The list of what to fix before publishing, opened by its button beside Publish. */
export async function openFixList(page: Page, count: number) {
  await page.getByRole('button', { name: `প্রকাশের আগে ঠিক করুন (${count})`, exact: true }).click();
  const list = page.getByRole('dialog', { name: 'প্রকাশের আগে ঠিক করুন' });
  await expect(list).toBeVisible();
  return list;
}

/**
 * Waits until the page is still: the pointer away from the language switch and no colour fading,
 * so axe reads the colours the page settles on, not a frame of a transition.
 */
export async function settled(page: Page) {
  await page.mouse.move(0, 0);
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
}

/**
 * Picks the first choice of a select, or the named one, on the applicant's page: an earlier select
 * is a button, an asf one (the address) a combobox; on a phone a short choice is a row of buttons.
 */
export async function pick(page: Page, scope: Locator, label: RegExp, option?: string) {
  const group = scope.getByRole('radiogroup', { name: label });
  if (await group.count()) {
    const button = option
      ? group.getByRole('radio', { name: option, exact: true })
      : group.getByRole('radio').first();
    await button.click();
    await expect(button).toHaveAttribute('aria-checked', 'true');
    return;
  }
  await pickFrom(
    page,
    scope.getByRole('button', { name: label }).or(scope.getByRole('combobox', { name: label })),
    option,
  );
}

/**
 * Picks an option of the renderer's select by its label: an earlier select is a button named by
 * its value, then the label; an asf one (the address) a combobox named by the label; on a phone a
 * short choice is a row of buttons.
 */
export async function pickByLabel(page: Page, label: string, option: string) {
  if (await pickChoiceButton(page, label, option)) return;
  await pickFrom(
    page,
    page
      .getByRole('button', { name: new RegExp(`\\s${label}( \\(আবশ্যক\\))?$`) })
      .or(page.getByRole('combobox', { name: new RegExp(`^${label}`) })),
    option,
  );
}

/** Sends the application to the office: on a phone through the check of the answers first. */
export async function sendToOffice(page: Page) {
  const send = page.getByRole('button', { name: 'অফিসে পাঠান' });
  if (!(await send.isVisible())) {
    await page.getByRole('button', { name: 'পরের অংশ' }).click();
    await expect(page.getByText('পাঠানোর আগে দেখে নিন')).toBeVisible();
  }
  await send.click();
}
