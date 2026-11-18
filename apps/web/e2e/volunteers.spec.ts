import { expect, type Page, test, type TestInfo } from '@playwright/test';
import { filterBy, mainMenu, openTab, rows as listRows, scan, signIn } from './support/admin';

// The nationwide volunteer tab (docs/ui/SCREENS.md, the volunteer tab and the volunteer profile)
// against the API on its E2E database with the demo seed (docs/testing/DEMO_ACCOUNTS.md): the
// counts, the area filter kept in the address, the NID held back outside the caller's region, and
// the refusal for volunteers. Mobile and desktop share the database, so each signs in with its own
// accounts.
const ACCOUNTS = {
  desktop: { official: 'rpm.dhaka@example.org', volunteer: '01700000111' },
  mobile: { official: 'pm.hum@example.org', volunteer: '01700000113' },
} as const;
const accounts = (info: TestInfo) =>
  ACCOUNTS[info.project.name === 'mobile' ? 'mobile' : 'desktop'];

const TAB = 'স্বেচ্ছাসেবক';
const rows = (page: Page) => listRows(page, TAB);

/** Narrows the list to one volunteer by name, so the test never depends on which page holds them. */
async function find(page: Page, name: string) {
  const box = page.getByRole('searchbox');
  await box.fill(name);
  await expect(
    rows(page)
      .getByRole('link', { name })
      .or(page.getByText(/পাওয়া যায়নি/)),
  ).toBeVisible();
}

test.describe('the volunteer tab', () => {
  test("a row's action button opens the volunteer's profile", async ({ page }, info) => {
    await signIn(page, accounts(info).official);
    await openTab(page, TAB);
    await find(page, 'স্বেচ্ছাসেবক 2 (নমুনা)');
    await rows(page).getByRole('button', { name: 'স্বেচ্ছাসেবক 2 (নমুনা)-এর কাজ' }).click();
    await page.getByRole('menuitem', { name: 'প্রোফাইল দেখুন' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'স্বেচ্ছাসেবক 2 (নমুনা)' }),
    ).toBeVisible();
  });

  test('an official filters by district, and the filter stays in the address', async ({
    page,
  }, info) => {
    await signIn(page, accounts(info).official);
    await openTab(page, TAB);
    const counts = page.getByRole('group', { name: 'স্বেচ্ছাসেবকের হিসাব' });
    await expect(counts.getByRole('button', { name: /^সব \d/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await find(page, 'স্বেচ্ছাসেবক 2 (নমুনা)');
    await expect(rows(page).getByRole('link', { name: 'স্বেচ্ছাসেবক 2 (নমুনা)' })).toBeVisible();

    await filterBy(page, info, [
      ['বিভাগ', 'ঢাকা'],
      ['জেলা', 'ঢাকা'],
    ]);
    await expect(page).toHaveURL(/districtId=/);
    // the Rangpur volunteers live in Dinajpur
    await expect(rows(page).getByRole('link', { name: 'স্বেচ্ছাসেবক 2 (নমুনা)' })).toHaveCount(0);
    await find(page, 'স্বেচ্ছাসেবক 1 (নমুনা)');
    await expect(rows(page).getByRole('link', { name: 'স্বেচ্ছাসেবক 1 (নমুনা)' })).toBeVisible();
    await expect(rows(page).getByText('দিনাজপুর')).toHaveCount(0);

    // a reload shows the same view: the address keeps the filter and its chip shows it
    await page.reload();
    await expect(page).toHaveURL(/districtId=/);
    await expect(page.getByRole('button', { name: /^জেলা: ঢাকা সরান$/ })).toBeVisible();
    await find(page, 'স্বেচ্ছাসেবক 1 (নমুনা)');
    await expect(rows(page).getByRole('link', { name: 'স্বেচ্ছাসেবক 1 (নমুনা)' })).toBeVisible();
    await find(page, 'স্বেচ্ছাসেবক 2 (নমুনা)');
    await expect(rows(page).getByRole('link', { name: 'স্বেচ্ছাসেবক 2 (নমুনা)' })).toHaveCount(0);

    // a phone of 360 px never scrolls sideways
    await page.setViewportSize({ width: 360, height: 780 });
    // measured once the phone layout has replaced the table
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      )
      .toBe(true);
    expect((await scan(page)).violations).toEqual([]);
  });

  test('the Dhaka RPM sees the NID of a Dhaka volunteer, not of a Rangpur one', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'one account, one project');
    await signIn(page, accounts(info).official);
    await openTab(page, TAB);

    await find(page, 'স্বেচ্ছাসেবক 2 (নমুনা)');
    await rows(page).getByRole('link', { name: 'স্বেচ্ছাসেবক 2 (নমুনা)' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'স্বেচ্ছাসেবক 2 (নমুনা)' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'ব্যক্তিগত তথ্য' })).toBeVisible();
    await expect(page.getByText('আপনার জন্য দেখানো হয় না').first()).toBeVisible();
    await expect(page.getByText('1000000002')).toHaveCount(0);
    expect((await scan(page)).violations).toEqual([]);

    await page.getByRole('link', { name: 'সব স্বেচ্ছাসেবক' }).click();
    await find(page, 'স্বেচ্ছাসেবক 1 (নমুনা)');
    await rows(page).getByRole('link', { name: 'স্বেচ্ছাসেবক 1 (নমুনা)' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'স্বেচ্ছাসেবক 1 (নমুনা)' }),
    ).toBeVisible();
    // the NID in its section and, read out with its label and a copy button, in the banner
    await expect(page.getByText('1000000001', { exact: true })).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'NID নম্বর কপি করুন' })).toBeVisible();
  });

  test('a volunteer has no admin link, and the tab shows the forbidden page', async ({
    page,
  }, info) => {
    await signIn(page, accounts(info).volunteer);
    await expect(mainMenu(page)).toBeVisible();
    const destinations = await mainMenu(page)
      .getByRole('link')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
    expect(destinations.filter((href) => href.startsWith('/admin'))).toEqual([]);
    for (const path of ['/admin/volunteers', '/admin/beneficiaries']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: 'প্রবেশাধিকার নেই' })).toBeVisible();
    }
  });
});
