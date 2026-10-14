import AxeBuilder from '@axe-core/playwright';
import { fakeEmail, fakeMobile, fakeNid } from '@css/shared';
import { devices, expect, type Page, test, type TestInfo } from '@playwright/test';

// Registration on a phone from the login page to the pending confirmation (plans
// docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md, U11, and
// docs/plans/2026-10-13-0922-feat-registration-redesign-plan.md, U4: one page, UX-16; AUTH.md 2), and the
// approval journey of U13: an RPM asks for a correction, the volunteer fixes it on the phone and
// submits again, the RPM approves. The API runs with the dummy OTP 123456 on a fresh E2E database
// (recreated per run); every project, repeat and retry uses its own fake mobile, email and NID in
// the ranges the demo seed leaves free.
const OTP = '123456';
const PASSWORD = 'Nadi kul 2026';
const DEMO_PASSWORD = 'CssDemo2026';

/** A tiny valid PNG (1 x 1 pixel) as the photo and the NID photo. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const scan = (page: Page) => new AxeBuilder({ page }).exclude('[data-live-announcer]').analyze();

/** Contacts, an NID and a name nobody else of this run uses (project, repeat and retry). */
function personFor(info: TestInfo) {
  const n =
    5100 + (info.project.name === 'desktop' ? 500 : 0) + info.repeatEachIndex * 10 + info.retry;
  return {
    mobile: fakeMobile(n),
    email: fakeEmail(`reg-e2e-${n}`),
    nid: fakeNid(60000 + n),
    name: `নতুন স্বেচ্ছাসেবক ${n} (নমুনা)`,
  };
}
type Person = ReturnType<typeof personFor>;

