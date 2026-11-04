import { expect, type Locator, type Page } from '@playwright/test';

// The steps the form journeys share: the builder's own questions, its save and publish, and the
// applicant's picks on the public page.

/** A date as the date field takes it (ddmmyyyy), some days from today. */
export function dayFromToday(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`;
}
export const digits = (n: number) =>
  Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

/** A question of the project's own: its section chosen on the canvas, its type on the left. */
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
  const dialog = page.getByRole('dialog', { name: 'নতুন প্রশ্ন' });
  await expect(dialog.getByRole('textbox', { name: /^প্রশ্নের ধরন/ })).toHaveValue(type);
  await dialog.getByRole('textbox', { name: /^লেবেল \(বাংলা\)/ }).fill(label[0]);
  await dialog.getByRole('textbox', { name: /^লেবেল \(ইংরেজি\)/ }).fill(label[1]);
  for (const [i, [bn, en]] of options.entries()) {
    if (i > 0) await dialog.getByRole('button', { name: 'অপশন যোগ করুন' }).click();
    await dialog.getByRole('textbox', { name: new RegExp(`^অপশন ${i + 1} \\(বাংলা\\)`) }).fill(bn);
    await dialog.getByRole('textbox', { name: new RegExp(`^অপশন ${i + 1} \\(ইংরেজি\\)`) }).fill(en);
  }
  await dialog.getByRole('button', { name: 'প্রশ্ন যোগ করুন' }).click();
  await expect(dialog).toHaveCount(0);
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

/** Asks to publish, confirms, and expects the refusal to keep the draft open. */
export async function publishRefused(page: Page) {
  await saved(page);
  await page.getByRole('button', { name: 'প্রকাশ করুন', exact: true }).click();
  await page.getByRole('button', { name: 'সংস্করণ প্রকাশ করুন' }).click();
  await expect(page.getByTestId('form-head').getByText('সংস্করণ 1: খসড়া')).toBeVisible();
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
 * is a button, an asf one (the address) a combobox.
 */
export async function pick(page: Page, scope: Locator, label: RegExp, option?: string) {
  await scope
    .getByRole('button', { name: label })
    .or(scope.getByRole('combobox', { name: label }))
    .click();
  const list = page.getByRole('listbox');
  await (
    option
      ? list.getByRole('option', { name: option, exact: true })
      : list.getByRole('option').first()
  ).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}
