import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { openDestination, rows } from './support/admin';

// The permission panel against the API on its E2E database (SCR-062, RBAC.md 7; plan
// docs/plans/2026-10-12-1100-feat-rbac-permission-panel-plan.md, U8), and the audit entry the
// change leaves (every panel change is audited with its reason). Mobile and desktop share
// the database, so each project changes the permissions of its own target account and signs its
// reasons (docs/testing/DEMO_ACCOUNTS.md).
const PASSWORD = 'CssDemo2026';
const CASES = {
  desktop: {
    manager: 'head@example.org',
    target: 'executive@example.org',
    name: 'প্রজেক্ট এক্সিকিউটিভ (নমুনা)',
  },
  mobile: {
    manager: 'monitoring@example.org',
    target: 'daee@example.org',
    name: 'অফিসিয়াল দায়ী (নমুনা)',
  },
} as const;
const caseOf = (project: string) => CASES[project === 'mobile' ? 'mobile' : 'desktop'];

/**
 * Waits until no entrance animation runs: the bottom sheet and its scrim slide and fade in on
 * phones, and a list opened meanwhile would be clicked through the moving sheet.
 */
const settle = (page: Page) =>
  // an animation cancelled meanwhile (a removed element) rejects `finished` with an AbortError
  page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))),
  );

const scan = (page: Page) => new AxeBuilder({ page }).exclude('[data-live-announcer]').analyze();

// Signs in through the form in each test, as admin.spec.ts and auth.spec.ts do: the journey starts
// at the login screen, and each test stays independent of a stored session.
async function signIn(page: Page, loginId: string): Promise<void> {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'লগইন', exact: true })).toBeEnabled();
  await page.getByRole('textbox', { name: /মোবাইল নম্বর বা ইমেইল/ }).fill(loginId);
  await page
    .getByLabel(/^পাসওয়ার্ড/, { exact: false })
    .first()
    .fill(PASSWORD);
  await page.getByRole('button', { name: 'লগইন', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
}

test.describe('permission panel', () => {
  test('a manager grants a permission and ends it again', async ({ page }, info) => {
    const c = caseOf(info.project.name);
    await signIn(page, c.manager);
    await openDestination(page, 'পারমিশন');
    await expect(page.getByRole('heading', { level: 1, name: 'পারমিশন প্যানেল' })).toBeVisible();

    await page.getByRole('combobox', { name: /ব্যবহারকারী খুঁজুন/ }).fill(c.target);
    await page.getByRole('option', { name: new RegExp(c.name.replace(/[()]/g, '\\$&')) }).click();
    const effective = page.getByRole('region', { name: 'কার্যকর পারমিশন' });
    await expect(
      effective.getByText('রোলের ডিফল্ট').filter({ visible: true }).first(),
    ).toBeVisible();

    await page.getByRole('button', { name: 'পারমিশন দিন' }).click();
    const dialog = page.getByRole('dialog', { name: 'পারমিশন দিন' });
    await settle(page);
    await dialog.getByRole('combobox', { name: /পারমিশন/ }).fill('permission.view');
    await settle(page);
    // options are chosen with the keyboard: on phones a pointer has to scroll the sheet, which
    // moves it under the floating list
    await expect(page.getByRole('option', { name: 'permission.view', exact: true })).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(dialog.getByRole('combobox', { name: /পারমিশন/ })).toHaveValue('permission.view');
    await dialog.getByRole('button', { name: /স্কোপ/ }).press('Enter');
    await expect(page.getByRole('option', { name: 'সারা দেশ (GLOBAL)' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog.getByRole('button', { name: /স্কোপ/ })).toContainText('সারা দেশ (GLOBAL)');
    const reason = `E2E: monitoring help (${info.project.name} ${Date.now() % 100000})`;
    await dialog.getByRole('textbox', { name: /কারণ/ }).fill(reason);
    await dialog.getByRole('button', { name: 'দিন', exact: true }).click();
    await expect(page.getByText('পারমিশন দেওয়া হয়েছে')).toBeVisible();
    await expect(effective.getByText('প্যানেল').filter({ visible: true }).first()).toBeVisible();

    await effective
      .getByRole('button', { name: 'permission.view প্রত্যাহার' })
      .filter({ visible: true })
      .first()
      .click();
    const confirm = page.getByRole('alertdialog', { name: 'পারমিশন প্রত্যাহার' });
    await settle(page);
    await confirm.getByRole('textbox', { name: /কারণ/ }).fill('E2E: no longer needed');
    await confirm.getByRole('button', { name: 'প্রত্যাহার করুন' }).click();
    await expect(page.getByText('পারমিশন প্রত্যাহার করা হয়েছে')).toBeVisible();

    const notice = page.getByText('এই পর্দা বড় স্ক্রিনে ভালো চলে।');
    if (info.project.name === 'mobile') await expect(notice).toBeVisible();
    else await expect(notice).toBeHidden();
    expect((await scan(page)).violations).toEqual([]);

    // the grant is in the audit log as a permission change of the target, with its reason; the
    // other project changes its own target at the same time, so its entries may be newer
    await page.goto('/admin/audit?action=permission_change&entityType=user');
    await expect(page.getByRole('heading', { level: 1, name: 'অডিট লগ' })).toBeVisible();
    await expect(rows(page, 'অডিট লগের এন্ট্রি')).toBeVisible();
    const details = page
      .getByRole('button', { name: 'permission_change বিস্তারিত দেখুন' })
      .or(page.getByRole('button', { name: 'বিস্তারিত', exact: true }));
    await expect(details.first()).toBeVisible();
    let found = false;
    const shown = Math.min(await details.count(), 8);
    for (let i = 0; i < shown && !found; i += 1) {
      await details.nth(i).click();
      const drawer = page.getByRole('dialog', { name: 'অডিট এন্ট্রি' });
      await expect(drawer).toBeVisible();
      const text = (await drawer.textContent()) ?? '';
      // the reason is this run's own; the entity line names the user kind
      found = text.includes(reason) && text.includes('user');
      await page.keyboard.press('Escape');
      await expect(drawer).toHaveCount(0);
    }
    expect(found, 'the grant with its reason in the audit log').toBe(true);
  });

  test('a Program Manager has no panel item and no access to the panel', async ({ page }) => {
    await signIn(page, 'pm.err@example.org');
    await expect(page.getByRole('navigation', { name: 'প্রধান মেনু' })).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'প্রধান মেনু' }).getByRole('link', { name: 'পারমিশন' }),
    ).toHaveCount(0);
    await page.goto('/admin/permissions');
    await expect(page.getByText('এই পাতায় আপনার প্রবেশাধিকার নেই।')).toBeVisible();
  });
});
