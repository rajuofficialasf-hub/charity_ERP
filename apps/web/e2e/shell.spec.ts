import { expect, test } from '@playwright/test';
import { fromProfileMenu, isPhone, mainMenu, scan, signIn } from './support/admin';

// The app shell against the API on its E2E database: the navigation of each width, the profile
// menu and the offline banner. Read-only accounts of the demo seed (docs/testing/DEMO_ACCOUNTS.md),
// so the spec runs beside the others.
const VOLUNTEER = '01700000116';

test.describe('app shell', () => {
  test('a volunteer on a phone has the bottom tabs and opens My projects from them', async ({
    page,
  }, info) => {
    test.skip(!isPhone(info), 'the bottom tabs are for phones');
    await signIn(page, VOLUNTEER);
    const tabs = mainMenu(page);
    await expect(tabs.getByRole('link')).toHaveText([
      'হোম',
      'আমার প্রকল্প',
      'আমার আবেদন',
      'নোটিফিকেশন',
    ]);
    await expect(tabs.getByRole('button', { name: 'আরও' })).toBeVisible();
    await tabs.getByRole('link', { name: 'আমার প্রকল্প' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'আমার প্রকল্প' })).toBeVisible();
    await expect(tabs.getByRole('link', { name: 'আমার প্রকল্প' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect((await scan(page)).violations).toEqual([]);
  });

  test('the Department Head on a desktop opens the audit log from the sidebar', async ({
    page,
  }, info) => {
    test.skip(isPhone(info), 'the sidebar is for desktops');
    await signIn(page, 'head@example.org');
    await mainMenu(page).getByRole('link', { name: 'অডিট লগ' }).click();
    await expect(page).toHaveURL(/\/admin\/audit$/);
    await expect(page.getByRole('heading', { level: 1, name: 'অডিট লগ' })).toBeVisible();
    expect((await scan(page)).violations).toEqual([]);
  });

  test('the profile menu leads to my devices', async ({ page }) => {
    await signIn(page, VOLUNTEER);
    await fromProfileMenu(page, 'আমার ডিভাইস');
    await expect(page.getByRole('heading', { level: 1, name: 'আমার ডিভাইস' })).toBeVisible();
  });

  test('the offline banner shows while the browser has no connection', async ({
    page,
    context,
  }) => {
    await signIn(page, VOLUNTEER);
    await context.setOffline(true);
    await expect(page.getByText(/আপনি অফলাইনে আছেন/)).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByText(/আপনি অফলাইনে আছেন/)).toBeHidden();
  });
});
