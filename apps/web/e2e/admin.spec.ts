import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

// The admin area shell on packages/ui (UX-15; plan
// docs/plans/2026-10-11-1742-chore-stack-adoption-admin-minimal-plan.md, U11) against the API on its
// E2E database. Mobile and desktop share the database, so each project signs in with its own
// accounts (docs/testing/DEMO_ACCOUNTS.md).
const PASSWORD = 'CssDemo2026';
const ACCOUNTS = {
  desktop: { manager: 'head@example.org', volunteer: '01700000111' },
  mobile: { manager: 'monitoring@example.org', volunteer: '01700000112' },
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

test.describe('admin area', () => {
  test('a manager opens the admin shell from the home page and logs out from it', async ({
    page,
  }, info) => {
    const name = await signIn(page, accounts(info.project.name).manager);

    await page.getByRole('link', { name: 'অ্যাডমিন' }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { level: 1, name: 'ড্যাশবোর্ড' })).toBeVisible();
    await expect(page).toHaveTitle('ড্যাশবোর্ড');
    const nav = page.getByRole('navigation', { name: 'অ্যাডমিন মেনু' });
    await expect(nav.getByRole('link', { name: 'ড্যাশবোর্ড' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByText(`লগইন করা: ${name}`)).toBeVisible();
    // dates in English digits (UX-05)
    await expect(page.getByText(/^আজ: \d{2}-\d{2}-\d{4}$/)).toBeVisible();

    // the UX-04 notice only on phones
    const notice = page.getByText('এই পর্দা বড় স্ক্রিনে ভালো চলে।');
    if (info.project.name === 'mobile') await expect(notice).toBeVisible();
    else await expect(notice).toBeHidden();

    // the language toggle ends the sidebar (UX-19), in view, and the page never scrolls sideways
    const toggle = page.locator('nav.admin-sidebar').getByRole('radiogroup');
    await expect(toggle).toBeInViewport();
    await toggle.getByRole('radio', { name: 'English' }).click({ force: true });
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    await toggle.getByRole('radio', { name: 'বাংলা' }).click({ force: true });
    await expect(page.getByRole('heading', { level: 1, name: 'ড্যাশবোর্ড' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    expect((await scan(page)).violations).toEqual([]);

    await page.getByRole('button', { name: 'লগআউট' }).click();
    await expect(page).toHaveURL(/\/login\?ended=logout$/);
  });

  test('a volunteer sees the forbidden screen and no admin link', async ({ page }, info) => {
    await signIn(page, accounts(info.project.name).volunteer);
    await expect(page.getByRole('link', { name: 'অ্যাডমিন' })).toHaveCount(0);

    await page.goto('/admin');
    await expect(page.getByRole('heading', { level: 1, name: 'প্রবেশাধিকার নেই' })).toBeVisible();
    await expect(page.getByText('এই পাতায় আপনার প্রবেশাধিকার নেই।')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'অ্যাডমিন মেনু' })).toHaveCount(0);
    expect((await scan(page)).violations).toEqual([]);
  });
});