/** Picks from a Select; its button is named by the current value, then the label. */
async function choose(page: Page, label: RegExp, option?: string) {
  await page.getByRole('button', { name: label }).click();
  const list = page.getByRole('listbox');
  const choice = option
    ? list.getByRole('option', { name: option, exact: true })
    : list.getByRole('option').first();
  await choice.click();
  // the list closes before the next one opens
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

async function photo(page: Page, label: RegExp, slot: string) {
  const uploaded = page.waitForResponse(
    (r) => r.url().includes(`/auth/register/photos/${slot}?`) && r.status() === 201,
  );
  const chooser = page.waitForEvent('filechooser');
  await page
    .getByRole('group', { name: label })
    .getByRole('button', { name: 'গ্যালারি থেকে নিন' })
    .click();
  await (await chooser).setFiles({ name: `${slot}.png`, mimeType: 'image/png', buffer: PNG });
  await uploaded;
}

/** Verifies one contact inside its field (UX-16): "যাচাই করুন", the code below, "যাচাই হয়েছে". */
async function verifyContact(page: Page, label: RegExp, value: string, codeLabel: RegExp) {
  const field = page
    .getByTestId('register-contact')
    .filter({ has: page.getByRole('textbox', { name: label }) });
  await field.getByRole('textbox', { name: label }).fill(value);
  await field.getByRole('button', { name: 'যাচাই করুন' }).click();
  await field.getByRole('textbox', { name: codeLabel }).fill(OTP);
  await expect(field.getByText('যাচাই হয়েছে')).toBeVisible();
}

const next = (page: Page) => page.getByRole('button', { name: 'পরের ধাপ' }).click();

/** The phone registration of a volunteer in Savar (Dhaka), up to the pending confirmation. */
async function register(page: Page, person: Person) {
  await page.goto('/login');
  await page.getByRole('link', { name: 'নিবন্ধন করুন' }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole('heading', { level: 1, name: 'স্বেচ্ছাসেবক নিবন্ধন' })).toBeVisible();
  await page.getByRole('textbox', { name: /^নাম/ }).fill(person.name);
  await page.getByRole('textbox', { name: /পিতার নাম/ }).fill('নমুনা পিতা');
  await verifyContact(page, /মোবাইল নম্বর/, person.mobile, /মোবাইলে পাওয়া কোড/);
  await verifyContact(page, /^ইমেইল/, person.email, /ইমেইলে পাওয়া কোড/);
  await next(page);

  // identity: the mother, the NID and the optional personal data
  await page.getByRole('textbox', { name: /মাতার নাম/ }).fill('নমুনা মাতা');
  await page.getByRole('textbox', { name: /NID নম্বর/ }).fill(person.nid);
  await choose(page, /রক্তের গ্রুপ/, 'O+');
  await next(page);

  // address
  await choose(page, /(^|\s)বিভাগ/, 'ঢাকা');
  await choose(page, /(^|\s)জেলা/, 'ঢাকা');
  await choose(page, /(^|\s)উপজেলা/, 'সাভার');
  await choose(page, /(^|\s)ইউনিয়ন/, 'সাভার');
  await next(page);

  // the profession is mandatory and shows its own fields only (O-65)
  await choose(page, /আপনার বর্তমান পেশা/, 'শিক্ষক');
  await page.getByRole('textbox', { name: /^পদবি/ }).fill('সহকারী শিক্ষক');
  await choose(page, /আপনার বর্তমান পেশা/, 'ছাত্র');
  await expect(page.getByRole('textbox', { name: /^পদবি/ })).toHaveCount(0);
  await page.getByRole('textbox', { name: /শিক্ষাপ্রতিষ্ঠানের নাম/ }).fill('নমুনা বিদ্যালয়');
  await next(page);

  // skills and the emergency contact, all optional
  await page.getByRole('checkbox', { name: 'প্রাথমিক চিকিৎসা ও উদ্ধারকাজ' }).check({ force: true });
  await next(page);
  // nobody is asked for a type, a reference or bank details (O-64)
  await expect(page.getByRole('button', { name: /স্বেচ্ছাসেবকের ধরন/ })).toHaveCount(0);
  await expect(page.getByText(/ব্যাংক/)).toHaveCount(0);
  // the password rules tick while typing (O-64)
  const rules = page.getByRole('list').filter({ hasText: 'অন্তত 8টি অক্ষর' });
  await expect(rules.locator('[data-met="true"]')).toHaveCount(0);
  await page
    .getByLabel(/^পাসওয়ার্ড/)
    .first()
    .fill(PASSWORD);
  await expect(rules.locator('[data-met="true"]')).toHaveCount(3);
  await page.getByLabel(/^পাসওয়ার্ড আবার লিখুন/).fill(PASSWORD);
  await next(page);

  // the photos come last (UX-18): the own photo and both pages of the NID card
  await photo(page, /^নিজের ছবি/, 'photo');
  await photo(page, /^NID কার্ডের প্রথম পাতা/, 'nid_photo');
  await photo(page, /^NID কার্ডের দ্বিতীয় পাতা/, 'nid_photo_back');
  await page.getByRole('button', { name: 'জমা দিন' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'নিবন্ধন জমা হয়েছে' })).toBeVisible();
  await expect(page.getByText('অনুমোদনের পর আপনি কাজ শুরু করতে পারবেন।')).toBeVisible();
}

async function signIn(page: Page, loginId: string, password: string) {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'লগইন', exact: true })).toBeEnabled();
  await page.getByRole('textbox', { name: /মোবাইল নম্বর বা ইমেইল/ }).fill(loginId);
  await page
    .getByLabel(/^পাসওয়ার্ড/)
    .first()
    .fill(password);
  await page.getByRole('button', { name: 'লগইন', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: /^স্বাগতম, / })).toBeVisible();
}

test.describe('registration on a phone', () => {
  test('a volunteer registers with two codes and reaches the pending confirmation', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'mobile', 'the phone journey');
    await register(page, personFor(info));
    expect((await scan(page)).violations).toEqual([]);
  });
});

