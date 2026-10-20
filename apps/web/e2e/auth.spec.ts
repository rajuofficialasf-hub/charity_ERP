import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { fromProfileMenu } from './support/admin';

// Login, logout, devices and passwords against the API on its E2E database (T1.7; AUTH.md 3 to 8).
// Demo accounts and their password: docs/testing/DEMO_ACCOUNTS.md. The API runs with the dummy
// OTP 123456 (apps/api/scripts/e2e-server.ts). Mobile and desktop share the database, so every
// test uses its own account per project.
const PASSWORD = 'CssDemo2026';
const OTP = '123456';

const ACCOUNTS = {
  desktop: {
    login: 'pm.ucd@example.org',
    reload: 'pm.hum@example.org',
    devices: 'finance@example.org',
    change: 'executive@example.org',
    reset: 'implementer@example.org',
  },
  mobile: {
    login: '01700000105',
    reload: '01700000106',
    devices: '01700000107',
    change: '01700000108',
    reset: '01700000109',
  },
} as const;

/**
 * axe on the page. React Aria's live announcer (`[data-live-announcer]`) briefly keeps an
 * announcement node that points at a button already gone after a pending state; it is excluded.
 */
const scan = (page: Page) => new AxeBuilder({ page }).exclude('[data-live-announcer]').analyze();

type Purpose = keyof (typeof ACCOUNTS)['desktop'];
const account = (project: string, purpose: Purpose) =>
  ACCOUNTS[project === 'mobile' ? 'mobile' : 'desktop'][purpose];

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
  await expect(page.getByRole('heading', { level: 1, name: /^স্বাগতম, / })).toBeVisible();
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
    await expect(page.getByRole('heading', { level: 1, name: /^স্বাগতম, / })).toBeVisible();
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

    // The revoked device is sent to the login screen with the reason (AUTH.md 8).
    await otherPage.reload();
    await expect(otherPage).toHaveURL(/\/login\?ended=revoked$/);
    await expect(otherPage.getByText('এই ডিভাইসের সেশন শেষ হয়েছে। আবার লগইন করুন।')).toBeVisible();
    await other.close();
  });
});

test.describe('passwords', () => {
  test('changes the password and logs in with the new one', async ({ page }, info) => {
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
