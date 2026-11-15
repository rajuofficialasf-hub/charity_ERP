import { expect, type Page, test, type TestInfo } from '@playwright/test';
import { apiAs, isPhone, openTab, rows, scan, signIn } from './support/admin';

// The duplicate profiles and their merge (docs/ui/SCREENS.md, the duplicates page) against the
// demo seed (docs/testing/DEMO_ACCOUNTS.md): the PM of program HUM finds a suggested pair, compares
// the two profiles, keeps one and merges; the retired BEN number leads to the kept profile; the
// Monitoring Team reverts the merge, which brings the pair back, so every run finds the data as it
// was. The projects share the database, so each merges a pair of its own.
const PAIR = { desktop: 'রাবেয়া খাতুন (নমুনা)', mobile: 'আনোয়ারা বেগম (নমুনা)' } as const;
const pairName = (info: TestInfo) => PAIR[isPhone(info) ? 'mobile' : 'desktop'];

const TITLE = 'সম্ভাব্য ডুপ্লিকেট';
const PAIRS = 'সম্ভাব্য ডুপ্লিকেট জোড়া';
const RULE = 'একই নাম, পিতা/স্বামী ও মোবাইল';
const DENIED = 'এই পাতায় আপনার প্রবেশাধিকার নেই।';

/** The suggested pair of this project, as a row on a desktop or a card on a phone. */
const pairOf = (page: Page, info: TestInfo) =>
  rows(page, PAIRS)
    .getByRole(isPhone(info) ? 'listitem' : 'row')
    .filter({ hasText: pairName(info) });

const fitsWidth = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.describe('duplicate beneficiary profiles', () => {
  test('the PM merges a suggested pair and the Monitoring Team reverts the merge', async ({
    page,
  }, info) => {
    test.setTimeout(180_000);
    await signIn(page, 'pm.hum@example.org');
    await openTab(page, 'উপকারভোগী');
    await page.getByRole('link', { name: TITLE }).click();
    await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();

    const pair = pairOf(page, info);
    await expect(pair.getByText(RULE)).toBeVisible();
    const [keptBen, retiredBen] = ((await pair.textContent()) ?? '').match(/BEN-\d{7}/g) ?? [];
    expect(keptBen).toBeTruthy();
    expect(retiredBen).toBeTruthy();
    expect((await scan(page)).violations).toEqual([]);

    // both profiles side by side; the first one (the first of the pair) is kept
    await pair.getByRole('link', { name: 'তুলনা করুন' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'প্রোফাইল তুলনা' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: pairName(info) })).toHaveCount(2);
    await expect(page.getByText(keptBen!, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(retiredBen!, { exact: true }).first()).toBeVisible();
    await expect.poll(() => fitsWidth(page)).toBe(true);
    expect((await scan(page)).violations).toEqual([]);

    await page.getByText('এই প্রোফাইল রাখুন').first().click();
    await page.getByRole('button', { name: 'মার্জ করুন' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: /কারণ/ }).fill('একই ব্যক্তি দুইবার নিবন্ধিত হয়েছেন');
    await dialog.getByRole('button', { name: 'মার্জ করুন' }).click();
    await expect(page.getByText('প্রোফাইল মার্জ হয়েছে')).toBeVisible();
    await expect(
      page
        .getByRole('listitem')
        .filter({ hasText: 'BEN নম্বর' })
        .getByText(keptBen!, { exact: true }),
    ).toBeVisible();

    // the retired BEN number leads to the kept profile
    await openTab(page, 'উপকারভোগী');
    await page.getByRole('searchbox').fill(retiredBen!);
    const found = rows(page, 'উপকারভোগী');
    await expect(found.getByRole('link')).toHaveCount(1);
    await expect(found.getByText(keptBen!, { exact: true })).toBeVisible();
    await found.getByRole('link').click();
    await expect(
      page
        .getByRole('listitem')
        .filter({ hasText: 'BEN নম্বর' })
        .getByText(keptBen!, { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(`${retiredBen} এর সাথে মার্জ হয়েছে`).first()).toBeVisible();
    const keptUrl = page.url();

    // the Monitoring Team reverts the merge from the kept profile's history
    await page.context().clearCookies();
    await signIn(page, 'monitoring@example.org');
    await page.goto(keptUrl);
    await page.getByRole('button', { name: 'মার্জ ফেরত নিন' }).click();
    const revert = page.getByRole('dialog');
    await revert.getByRole('textbox', { name: /কারণ/ }).fill('ভুল জোড়া মার্জ হয়েছিল');
    await revert.getByRole('button', { name: 'মার্জ ফেরত নিন' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'মার্জ ফেরত নেওয়া হয়েছে' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'মার্জ ফেরত নিন' })).toHaveCount(0);

    // both profiles are live again, so the pair is suggested again
    await page.goto('/admin/beneficiaries/duplicates');
    await expect(pairOf(page, info).getByText(RULE)).toBeVisible();
  });

  for (const [who, loginId] of [
    ['a volunteer', '01700000103'],
    ['the Media Team', 'media@example.org'],
  ] as const)
    test(`${who} cannot open the duplicates page`, async ({ page, request }) => {
      await signIn(page, loginId);
      await page.goto('/admin/beneficiaries/duplicates');
      await expect(page.getByText(DENIED)).toBeVisible();
      await expect(page.getByRole('heading', { level: 1, name: TITLE })).toHaveCount(0);
      const api = await apiAs(request, loginId);
      expect((await api.get('/beneficiaries/merge-candidates')).status()).toBe(403);
    });
});
