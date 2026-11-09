import { devices, expect, test } from '@playwright/test';
import { isPhone, mainMenu, openTab, scan, signIn } from './support/admin';
import { activeProject, code, ERR } from './support/projects';

// Assign → consent → the project appears (plan
// docs/plans/2026-10-17-0905-feat-templates-consent-assignment-plan.md, the end-to-end journey):
// the Monitoring Team activates a project of ERR with rules in the Dhaka division; the Dhaka RPM assigns a
// volunteer found by mobile; the volunteer reads the rules part by part, accepts, and the project
// opens; another volunteer never sees it. The officials work in a desktop window of their own; the
// volunteer's part runs in the project's viewport, so on the phone project it is checked at phone
// width. Each run makes its own project.
// the Monitoring Team creates projects in every program; the PMs of the demo seed work in other specs
const CREATOR = 'monitoring@example.org';
const RPM = 'rpm.dhaka@example.org';
// volunteers of the Dhaka division in the demo seed that no other spec signs in with
const VOLUNTEER = { desktop: '01700000115', mobile: '01700000117' } as const;
// a volunteer the projects spec only signs in with, never assigned
const OTHER = '01700000101';

test.describe('assigning volunteers and their consent', () => {
  test('an RPM assigns a volunteer, who accepts the rules and then sees the project', async ({
    browser,
    page,
  }, info) => {
    test.setTimeout(240_000);
    const mobile = VOLUNTEER[isPhone(info) ? 'mobile' : 'desktop'];
    const name = `অ্যাসাইনের পরীক্ষা ${code()}`;
    // a desktop browser of their own, also when the test runs as the phone project
    const officials = await browser.newContext({ ...devices['Desktop Chrome'] });
    const desk = await officials.newPage();

    // a project with rules in the Dhaka division, made active
    await signIn(desk, CREATOR);
    await openTab(desk, 'প্রকল্প');
    const projectId = await activeProject(desk, name, ERR, CREATOR);

    // the Dhaka RPM assigns the volunteer found by mobile number
    await desk.context().clearCookies();
    await signIn(desk, RPM);
    await desk.goto(`/admin/projects/${projectId}/volunteers`);
    await expect(
      desk.getByRole('heading', { level: 1, name: `স্বেচ্ছাসেবক: ${name}` }),
    ).toBeVisible();
    await desk.getByRole('button', { name: 'স্বেচ্ছাসেবক অ্যাসাইন করুন' }).click();
    const dialog = desk.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'নাম বা মোবাইল নম্বর' }).fill(mobile);
    const candidates = dialog.getByRole('table', { name: 'অ্যাসাইন করা যায় এমন স্বেচ্ছাসেবক' });
    await expect(candidates.getByRole('row')).toHaveCount(2);
    // a row is chosen by pressing it (the checkbox input itself is visually hidden)
    await candidates.getByRole('row').nth(1).getByRole('cell').nth(1).click();
    await expect(dialog.getByText('1 জন বাছাই করা হয়েছে')).toBeVisible();
    await dialog.getByRole('button', { name: 'অ্যাসাইন করুন', exact: true }).click();
    await expect(desk.getByText(/1 জন স্বেচ্ছাসেবক অ্যাসাইন হয়েছেন/)).toBeVisible();
    const assigned = desk.getByRole('table', { name: 'প্রকল্পে অ্যাসাইন করা স্বেচ্ছাসেবক' });
    await expect(assigned.getByText('সম্মতির অপেক্ষায়')).toBeVisible();
    await officials.close();

    // the volunteer sees the project waiting, reads the rules part by part and accepts
    await signIn(page, mobile);
    await mainMenu(page).getByRole('link', { name: 'আমার প্রকল্প' }).click();
    const list = page.getByRole('list', { name: 'আমার প্রকল্পের তালিকা' });
    const card = list.getByRole('listitem').filter({ hasText: name });
    await expect(card.getByText('নিয়মাবলিতে সম্মতির অপেক্ষায়')).toBeVisible();
    await card.getByRole('link', { name: 'নিয়মাবলি পড়ুন' }).click();
    for (let part = 0; part < 3; part += 1) {
      await page.getByText('আমি পড়েছি এবং মেনে চলব').click();
      await page.getByRole('button', { name: 'পরের ধাপ' }).click();
    }
    await page.getByText('আমি রাজি এবং এই প্রকল্পে কাজ করতে আগ্রহী').click();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect((await scan(page)).violations).toEqual([]);
    await page.getByRole('button', { name: 'সম্মতি দিন' }).click();
    // the project is open: its work facts and the applications against the limit
    await expect(page.getByText('0 টি দেওয়া হয়েছে, আরও 50 টি দেওয়া যাবে')).toBeVisible();
    await page.getByRole('link', { name: 'আমার প্রকল্পে ফিরে যান' }).click();
    await expect(
      page.getByRole('list', { name: 'আমার প্রকল্পের তালিকা' }).getByRole('listitem').filter({
        hasText: name,
      }),
    ).toContainText('সক্রিয়');
  });

  test('a volunteer who is not assigned never sees the project', async ({ page }, info) => {
    test.skip(isPhone(info), 'one volunteer is enough');
    await signIn(page, OTHER);
    await mainMenu(page).getByRole('link', { name: 'আমার প্রকল্প' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'আমার প্রকল্প' })).toBeVisible();
    await expect(page.getByText(/অ্যাসাইনের পরীক্ষা/)).toHaveCount(0);
  });
});
