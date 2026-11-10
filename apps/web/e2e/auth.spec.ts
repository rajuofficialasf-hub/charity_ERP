import { expect, type Page, test, type TestInfo } from '@playwright/test';
import { fromProfileMenu, scan } from './support/admin';

// Login, logout, devices and passwords against the API on its E2E database
// (docs/architecture/AUTH.md, "Password rules" to "Devices: listing, remote revocation and
// local-data wipe"). Demo accounts and their password: docs/testing/DEMO_ACCOUNTS.md. The API runs
// with the dummy OTP 123456 (apps/api/scripts/e2e-server.ts). Mobile and desktop share the
// database, so every test uses its own account per project; the devices, change and reset accounts
// are signed in by no other spec (another session would be one more device, and a changed password
// ends every other login), see the account table of docs/testing/DEMO_ACCOUNTS.md.
const PASSWORD = 'CssDemo2026';
const OTP = '123456';

const ACCOUNTS = {
  desktop: {
    login: 'pm.ucd@example.org',
    reload: 'pm.hum@example.org',
    devices: '01700000102',
    change: 'media.director@example.org',
    reset: 'media.ad@example.org',
  },
  mobile: {
    login: '01700000105',
    reload: '01700000106',
    devices: '01700000107',
    change: '01700000108',
    reset: '01700000109',
  },
  // the iPhone project reads with volunteers 4 and 5 (a login makes a session, nothing more) and
  // revokes a device of volunteer 10; it changes no password (see the password tests)
  iphone: {
    login: '01700000104',
    reload: '01700000105',
    devices: '01700000110',
    change: '',
    reset: '',
  },
} as const;

type Purpose = keyof (typeof ACCOUNTS)['desktop'];
const account = (project: string, purpose: Purpose) =>
  ACCOUNTS[project === 'mobile' || project === 'iphone' ? project : 'desktop'][purpose];
/** The password screens are the same on every engine; one phone project changes them. */
const passwordsOnWebKit = (info: TestInfo) =>
  test.skip(info.project.name === 'iphone', 'the password screens are changed on Chromium');

/**
 * Waits until the form is interactive: its submit button stays disabled until the page has
 * hydrated (useHydrated), so typed values are never lost to hydration.
 */
const ready = (page: Page, submit: string) =>
  expect(page.getByRole('button', { name: submit, exact: true })).toBeEnabled();

async function signIn(page: Page, loginId: string, password = PASSWORD) {
  await page.goto('/login');
  await ready(page, 'লগইন');
  await page.getByRole('textbox', { name: /মোবাইল নম্বর বা ইমেইল/ }).fill(loginId);
  await page
    .getByLabel(/^পাসওয়ার্ড/, { exact: false })
    .first()
    .fill(password);
  await page.getByRole('button', { name: 'লগইন', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'আমার কাজ' })).toBeVisible();
  await expect(page).toHaveTitle('চ্যারিটি ও সোশ্যাল সার্ভিস');
}

test.describe('login and logout', () => {
  test('logs in, logs out and refuses the protected page afterwards', async ({ page }, info) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page).toHaveTitle('লগইন করুন');
    const axe = await scan(page);
    expect(axe.violations).toEqual([]);

    await signIn(page, account(info.project.name, 'login'));
    const home = await scan(page);
    expect(home.violations).toEqual([]);

    await fromProfileMenu(page, 'লগআউট');
    await expect(page).toHaveURL(/\/login\?ended=logout$/);
    await expect(page.getByText('আপনি লগআউট করেছেন।')).toBeVisible();
    await page.goto('/account/sessions');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('shows the same generic message for a wrong password', async ({ page }, info) => {
    await page.goto('/login');
    await ready(page, 'লগইন');
    await page
      .getByRole('textbox', { name: /মোবাইল নম্বর বা ইমেইল/ })
      .fill(`nobody.${info.project.name}@example.org`);
    await page
      .getByLabel(/^পাসওয়ার্ড/)
      .first()
      .fill('Wrong pass 1');
    await page.getByRole('button', { name: 'লগইন', exact: true }).click();
    // Next's route announcer is an alert too; the error is the one inside the form.
    await expect(page.locator('form').getByRole('alert')).toHaveText(
      'মোবাইল/ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।',
    );
  });

  test('keeps the session across a reload (silent refresh)', async ({ page }, info) => {
    await signIn(page, account(info.project.name, 'reload'));
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'আমার কাজ' })).toBeVisible();
  });
});

