import { fakeEmail, fakeMobile, fakeNid } from '@css/shared';
import { devices, expect, type Page, test, type TestInfo } from '@playwright/test';
import {
  openProjectsTab,
  fromProfileMenu,
  isPhone,
  mainMenu,
  openTab,
  scan,
} from './support/admin';
import { activeProject, code, ERR } from './support/projects';
import { pickFrom } from './support/select';

// Registration on a phone from the login page to the pending confirmation
// (docs/plans/2026-10-13-0922-feat-registration-redesign-plan.md: one page;
// docs/architecture/AUTH.md, "Registration with two OTPs"), and the approval journey: an RPM asks
// for a correction, the volunteer fixes it on the phone and submits again, the RPM approves. The
// chain then continues to the first project (the second critical journey of the Phase 1 gate;
// docs/testing/TEST_STRATEGY.md, "E2E: critical journeys"): the Dhaka RPM assigns the new volunteer
// to an active project of the division, the volunteer reads the rules and consents, and the project
// shows as active; a main volunteer of the demo seed adds a team member, who consents on their own.
// The API runs with the dummy OTP 123456 on a fresh E2E database (recreated per run); every
// project, repeat and retry uses its own fake mobile, email and NID in the ranges the demo seed
// leaves free, and makes its own project. the PM of ERR creates the projects of this spec; the
// Monitoring Team's sessions are for the others
const PM = 'pm.err@example.org';
const RPM = 'rpm.dhaka@example.org';
// the main volunteer of the demo seed and the team member registered under their NID
const LEAD = '01700000101';
const MEMBER = { mobile: '01700000119', name: 'স্বেচ্ছাসেবক 19 (নমুনা)' } as const;
const OTP = '123456';
const PASSWORD = 'Nadi kul 2026';
const DEMO_PASSWORD = 'CssDemo2026';

/** A tiny valid PNG (1 x 1 pixel) as the photo and the NID photo. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/** Contacts, an NID and a name nobody else of this run uses (project, repeat and retry). */
function personFor(info: TestInfo) {
  const project = { mobile: 0, desktop: 500, iphone: 1000 }[info.project.name] ?? 1500;
  const n = 5100 + project + info.repeatEachIndex * 10 + info.retry;
  return {
    mobile: fakeMobile(n),
    email: fakeEmail(`reg-e2e-${n}`),
    nid: fakeNid(60000 + n),
    name: `নতুন স্বেচ্ছাসেবক ${n} (নমুনা)`,
  };
}
type Person = ReturnType<typeof personFor>;

/** Picks from a select, a combobox named by its label. */
async function choose(page: Page, label: RegExp, option?: string) {
  await pickFrom(page, page.getByRole('combobox', { name: label }), option);
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

/** Verifies one contact inside its field: "যাচাই করুন", the code below, "যাচাই হয়েছে". */
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
  await page
    .getByRole('textbox', { name: /ফেসবুক অ্যাকাউন্টের লিঙ্ক/ })
    .fill('https://www.facebook.com/nomuna.name');
  await choose(page, /রক্তের গ্রুপ/, 'O+');
  await next(page);

  // address
  await choose(page, /(^|\s)বিভাগ/, 'ঢাকা');
  await choose(page, /(^|\s)জেলা/, 'ঢাকা');
  await choose(page, /(^|\s)উপজেলা/, 'সাভার');
  await choose(page, /(^|\s)ইউনিয়ন/, 'সাভার');
  // the present address is the permanent one unless the box is cleared
  await expect(
    page.getByRole('checkbox', { name: 'বর্তমান ঠিকানাই আমার স্থায়ী ঠিকানা' }),
  ).toBeChecked();
  await next(page);

  // the education is its own step and optional
  await choose(page, /সর্বশেষ শিক্ষাগত যোগ্যতা/, 'স্নাতক (অনার্স বা ডিগ্রি)');
  await page.getByRole('textbox', { name: /শিক্ষাপ্রতিষ্ঠানের নাম/ }).fill('নমুনা বিশ্ববিদ্যালয়');
  await next(page);

  // the profession is mandatory and shows its own fields only
  await choose(page, /আপনার বর্তমান পেশা/, 'শিক্ষক');
  await page.getByRole('textbox', { name: /^পদবি/ }).fill('সহকারী শিক্ষক');
  await choose(page, /আপনার বর্তমান পেশা/, 'ছাত্র');
  await expect(page.getByRole('textbox', { name: /^পদবি/ })).toHaveCount(0);
  await page.getByRole('textbox', { name: /শিক্ষাপ্রতিষ্ঠানের নাম/ }).fill('নমুনা বিদ্যালয়');
  await next(page);

  // skills and the full-time answer, all optional; there is no emergency contact
  await page.getByRole('checkbox', { name: 'প্রাথমিক চিকিৎসা ও উদ্ধারকাজ' }).check({ force: true });
  await expect(page.getByRole('textbox', { name: /জরুরি যোগাযোগ|অভিভাবক/ })).toHaveCount(0);
  await next(page);
  // nobody is asked for a type, a reference or bank details
  await expect(page.getByRole('button', { name: /স্বেচ্ছাসেবকের ধরন/ })).toHaveCount(0);
  await expect(page.getByText(/ব্যাংক/)).toHaveCount(0);
  // the password rules tick while typing
  const rules = page.getByRole('list').filter({ hasText: 'অন্তত 8টি অক্ষর' });
  await expect(rules.locator('[data-met="true"]')).toHaveCount(0);
  await page
    .getByLabel(/^পাসওয়ার্ড/)
    .first()
    .fill(PASSWORD);
  await expect(rules.locator('[data-met="true"]')).toHaveCount(3);
  await page.getByLabel(/^পাসওয়ার্ড আবার লিখুন/).fill(PASSWORD);
  await next(page);

  // the photos come last: the own photo and both pages of the NID card
  await photo(page, /^নিজের ছবি/, 'photo');
  await photo(page, /^NID কার্ডের প্রথম পাতা/, 'nid_photo');
  await photo(page, /^NID কার্ডের দ্বিতীয় পাতা/, 'nid_photo_back');
  await page.getByRole('button', { name: 'জমা দিন' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'নিবন্ধন জমা হয়েছে' })).toBeVisible();
  await expect(page.getByText('অনুমোদনের পর আপনি কাজ শুরু করতে পারবেন।')).toBeVisible();
}

