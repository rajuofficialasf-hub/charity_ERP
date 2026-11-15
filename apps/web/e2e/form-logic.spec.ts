import { devices, expect, type Locator, type Page, test } from '@playwright/test';
import { scan, signIn, switchLanguage } from './support/admin';
import { demoReadyForm } from './support/demo-form';
import { dayFromToday, digits, ownQuestion, pick, publish, settled } from './support/forms';
import {
  chooseIn,
  code,
  finishSetup,
  newDraft,
  projectIdOf,
  section,
  UCD,
} from './support/projects';

// The self-reliance demo form against the demo seed (docs/testing/DEMO_ACCOUNTS.md): its body
// comes through the API; the Monitoring Team adds on the screen a price chosen by a condition, a
// total typed as a formula, a number table and family rows that follow a count, and publishes it;
// the PM places it on a project and switches the public link on; an applicant fills it on a phone
// and sees each piece of logic answer.
const MONITORING = 'monitoring@example.org';
const PM = 'pm.ucd@example.org';

// a step that cannot happen fails on its own line instead of at the end of the journey
test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

/** Opens the calculation dialog of a calculation question on the canvas. */
async function openCalculation(page: Page, label: string): Promise<Locator> {
  await page.getByRole('button', { name: `${label} বদলান`, exact: true }).click();
  await page.getByRole('button', { name: 'হিসাবের নিয়ম দিন' }).click();
  return page.getByRole('dialog', { name: 'হিসাবের নিয়ম' });
}

/** Names one row or column of the number table in both languages. */
async function nameLine(page: Page, line: string, bn: string, en: string) {
  const main = page.locator('main');
  await main.getByRole('textbox', { name: `${line}: বাংলা`, exact: true }).fill(bn);
  await main.getByRole('textbox', { name: `${line}: English`, exact: true }).fill(en);
}

/** Today in Dhaka, the day the form fills in, as the date field shows it. */
function todayShown(): string {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' })
    .format(new Date())
    .split('-');
  return `${d}-${m}-${y}`;
}

