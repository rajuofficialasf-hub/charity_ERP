import {
  type APIRequestContext,
  type Browser,
  expect,
  type Page,
  test,
  type TestInfo,
} from '@playwright/test';
import { apiAs, isPhone, scan, signIn, switchLanguage } from './support/admin';
import { consent, onDesk, savar, volunteerId } from './support/applications';
import { digits, pickByLabel, sendToOffice } from './support/forms';
import { dataSetArrives, goOffline, goOnline } from './support/offline';
import { activeProject, choice, code, ERR, identityRulesOn, question } from './support/projects';

// What a project's application asks about identity and contact, end to end
// (docs/ui/SCREENS.md, "New application with NID lookup"; docs/testing/DEMO_ACCOUNTS.md): the PM
// lets the identity document and the mobile stay empty in the project's setup; a volunteer brings
// a person without a document and without a phone on a 360 px phone, with network and without it;
// the office reads both on the list and on the person's profile; and once the PM asks the
// document again, the start without it is gone and the number is asked. One project of this run,
// volunteer 15 assigned and consenting through the API; the journeys run in order on it.
const PM = 'pm.err@example.org';
const HEAD = 'head@example.org';
const RPM = 'rpm.dhaka@example.org';
const VOLUNTEER = '01700000115';

const DOCUMENT = 'পরিচয়পত্র (এনআইডি বা জন্মনিবন্ধন)';
const MOBILE = 'মোবাইল নম্বর';
const REQUIRED = 'বাধ্যতামূলক';
const IF_THEY_HAVE_ONE = 'থাকলে দিন';
const THROUGH_THE_VOLUNTEER = 'না থাকলে স্বেচ্ছাসেবকের মাধ্যমে যোগাযোগ';
const HELP = 'এই প্রকল্পে পরিচয়পত্র না থাকলেও আবেদন নেওয়া যায়। নম্বর থাকলে উপরে লিখে খুঁজুন।';
const START = 'পরিচয়পত্র নেই, নাম দিয়ে শুরু করুন';
const NO_DOCUMENT = 'পরিচয়পত্র নেই';
const CONTACT_THROUGH_VOLUNTEER = 'স্বেচ্ছাসেবকের মাধ্যমে যোগাযোগ';

