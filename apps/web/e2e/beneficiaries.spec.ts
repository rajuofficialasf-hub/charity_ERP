import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test, type TestInfo } from '@playwright/test';

// The nationwide beneficiary tab and the 360° profile shell (docs/ui/SCREENS.md, the beneficiary
// tab and the beneficiary profile) against the API on its E2E database with the demo seed
// (docs/testing/DEMO_ACCOUNTS.md: 25 beneficiaries in Dhaka district, 25 in Dinajpur). Mobile and
// desktop share the database, so each signs in with its own account.
const PASSWORD = 'CssDemo2026';
const OFFICIAL = { desktop: 'head@example.org', mobile: 'monitoring@example.org' } as const;
const official = (info: TestInfo) =>
  OFFICIAL[info.project.name === 'mobile' ? 'mobile' : 'desktop'];

/** axe on the page; React Aria's live announcer node is excluded as in auth.spec.ts. */
const scan = (page: Page) => new AxeBuilder({ page }).exclude('[data-live-announcer]').analyze();

async function signIn(page: Page, loginId: string): Promise<void> {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'লগইন', exact: true })).toBeEnabled();
  await page.getByRole('textbox', { name: /মোবাইল নম্বর বা ইমেইল/ }).fill(loginId);
  await page
    .getByLabel(/^পাসওয়ার্ড/, { exact: false })
    .first()
    .fill(PASSWORD);
  await page.getByRole('button', { name: 'লগইন', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: /^স্বাগতম, / })).toBeVisible();
}

/** Picks from a Select; its button is named by the current value, then the label. */
async function choose(page: Page, label: RegExp, option: string) {
  await page.getByRole('button', { name: label }).click();
  await page.getByRole('listbox').getByRole('option', { name: option, exact: true }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

/**
 * Sets area filters: inline beside the list on a desktop, in the filter sheet on a phone. The
 * Select buttons end with their label ("বেছে নিন জেলা"), so "জেলা" never matches "উপজেলা".
 */
async function filterBy(page: Page, info: TestInfo, picks: [label: string, option: string][]) {
  const phone = info.project.name === 'mobile';
  if (phone) await page.getByRole('button', { name: /^ফিল্টার/ }).click();
  for (const [label, option] of picks) await choose(page, new RegExp(`\\s${label}$`), option);
  if (phone) await page.getByRole('button', { name: 'ফিল্টার প্রয়োগ' }).click();
}

/** The rows of the list: a table on a desktop, a card list on a phone. */
const rows = (page: Page) =>
  page.locator('[aria-label="উপকারভোগী"]:is(table, ul, [role=grid]):visible');

async function openTab(page: Page) {
  await page.getByRole('link', { name: 'অ্যাডমিন' }).click();
  await page
    .getByRole('navigation', { name: 'অ্যাডমিন মেনু' })
    .getByRole('link', { name: 'উপকারভোগী' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'উপকারভোগী' })).toBeVisible();
}

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
    await openTab(page);
    const counts = page.getByRole('region', { name: 'উপকারভোগীর হিসাব' });
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
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect((await scan(page)).violations).toEqual([]);
  });

  test('the Media Team gets the limited view: no mobile, no family, no follow-ups', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'one account, one project');
    await signIn(page, 'media@example.org');
    await openTab(page);
    // no type, blocklist or union filter, and no blocked count
    await expect(page.getByRole('region', { name: 'উপকারভোগীর হিসাব' })).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'উপকারভোগীর হিসাব' }).getByText('ব্লক করা'),
    ).toHaveCount(0);
    await expect(rows(page).getByText(/^017000010\d\d$/)).toHaveCount(0);

    await rows(page).getByRole('link').first().click();
    await expect(page.getByRole('heading', { level: 2, name: 'মূল তথ্য' })).toBeVisible();
    for (const section of ['পরিবার', 'আবেদনের ইতিহাস', 'দাওয়াহ', 'ফলো-আপ', 'কার্যক্রমের ইতিহাস'])
      await expect(page.getByRole('heading', { level: 2, name: section })).toHaveCount(0);
    await expect(page.getByText(/^017000010\d\d$/)).toHaveCount(0);
  });
});
