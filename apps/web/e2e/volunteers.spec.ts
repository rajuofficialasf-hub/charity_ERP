import { expect, type Page, test, type TestInfo } from '@playwright/test';
import { filterBy, mainMenu, openTab, rows as listRows, scan, signIn } from './support/admin';

// The nationwide volunteer tab (docs/ui/SCREENS.md, the volunteer tab and the volunteer profile)
// against the API on its E2E database with the demo seed (docs/testing/DEMO_ACCOUNTS.md): the
// counts, the area filter kept in the address, the NID held back outside the caller's region, and
// the refusal for volunteers. Mobile and desktop share the database, so each signs in with its own
// accounts.
const ACCOUNTS = {
  desktop: { official: 'rpm.dhaka@example.org', volunteer: '01700000111' },
  mobile: { official: 'pm.hum@example.org', volunteer: '01700000113' },
} as const;
const accounts = (info: TestInfo) =>
  ACCOUNTS[info.project.name === 'mobile' ? 'mobile' : 'desktop'];

const TAB = 'স্বেচ্ছাসেবক';
const rows = (page: Page) => listRows(page, TAB);

test.describe('the volunteer tab', () => {
  test('an official filters by district, and the filter stays in the address', async ({
    page,
  }, info) => {
    await signIn(page, accounts(info).official);
    await openTab(page, TAB);
    const counts = page.getByRole('region', { name: 'স্বেচ্ছাসেবকের হিসাব' });
    await expect(counts.getByText('মোট')).toBeVisible();
    await expect(rows(page).getByRole('link', { name: 'স্বেচ্ছাসেবক 2 (নমুনা)' })).toBeVisible();

    await filterBy(page, info, [
      ['বিভাগ', 'ঢাকা'],
      ['জেলা', 'ঢাকা'],
    ]);
    await expect(page).toHaveURL(/districtId=/);
    await expect(rows(page).getByRole('link', { name: 'স্বেচ্ছাসেবক 1 (নমুনা)' })).toBeVisible();
    // the Rangpur volunteers live in Dinajpur
    await expect(rows(page).getByText('দিনাজপুর')).toHaveCount(0);
    await expect(rows(page).getByRole('link', { name: 'স্বেচ্ছাসেবক 2 (নমুনা)' })).toHaveCount(0);

    // a reload shows the same view
    await page.reload();
    await expect(page).toHaveURL(/districtId=/);
    await expect(rows(page).getByRole('link', { name: 'স্বেচ্ছাসেবক 1 (নমুনা)' })).toBeVisible();
    await expect(rows(page).getByRole('link', { name: 'স্বেচ্ছাসেবক 2 (নমুনা)' })).toHaveCount(0);

    // a phone of 360 px never scrolls sideways
    await page.setViewportSize({ width: 360, height: 780 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect((await scan(page)).violations).toEqual([]);
  });

  test('the Dhaka RPM sees the NID of a Dhaka volunteer, not of a Rangpur one', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'one account, one project');
    await signIn(page, accounts(info).official);
    await openTab(page, TAB);

    await rows(page).getByRole('link', { name: 'স্বেচ্ছাসেবক 2 (নমুনা)' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'স্বেচ্ছাসেবক 2 (নমুনা)' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'পরিচয়' })).toBeVisible();
    await expect(page.getByText('আপনার জন্য দেখানো হয় না').first()).toBeVisible();
    await expect(page.getByText('1000000002')).toHaveCount(0);
    expect((await scan(page)).violations).toEqual([]);

    await page.getByRole('link', { name: 'সব স্বেচ্ছাসেবক' }).click();
    await rows(page).getByRole('link', { name: 'স্বেচ্ছাসেবক 1 (নমুনা)' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'স্বেচ্ছাসেবক 1 (নমুনা)' }),
    ).toBeVisible();
    await expect(page.getByText('1000000001')).toBeVisible();
  });

  test('a volunteer has no admin link, and the tab shows the forbidden page', async ({
    page,
  }, info) => {
    await signIn(page, accounts(info).volunteer);
    await expect(mainMenu(page).locator('a[href^="/admin"]')).toHaveCount(0);
    for (const path of ['/admin/volunteers', '/admin/beneficiaries']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: 'প্রবেশাধিকার নেই' })).toBeVisible();
    }
  });
});
