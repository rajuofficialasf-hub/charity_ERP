import {
  type APIRequestContext,
  type Browser,
  expect,
  type Page,
  test,
  type TestInfo,
} from '@playwright/test';
import { apiAs, isPhone, scan, signIn } from './support/admin';
import { consent, onDesk, savar, volunteerId } from './support/applications';
import {
  dataSetArrives,
  goOffline,
  goOnline,
  syncedNumber,
  throttle3g,
  TINY_PNG,
} from './support/offline';
import { digits, pickByLabel, sendToOffice } from './support/forms';
import { activeProject, choice, code, ERR, question } from './support/projects';

// The offline journeys of a volunteer's phone (docs/architecture/OFFLINE_SYNC.md, the test
// strategy; docs/testing/DEMO_ACCOUNTS.md): an application taken without network with its photo
// goes to the office when the network returns, over a slow link and through a dropped upload
// part; an offline entry on a known number with another name waits for the office, which links
// it; a draft edited on both sides keeps the later edit; a logout with work left warns twice; a
// device the office signs out wipes the phone. One project of this run, volunteer 11 assigned and
// consenting through the API; the journeys run in order on the same phone.
const PM = 'pm.err@example.org';
const HEAD = 'head@example.org';
const RPM = 'rpm.dhaka@example.org';
const VOLUNTEER = '01700000111';
/** Signed in read-only on the same phone after the first volunteer (docs/testing/DEMO_ACCOUNTS.md). */
const NEXT_VOLUNTEER = '01700000116';
/** The first demo beneficiary (a woman of Dhaka): her number is known, her name is not the typed one. */
const KNOWN_NID = '1000001000';

