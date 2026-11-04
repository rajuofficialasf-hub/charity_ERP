import {
  type APIRequestContext,
  type Browser,
  devices,
  expect,
  type Page,
  test,
} from '@playwright/test';
import { apiAs, isPhone, openTab, scan, signIn } from './support/admin';
import { activeProject, choice, code, ERR, question } from './support/projects';

// The application cycle across both screens (docs/MASTER_PROMPT.md, the critical journey
// "review, approval"; docs/testing/DEMO_ACCOUNTS.md): a project of this run with a two-part form,
// volunteer 15 assigned and consenting through the API; the volunteer brings a new person's
// application on the phone, part by part, and sends it; the Project Executive, given the Dhaka
// area on the project, starts the review and sends it for approval; the Dhaka RPM approves; the
// volunteer reads the outcome. Each page the journey opens is checked with axe on the way.
const PM = 'pm.err@example.org';
const HEAD = 'head@example.org';
const EXECUTIVE = 'executive@example.org';
const RPM = 'rpm.dhaka@example.org';
const VOLUNTEER = '01700000115';

const digits = (n: number) =>
  Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

/** A day as the date field takes it (ddmmyyyy). */
const ddmmyyyy = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`;
/** An application window that holds today: a week back to two months ahead. */
const windowAroundToday = () => {
  const from = new Date();
  from.setDate(from.getDate() - 7);
  const to = new Date();
  to.setMonth(to.getMonth() + 2);
  return { from: ddmmyyyy(from), to: ddmmyyyy(to) };
};

/** The identity part with its own labels, then one part the office reads. */
const FORM = [
  {
    key: 'section_1',
    librarySectionKey: null,
    title: { bn: 'পরিচয়', en: 'Identity' },
    visibility: 'volunteer',
    condition: null,
    fields: [
      question('q_id', 'short_text', {
        standardColumn: 'nid_or_birth_reg',
        label: { bn: 'পরিচয় নম্বর', en: 'Identity number' },
      }),
      question('q_name', 'short_text', {
        standardColumn: 'name',
        label: { bn: 'উপকারভোগীর নাম', en: 'Name' },
      }),
      question('q_father', 'short_text', {
        standardColumn: 'father_or_husband_name',
        label: { bn: 'পিতা বা স্বামীর নাম', en: 'Father or husband' },
      }),
      question('q_mobile', 'phone', {
        standardColumn: 'mobile',
        label: { bn: 'উপকারভোগীর মোবাইল', en: 'Mobile' },
      }),
      question('q_gender', 'single_select', {
        standardColumn: 'gender_code',
        label: { bn: 'লিঙ্গ', en: 'Gender' },
        options: [
          choice('male', { bn: 'পুরুষ', en: 'Male' }),
          choice('female', { bn: 'নারী', en: 'Female' }),
        ],
      }),
      question('q_address', 'bd_address', {
        standardColumn: 'division_id,district_id,upazila_id,union_id',
        label: { bn: 'ঠিকানা', en: 'Address' },
      }),
      question('q_village', 'short_text', {
        standardColumn: 'village',
        label: { bn: 'গ্রাম', en: 'Village' },
      }),
    ],
  },
  {
    key: 'section_2',
    librarySectionKey: null,
    title: { bn: 'প্রয়োজন', en: 'Need' },
    visibility: 'volunteer',
    condition: null,
    fields: [question('q_need', 'long_text', { label: { bn: 'কেন সহায়তা দরকার', en: 'Why' } })],
  },
];

/**
 * Picks an option of the renderer's select by its label: an earlier select is a button named by
 * its value, then the label; an asf one (the address) a combobox named by the label.
 */
async function pick(page: Page, label: string, option: string) {
  await page
    .getByRole('button', { name: new RegExp(`\\s${label}( \\(আবশ্যক\\))?$`) })
    .or(page.getByRole('combobox', { name: new RegExp(`^${label}`) }))
    .click();
  await page.getByRole('listbox').getByRole('option', { name: option, exact: true }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

/** Opens the application's own page from the row of the list that carries its number. */
const openOwn = (page: Page, appNo: string) =>
  page
    .getByRole('listitem')
    .filter({ hasText: appNo })
    .getByRole('link', { name: 'আবেদন দেখুন' })
    .click();

/** A desktop page of its own for an official, closed whatever happens on it. */
async function onDesk<T>(browser: Browser, work: (desk: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({ ...devices['Desktop Chrome'] });
  try {
    return await work(await context.newPage());
  } finally {
    await context.close();
  }
}

const noViolations = async (page: Page, where: string) =>
  expect((await scan(page)).violations, where).toEqual([]);

/**
 * An active ERR project of this run in the Dhaka division with the two-part form, volunteer 15
 * assigned and consenting, and the Project Executive given the Dhaka area on the project.
 */
async function projectOfTheJourney(browser: Browser, request: APIRequestContext) {
  const projectId = await onDesk(browser, async (desk) => {
    await signIn(desk, PM);
    await openTab(desk, 'প্রকল্প');
    return activeProject(desk, `আবেদনের যাত্রা ${code()}`, ERR, PM, FORM, {
      window: windowAroundToday(),
      fundSource: 'সাধারণ দান',
    });
  });
  const head = await apiAs(request, HEAD);
  const volunteers = await head.get(`/volunteers?q=${VOLUNTEER}`);
  expect(volunteers.ok()).toBe(true);
  const found = ((await volunteers.json()) as { data: { id: string }[] }).data;
  expect(found).toHaveLength(1);
  const assigned = await head.post(`/projects/${projectId}/volunteers`, {
    volunteers: [{ volunteerId: found[0]!.id }],
  });
  expect(assigned.status(), 'the assignment').toBe(201);
  const areas = await head.get(`/projects/${projectId}/areas`);
  expect(areas.ok()).toBe(true);
  const [area] = ((await areas.json()) as { data: { locationId: string }[] }).data;
  const users = await head.get(`/users?q=${encodeURIComponent(EXECUTIVE)}`);
  expect(users.ok()).toBe(true);
  const [executive] = ((await users.json()) as { data: { id: string }[] }).data;
  const staff = await head.post(`/projects/${projectId}/staff`, {
    userId: executive!.id,
    roleKey: 'project_executive',
    areaLocationId: area!.locationId,
    canView: true,
    canEdit: true,
  });
  expect(staff.status(), await staff.text()).toBe(201);
  const me = await apiAs(request, VOLUNTEER);
  const detail = await me.get(`/me/projects/${projectId}`);
  expect(detail.ok()).toBe(true);
  const { data } = (await detail.json()) as {
    data: { rules: { version: number; parts: { part: string }[] } };
  };
  const consent = await me.post(`/me/projects/${projectId}/consent`, {
    rulesVersion: data.rules.version,
    decision: 'accepted',
    parts: data.rules.parts.map((p) => p.part),
  });
  expect(consent.ok(), 'the consent').toBe(true);
  return projectId;
}

test.describe('the application cycle', () => {
  test('a volunteer sends a new application, the office reviews and approves it, and the volunteer reads the outcome', async ({
    browser,
    page,
    request,
  }, info) => {
    test.setTimeout(300_000);
    const projectId = await projectOfTheJourney(browser, request);
    const nid = `2${digits(9)}`;
    const name = `নমুনা উপকারভোগী ${code()}`;

    // the volunteer: the lookup finds nobody, the form part by part, then the send
    await signIn(page, VOLUNTEER);
    await page.goto(`/my-projects/${projectId}`);
    await page.getByRole('link', { name: 'নতুন আবেদন' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'নতুন আবেদন' })).toBeVisible();
    await page.getByRole('textbox', { name: /NID নম্বর/ }).fill(nid);
    await page.getByRole('button', { name: 'খুঁজুন' }).click();
    await expect(page.getByText('এই নম্বরে কোনো প্রোফাইল নেই')).toBeVisible();
    await noViolations(page, 'the lookup');
    await page.getByRole('button', { name: 'নতুন ব্যক্তির জন্য ফর্ম পূরণ করুন' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'আবেদন ফর্ম' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /পরিচয় নম্বর/ })).toHaveValue(nid);
    await page.getByRole('textbox', { name: /উপকারভোগীর নাম/ }).fill(name);
    await page.getByRole('textbox', { name: /পিতা বা স্বামীর নাম/ }).fill('নমুনা পিতা');
    await page.getByRole('textbox', { name: /উপকারভোগীর মোবাইল/ }).fill(`018${digits(8)}`);
    await pick(page, 'লিঙ্গ', 'নারী');
    await pick(page, 'বিভাগ', 'ঢাকা');
    await pick(page, 'জেলা', 'ঢাকা');
    await pick(page, 'উপজেলা', 'সাভার');
    await pick(page, 'ইউনিয়ন', 'সাভার');
    await page.getByRole('textbox', { name: /গ্রাম/ }).fill('নমুনা গ্রাম');
    if (isPhone(info)) {
      // the first part done saves the draft; the second part is its own screen
      await page.getByRole('button', { name: 'পরের অংশ' }).click();
      await expect(page.getByText('খসড়া সংরক্ষিত হয়েছে')).toBeVisible();
    }
    await page.getByRole('textbox', { name: /কেন সহায়তা দরকার/ }).fill('শীতের কাপড় দরকার');
    await noViolations(page, 'the form');
    await page.getByRole('button', { name: 'অফিসে পাঠান' }).click();
    await expect(
      page.getByRole('heading', { level: 2, name: 'আবেদন পাঠানো হয়েছে' }),
    ).toBeVisible();
    const sent = await page.getByText(/^আবেদন নম্বর: /).textContent();
    const appNo = /আবেদন নম্বর: ([A-Z0-9]+-\d{4}-\d{5})/.exec(sent ?? '')?.[1];
    expect(appNo, sent ?? '').toBeTruthy();
    await page.getByRole('link', { name: 'আমার আবেদন দেখুন' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'আমার আবেদন' })).toBeVisible();
    await page.getByRole('tab', { name: /পেন্ডিং/ }).click();
    await expect(page.getByText(appNo!)).toBeVisible();
    await noViolations(page, 'the own list');
    await openOwn(page, appNo!);
    await expect(page.getByText(appNo!)).toBeVisible();
    await expect(page.getByRole('list', { name: 'আবেদনের ধাপ' })).toContainText(
      'অফিসে পাঠানো হয়েছে',
    );
    await noViolations(page, 'the own record');

    // the Project Executive: the list, the record, the review and the send for approval
    const recordUrl = await onDesk(browser, async (desk) => {
      await signIn(desk, EXECUTIVE);
      await desk.goto(`/admin/projects/${projectId}/applications`);
      await expect(desk.getByRole('heading', { level: 1, name: /^আবেদন: / })).toBeVisible();
      await expect(desk.getByText(appNo!).first()).toBeVisible();
      await noViolations(desk, 'the office list');
      await desk.getByRole('link', { name }).first().click();
      await expect(desk.getByRole('heading', { level: 1, name })).toBeVisible();
      await desk.getByRole('button', { name: 'রিভিউ শুরু' }).click();
      await expect(desk.getByText('রিভিউ শুরু হয়েছে।')).toBeVisible();
      const steps = desk.getByRole('list', { name: 'আবেদনের ধাপ' });
      await expect(steps).toContainText('পর্যালোচনা চলছে');
      await expect(steps).toContainText('প্রজেক্ট এক্সিকিউটিভ');
      await noViolations(desk, 'the review page');
      await desk.getByRole('button', { name: 'অনুমোদনের জন্য পাঠান' }).click();
      await expect(desk.getByText('অনুমোদনের জন্য পাঠানো হয়েছে।')).toBeVisible();
      return desk.url();
    });

    // the Dhaka RPM: the approval moves on into implementation by itself; the badge and the six
    // steps (the draft, the send, the review, the wait, the approval, the implementation) with
    // their names
    await onDesk(browser, async (rpm) => {
      await signIn(rpm, RPM);
      await rpm.goto(recordUrl);
      await expect(rpm.getByRole('heading', { level: 1, name })).toBeVisible();
      await rpm.getByRole('button', { name: 'অনুমোদন করুন' }).click();
      await expect(rpm.getByText('আবেদন অনুমোদিত হয়েছে।')).toBeVisible();
      await expect(
        rpm.getByRole('definition').filter({ hasText: 'বাস্তবায়ন চলছে' }),
      ).toBeVisible();
      const trail = rpm.getByRole('list', { name: 'আবেদনের ধাপ' });
      await expect(trail.getByRole('listitem')).toHaveCount(6);
      await expect(trail.getByRole('listitem')).toContainText([
        'খসড়া',
        'অফিসে পাঠানো হয়েছে',
        'পর্যালোচনা চলছে',
        'অনুমোদনের অপেক্ষায়',
        'অনুমোদিত',
        'বাস্তবায়ন চলছে',
      ]);
      await expect(trail).toContainText('প্রজেক্ট এক্সিকিউটিভ');
      await expect(trail).toContainText('আরপিএম ঢাকা');
    });

    // the volunteer reads the outcome without the office's names
    await page.goto('/my-applications?tab=approved');
    await expect(page.getByText(appNo!)).toBeVisible();
    await openOwn(page, appNo!);
    const own = page.getByRole('list', { name: 'আবেদনের ধাপ' });
    await expect(own.getByRole('listitem')).toHaveCount(6);
    await expect(own).not.toContainText('আরপিএম ঢাকা');
  });
});
