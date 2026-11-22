import { expect, type Page, test, type TestInfo } from '@playwright/test';
import {
  mainMenu,
  openProjectsTab,
  PROJECTS_TAB,
  rows as listRows,
  scan,
  signIn,
} from './support/admin';
import {
  chooseIn,
  code,
  ERR,
  newDraft,
  newSeries,
  next,
  projectIdOf,
  placeReadyForm,
  publishReadyForm,
  section,
  state,
  typeDate,
  writeRules,
} from './support/projects';

// Programs and project setup against the API on its E2E database with the demo seed
// (docs/testing/DEMO_ACCOUNTS.md): a PM starts a project in the setup wizard, walks its steps with
// Next, saves the draft and exits, comes back to the first step with something missing, activates
// from the review, closes in two steps and reopens; a second draft is cancelled. pm.hum works on
// phones in volunteers.spec.ts, so this journey runs as pm.ucd on the desktop only; each run makes
// its own project codes.
const PM = 'pm.ucd@example.org';
const COPY_PM = 'pm.err@example.org';
const VOLUNTEER = { desktop: '01700000101', mobile: '01700000103' } as const;
/** The name of the list of the sessions, the tab's second view. */
const LIST = 'প্রকল্প';
const RPM = 'rpm.dhaka@example.org';
const UCD_NAME = 'আন্ডারপ্রিভিলেজড কমিউনিটি ডেভেলপমেন্ট প্রোগ্রাম';

/** Opens the session's summary, a tab of the frame above every page of the session. */
async function openSummary(page: Page) {
  await page
    .getByRole('navigation', { name: 'প্রকল্পের অংশ' })
    .getByRole('link', { name: 'সারসংক্ষেপ' })
    .click();
  // the summary has drawn, and the header with it shows the summary's moves
  await expect(page.getByRole('heading', { name: 'প্রকল্পের মূল তথ্য' })).toBeVisible();
}

/**
 * A lifecycle move with its reason, then the new state badge: the main move of the state is the
 * header's button, the others are in its "more actions" menu.
 */