/** An active ERR project of this run in the Dhaka division, made by its PM on `desk`. */
async function projectOfThisRun(desk: Page, name: string): Promise<string> {
  await desk.context().clearCookies();
  await signIn(desk, PM, DEMO_PASSWORD);
  await openProjectsTab(desk);
  return activeProject(desk, name, ERR, PM);
}

/** The Dhaka RPM assigns the volunteer with this mobile number to the project on `desk`. */
async function assign(desk: Page, projectId: string, name: string, mobile: string) {
  await desk.context().clearCookies();
  await signIn(desk, RPM, DEMO_PASSWORD);
  await desk.goto(`/admin/projects/${projectId}/volunteers`);
  await expect(
    desk.getByRole('heading', { level: 2, name: `স্বেচ্ছাসেবক: ${name}` }),
  ).toBeVisible();
  await desk.getByRole('button', { name: 'স্বেচ্ছাসেবক অ্যাসাইন করুন' }).click();
  const dialog = desk.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'নাম বা মোবাইল নম্বর' }).fill(mobile);
  const candidates = dialog.getByRole('table', { name: 'অ্যাসাইন করা যায় এমন স্বেচ্ছাসেবক' });
  await expect(candidates.getByRole('row')).toHaveCount(2);
  await candidates.getByRole('row').nth(1).getByRole('cell').nth(1).click();
  await dialog.getByRole('button', { name: 'অ্যাসাইন করুন', exact: true }).click();
  await expect(desk.getByText(/1 জন স্বেচ্ছাসেবক অ্যাসাইন হয়েছেন/)).toBeVisible();
}

/** On the phone: the project waits, the rules are read part by part, the consent is given. */
async function consent(mobile: Page, name: string) {
  await mobile.goto('/');
  await mainMenu(mobile).getByRole('link', { name: 'আমার প্রকল্প' }).click();
  const list = mobile.getByRole('list', { name: 'আমার প্রকল্পের তালিকা' });
  const card = list.getByRole('listitem').filter({ hasText: name });
  await expect(card.getByText('নিয়মাবলিতে সম্মতির অপেক্ষায়')).toBeVisible();
  await card.getByRole('link', { name: 'নিয়মাবলি পড়ুন' }).click();
  for (let part = 0; part < 3; part += 1) {
    await mobile.getByText('আমি পড়েছি এবং মেনে চলব').click();
    await mobile.getByRole('button', { name: 'পরের ধাপ' }).click();
  }
  await mobile.getByText('আমি রাজি এবং এই প্রকল্পে কাজ করতে আগ্রহী').click();
  await mobile.getByRole('button', { name: 'সম্মতি দিন' }).click();
  // the project is open: its applications against the limit
  await expect(mobile.getByText('0 টি দেওয়া হয়েছে, আরও 50 টি দেওয়া যাবে')).toBeVisible();
  await mobile.getByRole('link', { name: 'আমার প্রকল্পে ফিরে যান' }).click();
  await expect(
    mobile.getByRole('list', { name: 'আমার প্রকল্পের তালিকা' }).getByRole('listitem').filter({
      hasText: name,
    }),
  ).toContainText('সক্রিয়');
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
  await expect(page.getByRole('heading', { level: 1, name: 'আমার কাজ' })).toBeVisible();
}

