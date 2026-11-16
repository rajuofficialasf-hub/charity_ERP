import { expect, type Locator, type Page, request as apiRequest, test } from '@playwright/test';
import { apiAs, openProjectsTab, scan, signIn } from './support/admin';
import { chooseIn, code, next, section, state } from './support/projects';

// A program's page with its permanent projects as cards and a project's page with its sessions,
// against the E2E API with the demo seed (docs/testing/DEMO_ACCOUNTS.md): the UCD Program Manager
// makes a project on the program's page and starts its next session; the Dhaka RPM meets a session
// outside the region; the Department Head turns a project card on a phone and reads the sessions
// as cards. Each run makes its own project codes. The pictures of both pages, at 1280 and 360 px
// in light and dark, are written beside each test's output.
const PM = 'pm.ucd@example.org';
const RPM = 'rpm.dhaka@example.org';
const HEAD = 'head@example.org';
const UCD_NAME = 'আন্ডারপ্রিভিলেজড কমিউনিটি ডেভেলপমেন্ট প্রোগ্রাম';
/** The program of the demo seed's one project (WNT). */
const HUM_NAME = 'হিউম্যানিটেরিয়ান প্রোগ্রাম';
const PHONE_NOTICE = 'এই পর্দা বড় স্ক্রিনে ভালো চলে।';

/** Types a month into a month field (mm then yyyy). */
async function chooseMonth(page: Page, scope: Locator, label: string, mmyyyy: string) {
  await scope
    .getByRole('group', { name: new RegExp(label) })
    .getByRole('spinbutton')
    .first()
    .click();
  await page.keyboard.type(mmyyyy);
}

/** A picture of the screen once every turn of a card has ended, light and dark. */
async function pictures(
  page: Page,
  outputPath: (name: string) => string,
  name: string,
  keepPointer = false,
) {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    // the pointer away from the cards, unless it holds one turned for the picture
    if (!keepPointer) await page.mouse.move(0, 0);
    // the colours ease into the new scheme from the next frame: wait for it, then for the eases
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
          .map((animation) => animation.finished.catch(() => undefined)),
      ),
    );
    await page.screenshot({ path: outputPath(`${name}-${scheme}.png`), fullPage: true });
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

