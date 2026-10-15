import { expect, type Locator, type Page, test, type TestInfo } from '@playwright/test';
import { openTab, rows as listRows, scan, signIn } from './support/admin';

/** Picks an option of a Select inside a part of the page (the list behind a dialog has Selects too). */
async function chooseIn(page: Page, scope: Locator, label: string, option: string) {
  // the name is the value, then the label, then "(আবশ্যক)" for a required field
  await scope.getByRole('button', { name: new RegExp(`\\s${label}( \\(আবশ্যক\\))?$`) }).click();
  await page.getByRole('listbox').getByRole('option', { name: option, exact: true }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

// Programs and project setup against the API on its E2E database with the demo seed
// (docs/testing/DEMO_ACCOUNTS.md): a PM creates a draft, sees what activation still needs, fills
// the setup section by section, activates, closes in two steps and reopens; a second draft is
// cancelled. pm.hum works on phones in volunteers.spec.ts, so this journey runs as pm.ucd on the
// desktop only; each run makes its own project codes.
const PM = 'pm.ucd@example.org';
const VOLUNTEER = { desktop: '01700000101', mobile: '01700000103' } as const;
const TAB = 'প্রকল্প';

/** A project code of its own for this run: E and three random capital letters. */
const code = () =>
  `E${Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('')}`;

const section = (page: Page, name: string): Locator => page.getByRole('region', { name });
/** The state badge beside the project's name. */
const state = (page: Page, badge: string): Locator =>
  page.locator('.admin-title-row').getByText(badge, { exact: true });

async function newDraft(page: Page, projectCode: string, name: string) {
  await page.getByRole('button', { name: 'নতুন প্রকল্প' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /প্রকল্প কোড/ }).fill(projectCode);
  await dialog.getByRole('textbox', { name: /বাংলায় নাম/ }).fill(name);
  await dialog.getByRole('textbox', { name: /ইংরেজিতে নাম/ }).fill(`${name} EN`);
  await dialog.getByRole('textbox', { name: /বছর/ }).fill('2026');
  await chooseIn(
    page,
    dialog,
    'প্রোগ্রাম',
    'আন্ডারপ্রিভিলেজড কমিউনিটি ডেভেলপমেন্ট প্রোগ্রাম (UCD)',
  );
  await chooseIn(page, dialog, 'ওয়ার্কফ্লো', 'বিতরণ');
  await dialog.getByRole('button', { name: 'খসড়া তৈরি করুন' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(state(page, 'খসড়া')).toBeVisible();
}

/** Types a date into the segments of a date field (dd-mm-yyyy). */
async function typeDate(page: Page, scope: Locator, label: string, ddmmyyyy: string) {
  await scope.getByRole('group', { name: label }).getByRole('spinbutton').first().click();
  await page.keyboard.type(ddmmyyyy);
}

/** A lifecycle move with its reason, then the new state badge. */
async function move(page: Page, button: string, badge: string) {
  await page.getByRole('button', { name: button, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /কারণ/ }).fill('পরীক্ষার কারণ');
  await dialog.getByRole('button', { name: button, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(state(page, badge)).toBeVisible();
}

test.describe('programs and project setup', () => {
  test('a PM creates, sets up, activates, closes and reopens a project', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'one PM, one project');
    test.setTimeout(180_000);
    const name = `শীতবস্ত্র পরীক্ষা ${code()}`;
    await signIn(page, PM);
    await openTab(page, TAB);
    await newDraft(page, code(), name);

    // activation lists what is still missing
    await page.getByRole('button', { name: 'সক্রিয় করুন', exact: true }).click();
    const missing = page.getByRole('alert');
    await expect(missing.getByText('আরপিএমসহ একটি এলাকা')).toBeVisible();
    await expect(missing.getByText('ছবির নিয়ম')).toBeVisible();

    await page.getByRole('link', { name: 'সেটআপ' }).click();
    await expect(page.getByRole('heading', { level: 1, name: `সেটআপ: ${name}` })).toBeVisible();

    // the budget and its fund source, saved together
    const budget = section(page, 'বাজেট ও তহবিলের উৎস');
    await budget.getByRole('textbox', { name: /প্রতিজনের খরচ/ }).fill('1000');
    await budget.getByRole('textbox', { name: /লক্ষ্য/ }).fill('100');
    await budget.getByRole('button', { name: 'তহবিলের উৎস যোগ করুন' }).click();
    await chooseIn(page, budget, 'তহবিলের উৎস', 'যাকাত');
    await budget.getByRole('textbox', { name: /পরিমাণ/ }).fill('100000');
    await budget.getByRole('button', { name: 'সংরক্ষণ' }).click();
    await expect(budget.getByText('সংরক্ষিত হয়েছে।')).toBeVisible();

    // the application window and the per-volunteer limit
    const window = section(page, 'আবেদনের সময়সীমা ও সীমা');
    await typeDate(page, window, 'আবেদন শুরু', '01112026');
    await typeDate(page, window, 'আবেদনের শেষ তারিখ', '31122026');
    await window.getByRole('textbox', { name: /আবেদন সীমা/ }).fill('50');
    await window.getByRole('button', { name: 'সংরক্ষণ' }).click();
    await expect(window.getByText('সংরক্ষিত হয়েছে।')).toBeVisible();

    // one area with its RPM
    const areas = section(page, 'এলাকা ও আরপিএম');
    await chooseIn(page, areas, 'বিভাগ', 'ঢাকা');
    await areas.getByRole('combobox', { name: /আরপিএম/ }).fill('আরপিএম ঢাকা');
    await page
      .getByRole('option', { name: /^আরপিএম ঢাকা/ })
      .first()
      .click();
    await areas.getByRole('button', { name: 'এলাকা যোগ করুন' }).click();
    await expect(areas.getByText('আরপিএম ঢাকা', { exact: false }).first()).toBeVisible();

    // the photo rule in the distribution component's settings
    await page.getByRole('button', { name: 'বিতরণ ও ছবি-এর সেটিংস' }).click();
    const drawer = page.getByRole('dialog');
    await drawer.getByText('শুধু দলের ছবি', { exact: true }).click();
    await expect(drawer.getByRole('radio', { name: 'শুধু দলের ছবি' })).toBeChecked();
    await drawer.getByRole('button', { name: 'সংরক্ষণ' }).click();
    await expect(drawer).toHaveCount(0);

    const summary = page.getByRole('complementary', { name: 'সারসংক্ষেপ' });
    await expect(summary.getByText('সক্রিয় করার জন্য দরকারি সব আছে।')).toBeVisible();
    // a reload keeps what was saved
    await page.reload();
    await expect(
      section(page, 'আবেদনের সময়সীমা ও সীমা').getByRole('textbox', { name: /আবেদন সীমা/ }),
    ).toHaveValue('50');
    await expect(summary.getByText('সক্রিয় করার জন্য দরকারি সব আছে।')).toBeVisible();
    expect((await scan(page)).violations).toEqual([]);

    // activate: the year is fixed from now on
    await page.getByRole('link', { name: 'প্রকল্পে ফিরে যান' }).click();
    await page.getByRole('button', { name: 'সক্রিয় করুন', exact: true }).click();
    await expect(state(page, 'সক্রিয়')).toBeVisible();
    await page.getByRole('link', { name: 'সেটআপ' }).click();
    await expect(section(page, 'মৌলিক তথ্য').getByRole('textbox', { name: /বছর/ })).toHaveAttribute(
      'readonly',
      '',
    );
    await page.getByRole('link', { name: 'প্রকল্পে ফিরে যান' }).click();

    // close in two steps, then every field is read-only
    await move(page, 'বন্ধ শুরু করুন', 'বন্ধ হচ্ছে');
    await move(page, 'প্রকল্প বন্ধ করুন', 'বন্ধ');
    await page.getByRole('link', { name: 'সেটআপ' }).click();
    await expect(page.getByText(/এর সেটআপ বদলানো যায় না/)).toBeVisible();
    await expect(
      section(page, 'মৌলিক তথ্য').getByRole('textbox', { name: /বাংলায় নাম/ }),
    ).toHaveAttribute('readonly', '');
    await page.getByRole('link', { name: 'প্রকল্পে ফিরে যান' }).click();

    // reopen
    await move(page, 'আবার খুলুন', 'সক্রিয়');
  });

  test('a draft that was never activated is cancelled and leaves the list', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'one PM, one project');
    const name = `বাতিলের পরীক্ষা ${code()}`;
    await signIn(page, PM);
    await openTab(page, TAB);
    await newDraft(page, code(), name);
    await move(page, 'বাতিল করুন', 'বাতিল');
    await page.getByRole('link', { name: 'সব প্রকল্প' }).click();
    // the list has loaded (another PM's project is in it) before the cancelled one is looked for
    await expect(listRows(page, TAB)).toBeVisible();
    await expect(page.getByText(/^\d+টির মধ্যে \d+টি$/).first()).toBeVisible();
    await expect(listRows(page, TAB).getByRole('link', { name })).toHaveCount(0);
  });

  test('a volunteer has no project menu and is refused the list', async ({
    page,
  }, info: TestInfo) => {
    await signIn(page, VOLUNTEER[info.project.name === 'mobile' ? 'mobile' : 'desktop']);
    await expect(page.getByRole('link', { name: 'অ্যাডমিন' })).toHaveCount(0);
    await page.goto('/admin/projects');
    await expect(page.getByRole('heading', { level: 1, name: 'প্রবেশাধিকার নেই' })).toBeVisible();
  });

  test('the project list does not scroll sideways on a phone', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'the phone layout');
    await signIn(page, 'pm.err@example.org');
    await openTab(page, TAB);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect((await scan(page)).violations).toEqual([]);
  });
});