test.describe('registration approval', () => {
  test('an RPM asks for a correction, the volunteer fixes it, the RPM approves', async ({
    page,
    browser,
    baseURL,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'the approver works on a desktop');
    test.setTimeout(120_000);
    const person = personFor(info);
    const phone = await browser.newContext({ ...devices['Pixel 7'], baseURL });
    const mobile = await phone.newPage();
    await register(mobile, person);

    // the RPM of Dhaka asks for a correction of the father's name
    await signIn(page, 'rpm.dhaka@example.org', DEMO_PASSWORD);
    await page.getByRole('link', { name: 'অ্যাডমিন' }).click();
    await page
      .getByRole('navigation', { name: 'অ্যাডমিন মেনু' })
      .getByRole('link', { name: 'নিবন্ধন' })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'নিবন্ধন' })).toBeVisible();
    await page.getByRole('link', { name: person.name }).click();
    await expect(page.getByRole('heading', { level: 1, name: person.name })).toBeVisible();
    await expect(page.getByText(person.nid)).toBeVisible();
    expect((await scan(page)).violations).toEqual([]);
    await page.getByRole('button', { name: 'সংশোধনের অনুরোধ' }).click();
    const dialog = page.getByRole('dialog', { name: 'সংশোধনের অনুরোধ' });
    // the native input is visually hidden; people press its label text
    await dialog.getByText('পিতার নাম', { exact: true }).click();
    await expect(dialog.getByRole('checkbox', { name: 'পিতার নাম' })).toBeChecked();
    await dialog.getByRole('textbox', { name: /কী ঠিক করতে হবে/ }).fill('NID-এর মতো লিখুন');
    await dialog.getByRole('button', { name: 'পাঠান' }).click();
    await expect(page.getByText('সংশোধনের অনুরোধ পাঠানো হয়েছে')).toBeVisible();
    await expect(page.getByRole('button', { name: 'অনুমোদন', exact: true })).toBeDisabled();

    // the volunteer fixes it on the phone and submits again
    await signIn(mobile, person.mobile, PASSWORD);
    await expect(
      mobile.getByText('আপনার নিবন্ধন অনুমোদনের অপেক্ষায়', { exact: false }),
    ).toBeVisible();
    await mobile.getByRole('link', { name: 'আমার প্রোফাইল' }).click();
    await mobile.getByRole('textbox', { name: /পিতার নাম/ }).fill('সংশোধিত পিতা');
    await mobile.getByRole('button', { name: 'উত্তর দিন' }).click();
    await mobile.getByRole('button', { name: 'আবার জমা দিন' }).click();
    await expect(mobile.getByText(/সংশোধন জমা হয়েছে/)).toBeVisible();

    // the RPM sees the corrected name and approves
    await page.reload();
    await expect(page.getByText('সংশোধিত পিতা')).toBeVisible();
    await page.getByRole('button', { name: 'অনুমোদন', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'অনুমোদন করুন' }).click();
    await expect(page.getByText('নিবন্ধন অনুমোদিত হয়েছে')).toBeVisible();
    await expect(page.getByRole('link', { name: person.name })).toHaveCount(0);

    // the volunteer's home no longer shows the pending message
    await mobile.goto('/');
    await expect(mobile.getByRole('heading', { level: 1, name: /^স্বাগতম, / })).toBeVisible();
    await expect(
      mobile.getByText('আপনার নিবন্ধন অনুমোদনের অপেক্ষায়', { exact: false }),
    ).toHaveCount(0);
    await phone.close();
  });
});

test.describe('language toggle in the top bar', () => {
  test('the registration page switches to English from the bar and keeps it', async ({ page }) => {
    await page.goto('/register');
    const toggle = page.getByRole('banner').getByRole('radiogroup', { name: 'ভাষা' });
    await expect(toggle).toBeVisible();
    await toggle.getByRole('radio', { name: 'English' }).click({ force: true });
    await expect(
      page.getByRole('heading', { level: 1, name: 'Volunteer registration' }),
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.reload();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Volunteer registration' }),
    ).toBeVisible();
  });
});
