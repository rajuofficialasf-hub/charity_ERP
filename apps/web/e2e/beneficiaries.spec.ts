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

// The lookup cases of the demo seed (docs/testing/DEMO_ACCOUNTS.md): beneficiary 1 of Dhaka is
// found, beneficiary 3 is blocked, and an unused NID finds nothing; all inside project WNT, which
// the Dhaka RPM works on. Nothing here changes data, so both projects share the account.
const FOUND_NID = '1000001000';
const BLOCKED_NID = '1000001002';
const UNKNOWN_NID = '1000099999';

test.describe('the lookup by NID or birth registration', () => {
  test('the RPM sees the auto-fill with the identity locked, each other answer, and finds the profile by its BEN number', async ({
    page,
  }) => {
    await signIn(page, 'rpm.dhaka@example.org');
    await openTab(page, TAB);
    await page.getByRole('button', { name: 'NID / জন্মনিবন্ধন দিয়ে খুঁজুন' }).click();
    const dialog = page.getByRole('dialog', { name: 'NID বা জন্মনিবন্ধন দিয়ে খুঁজুন' });
    await expect(dialog).toBeVisible();
    await select(page, 'প্রকল্প').click();
    await page
      .getByRole('listbox')
      .getByRole('option', { name: /\(WNT\)$/ })
      .click();

    const number = dialog.getByRole('textbox', { name: /^NID নম্বর/ }).first();
    const lookUp = async (nid: string) => {
      await number.fill(nid);
      await dialog.getByRole('button', { name: 'খুঁজুন' }).click();
    };

    await lookUp(FOUND_NID);
    // the lock marker is read out after the label: "নাম (লক করা)"
    const name = dialog.getByRole('textbox', { name: /^নাম\s?\(লক করা\)$/ });
    await expect(name).toHaveValue(/\S/);
    await expect(name).not.toBeEditable();
    await expect(
      dialog.getByRole('textbox', { name: /^পিতা\/স্বামীর নাম\s?\(লক করা\)$/ }),
    ).not.toBeEditable();
    await expect(dialog.getByRole('textbox', { name: 'মোবাইল', exact: true })).toBeEditable();
    const found = dialog.getByText(/^প্রোফাইল পাওয়া গেছে: BEN-\d{7}$/);
    await expect(found).toBeVisible();
    const benNo = /BEN-\d{7}/.exec((await found.textContent()) ?? '')![0];
    expect((await scan(page)).violations).toEqual([]);

    await lookUp(UNKNOWN_NID);
    await expect(dialog.getByText('এই নম্বরে কোনো প্রোফাইল নেই')).toBeVisible();
    await lookUp(BLOCKED_NID);
    await expect(dialog.getByText('এই ব্যক্তি ব্লক করা আছেন')).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: /^নাম\s?\(লক করা\)$/ })).toHaveCount(0);

    await dialog.getByRole('button', { name: 'বন্ধ করুন' }).first().click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('searchbox').fill(benNo);
    // the search waits for typing to pause, so the list narrows to the one person a moment later
    await expect(rows(page).getByRole('link')).toHaveCount(1);
    await expect(rows(page).getByText(benNo, { exact: true })).toBeVisible();
    await rows(page).getByRole('link').click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(`BEN নম্বর: ${benNo}`, { exact: true })).toBeVisible();
  });
});
