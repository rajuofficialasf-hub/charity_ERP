import { type APIRequestContext, type Browser, expect, type Page, test } from '@playwright/test';
import { apiAs, scan, signIn } from './support/admin';
import { act, consent, onDesk, savar, volunteerId } from './support/applications';
import { activeProject, choice, code, ERR, question } from './support/projects';

// The application rules end to end (docs/plans/2026-10-25-1156-feat-application-rules-plan.md,
// the journeys): the score orders the office's decisions and the waitlist gives the next person
// in one click; an approved answer is opened, filled by its volunteer on the phone and accepted
// by another official; a volunteer's application is handed to another volunteer, after which the
// first no longer finds it. Each journey makes its own project of this run; the applications are
// brought through the API, the decisions are taken on the screens.
const PM = 'pm.err@example.org';
const HEAD = 'head@example.org';
const EXECUTIVE = 'executive@example.org';
const RPM = 'rpm.dhaka@example.org';
const VOLUNTEER = '01700000115';
const OTHER_VOLUNTEER = '01700000103';

const digits = (n: number) =>
  Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
/** A day as the date field takes it (ddmmyyyy). */
const ddmmyyyy = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`;
const windowAroundToday = () => {
  const from = new Date();
  from.setDate(from.getDate() - 7);
  const to = new Date();
  to.setMonth(to.getMonth() + 2);
  return { from: ddmmyyyy(from), to: ddmmyyyy(to) };
};

/** The identity part, then the kind of need, whose "বিধবা" gives 20 points. */
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
    fields: [
      question('q_kind', 'radio', {
        label: { bn: 'উপকারভোগীর ধরন', en: 'Kind' },
        options: [
          choice('widow', { bn: 'বিধবা', en: 'Widow' }),
          choice('other', { bn: 'অন্যান্য', en: 'Other' }),
        ],
        settings: { score: { options: { widow: 20, other: 0 } } },
      }),
    ],
  },
];

const noViolations = async (page: Page, where: string) =>
  expect((await scan(page)).violations, where).toEqual([]);

/**
 * An active ERR project of this run with the scored form, volunteers 15 and 3 assigned and
 * consenting, and the Project Executive given the Dhaka area. Returns its id and the volunteers.
 */
async function rulesProject(browser: Browser, request: APIRequestContext) {
  const projectId = await onDesk(browser, async (desk) => {
    await signIn(desk, PM);
    await desk.goto('/admin/projects');
    return activeProject(desk, `আবেদনের নিয়ম ${code()}`, ERR, PM, FORM, {
      window: windowAroundToday(),
      fundSource: 'সাধারণ দান',
    });
  });
  const head = await apiAs(request, HEAD);
  const first = await volunteerId(head, VOLUNTEER);
  const second = await volunteerId(head, OTHER_VOLUNTEER);
  const assigned = await head.post(`/projects/${projectId}/volunteers`, {
    volunteers: [{ volunteerId: first }, { volunteerId: second }],
  });
  expect(assigned.status(), await assigned.text()).toBe(201);
  const areas = await head.get(`/projects/${projectId}/areas`);
  const [area] = ((await areas.json()) as { data: { locationId: string }[] }).data;
  const users = await head.get(`/users?q=${encodeURIComponent(EXECUTIVE)}`);
  const [executive] = ((await users.json()) as { data: { id: string }[] }).data;
  const staff = await head.post(`/projects/${projectId}/staff`, {
    userId: executive!.id,
    roleKey: 'project_executive',
    areaLocationId: area!.locationId,
    canView: true,
    canEdit: true,
  });
  expect(staff.status(), await staff.text()).toBe(201);
  await consent(request, VOLUNTEER, projectId);
  await consent(request, OTHER_VOLUNTEER, projectId);
  return { projectId, first, second, places: await savar(head) };
}

/** Volunteer 15's application of this kind, sent and, when asked, reviewed by the RPM. */
async function bring(
  request: APIRequestContext,
  projectId: string,
  places: Awaited<ReturnType<typeof savar>>,
  kind: 'widow' | 'other',
  name: string,
  upTo: 'draft' | 'sent' | 'reviewed' | 'approved',
): Promise<string> {
  const me = await apiAs(request, VOLUNTEER);
  const form = await me.get(`/projects/${projectId}/application-form`);
  expect(form.ok(), await form.text()).toBe(true);
  const { data: version } = (await form.json()) as { data: { id: string } };
  const made = await me.post(`/projects/${projectId}/applications`, {
    clientUuid: crypto.randomUUID(),
    projectId,
    formVersionId: version.id,
    answers: [
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
      { fieldKey: 'q_village', value: { t: 'short_text', v: 'পুরনো গ্রাম' } },
      { fieldKey: 'q_kind', value: { t: 'radio', v: kind } },
    ],
  });
  expect(made.status(), await made.text()).toBe(201);
  const id = ((await made.json()) as { data: { id: string } }).data.id;
  if (upTo === 'draft') return id;
  await act(me, id, 'submit');
  if (upTo === 'sent') return id;
  const rpm = await apiAs(request, RPM);
  await act(rpm, id, 'review');
  await act(rpm, id, 'send_for_approval');
  if (upTo === 'approved') await act(rpm, id, 'approve');
  return id;
}

test.describe('the application rules', () => {
  test('the score orders the decisions, and the waitlist gives the next person in one click', async ({
    browser,
    request,
  }) => {
    test.setTimeout(300_000);
    const { projectId, places } = await rulesProject(browser, request);
    const pm = await apiAs(request, PM);
    const quota = await pm.patch(`/projects/${projectId}/quotas`, {
      quotas: [{ level: 'union', locationId: places.union, target: 1 }],
    });
    expect(quota.ok(), await quota.text()).toBe(true);
    const higher = `বিধবা ${code()}`;
    const lower = `অন্যজন ${code()}`;
    await bring(request, projectId, places, 'other', lower, 'reviewed');
    await bring(request, projectId, places, 'widow', higher, 'reviewed');

    await onDesk(browser, async (desk) => {
      await signIn(desk, RPM);
      await desk.goto(`/admin/projects/${projectId}/applications?sort=-score`);
      const rows = desk.getByRole('grid').getByRole('row');
      // the first row after the header holds the higher score
      await expect(rows.nth(1)).toContainText(higher);
      await expect(rows.nth(1).getByText('20', { exact: true })).toBeVisible();
      await noViolations(desk, 'the list by score');

      // approving the lower score first asks why
      await desk.getByRole('link', { name: lower }).first().click();
      await desk.getByRole('button', { name: 'অনুমোদন করুন' }).click();
      const why = desk.getByRole('dialog', { name: 'আবেদন অনুমোদন করুন' });
      await expect(why.getByText('কেন স্কোরের ক্রম ভেঙে সিদ্ধান্ত নিচ্ছেন?')).toBeVisible();
      await why.getByRole('button', { name: 'বাতিল' }).click();
      // the lower one waits instead, with the office's reason
      await desk.getByRole('button', { name: 'অপেক্ষমাণ তালিকায় রাখুন' }).click();
      const wait = desk.getByRole('dialog', { name: 'অপেক্ষমাণ তালিকায় রাখুন' });
      await wait.getByRole('textbox', { name: /অফিসের কারণ/ }).fill('কোটা আগে পূর্ণ হবে');
      await wait.getByRole('button', { name: 'অপেক্ষমাণ তালিকায় রাখুন' }).click();
      await expect(desk.getByText('আবেদনটি অপেক্ষমাণ তালিকায় রাখা হয়েছে।')).toBeVisible();

      // the higher score is approved and fills the union's quota of one
      await desk.goto(`/admin/projects/${projectId}/applications?sort=-score`);
      await desk.getByRole('link', { name: higher }).first().click();
      await desk.getByRole('button', { name: 'অনুমোদন করুন' }).click();
      await expect(desk.getByText('আবেদন অনুমোদিত হয়েছে।')).toBeVisible();

      // the quota is full, so the pull asks why before it approves the next one
      await desk.goto(`/admin/projects/${projectId}/applications`);
      const quotas = desk.locator('section').filter({
        has: desk.getByRole('heading', { level: 2, name: 'এলাকার কোটা' }),
      });
      await expect(quotas).toContainText('লক্ষ্য 1');
      await expect(quotas).toContainText('অনুমোদিত 1');
      await expect(quotas.getByText('কোটা পূর্ণ')).toBeVisible();
      await noViolations(desk, 'the quota bars');
      await quotas.getByRole('button', { name: /^পরেরজনকে আনুন/ }).click();
      const pull = desk.getByRole('dialog', { name: 'পরেরজনকে আনুন' });
      await expect(pull.getByText('এই এলাকার কোটা পূর্ণ। তবু কেন অনুমোদন দিচ্ছেন?')).toBeVisible();
      await pull.getByRole('textbox', { name: /মন্তব্য/ }).fill('বাড়তি মালামাল এসেছে');
      await pull.getByRole('button', { name: 'পরেরজনকে আনুন' }).click();
      await expect(desk.getByText(/অপেক্ষমাণ তালিকা থেকে অনুমোদিত হয়েছে।/)).toBeVisible();
      await desk.getByRole('link', { name: lower }).first().click();
      await expect(
        desk.getByRole('definition').filter({ hasText: 'বাস্তবায়ন চলছে' }),
      ).toBeVisible();
    });
  });

  test('an approved answer is opened, filled by its volunteer and accepted by another official', async ({
    browser,
    page,
    request,
  }) => {
    test.setTimeout(300_000);
    const { projectId, places } = await rulesProject(browser, request);
    const name = `সংশোধন ${code()}`;
    const id = await bring(request, projectId, places, 'other', name, 'approved');

    // the RPM opens the village with a reason
    await onDesk(browser, async (desk) => {
      await signIn(desk, RPM);
      await desk.goto(`/admin/applications/${id}`);
      await desk.getByRole('button', { name: /^সংশোধনের জন্য খুলুন ?: গ্রাম$/ }).click();
      const open = desk.getByRole('dialog', { name: '“গ্রাম” সংশোধনের জন্য খুলুন' });
      await open.getByRole('textbox', { name: /অফিসের কারণ/ }).fill('গ্রামের নাম ভুল এসেছে');
      await open.getByRole('button', { name: 'খুলুন' }).click();
      await expect(desk.getByText('উত্তরটি সংশোধনের জন্য খোলা হয়েছে।')).toBeVisible();
    });

    // the volunteer gives the new village on the page of the application
    await signIn(page, VOLUNTEER);
    await page.goto(`/my-applications/${id}`);
    await expect(page.getByText('নতুন উত্তর দিন')).toBeVisible();
    await noViolations(page, 'the open answer');
    const village = page.getByRole('textbox', { name: /গ্রাম/ });
    await village.fill('নতুন গ্রাম');
    await page.getByRole('button', { name: 'পাঠান' }).click();
    await expect(
      page.getByText('নতুন উত্তর পাঠানো হয়েছে, এখন যাচাইয়ের অপেক্ষায়।'),
    ).toBeVisible();

    // another official accepts it; the change log keeps the step
    await onDesk(browser, async (desk) => {
      await signIn(desk, EXECUTIVE);
      await desk.goto(`/admin/applications/${id}`);
      const card = desk.locator('section').filter({
        has: desk.getByRole('heading', { level: 2, name: 'সংশোধনের জন্য খোলা উত্তর' }),
      });
      await expect(card).toContainText('পুরনো গ্রাম');
      await expect(card).toContainText('নতুন গ্রাম');
      await noViolations(desk, 'the unlock review');
      await card.getByRole('button', { name: 'গ্রহণ করুন' }).click();
      await expect(desk.getByText('নতুন উত্তর গ্রহণ করা হয়েছে।')).toBeVisible();
      await expect(desk.getByRole('table', { name: 'পরিবর্তনের লগ' })).toContainText('গ্রাম');
    });
  });

  test('a volunteer’s application is handed to another volunteer, and the first no longer finds it', async ({
    browser,
    request,
  }) => {
    test.setTimeout(300_000);
    const { projectId, first, places } = await rulesProject(browser, request);
    const name = `হস্তান্তর ${code()}`;
    const id = await bring(request, projectId, places, 'other', name, 'sent');
    const head = await apiAs(request, HEAD);
    const people = await head.get(`/projects/${projectId}/volunteers`);
    const assignments = (
      (await people.json()) as {
        data: { volunteerId: string; displayName: string }[];
      }
    ).data;
    const second = assignments.find((a) => a.volunteerId !== first)!;

    await onDesk(browser, async (desk) => {
      await signIn(desk, RPM);
      await desk.goto(`/admin/projects/${projectId}/transfer?from=${first}`);
      await desk.getByRole('checkbox', { name: new RegExp(name) }).check({ force: true });
      await desk.getByRole('button', { name: /নতুন স্বেচ্ছাসেবক$/ }).click();
      await desk.getByRole('option', { name: second.displayName, exact: true }).click();
      await desk
        .getByRole('textbox', { name: /হস্তান্তরের কারণ/ })
        .fill('স্বেচ্ছাসেবক এলাকা ছেড়েছেন');
      await noViolations(desk, 'the transfer');
      await desk.getByRole('button', { name: 'হস্তান্তর করুন' }).click();
      await expect(desk.getByText(/1টি আবেদন হস্তান্তর হয়েছে।/)).toBeVisible();
    });

    // the first volunteer no longer reaches it; the second does
    const gone = await (await apiAs(request, VOLUNTEER)).get(`/applications/${id}`);
    expect(gone.status()).toBe(404);
    const mine = await (await apiAs(request, OTHER_VOLUNTEER)).get(`/applications/${id}`);
    expect(mine.status()).toBe(200);
  });
});
