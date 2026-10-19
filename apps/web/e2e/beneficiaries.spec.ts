import { expect, type Page, test, type TestInfo } from '@playwright/test';
import { filterBy, openTab, rows as listRows, scan, select, signIn } from './support/admin';

// The nationwide beneficiary tab and the 360° profile shell (docs/ui/SCREENS.md, the beneficiary
// tab and the beneficiary profile) against the API on its E2E database with the demo seed
// (docs/testing/DEMO_ACCOUNTS.md: 25 beneficiaries in Dhaka district, 25 in Dinajpur). Mobile and
// desktop share the database, so each signs in with its own account.
const OFFICIAL = { desktop: 'head@example.org', mobile: 'monitoring@example.org' } as const;
const official = (info: TestInfo) =>
  OFFICIAL[info.project.name === 'mobile' ? 'mobile' : 'desktop'];

const TAB = 'উপকারভোগী';
const rows = (page: Page) => listRows(page, TAB);

const SECTIONS = [
  'মূল তথ্য',
  'ঠিকানা',
  'পরিবার',
  'বছরভিত্তিক প্রজেক্ট',
  'আবেদনের ইতিহাস',
  'বিতরণ ও বাস্তবায়ন',
  'দাওয়াহ',
  'ফলো-আপ',
  'কার্যক্রমের ইতিহাস',
];

test.describe('the beneficiary tab', () => {
  test('an official filters by district and opens the 360° profile with its sections', async ({
    page,
  }, info) => {
    await signIn(page, official(info));
    await openTab(page, TAB);
    const counts = page.getByRole('group', { name: 'উপকারভোগীর হিসাব' });
    await expect(counts.getByText('মোট')).toBeVisible();
    await expect(counts.getByText('ব্লক করা')).toBeVisible();

    await filterBy(page, info, [
      ['বিভাগ', 'রংপুর'],
      ['জেলা', 'দিনাজপুর'],
    ]);
    await expect(page).toHaveURL(/districtId=/);
    await expect(rows(page).getByText('দিনাজপুর').first()).toBeVisible();
    await expect(rows(page).getByText('ঢাকা')).toHaveCount(0);

    const first = rows(page).getByRole('link').first();
    const name = ((await first.textContent()) ?? '').trim();
    await first.click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    for (const section of SECTIONS)
      await expect(page.getByRole('heading', { level: 2, name: section })).toBeVisible();

    await page.setViewportSize({ width: 360, height: 780 });
    // measured once the phone layout has replaced the table
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    expect((await scan(page)).violations).toEqual([]);
  });

  test('the Media Team gets the limited view: no mobile, no family, no follow-ups', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'one account, one project');
    await signIn(page, 'media@example.org');
    await openTab(page, TAB);
    // no type, blocklist or union filter, and no blocked count (the Procurement Team's view is
    // proved by the API tests in apps/api/test/integration/beneficiary-tab.test.ts)
    await expect(page.getByRole('group', { name: 'উপকারভোগীর হিসাব' })).toBeVisible();
    await page.getByRole('button', { name: /^ফিল্টার/, expanded: false }).click();
    await expect(select(page, 'উপজেলা')).toBeVisible();
    for (const label of ['ধরন', 'ব্লকলিস্ট', 'ইউনিয়ন'])
      await expect(select(page, label)).toHaveCount(0);
    await expect(
      page.getByRole('group', { name: 'উপকারভোগীর হিসাব' }).getByText('ব্লক করা'),
    ).toHaveCount(0);
    await expect(rows(page).getByText(/^017000010\d\d$/)).toHaveCount(0);

    await rows(page).getByRole('link').first().click();
    await expect(page.getByRole('heading', { level: 2, name: 'মূল তথ্য' })).toBeVisible();
    for (const section of ['পরিবার', 'আবেদনের ইতিহাস', 'দাওয়াহ', 'ফলো-আপ', 'কার্যক্রমের ইতিহাস'])
      await expect(page.getByRole('heading', { level: 2, name: section })).toHaveCount(0);
    await expect(page.getByText(/^017000010\d\d$/)).toHaveCount(0);
  });
});
