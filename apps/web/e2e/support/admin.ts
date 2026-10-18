import AxeBuilder from '@axe-core/playwright';
import {
  type APIRequestContext,
  type APIResponse,
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';

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

/**
 * A small API client signed in as a demo account, for checks the server decides (a 403 behind a
 * forbidden screen) and for set-up facts; the answer is returned as it is, whatever its status.
 */
export async function apiAs(
  request: APIRequestContext,
  loginId: string,
): Promise<{ get: (path: string) => Promise<APIResponse> }> {
  const login = await request.post('/api/v1/auth/login', {
    data: {
      loginId,
      password: PASSWORD,
      device: { name: 'E2E', platform: 'desktop', appVersion: 'e2e' },
    },
  });
  expect(login.ok(), `login as ${loginId}: ${login.status()}`).toBe(true);
  const token = ((await login.json()) as { data: { accessToken: string } }).data.accessToken;
  const headers = { Authorization: `Bearer ${token}` };
  return { get: (path) => request.get(`/api/v1${path}`, { headers }) };
}

/** The navigation of the app shell: the sidebar, the rail or the bottom tabs. */
export const mainMenu = (page: Page) => page.getByRole('navigation', { name: 'প্রধান মেনু' });

/**
 * Opens a destination from the app shell: from the menu, else from "more", else (the volunteer or
 * beneficiary list on a phone) from the people tab.
 */
export async function openDestination(page: Page, name: string): Promise<void> {
  const nav = mainMenu(page);
  await expect(nav).toBeVisible();
  const direct = nav.getByRole('link', { name, exact: true });
  if ((await direct.count()) > 0) await direct.click();
  else {
    await nav.getByRole('button', { name: 'আরও' }).click();
    const sheet = page.getByRole('dialog', { name: 'আরও' });
    await expect(sheet).toBeVisible();
    const inSheet = sheet.getByRole('link', { name, exact: true });
    if ((await inSheet.count()) > 0) await inSheet.click();
    else {
      await page.keyboard.press('Escape');
      await nav.getByRole('link', { name: 'মানুষ' }).click();
    }
  }
}

/** Opens a destination from the app shell and waits for its heading of the same name. */
export async function openTab(page: Page, name: string): Promise<void> {
  await openDestination(page, name);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

/** Opens the profile menu of the app bar and picks an item. */
export async function fromProfileMenu(page: Page, item: string): Promise<void> {
  await page.getByRole('banner').getByRole('button', { name: 'প্রোফাইল মেনু' }).click();
  await page.getByRole('menuitem', { name: item }).click();
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
