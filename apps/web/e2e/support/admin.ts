import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

// Shared steps of the admin tab specs (volunteers.spec.ts, beneficiaries.spec.ts) against the demo
// seed (docs/testing/DEMO_ACCOUNTS.md).
export const PASSWORD = 'CssDemo2026';

export const isPhone = (info: TestInfo) => info.project.name === 'mobile';

/** axe on the page; React Aria's live announcer node is excluded as in auth.spec.ts. */
export const scan = (page: Page) =>
  new AxeBuilder({ page }).exclude('[data-live-announcer]').analyze();

export async function signIn(page: Page, loginId: string): Promise<void> {
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

/** Opens a destination of the admin menu from the home page and waits for its heading. */
export async function openTab(page: Page, name: string): Promise<void> {
  await page.getByRole('link', { name: 'অ্যাডমিন' }).click();
  await page.getByRole('navigation', { name: 'অ্যাডমিন মেনু' }).getByRole('link', { name }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

/**
 * A Select button by its label: the button is named by the current value, then the label
 * ("বেছে নিন জেলা"), so the label must end the name and "জেলা" never matches "উপজেলা".
 */
export const select = (page: Page, label: string) =>
  page.getByRole('button', { name: new RegExp(`\\s${label}$`) });

/** Picks an option from a Select. */
export async function choose(page: Page, label: string, option: string): Promise<void> {
  await select(page, label).click();
  await page.getByRole('listbox').getByRole('option', { name: option, exact: true }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

/** Sets filters: inline beside the list on a desktop, in the filter sheet on a phone. */
export async function filterBy(
  page: Page,
  info: TestInfo,
  picks: [label: string, option: string][],
): Promise<void> {
  if (isPhone(info)) await page.getByRole('button', { name: /^ফিল্টার/ }).click();
  for (const [label, option] of picks) await choose(page, label, option);
  if (isPhone(info)) await page.getByRole('button', { name: 'ফিল্টার প্রয়োগ' }).click();
}

/** The rows of a list by its name: a grid on a desktop, a card list on a phone. */
export const rows = (page: Page, name: string): Locator =>
  page
    .getByRole('grid', { name })
    .or(page.getByRole('table', { name }))
    .or(page.getByRole('list', { name }));
