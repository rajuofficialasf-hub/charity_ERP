import { expect, type Locator, type Page, test } from '@playwright/test';
import { scan, signIn, switchLanguage } from './support/admin';
import {
  chooseIn,
  code,
  finishSetup,
  newDraft,
  projectIdOf,
  section,
  UCD,
} from './support/projects';

// The form builder's journey against the demo seed (docs/testing/DEMO_ACCOUNTS.md): a PM builds
// a project's form from the library with questions of the project's own, a condition and a
// calculation, publishes it and switches the public link on; an applicant sends it on a phone;
// the PM publishes version 2, which the same link then opens. That the entry stays on version 1
// is proven by the API test of the public forms, since no screen reads an entry yet.
const PM = 'pm.ucd@example.org';

// a step that cannot happen fails on its own line instead of at the end of the journey
test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });
const TEMPLATE = 'বিতরণভিত্তিক আবেদন ফর্ম (কুরবানী, ইফতার, শীতবস্ত্র)';

/** A date as the date field takes it (ddmmyyyy), some days from today. */
function dayFromToday(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`;
}
const digits = (n: number) =>
  Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

/** A question of the project's own, added to a section through its settings. */
async function ownQuestion(
  page: Page,
  sectionTitle: string,
  type: string,
  label: [string, string],
  options: [string, string][] = [],
) {
  await page.getByRole('button', { name: `${sectionTitle} বদলান`, exact: true }).click();
  await page.getByRole('button', { name: 'নিজের প্রশ্ন যোগ করুন' }).click();
  const dialog = page.getByRole('dialog', { name: 'নতুন প্রশ্ন' });
  // the type list is long and still settling as it opens, so a pick that lands too early is
  // made again until the list closes with that type
  const typeSelect = dialog.getByRole('button', { name: /\sপ্রশ্নের ধরন \(আবশ্যক\)$/ });
  await expect(async () => {
    if ((await page.getByRole('listbox').count()) === 0) await typeSelect.click();
    await page.getByRole('listbox').getByRole('option', { name: type, exact: true }).click();
    await expect(page.getByRole('listbox')).toHaveCount(0, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await expect(typeSelect).toHaveAccessibleName(new RegExp(`^${type}\\s`));
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
const saved = (page: Page) =>
  expect(page.locator('.admin-title-row').getByText('সংরক্ষিত', { exact: true })).toBeVisible({
    timeout: 15_000,
  });

async function publish(page: Page, versionNo: number) {
  await saved(page);
  await page.getByRole('button', { name: 'প্রকাশ করুন', exact: true }).click();
  const confirm = page.getByRole('alertdialog', { name: `সংস্করণ ${versionNo} প্রকাশ করবেন?` });
  await expect(confirm).toContainText('আগে জমা পড়া আবেদনগুলো তাদের নিজের সংস্করণেই থাকবে।');
  await confirm.getByRole('button', { name: 'সংস্করণ প্রকাশ করুন' }).click();
  await expect(confirm).toHaveCount(0);
  return confirm;
}

/** Picks the first choice of a select, or the named one, on the applicant's page. */
async function pick(page: Page, scope: Locator, label: RegExp, option?: string) {
  await scope.getByRole('button', { name: label }).click();
  const list = page.getByRole('listbox');
  await (
    option
      ? list.getByRole('option', { name: option, exact: true })
      : list.getByRole('option').first()
  ).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

test('a PM builds and publishes a form, an applicant sends it by the link, and version 2 follows', async ({
  page,
  browser,
}, info) => {
  test.skip(
    info.project.name !== 'desktop',
    'the PM builds on a computer; the applicant gets a phone page of its own',
  );
  test.setTimeout(300_000);
  await signIn(page, PM);
  await page.goto('/admin/projects');
  const name = `ফর্ম ${code()}`;
  await newDraft(page, code(), name, UCD);
  const projectId = projectIdOf(page);

  // the activation review leads the missing form to a new form of the project
  await page.goto(`/admin/projects/${projectId}/setup?step=review`);
  const review = section(page, 'পর্যালোচনা');
  await expect(review.getByText('প্রকাশিত আবেদন ফর্ম')).toBeVisible();
  await review.getByRole('link', { name: 'ফর্ম বিল্ডার খুলুন' }).click();
  const create = page.getByRole('dialog', { name: 'নতুন আবেদন ফর্ম' });
  await create.getByRole('textbox', { name: /ফর্মের নাম \(বাংলা\)/ }).fill('আবেদন');
  await create.getByRole('textbox', { name: /ফর্মের নাম \(ইংরেজি\)/ }).fill('Application');
  await chooseIn(page, create, 'টেমপ্লেট', TEMPLATE);
  await create.getByRole('button', { name: 'তৈরি করুন' }).click();
  await expect(page).toHaveURL(/\/forms\/[0-9a-f-]{36}$/);
  const builderUrl = page.url();
  await expect(page.locator('.admin-title-row').getByText('সংস্করণ 1: খসড়া')).toBeVisible();

  // a library section, two numbers of the project's own with their total, and a question shown
  // only when the first number is above zero
  // the set's checkbox input is visually hidden behind its box
  await page.getByRole('checkbox', { name: 'আর্থিক অবস্থা' }).check({ force: true });
  await expect(page.getByRole('list', { name: 'আর্থিক অবস্থা' })).toBeVisible();
  await ownQuestion(page, 'আর্থিক অবস্থা', 'সংখ্যা', ['পুরুষ সদস্য', 'Male members']);
  await ownQuestion(page, 'আর্থিক অবস্থা', 'সংখ্যা', ['নারী সদস্য', 'Female members']);
  await ownQuestion(page, 'আর্থিক অবস্থা', 'হিসাব', ['মোট সদস্য', 'All members']);
  const calc = section(page, 'হিসাবের নিয়ম');
  await calc.getByRole('button', { name: 'পদ যোগ করুন' }).click();
  await calc.getByRole('button', { name: 'পদ যোগ করুন' }).click();
  await chooseIn(page, calc, 'পদ 1', 'পুরুষ সদস্য');
  await chooseIn(page, calc, 'পদ 2', 'নারী সদস্য');
  await ownQuestion(
    page,
    'আর্থিক অবস্থা',
    'একটি বেছে নিন',
    ['আপনার কি নিজের ঘর আছে?', 'Do you own a house?'],
    [
      ['হ্যাঁ', 'Yes'],
      ['না', 'No'],
    ],
  );
  const show = section(page, 'কখন দেখাবে');
  await show.getByRole('button', { name: 'শর্ত যোগ করুন' }).click();
  await chooseIn(page, show, 'শর্ত 1: প্রশ্ন', 'পুরুষ সদস্য');
  await chooseIn(page, show, 'শর্ত 1: তুলনা', 'বেশি');
  await show.getByRole('textbox', { name: 'শর্ত 1: মান' }).fill('0');

  await publish(page, 1);
  const versions = section(page, 'সংস্করণগুলো');
  await expect(versions.getByText('সংস্করণ 1: প্রকাশিত')).toBeVisible();

  // the public link, switched on with this form
  const link = section(page, 'পাবলিক আবেদনের লিংক');
  // the switch's input is visually hidden behind its track, like the checkbox's
  await link
    .getByRole('switch', { name: 'এই ফর্মের জন্য পাবলিক লিংক চালু' })
    .click({ force: true });
  // it shows as on once the server has issued the link
  await expect(link.getByText('লিংক চালু; এই ফর্মটি খোলে।')).toBeVisible();
  const url = await link.getByRole('textbox', { name: 'আবেদনের লিংক' }).inputValue();
  expect(url).toMatch(/\/apply\/[A-Za-z0-9_-]{20,}$/);

  // the rest of the setup, with a window open from yesterday, then the activation
  await page.goto(`/admin/projects/${projectId}/setup?step=components`);
  await finishSetup(page, { from: dayFromToday(-1), to: dayFromToday(60) });

  // the applicant, signed out, on a phone
  const phone = await browser.newContext({ viewport: { width: 360, height: 640 } });
  try {
    const applicant = await phone.newPage();
    await applicant.goto(new URL(url).pathname);
    await expect(applicant.getByRole('heading', { level: 1, name })).toBeVisible();
    // the open form passes axe in both languages on the phone; each scan waits for the page to
    // show its language, so the switch is not caught between its two colours
    expect((await scan(applicant)).violations, 'the public form (bn)').toEqual([]);
    await switchLanguage(applicant, 'en');
    await expect(applicant.getByRole('heading', { level: 1, name: `${name} EN` })).toBeVisible();
    expect((await scan(applicant)).violations, 'the public form (en)').toEqual([]);
    await switchLanguage(applicant, 'bn');
    await expect(applicant.getByRole('heading', { level: 1, name })).toBeVisible();
    const form = applicant.locator('main');
    await form.getByRole('textbox', { name: /জাতীয় পরিচয়পত্র/ }).fill(`1${digits(9)}`);
    await form.getByRole('textbox', { name: /মোবাইল/ }).fill(`017${digits(8)}`);
    await form.getByRole('textbox', { name: /^উপকারভোগীর নাম/ }).fill('নমুনা আবেদনকারী');
    await form.getByRole('textbox', { name: /^পিতা\/স্বামীর নাম/ }).fill('নমুনা পিতা');
    await pick(applicant, form, /(^|\s)লিঙ্গ/);
    // the parts come one per screen on a phone: next until the own questions show
    const nextPart = form.getByRole('button', { name: 'পরের অংশ' });
    const male = form.getByRole('textbox', { name: /পুরুষ সদস্য/ });
    for (let i = 0; i < 12 && !(await male.isVisible()); i += 1) {
      if (await form.getByRole('button', { name: /(^|\s)বিভাগ/ }).isVisible()) {
        await pick(applicant, form, /(^|\s)বিভাগ/, 'ঢাকা');
        await pick(applicant, form, /(^|\s)জেলা/, 'ঢাকা');
        await pick(applicant, form, /(^|\s)উপজেলা/, 'সাভার');
        await pick(applicant, form, /(^|\s)ইউনিয়ন/, 'সাভার');
        await form.getByRole('textbox', { name: /গ্রাম/ }).first().fill('নমুনা গ্রাম');
      }
      await nextPart.click();
    }
    await male.fill('2');
    await form.getByRole('textbox', { name: /নারী সদস্য/ }).fill('1');
    await expect(form.getByRole('textbox', { name: /মোট সদস্য/ })).toHaveValue('3');
    // shown because the first number is above zero
    await form
      .getByRole('radiogroup', { name: 'আপনার কি নিজের ঘর আছে?' })
      .getByText('হ্যাঁ', { exact: true })
      .click();
    const send = form.getByRole('button', { name: 'আবেদন জমা দিন' });
    for (let i = 0; i < 12 && !(await send.isVisible()); i += 1) await nextPart.click();
    await send.click();
    await expect(applicant.getByRole('heading', { name: 'আবেদন জমা হয়েছে' })).toBeVisible();
    // no horizontal scrolling at 360 px
    expect(
      await applicant.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(360);

    // version 2: one option changes, the summary names it, and the link opens it
    await page.goto(builderUrl);
    await page.getByRole('button', { name: 'নতুন সংস্করণ তৈরি করুন' }).click();
    await expect(page.locator('.admin-title-row').getByText('সংস্করণ 2: খসড়া')).toBeVisible();
    await page.getByRole('button', { name: 'আপনার কি নিজের ঘর আছে? বদলান' }).click();
    await page.getByRole('textbox', { name: /^অপশন 2 \(বাংলা\)/ }).fill('না, ভাড়া থাকি');
    await publish(page, 2);
    await expect(versions.getByText('সংস্করণ 2: প্রকাশিত')).toBeVisible();
    await expect(versions.getByText(/প্রশ্নে বদল: আপনার কি নিজের ঘর আছে\? \(অপশন\)/)).toBeVisible();
    await expect(versions.getByText('সংস্করণ 1: পুরোনো')).toBeVisible();
    const token = new URL(url).pathname.split('/').at(-1)!;
    const opened = await applicant.request.get(`/api/v1/public/forms/${token}`);
    expect(opened.ok()).toBe(true);
    expect(
      ((await opened.json()) as { data: { form: { versionNo: number } } }).data.form.versionNo,
    ).toBe(2);
  } finally {
    await phone.close();
  }
});