test('the demo form: a price by condition, a typed formula, a number table and counted rows, filled on a phone', async ({
  page,
  browser,
}, info) => {
  test.skip(
    info.project.name !== 'desktop',
    'the builders work on a computer; the applicant gets a phone page of its own',
  );
  test.setTimeout(420_000);

  // the Monitoring Team: the demo's body in a new ready form, opened in the builder
  await signIn(page, MONITORING);
  const title = `স্বাবলম্বী ডেমো ${code()}`;
  const formId = await demoReadyForm(page, MONITORING, title);
  await page.goto(`/admin/ready-forms/${formId}`);
  await expect(page.getByTestId('form-head').getByText('সংস্করণ 1: খসড়া')).toBeVisible();

  // the price of one ana of gold: 14883 when the karat is 22, else 0
  let calc = await openCalculation(page, 'প্রতি আনার দাম');
  await chooseIn(page, calc, 'হিসাব: ধরন', 'যদি … তবে');
  const branch = calc.getByRole('region', { name: 'শর্ত 1', exact: true });
  await chooseIn(page, branch, 'শর্ত 1: কোন প্রশ্নের উত্তর', 'সোনার ক্যারেট');
  await chooseIn(page, branch, 'শর্ত 1: উত্তরটি কেমন হলে', 'সমান');
  await chooseIn(page, branch, 'শর্ত 1: কোন উত্তরের সঙ্গে তুলনা', '22 ক্যারেট');
  await calc.getByRole('textbox', { name: 'তবে 1: সংখ্যা' }).fill('14883');
  await calc.getByRole('button', { name: 'ঠিক আছে' }).click();
  await expect(
    page.getByText(/^প্রতি আনার দাম = যদি “সোনার ক্যারেট”.*14883, নইলে 0$/),
  ).toBeVisible();

  // the total assets, typed as a formula with the questions' names
  calc = await openCalculation(page, 'মোট সম্পদ');
  // the radio's input is visually hidden; its text chooses it
  await calc.getByText('সূত্র লিখুন', { exact: true }).click();
  await calc.getByRole('textbox', { name: /^সূত্র/ }).fill('q_gold_anas * q_gold_price + q_cash');
  await calc.getByRole('button', { name: 'ঠিক আছে' }).click();
  await expect(page.getByText(/^মোট সম্পদ = .*“সোনার পরিমাণ \(আনা\)”/)).toBeVisible();

  // the livestock table: cows and goats, own and sharecropped
  await ownQuestion(page, 'খামার', 'সংখ্যার ছক', ['গবাদি পশু', 'Livestock']);
  await nameLine(page, 'সারি 1', 'গরু', 'Cows');
  await page.locator('main').getByRole('button', { name: 'সারি যোগ করুন' }).click();
  await nameLine(page, 'সারি 2', 'ছাগল', 'Goats');
  await nameLine(page, 'কলাম 1', 'নিজের', 'Own');
  await page.locator('main').getByRole('button', { name: 'কলাম যোগ করুন' }).click();
  await nameLine(page, 'কলাম 2', 'বর্গা', 'Sharecropped');

  // the family's rows follow the number of members
  // the group's row holds its members' rows, which cover the middle of its own button; the
  // keyboard chooses it as a person using the keyboard would
  await page.getByRole('button', { name: 'পরিবারের সদস্য বদলান', exact: true }).focus();
  await page.keyboard.press('Enter');
  await chooseIn(
    page,
    page.locator('main'),
    'সারির সংখ্যা যে প্রশ্ন থেকে',
    'পরিবারের সদস্য সংখ্যা',
  );

  await publish(page, 1);
  await expect(page.getByTestId('form-head').getByText('সংস্করণ 1: প্রকাশিত')).toBeVisible();

  const desk = await browser.newContext({
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
  });
  const phone = await browser.newContext({
    ...devices['Pixel 7'],
    viewport: { width: 360, height: 640 },
  });
  try {
    // the PM places the form on a new project and switches the public link on
    const pm = await desk.newPage();
    await signIn(pm, PM);
    await pm.goto('/admin/projects');
    const name = `ডেমো ${code()}`;
    await newDraft(pm, code(), name, UCD);
    const projectId = projectIdOf(pm);
    await pm.goto(`/admin/projects/${projectId}/setup?step=review`);
    await section(pm, 'পর্যালোচনা').getByRole('link', { name: 'ফর্ম বিল্ডার খুলুন' }).click();
    const place = pm.getByRole('dialog', { name: 'তৈরি ফর্ম বসান' });
    await place.getByText(`${title} · উপকারভোগীর আবেদন · সংস্করণ 1`, { exact: true }).click();
    await place.getByRole('button', { name: 'বসান', exact: true }).click();
    await expect(pm.getByTestId('form-head').getByText('সংস্করণ 1: প্রকাশিত')).toBeVisible();
    await pm.getByRole('tab', { name: 'ফর্মের সেটিং' }).click();
    await pm.getByRole('button', { name: 'পাবলিক আবেদনের লিংক', exact: true }).click();
    const link = section(pm, 'পাবলিক আবেদনের লিংক');
    // the switch's input is visually hidden behind its track
    await link
      .getByRole('switch', { name: 'এই ফর্মের জন্য পাবলিক লিংক চালু' })
      .click({ force: true });
    await expect(link.getByText('লিংক চালু; এই ফর্মটি খোলে।')).toBeVisible();
    const url = await link.getByRole('textbox', { name: 'আবেদনের লিংক' }).inputValue();
    await pm.goto(`/admin/projects/${projectId}/setup?step=components`);
    await finishSetup(pm, { window: { from: dayFromToday(-1), to: dayFromToday(60) } });

    // the applicant, signed out, on the phone; the open form passes axe in both languages
    const applicant = await phone.newPage();
    await applicant.goto(new URL(url).pathname);
    await expect(applicant.getByRole('heading', { level: 1, name })).toBeVisible();
    await settled(applicant);
    expect((await scan(applicant)).violations, 'the demo form (bn)').toEqual([]);
    await switchLanguage(applicant, 'en');
    await expect(applicant.getByRole('heading', { level: 1, name: `${name} EN` })).toBeVisible();
    await settled(applicant);
    expect((await scan(applicant)).violations, 'the demo form (en)').toEqual([]);
    await switchLanguage(applicant, 'bn');
    await expect(applicant.getByRole('heading', { level: 1, name })).toBeVisible();
    const form = applicant.locator('main');
    const nextPart = form.getByRole('button', { name: 'পরের অংশ' });

    // the first part: who applies, today's date already in place and the number prefix fixed
    await form.getByRole('textbox', { name: /জাতীয় পরিচয়পত্র/ }).fill(`1${digits(9)}`);
    await form.getByRole('textbox', { name: /মোবাইল/ }).fill(`017${digits(8)}`);
    await form.getByRole('textbox', { name: /^উপকারভোগীর নাম/ }).fill('নমুনা আবেদনকারী');
    await form.getByRole('textbox', { name: /^পিতা\/স্বামীর নাম/ }).fill('নমুনা পিতা');
    await pick(applicant, form, /(^|\s)লিঙ্গ/);
    await pick(applicant, form, /(^|\s)বিভাগ/, 'ঢাকা');
    await pick(applicant, form, /(^|\s)জেলা/, 'ঢাকা');
    await pick(applicant, form, /(^|\s)উপজেলা/, 'সাভার');
    await pick(applicant, form, /(^|\s)ইউনিয়ন/, 'সাভার');
    await form.getByRole('textbox', { name: /^গ্রাম/ }).fill('নমুনা গ্রাম');
    await expect(form.getByRole('group', { name: /আবেদনের তারিখ/ })).toContainText(todayShown());
    const prefix = form.getByRole('textbox', { name: /আবেদন নম্বরের শুরু/ });
    await expect(prefix).toHaveValue('SRP-26-');
    await expect(prefix).not.toBeEditable();
    await nextPart.click();

    // the family: three members give three rows
    await form.getByRole('textbox', { name: /পরিবারের সদস্য সংখ্যা/ }).fill('3');
    const members = form.getByRole('textbox', { name: /সদস্যের নাম/ });
    await expect(members).toHaveCount(3);
    for (const [i, member] of ['প্রথম', 'দ্বিতীয়', 'তৃতীয়'].entries())
      await members.nth(i).fill(`${member} সদস্য`);
    await nextPart.click();

    // spending above income asks why
    const why = form.getByRole('textbox', { name: /আয়ের চেয়ে ব্যয় বেশি হওয়ার কারণ/ });
    await form.getByRole('textbox', { name: /মাসিক আয়/ }).fill('10000');
    await form.getByRole('textbox', { name: /মাসিক ব্যয়/ }).fill('9000');
    await expect(why).toHaveCount(0);
    await form.getByRole('textbox', { name: /মাসিক ব্যয়/ }).fill('12000');
    await why.fill('চিকিৎসার খরচ');
    await nextPart.click();

    // 22 karat sets the price; the total follows the formula
    await form
      .getByRole('radiogroup', { name: /সোনার ক্যারেট/ })
      .getByText('22 ক্যারেট', { exact: true })
      .click();
    await expect(form.getByRole('textbox', { name: /প্রতি আনার দাম/ })).toHaveValue('14,883');
    await form.getByRole('textbox', { name: /সোনার পরিমাণ/ }).fill('2');
    await form.getByRole('textbox', { name: /নগদ টাকা/ }).fill('5000');
    await expect(form.getByRole('textbox', { name: /মোট সম্পদ/ })).toHaveValue('৳ 34,766');
    await nextPart.click();

    // the count question names the animal chosen before it
    await form
      .getByRole('radiogroup', { name: /কী পালন করতে চান/ })
      .getByText('গরু', { exact: true })
      .click();
    await form.getByRole('textbox', { name: /কতটি গরু পালন করতে চান\?/ }).fill('2');
    await form.getByRole('textbox', { name: 'গরু: নিজের' }).fill('1');
    // the phone ends on a review of every part before the send
    await nextPart.click();
    await form.getByRole('button', { name: 'আবেদন জমা দিন' }).click();
    await expect(applicant.getByRole('heading', { name: 'আবেদন জমা হয়েছে' })).toBeVisible();
    // no horizontal scrolling at 360 px
    expect(
      await applicant.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(360);
  } finally {
    await phone.close();
    await desk.close();
  }
});