test.describe('registration on a phone', () => {
  test('a volunteer registers with two codes and reaches the pending confirmation', async ({
    page,
  }, info) => {
    test.skip(!isPhone(info), 'the phone journey');
    // seven steps with three photos; WebKit takes longer than Chromium
    test.setTimeout(90_000);
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
    test.setTimeout(300_000);
    const person = personFor(info);
    const project = `নিবন্ধনের পরীক্ষা ${code()}`;
    const phone = await browser.newContext({ ...devices['Pixel 7'], baseURL });
    const mobile = await phone.newPage();
    await register(mobile, person);

    // the RPM of Dhaka asks for a correction of the father's name
    await signIn(page, 'rpm.dhaka@example.org', DEMO_PASSWORD);
    // volunteer registrations are reviewed in the volunteer tab, under its pending count card
    await openTab(page, 'স্বেচ্ছাসেবক');
    await page
      .getByRole('group', { name: 'স্বেচ্ছাসেবকের হিসাব' })
      .getByRole('button', { name: /^অনুমোদনের অপেক্ষায় \d/ })
      .click();
    await expect(page).toHaveURL(/state=pending/);
    await page.getByRole('link', { name: person.name }).click();
    await expect(page.getByRole('heading', { level: 1, name: person.name })).toBeVisible();
    // the NID in its section; the header shows it again with its label
    // in the banner's facts and in the details below
    await expect(page.getByText(person.nid, { exact: true })).toHaveCount(2);
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
    // the home names the correction asked of the volunteer, not only the wait
    await expect(
      mobile.getByText('আপনার নিবন্ধনে কিছু তথ্য ঠিক করতে বলা হয়েছে', { exact: false }),
    ).toBeVisible();
    await fromProfileMenu(mobile, 'আমার প্রোফাইল');
    await mobile.getByRole('textbox', { name: /পিতার নাম/ }).fill('সংশোধিত পিতা');
    // one correction: the answer sends it back at once
    await mobile.getByRole('button', { name: 'উত্তর দিয়ে জমা দিন' }).click();
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
    await expect(mobile.getByRole('heading', { level: 1, name: 'আমার কাজ' })).toBeVisible();
    await expect(
      mobile.getByText('আপনার নিবন্ধন অনুমোদনের অপেক্ষায়', { exact: false }),
    ).toHaveCount(0);

    // the RPM assigns the new volunteer to an active project of the division; the volunteer
    // reads the rules, consents, and the project is open
    const projectId = await projectOfThisRun(page, project);
    await assign(page, projectId, project, person.mobile);
    await consent(mobile, project);
    expect((await scan(mobile)).violations).toEqual([]);
    await phone.close();
  });
});

test.describe('team members', () => {
  test('a main volunteer adds a team member, who consents on their own and then works on the project', async ({
    page,
    browser,
    baseURL,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'the officials work on a desktop');
    test.setTimeout(300_000);
    const project = `টিমের পরীক্ষা ${code()}`;
    const projectId = await projectOfThisRun(page, project);
    await assign(page, projectId, project, LEAD);

    // the main volunteer consents and adds the member registered under their NID
    const lead = await browser.newContext({ ...devices['Pixel 7'], baseURL });
    const leadPage = await lead.newPage();
    await signIn(leadPage, LEAD, DEMO_PASSWORD);
    await consent(leadPage, project);
    await leadPage.goto(`/my-projects/${projectId}`);
    await leadPage.getByRole('link', { name: 'আমার টিম' }).click();
    await expect(leadPage.getByRole('heading', { level: 1, name: 'আমার টিম' })).toBeVisible();
    // the member is a candidate (registered under the main volunteer's NID), then on the team
    await leadPage.getByRole('checkbox', { name: MEMBER.name }).check({ force: true });
    await leadPage.getByRole('button', { name: 'টিমে যোগ করুন' }).click();
    await expect(leadPage.getByText(/টিমে যোগ করা হয়েছে/)).toBeVisible();
    await expect(leadPage.getByRole('checkbox', { name: MEMBER.name })).toHaveCount(0);
    await expect(leadPage.getByText(MEMBER.name, { exact: true })).toBeVisible();
    await expect(leadPage.getByText('সম্মতির অপেক্ষায়')).toBeVisible();
    expect((await scan(leadPage)).violations).toEqual([]);
    await lead.close();

    // the member consents on their own phone and sees the project active
    const member = await browser.newContext({ ...devices['Pixel 7'], baseURL });
    const memberPage = await member.newPage();
    await signIn(memberPage, MEMBER.mobile, DEMO_PASSWORD);
    await consent(memberPage, project);
    await member.close();
  });
});

test.describe('language toggle in the top bar', () => {
  test('the registration page switches to English from the bar and keeps it', async ({ page }) => {
    await page.goto('/register');
    const toggle = page.getByRole('banner').getByRole('group', { name: 'ভাষা' });
    await expect(toggle).toBeVisible();
    await toggle.getByRole('button', { name: 'English' }).click({ force: true });
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