test.describe('devices', () => {
  test('lists the devices and logs out another one, which then has to log in again', async ({
    browser,
    page,
  }, info) => {
    const id = account(info.project.name, 'devices');
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signIn(otherPage, id);
    await signIn(page, id);

    await fromProfileMenu(page, 'আমার ডিভাইস');
    await expect(page.getByRole('heading', { level: 1, name: 'আমার ডিভাইস' })).toBeVisible();
    await expect(page).toHaveTitle('আমার ডিভাইস');
    await expect(page.getByText('এই ডিভাইস', { exact: true })).toBeVisible();
    const axe = await scan(page);
    expect(axe.violations).toEqual([]);
    await page.getByRole('button', { name: 'এই ডিভাইস লগআউট করুন' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'ডিভাইস লগআউট করুন' }).click();
    await expect(page.getByText('ডিভাইসটি লগআউট করা হয়েছে।')).toBeVisible();

    // The revoked device is sent to the login screen with the reason (docs/architecture/AUTH.md,
    // "Devices: listing, remote revocation and local-data wipe").
    await otherPage.reload();
    await expect(otherPage).toHaveURL(/\/login\?ended=revoked$/);
    await expect(otherPage.getByText('এই ডিভাইসের সেশন শেষ হয়েছে। আবার লগইন করুন।')).toBeVisible();
    await other.close();
    // this device signs out too, so a repeat of the test finds one other device again
    await fromProfileMenu(page, 'লগআউট');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('passwords', () => {
  test('changes the password and logs in with the new one', async ({ page }, info) => {
    passwordsOnWebKit(info);
    const id = account(info.project.name, 'change');
    await signIn(page, id);
    await fromProfileMenu(page, 'পাসওয়ার্ড পরিবর্তন');
    await ready(page, 'পাসওয়ার্ড পরিবর্তন করুন');
    await page
      .getByLabel(/^বর্তমান পাসওয়ার্ড/)
      .first()
      .fill(PASSWORD);
    await page
      .getByLabel(/^নতুন পাসওয়ার্ড(?! আবার)/)
      .first()
      .fill('Shapla phul 2027');
    await page
      .getByLabel(/^নতুন পাসওয়ার্ড আবার লিখুন/)
      .first()
      .fill('Shapla phul 2027');
    await page.getByRole('button', { name: 'পাসওয়ার্ড পরিবর্তন করুন' }).click();
    await expect(page.getByText(/পাসওয়ার্ড বদলানো হয়েছে/)).toBeVisible();
    await fromProfileMenu(page, 'লগআউট');
    await expect(page).toHaveURL(/\/login/);
    await signIn(page, id, 'Shapla phul 2027');
  });

  test('resets a forgotten password with the OTP', async ({ page }, info) => {
    passwordsOnWebKit(info);
    const id = account(info.project.name, 'reset');
    await page.goto('/login');
    await ready(page, 'লগইন');
    await page.getByRole('link', { name: 'পাসওয়ার্ড ভুলে গেছেন?' }).click();
    await expect(page).toHaveURL(/\/login\/reset$/);
    await ready(page, 'কোড পাঠান');
    await expect(page).toHaveTitle('পাসওয়ার্ড রিসেট');
    await page.getByRole('textbox', { name: /মোবাইল নম্বর বা ইমেইল/ }).fill(id);
    await page.getByRole('button', { name: 'কোড পাঠান' }).click();
    await expect(page.getByText(/6 অঙ্কের কোড পাঠানো হয়েছে/)).toBeVisible();
    await expect(page.getByText(/ডেভেলপমেন্ট মোড/)).toBeVisible();
    const axe = await scan(page);
    expect(axe.violations).toEqual([]);
    await page.getByRole('textbox', { name: /কোড/ }).fill(OTP);
    await page
      .getByLabel(/^নতুন পাসওয়ার্ড(?! আবার)/)
      .first()
      .fill('Kadam phul 2027');
    await page
      .getByLabel(/^নতুন পাসওয়ার্ড আবার লিখুন/)
      .first()
      .fill('Kadam phul 2027');
    await page.getByRole('button', { name: 'নতুন পাসওয়ার্ড সংরক্ষণ' }).click();
    await expect(
      page.getByText(/পাসওয়ার্ড বদলানো হয়েছে। নতুন পাসওয়ার্ড দিয়ে লগইন করুন।/),
    ).toBeVisible();
    await signIn(page, id, 'Kadam phul 2027');
  });
});
