import { expect, test } from '@playwright/test';
import { choose, mainMenu, newOfficial, noSideways, scan, signIn } from './support/admin';

// The role change on an official's profile (docs/security/RBAC.md, "Roles"; docs/BUSINESS_RULES.md,
// "An official's role is changed") against the API on its E2E database with the demo seed
// (docs/testing/DEMO_ACCOUNTS.md): the Department Head makes a Project Executive an RPM with a
// reason, the history lists both roles, and the person, signed in already, meets the menu of an
// RPM on the next page. The official is made for the run, so no demo account's role moves.
const HEAD = 'head@example.org';
/** A destination an RPM has and a Project Executive has not. */
const STAFF = 'কর্মী';

test.describe('the role change', () => {
  test('the Head makes a Project Executive an RPM, and the person meets the new menu', async ({
    page,
    browser,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'one account, one project');
    const suffix = Date.now().toString(36).slice(-5);
    const jobId = `RC-${suffix}`.toUpperCase();
    const name = `রোল পরীক্ষা ${suffix}`;
    await signIn(page, HEAD);
    const userId = await newOfficial(page, HEAD, {
      jobId,
      name,
      roleKey: 'project_executive',
      designation: 'Project Executive',
    });

    // the person signs in first, as a Project Executive
    const other = await browser.newContext({ baseURL: info.project.use.baseURL });
    const person = await other.newPage();
    await signIn(person, jobId);
    await expect(mainMenu(person).getByRole('link', { name: STAFF })).toHaveCount(0);

    await page.goto(`/admin/staff/${userId}`);
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await page.getByRole('button', { name: 'রোল বদলান' }).click();
    const dialog = page.getByRole('dialog', { name: `${name}-এর রোল বদলান` });
    await expect(dialog.getByText('এখনকার রোল: প্রজেক্ট এক্সিকিউটিভ')).toBeVisible();
    await choose(page, 'নতুন রোল', 'রিজিওনাল প্রোগ্রাম ম্যানেজার');
    await dialog.getByRole('textbox', { name: /কারণ/ }).fill('নতুন অঞ্চলের দায়িত্ব');
    expect((await scan(page)).violations).toEqual([]);
    await dialog.getByRole('button', { name: 'রোল বদলান' }).click();
    await expect(page.getByText('রোল বদলানো হয়েছে।')).toBeVisible();
    await expect(dialog).toHaveCount(0);

    // the history, the newest first: the new role now, the old one ended
    const history = page.getByRole('region', { name: 'রোলের ইতিহাস' });
    const items = history.getByRole('listitem');
    await expect(items.first()).toContainText('রিজিওনাল প্রোগ্রাম ম্যানেজার');
    await expect(items.first()).toContainText('এখন');
    await expect(items.nth(1)).toContainText('প্রজেক্ট এক্সিকিউটিভ');
    await expect(items.nth(1)).toContainText('শেষ করেছেন');
    expect((await scan(page)).violations).toEqual([]);

    // the person's next page reads the new role
    await person.reload();
    await expect(mainMenu(person).getByRole('link', { name: STAFF })).toBeVisible();
    await other.close();

    // the page reads on a phone too
    await page.setViewportSize({ width: 360, height: 780 });
    await expect(history).toBeVisible();
    expect(await noSideways(page)).toBe(true);
  });
});