const ddmmyyyy = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`;
const windowAroundToday = () => {
  const from = new Date();
  from.setDate(from.getDate() - 7);
  const to = new Date();
  to.setMonth(to.getMonth() + 2);
  return { from: ddmmyyyy(from), to: ddmmyyyy(to) };
};

/** The identity part, then a part with the house photo and a note. */
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
    title: { bn: 'ঘর ও প্রয়োজন', en: 'House and need' },
    visibility: 'volunteer',
    condition: null,
    fields: [
      question('q_photo', 'photo', {
        label: { bn: 'ঘরের ছবি', en: 'House photo' },
        required: false,
      }),
      question('q_note', 'long_text', { label: { bn: 'মন্তব্য', en: 'Note' } }),
    ],
  },
];

const noViolations = async (page: Page, where: string) =>
  expect((await scan(page)).violations, where).toEqual([]);

/** An active ERR project of this run with the two-part form, volunteer 11 assigned and consenting. */
async function offlineProject(browser: Browser, request: APIRequestContext) {
  const projectId = await onDesk(browser, async (desk) => {
    await signIn(desk, PM);
    await desk.goto('/admin/projects');
    return activeProject(desk, `অফলাইনের যাত্রা ${code()}`, ERR, PM, FORM, {
      window: windowAroundToday(),
      fundSource: 'সাধারণ দান',
    });
  });
  const head = await apiAs(request, HEAD);
  const volunteer = await volunteerId(head, VOLUNTEER);
  const assigned = await head.post(`/projects/${projectId}/volunteers`, {
    volunteers: [{ volunteerId: volunteer }],
  });
  expect(assigned.status(), await assigned.text()).toBe(201);
  await consent(request, VOLUNTEER, projectId);
  return { projectId, places: await savar(head) };
}

/** The phone signed in with its data set and the locations on it, and the worker in control. */
async function phoneReady(page: Page, loginId = VOLUNTEER): Promise<void> {
  const arrives = dataSetArrives(page);
  await signIn(page, loginId);
  await arrives;
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

/** The identity part of a new person without network, typed over the offline lookup. */
async function identityOffline(page: Page, projectId: string, nid: string, name: string) {
  await page.goto(`/my-projects/${projectId}`);
  await page.getByRole('link', { name: 'নতুন আবেদন' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'নতুন আবেদন' })).toBeVisible();
  await page.getByRole('textbox', { name: /NID নম্বর/ }).fill(nid);
  await page.getByRole('button', { name: 'খুঁজুন' }).click();
  await expect(page.getByText(/নেট নেই, তাই যাচাই পরে হবে/)).toBeVisible();
  await page.getByRole('button', { name: 'নতুন ব্যক্তির জন্য ফর্ম পূরণ করুন' }).click();
  await expect(page.getByRole('textbox', { name: /পরিচয় নম্বর/ })).toHaveValue(nid);
  await page.getByRole('textbox', { name: /উপকারভোগীর নাম/ }).fill(name);
  await page.getByRole('textbox', { name: /পিতা বা স্বামীর নাম/ }).fill('নমুনা পিতা');
  await page.getByRole('textbox', { name: /উপকারভোগীর মোবাইল/ }).fill(`018${digits(8)}`);
  // the options of a coded question come from its reference list
  await pickByLabel(page, 'লিঙ্গ', 'মহিলা');
  await pickByLabel(page, 'বিভাগ', 'ঢাকা');
  await pickByLabel(page, 'জেলা', 'ঢাকা');
  await pickByLabel(page, 'উপজেলা', 'সাভার');
  await pickByLabel(page, 'ইউনিয়ন', 'সাভার');
  await page.getByRole('textbox', { name: /গ্রাম/ }).fill('নমুনা গ্রাম');
  // the first part done keeps the draft on the phone
  await page.getByRole('button', { name: 'পরের অংশ' }).click();
  await expect(page.getByText(/ফোনে জমা/)).toBeVisible();
}

/** The phone's row of the list by the person's name, in the tab given. */
const rowOf = (page: Page, name: string) => page.getByRole('listitem').filter({ hasText: name });

let projectId = '';
let places: Awaited<ReturnType<typeof savar>>;

test.describe.configure({ mode: 'serial' });

test.describe('the offline journeys', () => {
  // Playwright wants the first argument destructured, so one fixture is named and left alone
  test.beforeEach(({ page: _page }, info: TestInfo) => {
    test.skip(!isPhone(info), 'the offline work is the phone’s');
  });

  test('an application taken offline with its photo reaches the office when the network returns', async ({
    browser,
    page,
    context,
    request,
  }) => {
    test.setTimeout(300_000);
    ({ projectId, places } = await offlineProject(browser, request));
    const name = `অফলাইন উপকারভোগী ${code()}`;
    await phoneReady(page);

    await goOffline(context);
    await identityOffline(page, projectId, `3${digits(9)}`, name);
    await page
      .getByLabel('গ্যালারি থেকে নিন')
      .setInputFiles({ name: 'ghor.png', mimeType: 'image/png', buffer: TINY_PNG });
    await expect(page.getByText('ghor.png').first()).toBeVisible();
    await page.getByRole('textbox', { name: /মন্তব্য/ }).fill('অফলাইনে নেওয়া মন্তব্য');
    await noViolations(page, 'the form offline');
    await sendToOffice(page);
    // the queued send has its own card; the draft's save notice carries the same words
    await expect(page.getByRole('heading', { level: 2, name: 'ফোনে জমা আছে' })).toBeVisible();
    await expect(page.getByText('এই ফোনে জমা হয়েছে। নেট এলে অফিসে যাবে।')).toBeVisible();
    // the list shows the record on its way, and the chip counts the draft and its send
    await page.goto('/my-applications?tab=draft');
    await expect(rowOf(page, name)).toContainText('পাঠানোর অপেক্ষায়');
    await expect(
      page.getByRole('banner').getByRole('link', { name: /সিঙ্কের অবস্থা: \dটি বাকি/ }),
    ).toBeVisible();
    await noViolations(page, 'the list offline');

    // the network returns slowly, and the photo's first part is cut on its way once
    let cut = false;
    await page.route('**/api/v1/upload-sessions/*/parts/*', async (route) => {
      if (cut) return route.continue();
      cut = true;
      await route.abort('connectionreset');
    });
    const batch = page.waitForResponse((r) => r.url().includes('/api/v1/sync/batch') && r.ok(), {
      timeout: 60_000,
    });
    const finalized = page.waitForResponse(
      (r) => /\/api\/v1\/upload-sessions\/[^/]+\/finalize$/.test(r.url()) && r.ok(),
      { timeout: 120_000 },
    );
    const lift = await throttle3g(page);
    await goOnline(context);
    await batch;
    await finalized;
    expect(cut).toBe(true);
    await lift();
    // nothing was refused on the way
    await page.goto('/sync');
    await expect(page.getByRole('heading', { level: 1, name: 'সিঙ্ক' })).toBeVisible();
    await expect(page.getByRole('region', { name: /পাঠানো যায়নি/ })).toHaveCount(0);
    await page.goto('/my-applications?tab=pending');
    await expect(rowOf(page, name)).toBeVisible({ timeout: 30_000 });
    const appNo = await syncedNumber(rowOf(page, name));
    await expect(rowOf(page, name)).not.toContainText('ছবি এখনো যায়নি', { timeout: 30_000 });
    await expect(
      page.getByRole('banner').getByRole('link', { name: 'সিঙ্কের অবস্থা' }),
    ).toBeVisible();

    // the office reads the answers, the photo and the time the phone took it
    await onDesk(browser, async (desk) => {
      await signIn(desk, RPM);
      await desk.goto(`/admin/projects/${projectId}/applications`);
      await expect(desk.getByText(appNo).first()).toBeVisible();
      await desk.getByRole('link', { name }).first().click();
      await expect(desk.getByRole('heading', { level: 1, name })).toBeVisible();
      await expect(desk.getByText('অফলাইনে নেওয়া মন্তব্য')).toBeVisible();
      await expect(desk.getByText('ফোনে নেওয়া হয়েছে')).toBeVisible();
      // the photo answer is there; the E2E API runs no scan job, so the picture itself may still
      // read as waiting for its check
      await expect(
        desk
          .getByRole('img', { name: 'আবেদনের ছবি' })
          .or(desk.getByText('ফাইলটি যাচাই হচ্ছে; শেষ হলে দেখা যাবে।')),
      ).toBeVisible({ timeout: 30_000 });
      const id = /\/admin\/applications\/([0-9a-f-]{36})/.exec(desk.url())?.[1];
      expect(id, desk.url()).toBeTruthy();
      const rpm = await apiAs(request, RPM);
      const record = await rpm.get(`/applications/${id}`);
      expect(record.ok()).toBe(true);
      const { data } = (await record.json()) as {
        data: { answers: { fieldKey: string; value: { t: string; v?: string[] } }[] };
      };
      const photo = data.answers.find((a) => a.fieldKey === 'q_photo');
      expect(photo?.value.t).toBe('photo');
      const file = await rpm.get(`/files/${photo!.value.v![0]}`);
      expect(file.ok(), await file.text()).toBe(true);
      expect(((await file.json()) as { data: { kind: string } }).data.kind).toBe('form_photo');
    });
  });

  test('an offline entry on a known number with another name waits for the office, which links it', async ({
    browser,
    page,
    context,
  }) => {
    test.setTimeout(240_000);
    const name = `অন্য নাম ${code()}`;
    await phoneReady(page);
    await goOffline(context);
    await identityOffline(page, projectId, KNOWN_NID, name);
    await page.getByRole('textbox', { name: /মন্তব্য/ }).fill('একই নম্বর, অন্য নাম');
    await sendToOffice(page);
    // the queued send has its own card; the draft's save notice carries the same words
    await expect(page.getByRole('heading', { level: 2, name: 'ফোনে জমা আছে' })).toBeVisible();
    await expect(page.getByText('এই ফোনে জমা হয়েছে। নেট এলে অফিসে যাবে।')).toBeVisible();
    const batch = page.waitForResponse((r) => r.url().includes('/api/v1/sync/batch') && r.ok(), {
      timeout: 60_000,
    });
    await goOnline(context);
    await batch;
    // a held entry has no profile yet, so the list names no person: the row is the one waiting
    await page.goto('/my-applications?tab=pending');
    const held = page.getByRole('listitem').filter({ hasText: 'যাচাইয়ের অপেক্ষায়' }).first();
    await expect(held).toContainText('অফিস যাচাই করছে', { timeout: 30_000 });
    const href = await held.getByRole('link', { name: 'আবেদন দেখুন' }).getAttribute('href');
    const id = href?.split('/').pop() ?? '';
    expect(id).toMatch(/^[0-9a-f-]{36}$/);

    await onDesk(browser, async (desk) => {
      await signIn(desk, RPM);
      await desk.goto(`/admin/applications/${id}`);
      // a held entry is titled by the name typed on the phone until it is linked to a profile
      await expect(desk.getByRole('heading', { level: 1, name })).toBeVisible();
      await expect(desk.getByText('এই নম্বরের একটি প্রোফাইল আগে থেকেই আছে।')).toBeVisible();
      await desk.getByRole('button', { name: 'যাচাই করুন' }).click();
      const dialog = desk.getByRole('dialog', { name: 'এন্ট্রি যাচাই করুন' });
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'যুক্ত করুন' }).click();
      await expect(
        desk.getByText('এন্ট্রিটি প্রোফাইলের সঙ্গে যুক্ত হয়েছে, আবেদনটি এখন পেন্ডিং।'),
      ).toBeVisible();
    });
    // the phone learns of the decision with its next pull of the data set
    await page.goto('/sync');
    const pulled = page.waitForResponse(
      (r) => r.url().includes('/api/v1/sync/snapshot') && r.ok(),
      { timeout: 30_000 },
    );
    await page.getByRole('button', { name: 'এখনই সিঙ্ক করুন' }).click();
    await pulled;
    // the record's own page shows the office's state, and no longer the verifying badge
    await page.goto(`/my-applications/${id}`);
    await expect(page.getByRole('list', { name: 'আবেদনের ধাপ' })).toContainText(
      'অফিসে পাঠানো হয়েছে',
      { timeout: 30_000 },
    );
    await expect(page.getByText('অফিস যাচাই করছে')).toHaveCount(0);
  });

  test('a draft edited on both sides keeps the later edit, the phone’s', async ({
    browser,
    page,
    context,
    request,
  }) => {
    test.setTimeout(240_000);
    const name = `দুই দিকের খসড়া ${code()}`;
    const me = await apiAs(request, VOLUNTEER);
    const form = await me.get(`/projects/${projectId}/application-form`);
    const { data: version } = (await form.json()) as { data: { id: string } };
    const answers = (note: string) => [
      { fieldKey: 'q_id', value: { t: 'short_text', v: `3${digits(9)}` } },
      { fieldKey: 'q_name', value: { t: 'short_text', v: name } },
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
      { fieldKey: 'q_note', value: { t: 'long_text', v: note } },
    ];
    const first = answers('প্রথম মন্তব্য');
    const made = await me.post(`/projects/${projectId}/applications`, {
      clientUuid: crypto.randomUUID(),
      projectId,
      formVersionId: version.id,
      answers: first,
    });
    expect(made.status(), await made.text()).toBe(201);
    const id = ((await made.json()) as { data: { id: string } }).data.id;

    // the phone reads the draft online, so it is there without network
    await phoneReady(page);
    await page.goto(`/my-applications/${id}`);
    await expect(page.getByText('প্রথম মন্তব্য')).toBeVisible();
    await goOffline(context);
    // the office's side changes the note meanwhile
    const read = await me.get(`/applications/${id}`);
    const edited = await me.patch(
      `/applications/${id}`,
      {
        answers: first.map((a) =>
          a.fieldKey === 'q_note' ? { ...a, value: { t: 'long_text', v: 'সার্ভারের মন্তব্য' } } : a,
        ),
      },
      { 'If-Match': read.headers()['etag'] ?? '' },
    );
    expect(edited.ok(), await edited.text()).toBe(true);
    // the phone, later, writes its own note and sends
    await page.goto(`/my-applications/${id}/edit`);
    await page.getByRole('button', { name: 'পরের অংশ' }).click();
    const note = page.getByRole('textbox', { name: /মন্তব্য/ });
    await note.clear();
    await note.fill('ফোনের মন্তব্য');
    await sendToOffice(page);
    // the queued send has its own card; the draft's save notice carries the same words
    await expect(page.getByRole('heading', { level: 2, name: 'ফোনে জমা আছে' })).toBeVisible();
    await expect(page.getByText('এই ফোনে জমা হয়েছে। নেট এলে অফিসে যাবে।')).toBeVisible();
    const batch = page.waitForResponse((r) => r.url().includes('/api/v1/sync/batch') && r.ok(), {
      timeout: 60_000,
    });
    await goOnline(context);
    await batch;
    await onDesk(browser, async (desk) => {
      await signIn(desk, RPM);
      await desk.goto(`/admin/applications/${id}`);
      await expect(desk.getByRole('heading', { level: 1, name })).toBeVisible();
      await expect(desk.getByText('ফোনের মন্তব্য')).toBeVisible();
      await expect(desk.getByText('সার্ভারের মন্তব্য')).toHaveCount(0);
    });
  });

  test('a logout with work still on the phone is warned about twice, and a step back keeps the work', async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    const name = `রেখে দেওয়া খসড়া ${code()}`;
    await phoneReady(page);
    await goOffline(context);
    await identityOffline(page, projectId, `3${digits(9)}`, name);
    await page.getByRole('button', { name: 'প্রোফাইল মেনু' }).click();
    await page.getByRole('menuitem', { name: 'লগআউট' }).click();
    const first = page.getByRole('alertdialog', { name: 'না পাঠানো কাজ আছে' });
    await expect(first).toContainText(/1টি রেকর্ড এখনো অফিসে পৌঁছায়নি/);
    await first.getByRole('button', { name: 'তবুও লগআউট করুন' }).click();
    const second = page.getByRole('alertdialog', { name: 'সত্যিই লগআউট করবেন?' });
    await expect(second).toContainText(/1টি রেকর্ড চিরতরে হারিয়ে যাবে/);
    await second.getByRole('button', { name: 'বাতিল' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    // still signed in, the draft still on the phone
    await page.goto('/my-applications?tab=draft');
    await expect(rowOf(page, name)).toContainText('পাঠানোর অপেক্ষায়');
    const batch = page.waitForResponse((r) => r.url().includes('/api/v1/sync/batch'), {
      timeout: 60_000,
    });
    await goOnline(context);
    await batch;
  });

  test('a page not read before the network went shows the phone’s copy, not a wait', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await phoneReady(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await goOffline(context);
    // the list is read by the home already; the project's own page is not
    await page.getByRole('link', { name: 'আমার প্রকল্প' }).first().click();
    const list = page.getByRole('list', { name: 'আমার প্রকল্পের তালিকা' });
    await list.getByRole('link').first().click();
    await expect(page).toHaveURL(/\/my-projects\/[0-9a-f-]{36}$/);
    // drawn from the phone's copy: the page past its placeholder, with no load error
    await expect(page.getByRole('link', { name: 'আমার প্রকল্পে ফিরে যান' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('alert')).toHaveCount(0);
    await goOnline(context);
  });

  test('the next volunteer on the same phone sees none of the first one’s records offline', async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    await phoneReady(page);
    await page.goto('/my-applications');
    const first = page.getByRole('main').getByRole('listitem').first();
    await expect(first).toBeVisible();
    const theirs = (await first.innerText()).split('\n')[0]!.trim();
    expect(theirs.length).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'প্রোফাইল মেনু' }).click();
    await page.getByRole('menuitem', { name: 'লগআউট' }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });

    // the next volunteer reads their own list once online, then the phone loses the network
    await signIn(page, NEXT_VOLUNTEER);
    await page.goto('/my-applications');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await goOffline(context);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(theirs)).toHaveCount(0);
    await goOnline(context);
  });

  test('a device the office signs out wipes the phone at its next step', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    await phoneReady(page);
    const head = await apiAs(request, HEAD);
    const users = await head.get(`/users?q=${VOLUNTEER}`);
    const [user] = ((await users.json()) as { data: { id: string }[] }).data;
    const sessions = await head.get(`/users/${user!.id}/sessions`);
    const rows = ((await sessions.json()) as { data: { id: string }[] }).data;
    for (const s of rows) {
      const revoked = await head.post(`/users/${user!.id}/sessions/${s.id}/revoke`, {
        reason: 'ফোন হারিয়েছে (পরীক্ষা)',
      });
      expect(revoked.status(), await revoked.text()).toBe(204);
    }
    // the phone's next request meets the revocation (an open page may already have met it)
    await page.goto('/my-applications');
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 2, name: 'লগইন করুন' })).toBeVisible();
    const databases = await page.evaluate(async () =>
      (await indexedDB.databases()).map((d) => d.name ?? ''),
    );
    expect(databases).not.toContain('css-offline');
  });
});