const ddmmyyyy = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`;
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

const noViolations = async (page: Page, where: string) =>
  expect((await scan(page)).violations, where).toEqual([]);
const fitsThePhone = async (page: Page, where: string) =>
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
    where,
  ).toBeLessThanOrEqual(360);

/**
 * An active ERR project of this run with the two-part form, volunteer 15 assigned and consenting.
 * A project of the distribution workflow starts with the document and the mobile left free, so
 * both are set to required here: the journey begins where the PM has not allowed anything yet.
 */
async function projectOfTheJourney(browser: Browser, request: APIRequestContext) {
  const id = await onDesk(browser, async (desk) => {
    await signIn(desk, PM);
    await desk.goto('/admin/projects');
    return activeProject(desk, `পরিচয়ের নিয়ম ${code()}`, ERR, PM, FORM, {
      window: windowAroundToday(),
      fundSource: 'সাধারণ দান',
    });
  });
  await identityRulesOn(request, PM, id, { identity_document: 'required', mobile: 'required' });
  const head = await apiAs(request, HEAD);
  const assigned = await head.post(`/projects/${id}/volunteers`, {
    volunteers: [{ volunteerId: await volunteerId(head, VOLUNTEER) }],
  });
  expect(assigned.status(), await assigned.text()).toBe(201);
  await consent(request, VOLUNTEER, id);
  return id;
}

/**
 * The PM's choices in the settings of "আবেদন ফর্ম" on the project's setup screen at 1280 px, made
 * with the keyboard: each choice is a radio group, moved with the arrow keys, and Enter on the
 * save button saves.
 */
async function pmChooses(browser: Browser, id: string, picks: [group: string, option: string][]) {
  await onDesk(browser, async (desk) => {
    await signIn(desk, PM);
    await desk.goto(`/admin/projects/${id}/setup?step=components`);
    const open = desk.getByRole('button', { name: 'আবেদন ফর্ম-এর সেটিংস' });
    await open.focus();
    await desk.keyboard.press('Enter');
    const drawer = desk.getByRole('dialog', { name: 'সেটিংস: আবেদন ফর্ম' });
    await expect(drawer.getByText('আবেদনে যা চাওয়া হবে')).toBeVisible();
    for (const [group, option] of picks) {
      const choices = drawer.getByRole('radiogroup', { name: group });
      const wanted = choices.getByRole('radio', { name: option, exact: true });
      // the two choices of a group: the arrow key moves to the other one and chooses it
      await choices.getByRole('radio', { checked: true }).focus();
      if (!(await wanted.isChecked())) await desk.keyboard.press('ArrowDown');
      await expect(wanted).toBeChecked();
      await expect(wanted).toBeFocused();
    }
    // the focus mark of a choice pulses for as long as the keyboard rests on it, and axe reads a
    // page that has come to rest
    await desk.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await noViolations(desk, 'the settings of the application form');
    await drawer.getByRole('button', { name: 'সংরক্ষণ' }).focus();
    await desk.keyboard.press('Enter');
    await expect(drawer).toHaveCount(0);
    // the saved choices are what the settings show when the page is read again
    await desk.reload();
    await open.click();
    for (const [group, option] of picks)
      await expect(
        desk
          .getByRole('dialog')
          .getByRole('radiogroup', { name: group })
          .getByRole('radio', { name: option, exact: true }),
      ).toBeChecked();
  });
}

/** The first part of a person without a document and without a phone, typed from the name. */
async function personWithoutNumbers(page: Page, name: string) {
  const number = page.getByRole('textbox', { name: /পরিচয় নম্বর/ });
  // the document is asked only "if they have one": no required mark, and the line says so
  await expect(number).toHaveValue('');
  await expect(number).not.toHaveAttribute('required');
  await expect(number).toHaveAccessibleDescription('থাকলে দিন।');
  await expect(page.getByRole('textbox', { name: /উপকারভোগীর মোবাইল/ })).not.toHaveAttribute(
    'required',
  );
  await page.getByRole('textbox', { name: /উপকারভোগীর নাম/ }).fill(name);
  await page.getByRole('textbox', { name: /পিতা বা স্বামীর নাম/ }).fill('নমুনা পিতা');
  // the options of a coded question come from its reference list
  await pickByLabel(page, 'লিঙ্গ', 'মহিলা');
  await pickByLabel(page, 'বিভাগ', 'ঢাকা');
  await pickByLabel(page, 'জেলা', 'ঢাকা');
  await pickByLabel(page, 'উপজেলা', 'সাভার');
  await pickByLabel(page, 'ইউনিয়ন', 'সাভার');
  await page.getByRole('textbox', { name: /গ্রাম/ }).fill('নমুনা গ্রাম');
}

/** The office's list of the project and the person's profile both say what the person lacks. */
async function officeSeesBoth(browser: Browser, request: APIRequestContext, name: string) {
  await onDesk(browser, async (desk) => {
    await signIn(desk, RPM);
    await desk.goto(`/admin/projects/${projectId}/applications`);
    const row = desk.getByRole('row').filter({ hasText: name });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row.getByText(NO_DOCUMENT, { exact: true })).toBeVisible();
    await expect(row.getByText(CONTACT_THROUGH_VOLUNTEER, { exact: true })).toBeVisible();
    await row.getByRole('link', { name }).click();
    await expect(desk.getByRole('heading', { level: 1, name })).toBeVisible();
    const id = /\/admin\/applications\/([0-9a-f-]{36})/.exec(desk.url())?.[1];
    expect(id, desk.url()).toBeTruthy();
    // the person the send made: a profile without a document and without a mobile
    const rpm = await apiAs(request, RPM);
    const record = await rpm.get(`/applications/${id}`);
    expect(record.ok(), await record.text()).toBe(true);
    const { data } = (await record.json()) as {
      data: { beneficiaryId: string | null; identityKind: string | null };
    };
    expect(data.identityKind).toBe('none');
    expect(data.beneficiaryId).toBeTruthy();
    await desk.goto(`/admin/beneficiaries/${data.beneficiaryId}`);
    await expect(desk.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(desk.getByText(NO_DOCUMENT, { exact: true }).first()).toBeVisible();
    await expect(desk.getByText(CONTACT_THROUGH_VOLUNTEER, { exact: true }).first()).toBeVisible();
  });
}

let projectId = '';

test.describe.configure({ mode: 'serial' });
// the volunteer's phone is 360 px wide, the narrowest the field screens must fit
test.use({ viewport: { width: 360, height: 740 } });

test.describe('the identity an application asks follows the project', () => {
  // Playwright wants the first argument destructured, so one fixture is named and left alone
  test.beforeEach(({ page: _page }, info: TestInfo) => {
    test.skip(!isPhone(info), 'the volunteer’s part is the phone’s');
  });

  test('the PM lets the document and the mobile stay empty, a volunteer sends a person without either, and the office reads it', async ({
    browser,
    page,
    request,
  }) => {
    test.setTimeout(420_000);
    projectId = await projectOfTheJourney(browser, request);
    await pmChooses(browser, projectId, [
      [DOCUMENT, IF_THEY_HAVE_ONE],
      [MOBILE, THROUGH_THE_VOLUNTEER],
    ]);

    const name = `নথিহীন উপকারভোগী ${code()}`;
    await signIn(page, VOLUNTEER);
    await page.goto(`/my-projects/${projectId}/apply`);
    await expect(page.getByRole('heading', { level: 1, name: 'নতুন আবেদন' })).toBeVisible();
    // the lookup by number stays; under it the start for a person without a document
    await expect(page.getByRole('textbox', { name: /NID নম্বর/ })).toBeVisible();
    await expect(page.getByText(HELP)).toBeVisible();
    const start = page.getByRole('button', { name: START });
    await expect(start).toBeVisible();
    await noViolations(page, 'the identity card');
    await fitsThePhone(page, 'the identity card');
    await switchLanguage(page, 'en');
    await expect(
      page.getByRole('button', { name: 'No identity document: start with the name' }),
    ).toBeVisible();
    await noViolations(page, 'the identity card in English');
    await fitsThePhone(page, 'the identity card in English');
    await switchLanguage(page, 'bn');

    await start.click();
    await expect(page.getByRole('heading', { level: 2, name: 'আবেদন ফর্ম' })).toBeVisible();
    await personWithoutNumbers(page, name);
    await fitsThePhone(page, 'the first part');
    // the first part done saves the draft, as for any new person
    await page.getByRole('button', { name: 'পরের অংশ' }).click();
    await expect(page.getByText('খসড়া সংরক্ষিত হয়েছে')).toBeVisible();
    await page.getByRole('textbox', { name: /কেন সহায়তা দরকার/ }).fill('শীতের কাপড় দরকার');
    await noViolations(page, 'the form');
    await sendToOffice(page);
    await expect(
      page.getByRole('heading', { level: 2, name: 'আবেদন পাঠানো হয়েছে' }),
    ).toBeVisible();
    await expect(page.getByText(/^আবেদন নম্বর: [A-Z0-9]+-\d{4}-\d{5}/)).toBeVisible();
    await fitsThePhone(page, 'the result');

    await officeSeesBoth(browser, request, name);
  });

  test('the same start without network keeps the entry on the phone, and it reaches the office when the network returns', async ({
    browser,
    page,
    context,
    request,
  }) => {
    test.setTimeout(300_000);
    const name = `অফলাইন নথিহীন ${code()}`;
    const arrives = dataSetArrives(page);
    await signIn(page, VOLUNTEER);
    await arrives;
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

    await goOffline(context);
    await page.goto(`/my-projects/${projectId}`);
    await page.getByRole('link', { name: 'নতুন আবেদন' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'নতুন আবেদন' })).toBeVisible();
    // the rule comes from the project the phone holds
    await expect(page.getByText(HELP)).toBeVisible();
    await page.getByRole('button', { name: START }).click();
    await personWithoutNumbers(page, name);
    await page.getByRole('button', { name: 'পরের অংশ' }).click();
    await expect(page.getByText(/ফোনে জমা/)).toBeVisible();
    await page.getByRole('textbox', { name: /কেন সহায়তা দরকার/ }).fill('অফলাইনে নেওয়া');
    await sendToOffice(page);
    await expect(page.getByRole('heading', { level: 2, name: 'ফোনে জমা আছে' })).toBeVisible();

    // the sync centre holds the entry as one on its way, under the typed name
    await page.goto('/sync');
    await expect(page.getByRole('heading', { level: 1, name: 'সিঙ্ক' })).toBeVisible();
    const waiting = page.getByRole('region', { name: /পাঠানোর অপেক্ষায়/ });
    await expect(waiting.getByRole('heading', { level: 3, name })).toBeVisible();
    await expect(page.getByRole('region', { name: /অফিস যাচাই করছে/ })).toHaveCount(0);
    await fitsThePhone(page, 'the sync centre');

    const batch = page.waitForResponse((r) => r.url().includes('/api/v1/sync/batch') && r.ok(), {
      timeout: 60_000,
    });
    await goOnline(context);
    await batch;
    // nothing was refused and nothing waits for a check: the entry went like an online send
    await expect(page.getByRole('heading', { level: 3, name })).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByRole('region', { name: /পাঠানো যায়নি/ })).toHaveCount(0);
    await page.goto('/my-applications?tab=pending');
    const row = page.getByRole('listitem').filter({ hasText: name });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText(/[A-Z0-9]+-\d{4}-\d{5}/);

    await officeSeesBoth(browser, request, name);
  });

  test('once the PM asks the document again, the start without it is gone and the number is asked', async ({
    browser,
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    await pmChooses(browser, projectId, [[DOCUMENT, REQUIRED]]);

    await signIn(page, VOLUNTEER);
    await page.goto(`/my-projects/${projectId}/apply`);
    await expect(page.getByRole('textbox', { name: /NID নম্বর/ })).toBeVisible();
    await expect(page.getByText(HELP)).toHaveCount(0);
    await expect(page.getByRole('button', { name: START })).toHaveCount(0);

    // a new person under a number: the number is asked, and the part does not pass without it
    const nid = `4${digits(9)}`;
    await page.getByRole('textbox', { name: /NID নম্বর/ }).fill(nid);
    await page.getByRole('button', { name: 'খুঁজুন' }).click();
    await page.getByRole('button', { name: 'নতুন ব্যক্তির জন্য ফর্ম পূরণ করুন' }).click();
    const number = page.getByRole('textbox', { name: /পরিচয় নম্বর/ });
    await expect(number).toHaveValue(nid);
    await expect(number).toHaveAttribute('required', '');
    await number.fill('');
    await page.getByRole('button', { name: 'পরের অংশ' }).click();
    await expect(page.getByText(/পরের অংশে যাওয়ার আগে \dটি সমস্যা ঠিক করুন/)).toBeVisible();

    // the server asks it too, whatever a phone sends: a draft may still lack the number, its
    // send may not
    const me = await apiAs(request, VOLUNTEER);
    const form = await me.get(`/projects/${projectId}/application-form`);
    expect(form.ok(), await form.text()).toBe(true);
    const { data: version } = (await form.json()) as { data: { id: string } };
    const places = await savar(await apiAs(request, HEAD));
    const made = await me.post(`/projects/${projectId}/applications`, {
      clientUuid: crypto.randomUUID(),
      projectId,
      formVersionId: version.id,
      answers: [
        { fieldKey: 'q_name', value: { t: 'short_text', v: 'নম্বর ছাড়া' } },
        { fieldKey: 'q_father', value: { t: 'short_text', v: 'নমুনা পিতা' } },
        { fieldKey: 'q_mobile', value: { t: 'phone', v: `018${digits(8)}` } },
        { fieldKey: 'q_gender', value: { t: 'single_select', v: 'female' } },
        {
          fieldKey: 'q_address',
          value: {
            t: 'bd_address',
            division_id: places.division,
            district_id: places.district,
            upazila_id: places.upazila,
            union_id: places.union,
          },
        },
        { fieldKey: 'q_village', value: { t: 'short_text', v: 'নমুনা গ্রাম' } },
      ],
    });
    expect(made.status(), await made.text()).toBe(201);
    const draft = ((await made.json()) as { data: { id: string } }).data.id;
    const read = await me.get(`/applications/${draft}`);
    const refused = await me.post(
      `/applications/${draft}/actions/submit`,
      {},
      { 'If-Match': read.headers()['etag'] ?? '' },
    );
    expect(refused.status(), await refused.text()).toBe(409);
    const { error } = (await refused.json()) as { error: { code: string } };
    expect(error.code).toBe('workflow.guard.identity_present');
  });
});
