import { expect, type Page, test } from '@playwright/test';
import {
  choose,
  isPhone,
  newOfficial,
  noSideways,
  openTab,
  rows as listRows,
  scan,
  signIn,
} from './support/admin';

// An official's extra area for volunteers (docs/security/RBAC.md, "Data scopes and their
// resolution"; docs/BUSINESS_RULES.md, "An official may be given an extra area"), against the API
// on its E2E database with the demo seed (docs/testing/DEMO_ACCOUNTS.md): an RPM with no project
// finds the volunteer tab empty and reads why; the Department Head (an Admin on a phone) gives
// the Rangpur division on the RPM's profile, the RPM then meets a Rangpur volunteer and reads the
// area on the own profile; once the area is ended the volunteer is gone again. The RPM is made
// for this run through the API, so no demo account's reach moves under the other specs.
const ADMIN = { desktop: 'head@example.org', mobile: 'admin@example.org' } as const;
const TAB = 'স্বেচ্ছাসেবক';
/** Volunteer 2 of the demo seed lives in the Rangpur division. */
const OF_RANGPUR = 'স্বেচ্ছাসেবক 2 (নমুনা)';
const WHY_EMPTY = /আপনি শুধু নিজের চলমান প্রকল্পের এলাকার স্বেচ্ছাসেবকদের দেখতে পান।/;

/** Searches the volunteer tab for a name, waiting for the list read of that search. */
async function find(page: Page, name: string) {
  const read = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/volunteers') && url.searchParams.has('q') && response.ok();
  });
  await page.getByRole('searchbox').fill(name);
  await read;
  await expect(
    listRows(page, TAB)
      .getByRole('link', { name })
      .or(page.getByText(/পাওয়া যায়নি/)),
  ).toBeVisible();
}

test.describe('an extra area for volunteers', () => {
  test('an RPM with no project meets the volunteers of an area given on the profile, until it is ended', async ({
    page,
    browser,
  }, info) => {
    const admin = ADMIN[isPhone(info) ? 'mobile' : 'desktop'];
    const suffix = `${Date.now().toString(36).slice(-5)}${isPhone(info) ? 'm' : 'd'}`;
    const jobId = `XA-${suffix}`.toUpperCase();
    const name = `এলাকা পরীক্ষা ${suffix}`;
    await signIn(page, admin);
    const userId = await newOfficial(page, admin, {
      jobId,
      name,
      roleKey: 'regional_program_manager',
      designation: 'Regional Program Manager',
    });

    // the RPM in a browser of their own: no project, so nobody in the tab, and the reason why
    const other = await browser.newContext({
      baseURL: info.project.use.baseURL,
      viewport: info.project.use.viewport,
      isMobile: info.project.use.isMobile,
      hasTouch: info.project.use.hasTouch,
    });
    const rpm = await other.newPage();
    await signIn(rpm, jobId);
    await openTab(rpm, TAB);
    await expect(rpm.getByText(WHY_EMPTY)).toBeVisible();
    expect(await noSideways(rpm)).toBe(true);
    expect((await scan(rpm)).violations).toEqual([]);

    // the giver adds Rangpur on the RPM's profile, with a reason
    await page.goto(`/admin/staff/${userId}`);
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    const areas = page.getByRole('region', { name: 'বাড়তি এলাকা' });
    await expect(areas.getByText('কোনো বাড়তি এলাকা দেওয়া হয়নি।')).toBeVisible();
    await areas.getByRole('button', { name: 'এলাকা যোগ করুন' }).click();
    const dialog = page.getByRole('dialog', { name: `${name}-কে বাড়তি এলাকা দিন` });
    await choose(page, 'বিভাগ', 'রংপুর');
    await dialog.getByRole('textbox', { name: /কারণ/ }).fill('রংপুরে নতুন প্রকল্পের প্রস্তুতি');
    await dialog.getByRole('button', { name: 'এলাকা দিন' }).click();
    await expect(areas.getByText('বাড়তি এলাকা দেওয়া হয়েছে।')).toBeVisible();
    const given = areas.getByRole('listitem').filter({ hasText: 'রংপুর' });
    await expect(given).toContainText('কারণ: রংপুরে নতুন প্রকল্পের প্রস্তুতি');
    expect(await noSideways(page)).toBe(true);
    expect((await scan(page)).violations).toEqual([]);

    // the RPM now meets a Rangpur volunteer, and reads the area on the own profile
    await rpm.reload();
    await expect(rpm.getByRole('heading', { level: 1, name: TAB })).toBeVisible();
    await find(rpm, OF_RANGPUR);
    await expect(listRows(rpm, TAB).getByRole('link', { name: OF_RANGPUR })).toBeVisible();
    await rpm.goto('/account/profile');
    await rpm.getByRole('button', { name: 'আমার প্রকল্প' }).click();
    await expect(rpm.getByRole('region', { name: 'বাড়তি এলাকা' })).toContainText('রংপুর');
    expect(await noSideways(rpm)).toBe(true);

    // ended with a reason: the volunteer is out of the RPM's tab again
    await given.getByRole('button', { name: 'শেষ করুন' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'রংপুর: বাড়তি এলাকা শেষ করুন' });
    await confirm.getByRole('textbox', { name: /কারণ/ }).fill('প্রস্তুতি শেষ');
    await confirm.getByRole('button', { name: 'শেষ করুন' }).click();
    await expect(areas.getByText('বাড়তি এলাকা শেষ করা হয়েছে।')).toBeVisible();
    await expect(areas.getByText('কোনো বাড়তি এলাকা দেওয়া হয়নি।')).toBeVisible();

    await openTab(rpm, TAB);
    await find(rpm, OF_RANGPUR);
    await expect(listRows(rpm, TAB).getByRole('link', { name: OF_RANGPUR })).toHaveCount(0);
    await expect(rpm.getByText(WHY_EMPTY)).toBeVisible();
    await other.close();
  });
});