async function move(page: Page, button: string, badge: string) {
  const actions = page.getByRole('region', { name: 'প্রকল্পের কাজ' });
  const more = actions.getByRole('button', { name: 'আরও কাজ' });
  // the menu and the main move are drawn together, so once the menu is there the main one is too
  await expect(more).toBeVisible();
  const main = actions.getByRole('button', { name: button, exact: true });
  if (await main.count()) await main.click();
  else {
    await more.click();
    await page.getByRole('menuitem', { name: button, exact: true }).click();
  }
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /কারণ/ }).fill('পরীক্ষার কারণ');
  await dialog.getByRole('button', { name: button, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(state(page, badge)).toBeVisible();
}

/** The notice of a setup screen on a phone. */
const PHONE_NOTICE = 'এই পর্দা বড় স্ক্রিনে ভালো চলে।';

test.describe('programs and project setup', () => {
  test('a PM walks the setup wizard, activates, closes and reopens a project', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'one PM, one project');
    test.setTimeout(180_000);
    const name = `শীতবস্ত্র পরীক্ষা ${code()}`;
    await signIn(page, PM);
    await openProjectsTab(page);
    await newDraft(page, code(), name);

    // the application form: a ready form the Monitoring Team builds and publishes through the API,
    // placed on the project by the PM
    const projectId = projectIdOf(page);
    await placeReadyForm(page, PM, projectId);

    // the photo rule in the distribution component's settings
    await page.getByRole('button', { name: 'বিতরণ ও ছবি-এর সেটিংস' }).click();
    const drawer = page.getByRole('dialog');
    await drawer.getByText('শুধু দলের ছবি', { exact: true }).click();
    await expect(drawer.getByRole('radio', { name: 'শুধু দলের ছবি' })).toBeChecked();
    await drawer.getByRole('button', { name: 'সংরক্ষণ' }).click();
    await expect(drawer).toHaveCount(0);
    await next(page).click();

    // the budget and its fund source, saved together by Next
    const budget = section(page, 'বাজেট ও তহবিলের উৎস');
    await budget.getByRole('textbox', { name: /প্রতিজনের খরচ/ }).fill('1000');
    await budget.getByRole('textbox', { name: /লক্ষ্য/ }).fill('100');
    await budget.getByRole('button', { name: 'তহবিলের উৎস যোগ করুন' }).click();
    await chooseIn(page, budget, 'তহবিলের উৎস', 'যাকাত');
    await budget.getByRole('textbox', { name: /পরিমাণ/ }).fill('100000');
    await next(page).click();

    // the application window and the limit, then save the draft and exit
    const window = section(page, 'আবেদনের সময়সীমা ও সীমা');
    await typeDate(page, window, 'আবেদন শুরু', '01112026');
    await typeDate(page, window, 'আবেদনের শেষ তারিখ', '31122026');
    await window.getByRole('textbox', { name: /আবেদন সীমা/ }).fill('50');
    await page.getByRole('button', { name: 'খসড়া সেভ করে বের হন' }).click();
    await expect(page.getByText('খসড়া সংরক্ষিত হয়েছে।')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();

    // back in the setup, the wizard opens the first step with something missing: the areas
    await page.getByRole('link', { name: 'সেটআপ' }).click();
    const areas = section(page, 'এলাকা ও আরপিএম');
    await expect(areas).toBeVisible();
    await expect(
      page
        .getByRole('list', { name: 'সেটআপের ধাপ' })
        // the browser may put a space before the comma of the hidden words
        .getByRole('button', { name: /^এলাকা ও আরপিএম ?, বাকি আছে$/ }),
    ).toBeVisible();
    await chooseIn(page, areas, 'বিভাগ', 'ঢাকা');
    const rpm = areas.getByRole('combobox', { name: /আরপিএম/ });
    await rpm.fill('আরপিএম ঢাকা');
    await expect(page.getByRole('option', { name: /^আরপিএম ঢাকা/ }).first()).toBeVisible();
    // chosen with the keyboard: a list that redraws while it loads never stops a key press
    await rpm.press('ArrowDown');
    await rpm.press('Enter');
    await expect(rpm).toHaveValue(/আরপিএম ঢাকা/);
    // the area filled in is added by Next
    await next(page).click();
    await expect(section(page, 'স্টাফের অ্যাক্সেস')).toBeVisible();
    expect((await scan(page)).violations).toEqual([]);

    // the rules every volunteer accepts: three parts while dawah is off; Next opens the review
    await page
      .getByRole('list', { name: 'সেটআপের ধাপ' })
      .getByRole('button', { name: /^নিয়মাবলি/ })
      .click();
    await writeRules(page);
    await next(page).click();
    // the review: everything is there, and activation opens the project
    await expect(page.getByText('সক্রিয় করার জন্য দরকারি সব আছে।')).toBeVisible();
    await page.getByRole('button', { name: 'সক্রিয় করুন', exact: true }).click();
    // the activation asks first, saying what follows
    const ask = page.getByRole('alertdialog', { name: 'প্রকল্পটি সক্রিয় করবেন?' });
    await expect(
      ask.getByText('কোড, প্রোগ্রাম, বছর ও ওয়ার্কফ্লো আর বদলানো যাবে না।'),
    ).toBeVisible();
    await ask.getByRole('button', { name: 'সক্রিয় করুন', exact: true }).click();
    await expect(page.getByText('প্রকল্প সক্রিয় হয়েছে।')).toBeVisible();
    await expect(state(page, 'সক্রিয়')).toBeVisible();

    // the period is fixed from now on
    await page.getByRole('link', { name: 'সেটআপ' }).click();
    await page
      .getByRole('list', { name: 'সেটআপের ধাপ' })
      .getByRole('button', { name: 'মৌলিক তথ্য' })
      .click();
    await expect(
      section(page, 'মৌলিক তথ্য')
        .getByRole('group', { name: /শুরুর মাস/ })
        .getByRole('spinbutton')
        .first(),
    ).toHaveAttribute('aria-disabled', 'true');
    await openSummary(page);

    // close in two steps, then every field is read-only
    await move(page, 'বন্ধ শুরু করুন', 'বন্ধ হচ্ছে');
    await move(page, 'প্রকল্প বন্ধ করুন', 'বন্ধ');
    await page.getByRole('link', { name: 'সেটআপ' }).click();
    await expect(page.getByText(/এর সেটআপ বদলানো যায় না/)).toBeVisible();
    await page
      .getByRole('list', { name: 'সেটআপের ধাপ' })
      .getByRole('button', { name: 'মৌলিক তথ্য' })
      .click();
    await expect(
      section(page, 'মৌলিক তথ্য').getByRole('textbox', { name: /বাংলায় নাম/ }),
    ).toHaveAttribute('readonly', '');
    await openSummary(page);

    // reopen
    await move(page, 'আবার খুলুন', 'সক্রিয়');
  });

  test('a PM chooses the application form from the ready forms, and changes it while a draft', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'one PM, one project');
    await signIn(page, PM);
    await openProjectsTab(page);
    await newDraft(page, code(), `ফর্ম বাছাই ${code()}`);
    const winter = `শীতের আবেদন ${code()}`;
    const iftar = `ইফতারের আবেদন ${code()}`;
    await publishReadyForm(page, undefined, { bn: winter, en: 'Winter' });
    await publishReadyForm(page, undefined, { bn: iftar, en: 'Iftar' });
    await page.reload();

    // the first choice places the form at once
    const picker = page.getByRole('combobox', { name: 'আবেদন ফর্ম' });
    await picker.click();
    await page.getByRole('option', { name: `${winter} (সংস্করণ 1)` }).click();
    await expect(picker).toContainText(winter);
    await expect(page.getByRole('link', { name: 'ফর্ম বিল্ডার খুলুন' })).toBeVisible();

    // another choice asks first, then replaces it
    await picker.click();
    await page.getByRole('option', { name: `${iftar} (সংস্করণ 1)` }).click();
    const ask = page.getByRole('alertdialog', { name: 'আবেদন ফর্ম বদলাবেন?' });
    await ask.getByRole('button', { name: 'বদলান' }).click();
    await expect(ask).toHaveCount(0);
    await expect(picker).toContainText(iftar);
  });

  test('a draft that was never activated is cancelled and leaves the list', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'one PM, one project');
    const name = `বাতিলের পরীক্ষা ${code()}`;
    await signIn(page, PM);
    await openProjectsTab(page);
    await newDraft(page, code(), name);
    await page.getByRole('button', { name: 'খসড়া সেভ করে বের হন' }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await move(page, 'বাতিল করুন', 'বাতিল');
    await page.goto('/admin/projects?view=list');
    // the list has loaded before the cancelled one is looked for
    await expect(listRows(page, LIST)).toBeVisible();
    await expect(page.getByText(/^\d+টির মধ্যে \d+টি$/).first()).toBeVisible();
    await expect(listRows(page, LIST).getByRole('link', { name })).toHaveCount(0);
  });

  test('a PM copies a previous project: its photo rule comes, its budget does not', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'one PM, one project');
    test.setTimeout(120_000);
    const name = `কপির উৎস ${code()}`;
    // a PM of its own: the PM of the journey above already holds sessions on other devices
    await signIn(page, COPY_PM);
    await openProjectsTab(page);
    await newDraft(page, code(), name, ERR, COPY_PM);
    await page.getByRole('button', { name: 'বিতরণ ও ছবি-এর সেটিংস' }).click();
    const drawer = page.getByRole('dialog');
    await drawer.getByText('শুধু দলের ছবি', { exact: true }).click();
    await drawer.getByRole('button', { name: 'সংরক্ষণ' }).click();
    await expect(drawer).toHaveCount(0);
    await next(page).click();
    const budget = section(page, 'বাজেট ও তহবিলের উৎস');
    await budget.getByRole('textbox', { name: /প্রতিজনের খরচ/ }).fill('750');
    await page.getByRole('button', { name: 'খসড়া সেভ করে বের হন' }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();

    // a new project from a copy of that draft
    const copyName = `কপি ${code()}`;
    const copySeries = await newSeries(page, COPY_PM, code(), copyName, ERR);
    await page.goto(`/admin/projects/new?seriesId=${copySeries}`);
    const basics = section(page, 'মৌলিক তথ্য');
    await basics.getByText('আগের প্রকল্প থেকে কপি', { exact: true }).click();
    await basics.getByRole('combobox', { name: /যে প্রকল্প কপি হবে/ }).click();
    await page
      .getByRole('listbox')
      .getByRole('option', { name: new RegExp(`^${name} · সেশন`) })
      .click();
    await next(page).click();
    await expect(page.getByRole('heading', { level: 2, name: `সেটআপ: ${copyName}` })).toBeVisible();
    await expect(page).toHaveURL(/step=components/);
    await page.getByRole('button', { name: 'বিতরণ ও ছবি-এর সেটিংস' }).click();
    await expect(
      page.getByRole('dialog').getByRole('radio', { name: 'শুধু দলের ছবি' }),
    ).toBeChecked();
    await page.getByRole('dialog').getByRole('button', { name: 'বাতিল' }).click();
    await next(page).click();
    await expect(
      section(page, 'বাজেট ও তহবিলের উৎস').getByRole('textbox', { name: /প্রতিজনের খরচ/ }),
    ).toHaveValue('');
  });

  test('a volunteer has no project menu and is refused the list', async ({
    page,
  }, info: TestInfo) => {
    await signIn(page, VOLUNTEER[info.project.name === 'mobile' ? 'mobile' : 'desktop']);
    await expect(mainMenu(page)).toBeVisible();
    const destinations = await mainMenu(page)
      .getByRole('link')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
    expect(destinations.filter((href) => href.startsWith('/admin'))).toEqual([]);
    await page.goto('/admin/projects');
    await expect(page.getByRole('heading', { level: 1, name: 'প্রবেশাধিকার নেই' })).toBeVisible();
  });

  test('the project list and the new-project wizard do not scroll sideways on a phone', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'mobile', 'the phone layout');
    await signIn(page, 'pm.err@example.org');
    await openProjectsTab(page);
    // officials use the tab on a phone as on a computer: no "larger screen" notice
    await expect(page.getByRole('region', { name: 'প্রোগ্রাম' })).toBeVisible();
    await expect(page.getByText(PHONE_NOTICE)).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    expect((await scan(page)).violations).toEqual([]);
    const seriesId = await newSeries(page, 'pm.err@example.org', code(), `ফোন ${code()}`, ERR);
    await page.goto(`/admin/projects/new?seriesId=${seriesId}`);
    await expect(page.getByRole('heading', { level: 1, name: 'নতুন প্রকল্প' })).toBeVisible();
    // the setup is desktop first and says so
    await expect(page.getByText(PHONE_NOTICE)).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    expect((await scan(page)).violations).toEqual([]);
  });

  test('a session opens in its frame: the header and the tabs stay on every tab', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'iphone', 'the phone is checked on the mobile project');
    const phone = info.project.name === 'mobile';
    // read only: the demo seed's draft winter session, opened from the list
    await signIn(page, phone ? 'monitoring@example.org' : 'head@example.org');
    // from the cards: the Humanitarian Program, its winter project, the project's session (the
    // list of a full run holds many newer sessions before it)
    await page.goto('/admin/projects');
    await page
      .getByRole('article', { name: 'হিউম্যানিটেরিয়ান প্রোগ্রাম' })
      .getByRole('link', { name: 'হিউম্যানিটেরিয়ান প্রোগ্রাম', exact: true })
      .click();
    // the pointer rests where the program's card was: a project card under it would turn over
    await page.mouse.move(0, 0);
    await page
      .getByRole('article', { name: 'শীতবস্ত্র বিতরণ 2026' })
      .getByRole('link', { name: 'শীতবস্ত্র বিতরণ 2026', exact: true })
      .click();
    await page.getByRole('link', { name: /খুলুন/ }).first().click();
    const heading = page.getByRole('heading', { level: 1, name: 'শীতবস্ত্র বিতরণ 2026' });
    await expect(heading).toBeVisible();
    await expect(state(page, 'খসড়া')).toBeVisible();
    const id = projectIdOf(page);
    const tabs = page.getByRole('navigation', { name: 'প্রকল্পের অংশ' });
    await expect(tabs.getByRole('link')).toHaveText([
      'সারসংক্ষেপ',
      'সেটআপ',
      'স্বেচ্ছাসেবক',
      'আবেদন',
      'বিতরণ',
      'রিপোর্ট',
      'কার্যক্রম',
    ]);
    // the summary: the whole session's counts and its stage; the draft has no application yet
    await expect(page.getByRole('heading', { name: 'প্রকল্পের সারসংক্ষেপ' })).toBeVisible();
    await expect(page.getByRole('link', { name: /মোট আবেদন/ })).toBeVisible();
    const strip = page.getByRole('list', { name: 'সেশনের ধাপ' });
    await expect(strip.getByRole('listitem').first()).toHaveAttribute('aria-current', 'step');
    await expect(page.getByRole('heading', { name: 'বাস্তবায়ন অগ্রগতি' })).toBeVisible();
    expect((await scan(page)).violations).toEqual([]);

    // another tab keeps the header and the tabs above its own page
    await tabs.getByRole('link', { name: 'আবেদন' }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/projects/${id}/applications`));
    await expect(heading).toBeVisible();
    await expect(tabs.getByRole('link', { name: 'আবেদন' })).toHaveAttribute('aria-current', 'page');
    await tabs.getByRole('link', { name: 'বিতরণ' }).click();
    await expect(page.getByText('শীঘ্রই আসছে')).toBeVisible();

    // back on the summary: the main move of a draft, the others in the menu
    await tabs.getByRole('link', { name: 'সারসংক্ষেপ' }).click();
    const actions = page.getByRole('region', { name: 'প্রকল্পের কাজ' });
    await expect(actions.getByRole('button', { name: 'সক্রিয় করুন', exact: true })).toBeVisible();
    await actions.getByRole('button', { name: 'আরও কাজ' }).click();
    await expect(page.getByRole('menuitem', { name: 'টেমপ্লেট হিসেবে সংরক্ষণ' })).toBeVisible();
    await page.keyboard.press('Escape');
    if (phone)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
  });

  test('the programs and projects tab: one destination, the cards and the list', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'iphone', 'the phone is checked on the mobile project');
    /** A picture of the screen once every turn of a card has ended. */
    const shot = async (name: string) => {
      await page.evaluate(() =>
        Promise.all(
          document
            .getAnimations()
            .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
            // a turn the page itself cancelled ends too
            .map((animation) => animation.finished.catch(() => undefined)),
        ),
      );
      await page.screenshot({ path: info.outputPath(name) });
    };
    if (info.project.name === 'desktop') {
      // an RPM: the earlier address of the programs leads to the tab
      await signIn(page, RPM);
      await page.goto('/admin/programs');
      await expect(page).toHaveURL(/\/admin\/projects$/);
      await expect(page.getByRole('heading', { level: 1, name: PROJECTS_TAB })).toBeVisible();
      const card = page.getByRole('article', { name: UCD_NAME });
      const open = card.getByRole('link', { name: 'সব প্রকল্প দেখুন' });
      await expect(open).toBeHidden();
      await shot('tab-1280-light.png');
      await card.hover();
      await expect(open).toBeVisible();
      await shot('tab-1280-light-back.png');
      await page.emulateMedia({ colorScheme: 'dark' });
      await shot('tab-1280-dark-back.png');
      await page.emulateMedia({ colorScheme: 'light' });
      await page.mouse.move(0, 0);
      await page.getByRole('button', { name: 'তালিকা' }).click();
      await expect(page).toHaveURL(/view=list/);
      await expect(page.getByRole('columnheader', { name: 'সেশন' })).toBeVisible();
      // the rows have come
      await expect(page.getByText(/^\d+টির মধ্যে \d+টি$/).first()).toBeVisible();
      await shot('tab-1280-list-light.png');
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.getByRole('button', { name: 'কার্ড' }).click();
      await expect(page.getByRole('article', { name: UCD_NAME })).toBeVisible();
      await page.mouse.move(0, 0);
      await shot('tab-1280-dark.png');
    } else {
      // a PM on a phone 360 px wide: the tab "প্রকল্প" opens the cards, which turn by their buttons
      await page.setViewportSize({ width: 360, height: 780 });
      await signIn(page, PM);
      await openProjectsTab(page);
      const card = page.getByRole('article', { name: UCD_NAME });
      await card.getByRole('button', { name: `${UCD_NAME}: বিস্তারিত দেখুন` }).click();
      await expect(card.getByRole('link', { name: 'সব প্রকল্প দেখুন' })).toBeVisible();
      await card.scrollIntoViewIfNeeded();
      await shot('tab-360-light-back.png');
      await page.emulateMedia({ colorScheme: 'dark' });
      await shot('tab-360-dark-back.png');
      await page.emulateMedia({ colorScheme: 'light' });
      await card.getByRole('button', { name: 'সামনের দিকে ফিরুন' }).click();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
      expect((await scan(page)).violations).toEqual([]);
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot('tab-360-light.png');
      await page.emulateMedia({ colorScheme: 'dark' });
      await shot('tab-360-dark.png');
      await page.emulateMedia({ colorScheme: 'light' });
      // "আরও" offers no programs of their own
      await mainMenu(page).getByRole('button', { name: 'আরও' }).click();
      const sheet = page.getByRole('dialog', { name: 'আরও' });
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole('link', { name: 'প্রোগ্রাম', exact: true })).toHaveCount(0);
    }
  });
});
