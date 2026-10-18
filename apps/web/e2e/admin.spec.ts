import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

// The admin area shell on packages/ui (UX-15; plan
// docs/plans/2026-10-11-1742-chore-stack-adoption-admin-minimal-plan.md, U11) against the API on its
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

/** axe on the page; React Aria's live announcer node is excluded as in auth.spec.ts. */
const scan = (page: Page) => new AxeBuilder({ page }).exclude('[data-live-announcer]').analyze();

/** Signs in and returns the display name from the home heading ("স্বাগতম, <name>"). */
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
  const heading = page.getByRole('heading', { level: 1, name: /^স্বাগতম, / });
  await expect(heading).toBeVisible();
  return ((await heading.textContent()) ?? '').replace(/^স্বাগতম, /, '');
}

const mainMenu = (page: Page) => page.getByRole('navigation', { name: 'প্রধান মেনু' });

test.describe('admin area', () => {
  test('a manager opens the admin area inside the app shell and logs out from the profile menu', async ({
    page,
  }, info) => {
    const phone = info.project.name === 'mobile';
    const name = await signIn(page, accounts(info.project.name).manager);

    await page.goto('/admin');
    await expect(page.getByRole('heading', { level: 1, name: 'ড্যাশবোর্ড' })).toBeVisible();
    await expect(page).toHaveTitle('ড্যাশবোর্ড');
    await expect(mainMenu(page)).toBeVisible();
    const profile = page.getByRole('banner').getByRole('button', { name: 'প্রোফাইল মেনু' });
    await expect(profile).toContainText(name);
    // dates in English digits (UX-05)
    await expect(page.getByText(/^আজ: \d{2}-\d{2}-\d{4}$/)).toBeVisible();

    // the UX-04 notice only on phones
    const notice = page.getByText('এই পর্দা বড় স্ক্রিনে ভালো চলে।');
    if (phone) await expect(notice).toBeVisible();
    else await expect(notice).toBeHidden();

    // the language: in the app bar, or in the profile menu on a phone
    if (phone) {
      await profile.click();
      await page.getByRole('menuitem', { name: 'English' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
      await page.getByRole('banner').getByRole('button', { name: 'Profile menu' }).click();
      await page.getByRole('menuitem', { name: 'বাংলা' }).click();
    } else {
      const toggle = page.getByRole('banner').getByRole('radiogroup', { name: 'ভাষা' });
      await toggle.getByRole('radio', { name: 'English' }).click({ force: true });
      await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
      await page
        .getByRole('banner')
        .getByRole('radiogroup', { name: 'Language' })
        .getByRole('radio', { name: 'বাংলা' })
        .click({ force: true });
    }
    await expect(page.getByRole('heading', { level: 1, name: 'ড্যাশবোর্ড' })).toBeVisible();
    // the page never scrolls sideways
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    expect((await scan(page)).violations).toEqual([]);

    await profile.click();
    await page.getByRole('menuitem', { name: 'লগআউট' }).click();
    await expect(page).toHaveURL(/\/login\?ended=logout$/);
  });

  test('a volunteer sees the forbidden screen and no admin destination', async ({ page }, info) => {
    await signIn(page, accounts(info.project.name).volunteer);
    await expect(mainMenu(page).locator('a[href^="/admin"]')).toHaveCount(0);

    await page.goto('/admin');
    await expect(page.getByRole('heading', { level: 1, name: 'প্রবেশাধিকার নেই' })).toBeVisible();
    await expect(page.getByText('এই পাতায় আপনার প্রবেশাধিকার নেই।')).toBeVisible();
    expect((await scan(page)).violations).toEqual([]);
  });
});
