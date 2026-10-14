import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

// The own profile by section with one edit mode (plan
// docs/plans/2026-10-13-1500-feat-profile-redesign-plan.md, U3) against the API on its E2E
// database. Each project signs in with its own volunteer and every repeat asks for another detail,
// because a detail may have only one open request (D-085).
const PASSWORD = 'CssDemo2026';
const VOLUNTEER = { desktop: '01700000113', mobile: '01700000114' } as const;
const DETAILS = {
  desktop: [
    { section: 'যোগাযোগ', label: 'ফেসবুক আইডি' },
    { section: 'কাজের তথ্য', label: 'শিক্ষাগত যোগ্যতা' },
    { section: 'কাজের তথ্য', label: 'আগের প্রজেক্টে কাজ' },
  ],
  mobile: [
    { section: 'কাজের তথ্য', label: 'আগের প্রজেক্টে কাজ' },
    { section: 'কাজের তথ্য', label: 'শিক্ষাগত যোগ্যতা' },
    { section: 'যোগাযোগ', label: 'ফেসবুক আইডি' },
  ],
} as const;

const scan = (page: Page) => new AxeBuilder({ page }).exclude('[data-live-announcer]').analyze();

async function signIn(page: Page, loginId: string) {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'লগইন', exact: true })).toBeEnabled();
  await page.getByRole('textbox', { name: /মোবাইল নম্বর বা ইমেইল/ }).fill(loginId);
  await page
    .getByLabel(/^পাসওয়ার্ড/)
    .first()
    .fill(PASSWORD);
  await page.getByRole('button', { name: 'লগইন', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: /^স্বাগতম, / })).toBeVisible();
}

test.describe('own profile', () => {
  test('shows one section at a time and sends a change request from the edit mode', async ({
    page,
  }, info) => {
    const project = info.project.name === 'mobile' ? 'mobile' : 'desktop';
    const detail = DETAILS[project][info.repeatEachIndex % 3]!;
    await signIn(page, VOLUNTEER[project]);
    await page.getByRole('link', { name: 'আমার প্রোফাইল' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'আমার প্রোফাইল' })).toBeVisible();

    // the header and the first section; the other sections are not on the page
    const nav = page.getByRole('navigation', { name: 'প্রোফাইলের অংশ' });
    await expect(nav.getByRole('button', { name: 'ব্যক্তিগত তথ্য' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(page.getByRole('heading', { level: 2, name: 'ব্যক্তিগত তথ্য' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'ব্যাংকের তথ্য' })).toHaveCount(0);
    expect((await scan(page)).violations).toEqual([]);

    // a click on a section name shows that section
    await nav.getByRole('button', { name: 'ব্যাংকের তথ্য' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'ব্যাংকের তথ্য' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'ব্যক্তিগত তথ্য' })).toHaveCount(0);

    // one edit button: tick a detail, type the new value, send
    await nav.getByRole('button', { name: detail.section }).click();
    await page.getByRole('button', { name: `${detail.section} সম্পাদনা` }).click();
    const form = page.getByRole('form', { name: `${detail.section} পরিবর্তনের অনুরোধ` });
    expect((await scan(page)).violations).toEqual([]);
    await expect(form.getByRole('button', { name: 'অনুরোধ পাঠান' })).toBeDisabled();
    await form.getByText(`${detail.label} বদলাতে চাই`).click();
    await form.getByRole('textbox', { name: new RegExp(`^${detail.label}`) }).fill('নতুন তথ্য');
    await form.getByRole('button', { name: 'অনুরোধ পাঠান' }).click();
    await expect(page.getByText('অনুরোধ পাঠানো হয়েছে।')).toBeVisible();
    await expect(page.getByText('অনুমোদনের অপেক্ষায়', { exact: true }).first()).toBeVisible();

    // the page never scrolls sideways, on a phone as on a desktop
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
});