test.describe('a program’s page and a project’s page', () => {
  test('a PM makes a project on its program’s page and starts its next session', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'one PM, one project');
    test.setTimeout(150_000);
    const name = `ই২ই প্রকল্প ${code()}`;
    await signIn(page, PM);
    await openProjectsTab(page);
    const card = page.getByRole('article', { name: UCD_NAME });
    await card.hover();
    await card.getByRole('link', { name: 'সব প্রকল্প দেখুন' }).click();
    await expect(page.getByRole('heading', { level: 1, name: UCD_NAME })).toBeVisible();
    const programPage = page.url();

    // a new project: its code and names, then the setup of its first session
    await page.getByRole('button', { name: 'নতুন প্রকল্প' }).click();
    const dialog = page.getByRole('dialog', { name: 'নতুন প্রকল্প' });
    await dialog.getByRole('textbox', { name: /প্রকল্প কোড/ }).fill(code());
    await dialog.getByRole('textbox', { name: /বাংলায় নাম/ }).fill(name);
    await dialog.getByRole('textbox', { name: /ইংরেজিতে নাম/ }).fill(`${name} EN`);
    await dialog.getByRole('button', { name: 'সেভ করুন' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'নতুন প্রকল্প' })).toBeVisible();
    const seriesId = new URL(page.url()).searchParams.get('seriesId');
    expect(seriesId).toBeTruthy();
    const basics = section(page, 'মৌলিক তথ্য');
    // the first session's months, a far year of the test's own
    await chooseMonth(page, basics, 'শুরুর মাস', '012090');
    await chooseMonth(page, basics, 'শেষের মাস', '122090');
    await chooseIn(page, basics, 'ওয়ার্কফ্লো', 'বিতরণ');
    await next(page).click();
    await expect(
      page.getByRole('heading', { level: 1, name: `সেটআপ: ${name} · সেশন 2090` }),
    ).toBeVisible();
    await expect(state(page, 'খসড়া')).toBeVisible();

    // the project's page: its next session from its months
    await page.goto(`/admin/projects/series/${seriesId}`);
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await page.getByRole('button', { name: 'নতুন সেশন শুরু করুন' }).click();
    const next2 = page.getByRole('dialog', { name: 'নতুন সেশন শুরু করুন' });
    await chooseMonth(page, next2, 'শুরুর মাস', '062027');
    await chooseMonth(page, next2, 'শেষের মাস', '072028');
    await expect(next2.getByText('2027-28', { exact: true })).toBeVisible();
    await expect(next2.getByRole('region', { name: 'কপি হবে' })).toBeVisible();
    await next2.getByRole('button', { name: 'খসড়া তৈরি করুন' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: `সেটআপ: ${name} · সেশন 2027-28` }),
    ).toBeVisible();
    await page.goto(`/admin/projects/series/${seriesId}`);
    const row = page.getByRole('row', { name: /সেশন 2027-28/ });
    await expect(row.getByText('খসড়া', { exact: true })).toBeVisible();
    await pictures(page, (n) => info.outputPath(n), 'series-1280');

    // the program's page with the new project's card
    await page.goto(programPage);
    await expect(page.getByRole('article', { name })).toBeVisible();
    await pictures(page, (n) => info.outputPath(n), 'program-1280');
    await page.getByRole('article', { name }).hover();
    await expect(page.getByRole('article', { name })).toHaveAttribute('data-turned', 'true');
    await pictures(page, (n) => info.outputPath(n), 'program-1280-back', true);
  });

  test('an RPM meets a session outside the region and starts none', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'one RPM');
    // a project of this run with one session and no area yet, which no region reaches
    const origin = 'http://127.0.0.1:3100';
    const context = await apiRequest.newContext({
      baseURL: origin,
      extraHTTPHeaders: { Origin: origin },
    });
    let seriesId: string;
    try {
      const pm = await apiAs(context, PM);
      const cards = (await (await pm.get('/program-cards')).json()) as {
        data: { id: string; code: string }[];
      };
      const ucd = cards.data.find((g) => g.code === 'UCD')!;
      const made = await pm.post('/project-series', {
        programId: ucd.id,
        code: code(),
        name: { bn: `বাইরের প্রকল্প ${code()}`, en: 'Outside' },
      });
      expect(made.ok(), await made.text()).toBe(true);
      seriesId = ((await made.json()) as { data: { id: string } }).data.id;
      // a far year of the test's own, the same on every run date
      const session = await pm.post('/projects', {
        seriesId,
        periodFrom: '2090-01',
        periodTo: '2090-12',
        source: { kind: 'workflow', workflowKey: 'distribution' },
      });
      expect(session.ok(), await session.text()).toBe(true);
    } finally {
      await context.dispose();
    }
    await signIn(page, RPM);
    await page.goto(`/admin/projects/series/${seriesId}`);
    await expect(page.getByRole('heading', { level: 1, name: /বাইরের প্রকল্প/ })).toBeVisible();
    await expect(page.getByText('অনুমতি নেই').first()).toBeVisible();
    await expect(page.getByRole('link', { name: /খুলুন$/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'নতুন সেশন শুরু করুন' })).toHaveCount(0);
    expect((await scan(page)).violations).toEqual([]);
  });

  test('the Head turns a project card on a phone and reads the sessions as cards', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'mobile', 'the phone');
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 360, height: 780 });
    await signIn(page, HEAD);
    await openProjectsTab(page);
    const program = page.getByRole('article', { name: HUM_NAME });
    await program.getByRole('button', { name: `${HUM_NAME}: বিস্তারিত দেখুন` }).click();
    await program.getByRole('link', { name: 'সব প্রকল্প দেখুন' }).click();
    await expect(page.getByRole('heading', { level: 1, name: HUM_NAME })).toBeVisible();
    await expect(page.getByText(PHONE_NOTICE)).toHaveCount(0);
    const card = page.getByRole('region', { name: 'প্রকল্প' }).getByRole('article').first();
    const title = (await card.getByRole('heading').first().innerText()).trim();
    await card.getByRole('button', { name: /বিস্তারিত দেখুন$/ }).click();
    await expect(card).toHaveAttribute('data-turned', 'true');
    await expect(card.getByRole('link', { name: 'প্রকল্প খুলুন' })).toBeVisible();
    await card.scrollIntoViewIfNeeded();
    await pictures(page, (n) => info.outputPath(n), 'program-360-back');
    await card.getByRole('button', { name: 'সামনের দিকে ফিরুন' }).click();
    await expect(card).toHaveAttribute('data-turned', 'false');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect((await scan(page)).violations).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await pictures(page, (n) => info.outputPath(n), 'program-360');

    // the project's page: its sessions as cards
    await card.getByRole('link', { name: title }).click();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByText(/^আবেদন \d[\d,]* · অনুমোদিত \d[\d,]*$/).first()).toBeVisible();
    await expect(page.getByText(PHONE_NOTICE)).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect((await scan(page)).violations).toEqual([]);
    await pictures(page, (n) => info.outputPath(n), 'series-360');
  });
});
