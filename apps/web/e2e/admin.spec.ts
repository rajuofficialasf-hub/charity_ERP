import { expect, type Page, test } from '@playwright/test';
import { scan } from './support/admin';

// The admin area inside the app shell against the API on its
// E2E database. Mobile and desktop share the database, so each project signs in with its own
// accounts (docs/testing/DEMO_ACCOUNTS.md). The language switch here is saved on the account, so
// these accounts are used by no other spec: another spec signing in while the account is English
// would not find its Bengali labels.
const PASSWORD = 'CssDemo2026';
const ACCOUNTS = {
  desktop: { manager: 'rpm.rangpur@example.org', volunteer: '01700000111' },
  mobile: { manager: 'procurement@example.org', volunteer: '01700000112' },
} as const;
const accounts = (project: string) => ACCOUNTS[project === 'mobile' ? 'mobile' : 'desktop'];

/** Signs in and returns the display name from the profile chip of the app bar. */
async function signIn(page: Page, loginId: string): Promise<string> {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'লগইন', exact: true })).toBeEnabled();
  await page.getByRole('textbox', { name: /মোবাইল নম্বর বা ইমেইল/ }).fill(loginId);
  await page
    .getByLabel(/^পাসওয়ার্ড/, { exact: false })
    .first()
    .fill(PASSWORD);
  await page.getByRole('button', { name: 'লগইন', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'আমার কাজ' })).toBeVisible();
  // the chip's name is in the page on a phone too, where only its letter shows
  return (await page.getByTestId('profile-name').textContent()) ?? '';
}

const mainMenu = (page: Page) => page.getByRole('navigation', { name: 'প্রধান মেনু' });

test.describe('admin area', () => {
  test('a manager opens the admin area inside the app shell and logs out from the profile menu', async ({
    page,
  }, info) => {
    const phone = info.project.name === 'mobile';
    const name = await signIn(page, accounts(info.project.name).manager);

    await page.goto('/admin/beneficiaries');
    await expect(page.getByRole('heading', { level: 1, name: 'উপকারভোগী' })).toBeVisible();
    await expect(page).toHaveTitle('উপকারভোগী');
    await expect(mainMenu(page)).toBeVisible();
    const profile = page.getByRole('banner').getByRole('button', { name: 'প্রোফাইল মেনু' });
    await expect(profile).toContainText(name);

    // the larger-screen notice only on phones
    const notice = page.getByText('এই পর্দা বড় স্ক্রিনে ভালো চলে।');
    if (phone) await expect(notice).toBeVisible();
    else await expect(notice).toBeHidden();

    // the language: in the app bar, or in the profile menu on a phone
    if (phone) {
      await profile.click();
      await page.getByRole('menuitem', { name: 'English' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Beneficiaries' })).toBeVisible();
      await page.getByRole('banner').getByRole('button', { name: 'Profile menu' }).click();
      await page.getByRole('menuitem', { name: 'বাংলা' }).click();
    } else {
      const toggle = page.getByRole('banner').getByRole('group', { name: 'ভাষা' });
      await toggle.getByRole('button', { name: 'English' }).click({ force: true });
      await expect(page.getByRole('heading', { level: 1, name: 'Beneficiaries' })).toBeVisible();
      await page
        .getByRole('banner')
        .getByRole('group', { name: 'Language' })
        .getByRole('button', { name: 'বাংলা' })
        .click({ force: true });
    }
    await expect(page.getByRole('heading', { level: 1, name: 'উপকারভোগী' })).toBeVisible();
    // the page never scrolls sideways
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);

    expect((await scan(page)).violations).toEqual([]);

    await profile.click();
    await page.getByRole('menuitem', { name: 'লগআউট' }).click();
    await expect(page).toHaveURL(/\/login\?ended=logout$/);
  });

  test('a volunteer sees the forbidden screen and no admin destination', async ({ page }, info) => {
    await signIn(page, accounts(info.project.name).volunteer);
    await expect(mainMenu(page)).toBeVisible();
    const destinations = await mainMenu(page)
      .getByRole('link')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
    expect(destinations.filter((href) => href.startsWith('/admin'))).toEqual([]);

    await page.goto('/admin/volunteers');
    await expect(page.getByRole('heading', { level: 1, name: 'প্রবেশাধিকার নেই' })).toBeVisible();
    await expect(page.getByText('এই পাতায় আপনার প্রবেশাধিকার নেই।')).toBeVisible();
    expect((await scan(page)).violations).toEqual([]);
  });
});
