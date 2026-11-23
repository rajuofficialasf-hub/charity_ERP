import { DEFAULT_IDENTITY_RULES } from '@css/shared/projects';
import type { Me } from '@css/shared/auth';
import { bn } from '@css/shared/i18n';
import { expectNoAxeViolations } from '@/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// the chunked upload is its own module with its own tests; here it answers a stored file
vi.mock('../../lib/uploads', () => ({
  uploadFile: vi.fn(async () => ({
    id: '01900000-0000-7000-8000-0000000000f1',
    kind: 'form_photo',
  })),
}));
import { apiError, ME, refreshAs, renderApp } from '../../../test/auth';
import { definition, field, section } from '../../../test/forms';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../api/client';
import { uploadFile } from '../../lib/uploads';
import { ApplicationDetailPage } from './ApplicationDetailPage';
import { ApplicationFormPage } from './ApplicationFormPage';
import { MyApplicationsPage } from './MyApplicationsPage';
import { stubMatchMedia } from '../../../test/match-media';

// The volunteer's screens of the application cycle: the new application with the lookup, the
// draft saved part by part and sent at the end, "আমার আবেদন" by state, and one application with
// its answers, steps and the office's message. Test data only.
const VOLUNTEER: Me = { ...ME, kind: 'volunteer', roles: ['volunteer_general'] };
const MEMBER: Me = { ...ME, kind: 'volunteer', roles: ['volunteer_team_member'] };
const PROJECT = '01900000-0000-7000-8000-0000000000c1';
const VERSION = '01900000-0000-7000-8000-0000000000c2';
const APP = '01900000-0000-7000-8000-0000000000c3';
const PERSON = '01900000-0000-7000-8000-0000000000b1';
const DIVISION = '01900000-0000-7000-8000-0000000000a1';
const DISTRICT = '01900000-0000-7000-8000-0000000000a2';
const UPAZILA = '01900000-0000-7000-8000-0000000000a3';
const UNION = '01900000-0000-7000-8000-0000000000a4';
const place = (id: string, bn: string) => ({
  id,
  parentId: null,
  level: 'division',
  code: id.slice(-2),
  name: { bn, en: bn },
  active: true,
});

const autofill = {
  beneficiaryId: PERSON,
  benNo: 42,
  name: 'নমুনা উপকারভোগী',
  fatherOrHusbandName: 'নমুনা পিতা',
  motherName: null,
  mobile: '01700001000',
  genderCode: 'female',
  dob: null,
  ageYears: 40,
  divisionId: DIVISION,
  districtId: DISTRICT,
  upazilaId: UPAZILA,
  unionId: UNION,
  village: 'নমুনা গ্রাম',
  postOffice: null,
  postCode: null,
  landmark: null,
  members14Plus: 2,
  childrenUnder14: 1,
  lockedFields: ['name', 'father_or_husband_name', 'nid', 'birth_reg'],
};
const project = {
  projectId: PROJECT,
  code: 'WC',
  year: 2026,
  name: { bn: 'শীতবস্ত্র বিতরণ', en: 'Winter clothing' },
  status: 'active',
  applyFrom: '2026-11-01',
  applyTo: '2026-12-31',
  perVolunteerLimit: 50,
  dawahEnabled: false,
  via: 'assignment',
  permissionSet: 'application_distribution',
  isPaid: false,
  consentStatus: 'accepted',
  rulesVersion: 2,
  applicationsCounted: 7,
  applicationsLeft: 43,
  leadsTeam: true,
  identityRules: DEFAULT_IDENTITY_RULES,
  rules: { version: 2, parts: [] },
};
const form = {
  id: VERSION,
  formId: '01900000-0000-7000-8000-0000000000c4',
  versionNo: 1,
  status: 'published',
  publishedAt: '2026-10-01T00:00:00Z',
  ...definition(
    section('note', [
      field('note', 'long_text', { label: { bn: 'মন্তব্য', en: 'Note' } }),
      field('house_photo', 'photo', { label: { bn: 'ঘরের ছবি', en: 'House photo' } }),
    ]),
  ),
};
const envelope = (data: unknown, etag = '"v1"') =>
  HttpResponse.json({ data, meta: { requestId: 'r', etag } });

/** The server's record after a create or a save: the answers echoed, the state asked. */
function record(over: Record<string, unknown> = {}) {
  return {
    id: APP,
    appNo: null,
    projectId: PROJECT,
    beneficiaryId: null,
    beneficiaryName: 'নমুনা উপকারভোগী',
    ownerVolunteerId: '01900000-0000-7000-8000-0000000000d1',
    status: 'draft',
    stage: null,
    outcome: null,
    flags: [],
    districtId: DISTRICT,
    unionId: UNION,
    submittedAt: null,
    waitingDays: 0,
    etag: '"v1"',
    formVersionId: VERSION,
    createdByUserId: ME.id,
    identityKind: null,
    rejectionMessage: null,
    answers: [],
    reviewedAt: null,
    approvedAt: null,
    familyDuplicateWarnings: [],
    availableActions: ['submit', 'delete'],
    form,
    ...over,
  };
}

let created: unknown[];
let patched: unknown[];
let acted: string[];
/** What the server knows of the one application of these tests after the batches so far. */
let known: Record<string, unknown>;
/** One batch record as the phone sends it. */
interface BatchRecord {
  clientUuid: string;
  kind: string;
  target?: string | null;
  payload: { answers?: unknown[]; unlockId?: string; value?: unknown };
}
/**
 * The batch endpoint of the tests: a draft is created as the one application, an update patches
 * it, a submit gives it its number, a correction records the new value; the arrays say what came.
 */
function serveBatch(onUnlock?: (value: unknown) => void) {
  server.use(
    http.post('*/api/v1/sync/batch', async ({ request }) => {
      const body = (await request.json()) as { records: BatchRecord[] };
      const results = body.records.map((r) => {
        if (r.kind === 'application_draft') {
          created.push(r.payload);
          known = { ...known, answers: r.payload.answers ?? [] };
        } else if (r.kind === 'application_update') {
          patched.push(r.payload);
          known = { ...known, answers: r.payload.answers ?? [] };
        } else if (r.kind === 'application_submit') {
          acted.push('submit');
          known = {
            ...known,
            status: 'submitted',
            appNo: 'WC-2026-00012',
            submittedAt: '2026-11-02T10:00:00Z',
            availableActions: [],
          };
        } else if (r.kind === 'field_update') onUnlock?.(r.payload.value);
        return {
          clientUuid: r.clientUuid,
          result: 'synced',
          serverId: r.kind === 'field_update' ? r.target : APP,
          status: r.kind === 'field_update' ? 'implementation' : (known.status as string),
        };
      });
      return HttpResponse.json({
        data: { serverTime: new Date().toISOString(), results },
        meta: { requestId: 'r' },
      });
    }),
  );
}
function serve(lookup: Record<string, unknown> = { found: false }) {
  created = [];
  patched = [];
  acted = [];
  known = {};
  serveBatch();
  server.use(
    http.get(`*/api/v1/applications/${APP}`, () => envelope(record(known), '"v2"')),
    http.get('*/api/v1/locations', ({ request }) => {
      const parent = new URL(request.url).searchParams.get('parentId');
      const rows: Record<string, ReturnType<typeof place>[]> = {
        root: [place(DIVISION, 'ঢাকা বিভাগ')],
        [DIVISION]: [place(DISTRICT, 'ঢাকা জেলা')],
        [DISTRICT]: [place(UPAZILA, 'সাভার')],
        [UPAZILA]: [place(UNION, 'আশুলিয়া')],
      };
      return HttpResponse.json({ data: rows[parent ?? 'root'] ?? [], meta: { requestId: 'r' } });
    }),
    http.get(`*/api/v1/me/projects/${PROJECT}`, () => envelope(project)),
    http.get('*/api/v1/me/projects', () => envelope([project])),
    http.get(`*/api/v1/projects/${PROJECT}/application-form`, () => envelope(form)),
    http.post('*/api/v1/beneficiaries/lookup', () => envelope(lookup)),
    http.post('*/api/v1/beneficiaries/match', () => envelope({ total: 0, people: [] })),
  );
}

beforeEach(() => {
  resetClientForTests();
  sessionStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

/** A phone: the form comes one part per screen. */
const onPhone = () => stubMatchMedia(() => true);

/** The identity step: the number typed and looked up, then the form opened. */
async function lookUp(user: ReturnType<typeof userEvent.setup>, number: string) {
  await user.type(await screen.findByRole('textbox', { name: /NID নম্বর/ }), number);
  await user.click(screen.getByRole('button', { name: 'খুঁজুন' }));
}

describe('the new application', () => {
  it('tries the project again when its read failed, and names the failed request', async () => {
    const user = userEvent.setup();
    refreshAs(VOLUNTEER);
    serve();
    let failing = true;
    server.use(
      http.get(`*/api/v1/me/projects/${PROJECT}`, () =>
        failing
          ? HttpResponse.json(
              { error: { code: 'server.error', message: 'ভুল', requestId: 'req_project' } },
              { status: 500 },
            )
          : envelope(project),
      ),
    );
    renderApp(<ApplicationFormPage />, 'bn', {
      path: '/my-projects/:projectId/apply',
      initialPath: `/my-projects/${PROJECT}/apply`,
    });
    // the alert comes after the query's two retries (a second, then two), so a busy machine
    // needs more than five seconds
    const alert = await screen.findByRole('alert', {}, { timeout: 10_000 });
    expect(alert).toHaveTextContent('req_project');
    failing = false;
    await user.click(within(alert).getByRole('button', { name: 'আবার চেষ্টা করুন' }));
    expect(await screen.findByRole('textbox', { name: /NID নম্বর/ })).toBeInTheDocument();
  }, 20_000);

  it('locks a found person’s identity, saves the draft through the outbox when the first part is done and sends it with the number', async () => {
    const user = userEvent.setup();
    onPhone();
    refreshAs(VOLUNTEER);
    serve({ found: true, blocked: false, alreadyAppliedInProject: false, autofill });
    renderApp(<ApplicationFormPage />, 'bn', {
      path: '/my-projects/:projectId/apply',
      initialPath: `/my-projects/${PROJECT}/apply`,
    });
    await lookUp(user, '1234567890123');
    expect(await screen.findByText('প্রোফাইল পাওয়া গেছে: BEN-0000042')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'এই ব্যক্তির জন্য ফর্ম পূরণ করুন' }));
    // the identity came from the profile and cannot be changed; the mobile can
    const name = await screen.findByRole('textbox', { name: /^name/ });
    expect(name).toHaveValue('নমুনা উপকারভোগী');
    expect(name).toHaveAttribute('readonly');
    expect(screen.getByRole('textbox', { name: /^nid_or_birth_reg/ })).toHaveValue('1234567890123');
    expect(screen.getByRole('textbox', { name: /^mobile/ })).not.toHaveAttribute('readonly');
    // the first part done: the draft is created
    await user.click(screen.getByRole('button', { name: 'পরের অংশ' }));
    await waitFor(() => expect(created).toHaveLength(1), { timeout: 15_000 });
    expect(
      await screen.findByText('খসড়া সংরক্ষিত হয়েছে', {}, { timeout: 15_000 }),
    ).toBeInTheDocument();
    // the address came from the profile too: the next part is the note, then the send
    await user.click(screen.getByRole('button', { name: 'পরের অংশ' }));
    await waitFor(() => expect(patched).toHaveLength(1), { timeout: 15_000 });
    await user.type(
      await screen.findByRole('textbox', { name: /মন্তব্য/ }, { timeout: 15_000 }),
      'শীতের কাপড় দরকার',
    );
    // a photo goes up as part of the saved draft, under an id of its own that a retry reuses
    const [input] = await screen.findAllByLabelText('গ্যালারি থেকে নিন', {}, { timeout: 15_000 });
    await user.upload(input!, new File(['jpeg'], 'house.jpg', { type: 'image/jpeg' }));
    await waitFor(() => expect(vi.mocked(uploadFile)).toHaveBeenCalledTimes(1), {
      timeout: 15_000,
    });
    const [, target, options] = vi.mocked(uploadFile).mock.calls[0]!;
    expect(target).toMatchObject({
      kind: 'form_photo',
      entityType: 'application',
      entityId: APP,
      slot: 'house_photo',
    });
    expect(options.clientUuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    // after the last part the answers are read through, each part with a way back, before the send
    await user.click(screen.getByRole('button', { name: 'পরের অংশ' }));
    expect(await screen.findByText('পাঠানোর আগে দেখে নিন')).toBeInTheDocument();
    expect(screen.getByText('শীতের কাপড় দরকার')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'note বদলান' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'অফিসে পাঠান' }));
    expect(
      await screen.findByText('আবেদন পাঠানো হয়েছে', {}, { timeout: 15_000 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('আবেদন নম্বর: WC-2026-00012। অফিস যাচাই করে জানাবে।'),
    ).toBeInTheDocument();
    expect(acted).toEqual(['submit']);
    expect(patched).toHaveLength(2);
    // the next application starts at once, empty, on the same address
    await user.click(screen.getByRole('link', { name: 'আরেকটি আবেদন' }));
    expect(await screen.findByText('উপকারভোগীর পরিচয়')).toBeInTheDocument();
    expect(screen.queryByText('আবেদন পাঠানো হয়েছে')).not.toBeInTheDocument();
  }, 60_000);

  it('keeps a new person’s first part in memory until the address part, then makes the draft', async () => {
    const user = userEvent.setup();
    onPhone();
    refreshAs(VOLUNTEER);
    serve({ found: false });
    renderApp(<ApplicationFormPage />, 'bn', {
      path: '/my-projects/:projectId/apply',
      initialPath: `/my-projects/${PROJECT}/apply`,
    });
    await lookUp(user, '9876543210');
    await user.click(
      await screen.findByRole('button', { name: 'নতুন ব্যক্তির জন্য ফর্ম পূরণ করুন' }),
    );
    await user.type(await screen.findByRole('textbox', { name: /^name/ }), 'নমুনা উপকারভোগী');
    await user.type(screen.getByRole('textbox', { name: /^father_or_husband_name/ }), 'নমুনা পিতা');
    await user.type(screen.getByRole('textbox', { name: /^mobile/ }), '01700001000');
    // on a phone a list opens as a sheet from the bottom, with nothing to type
    // a short choice is a row of buttons on a phone
    await user.click(screen.getByRole('radio', { name: 'female' }));
    // the address is in the next part: the server would refuse a draft now, so nothing is sent
    // (the page answers again once the sheet has closed)
    await user.click(await screen.findByRole('button', { name: 'পরের অংশ' }));
    const division = await screen.findByRole('combobox', { name: /^বিভাগ/ }, { timeout: 15_000 });
    expect(created).toEqual([]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // a select-only combobox: a button, nothing to type in
    expect(division.tagName).toBe('BUTTON');
    expect(screen.queryByRole('textbox', { name: /বিভাগ/ })).not.toBeInTheDocument();
    await user.click(division);
    await user.click(await screen.findByRole('option', { name: 'ঢাকা বিভাগ' }));
    // each next level opens by itself once the one above it is picked
    for (const name of ['ঢাকা জেলা', 'সাভার', 'আশুলিয়া'])
      await user.click(await screen.findByRole('option', { name }, { timeout: 15_000 }));
    await user.type(await screen.findByRole('textbox', { name: /^village/ }), 'নমুনা গ্রাম');
    // with the address the draft is made, holding the first part's answers too
    await user.click(screen.getByRole('button', { name: 'পরের অংশ' }));
    await waitFor(() => expect(created).toHaveLength(1), { timeout: 15_000 });
    const keys = ((created[0] as { answers: { fieldKey: string }[] }).answers ?? []).map(
      (a) => a.fieldKey,
    );
    expect(keys).toEqual(expect.arrayContaining(['name', 'mobile', 'gender', 'address']));
  }, 60_000);

  it('leaves the identity free for a new person and stops at a blocked one', async () => {
    const user = userEvent.setup();
    refreshAs(VOLUNTEER);
    serve({ found: false });
    const view = renderApp(<ApplicationFormPage />, 'bn', {
      path: '/my-projects/:projectId/apply',
      initialPath: `/my-projects/${PROJECT}/apply`,
    });
    await lookUp(user, '9876543210');
    expect(await screen.findByText('এই নম্বরে কোনো প্রোফাইল নেই')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'নতুন ব্যক্তির জন্য ফর্ম পূরণ করুন' }));
    const name = await screen.findByRole('textbox', { name: /^name/ });
    expect(name).not.toHaveAttribute('readonly');
    expect(screen.getByRole('textbox', { name: /^nid_or_birth_reg/ })).toHaveValue('9876543210');
    await expectNoAxeViolations(view.container);
    view.unmount();
    serve({ found: true, blocked: true });
    renderApp(<ApplicationFormPage />, 'bn', {
      path: '/my-projects/:projectId/apply',
      initialPath: `/my-projects/${PROJECT}/apply`,
    });
    await lookUp(user, '1234567890123');
    expect(
      await screen.findByText('এই ব্যক্তি ব্লক করা আছেন, তাই নতুন আবেদন নেওয়া যাবে না।'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ফর্ম পূরণ করুন/ })).not.toBeInTheDocument();
  });

  it('lets a team member keep a draft but never send it, in English too', async () => {
    const user = userEvent.setup();
    refreshAs(MEMBER);
    serve({ found: false });
    const view = renderApp(<ApplicationFormPage />, 'en', {
      path: '/my-projects/:projectId/apply',
      initialPath: `/my-projects/${PROJECT}/apply`,
    });
    expect(
      await screen.findByText(
        'As a team member you can keep a draft; the main volunteer sends it to the office.',
      ),
    ).toBeInTheDocument();
    await user.type(await screen.findByRole('textbox', { name: /NID number/ }), '9876543210');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await user.click(
      await screen.findByRole('button', { name: 'Fill in the form for a new person' }),
    );
    await screen.findByRole('textbox', { name: /^name/ });
    expect(screen.queryByRole('button', { name: 'Send to the office' })).not.toBeInTheDocument();
    await expectNoAxeViolations(view.container);
  });
});

describe('my applications', () => {
  it('lists the applications by state in tabs, each opening its record', async () => {
    const user = userEvent.setup();
    refreshAs(VOLUNTEER);
    serve();
    const rows = (status: string, appNo: string | null) => [
      { ...record({ status, appNo }), id: `${APP.slice(0, -1)}${status.length}` },
    ];
    server.use(
      http.get('*/api/v1/me/applications', ({ request }) => {
        const status = new URL(request.url).searchParams.get('status') ?? '';
        const data = status.startsWith('submitted')
          ? rows('under_review', 'WC-2026-00012')
          : status === 'draft'
            ? rows('draft', null)
            : [];
        return HttpResponse.json({ data, meta: { requestId: 'r', total: data.length } });
      }),
    );
    const view = renderApp(<MyApplicationsPage />, 'bn', {
      path: '/my-applications',
      initialPath: '/my-applications?tab=pending',
    });
    const pending = await screen.findByRole('tab', { name: /প্রক্রিয়াধীন/ });
    expect(pending).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('WC-2026-00012')).toBeInTheDocument();
    expect(screen.getByText('পর্যালোচনা চলছে')).toBeInTheDocument();
    expect(screen.getByText('শীতবস্ত্র বিতরণ')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /খসড়া/ }));
    expect(await screen.findByText('নম্বর এখনো হয়নি')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /অনুমোদিত/ }));
    expect(await screen.findByText('এই তালিকায় এখনো কোনো আবেদন নেই।')).toBeInTheDocument();
    await expectNoAxeViolations(view.container);
  });

  it('tells a volunteer on no project calmly where applications come from, not of a failure', async () => {
    refreshAs(VOLUNTEER);
    serve();
    server.use(
      http.get('*/api/v1/me/applications', () =>
        apiError(403, 'permission.denied', 'এই কাজের অনুমতি নেই।'),
      ),
    );
    const view = renderApp(<MyApplicationsPage />, 'bn', {
      path: '/my-applications',
      initialPath: '/my-applications?tab=pending',
    });
    expect(
      await screen.findByText(
        'আপনি এখনো কোনো প্রকল্পে যুক্ত নন। প্রকল্পে যুক্ত হলে আপনার আবেদন এখানে দেখা যাবে।',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'আমার প্রকল্প' })).toHaveAttribute(
      'href',
      '/my-projects',
    );
    expect(screen.queryByText('আবেদনের তালিকা আনা যায়নি। আবার চেষ্টা করুন।')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    await expectNoAxeViolations(view.container);
  });
});

describe('one application', () => {
  it('shows the answers without the office’s questions, the steps without names, and the office’s message', async () => {
    refreshAs(VOLUNTEER);
    serve();
    server.use(
      http.get(`*/api/v1/applications/${APP}`, () =>
        envelope(
          record({
            status: 'rejected',
            appNo: 'WC-2026-00012',
            submittedAt: '2026-11-02T10:00:00Z',
            rejectionMessage: 'এবার সম্ভব হলো না',
            availableActions: [],
            answers: [
              {
                fieldKey: 'name',
                repeatIndex: 0,
                value: { t: 'short_text', v: 'নমুনা উপকারভোগী' },
              },
              { fieldKey: 'gender', repeatIndex: 0, value: { t: 'single_select', v: 'female' } },
              {
                fieldKey: 'note',
                repeatIndex: 0,
                value: { t: 'long_text', v: 'শীতের কাপড় দরকার' },
              },
            ],
          }),
        ),
      ),
      http.get(`*/api/v1/applications/${APP}/timeline`, () =>
        envelope([
          {
            id: 't1',
            at: '2026-11-02T10:00:00Z',
            action: 'application.submit',
            from: 'draft',
            to: 'submitted',
            automatic: false,
            message: null,
          },
          {
            id: 't2',
            at: '2026-11-03T10:00:00Z',
            action: 'application.reject',
            from: 'reviewed',
            to: 'rejected',
            automatic: false,
            message: 'এবার সম্ভব হলো না',
          },
        ]),
      ),
    );
    const view = renderApp(<ApplicationDetailPage />, 'bn', {
      path: '/my-applications/:applicationId',
      initialPath: `/my-applications/${APP}`,
    });
    expect(await screen.findByText('WC-2026-00012')).toBeInTheDocument();
    expect(screen.getAllByText('গৃহীত হয়নি').length).toBeGreaterThan(0);
    expect(screen.getByText('এবার সম্ভব হলো না', { selector: 'p' })).toBeInTheDocument();
    const answers = screen.getByRole('region', { name: 'basic_info' });
    expect(within(answers).getByText('নমুনা উপকারভোগী')).toBeInTheDocument();
    expect(within(answers).getByText('female')).toBeInTheDocument();
    const steps = await screen.findByRole('list', { name: 'আবেদনের ধাপ' });
    expect(within(steps).getByText('অফিসে পাঠানো হয়েছে')).toBeInTheDocument();
    expect(within(steps).queryByText(/নমুনা অফিসিয়াল/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'অফিসে পাঠান' })).not.toBeInTheDocument();
    await expectNoAxeViolations(view.container);
  });

  it('gives the new answer of an answer the office opened, then waits for the verification', async () => {
    const user = userEvent.setup();
    refreshAs(VOLUNTEER);
    serve();
    const unlock = {
      id: '01900000-0000-7000-8000-0000000000f1',
      applicationId: APP,
      fieldKey: 'note',
      repeatIndex: 0,
      state: 'open',
      oldValue: { t: 'long_text', v: 'পুরনো মন্তব্য' },
      newValue: null,
      reason: null,
      openedBy: null,
      openedAt: '2026-11-04T10:00:00Z',
      enteredBy: null,
      enteredAt: null,
      decidedBy: null,
      decidedAt: null,
      decision: null,
      decisionReason: null,
      mayFill: true,
      mayDecide: false,
      mayCancel: false,
    };
    let sent: unknown = null;
    serveBatch((value) => {
      sent = value;
    });
    server.use(
      http.get(`*/api/v1/applications/${APP}`, () =>
        envelope(
          record({
            status: 'implementation',
            appNo: 'WC-2026-00012',
            availableActions: [],
            answers: [
              { fieldKey: 'note', repeatIndex: 0, value: { t: 'long_text', v: 'পুরনো মন্তব্য' } },
            ],
            unlocks: [
              sent
                ? {
                    ...unlock,
                    state: 'updated',
                    newValue: sent,
                    mayFill: false,
                  }
                : unlock,
            ],
          }),
        ),
      ),
      http.get(`*/api/v1/applications/${APP}/timeline`, () => envelope([])),
    );
    const view = renderApp(<ApplicationDetailPage />, 'bn', {
      path: '/my-applications/:applicationId',
      initialPath: `/my-applications/${APP}`,
    });
    expect(await screen.findByText('নতুন উত্তর দিন')).toBeInTheDocument();
    await expectNoAxeViolations(view.container);
    const send = screen.getByRole('button', { name: 'পাঠান' });
    expect(send).toBeDisabled();
    const box = screen.getByRole('textbox', { name: /মন্তব্য/ });
    await user.clear(box);
    await user.type(box, 'নতুন মন্তব্য');
    await user.click(send);
    expect(
      await screen.findByText('নতুন উত্তর পাঠানো হয়েছে, এখন যাচাইয়ের অপেক্ষায়।'),
    ).toBeInTheDocument();
    expect(sent).toEqual({ t: 'long_text', v: 'নতুন মন্তব্য' });
    expect(await screen.findByText('যাচাইয়ের অপেক্ষায়')).toBeInTheDocument();
  });

  it('sends a draft from its page through the outbox and shows the number the server gave', async () => {
    const user = userEvent.setup();
    refreshAs(VOLUNTEER);
    serve();
    server.use(http.get(`*/api/v1/applications/${APP}/timeline`, () => envelope([])));
    renderApp(<ApplicationDetailPage />, 'bn', {
      path: '/my-applications/:applicationId',
      initialPath: `/my-applications/${APP}`,
    });
    await user.click(await screen.findByRole('button', { name: 'অফিসে পাঠান' }));
    expect(await screen.findByText('আবেদনটি অফিসে পাঠানো হয়েছে।')).toBeInTheDocument();
    expect(acted).toEqual(['submit']);
    expect(await screen.findByText('WC-2026-00012')).toBeInTheDocument();
  });

  it('tells of a stale version when a server-side delete meets a newer record', async () => {
    const user = userEvent.setup();
    refreshAs(VOLUNTEER);
    serve();
    server.use(
      http.get(`*/api/v1/applications/${APP}/timeline`, () => envelope([])),
      http.post(`*/api/v1/applications/${APP}/actions/delete`, () =>
        apiError(412, 'conflict.stale_version', 'অন্য কেউ এর মধ্যে তথ্য বদলেছেন।'),
      ),
    );
    renderApp(<ApplicationDetailPage />, 'bn', {
      path: '/my-applications/:applicationId',
      initialPath: `/my-applications/${APP}`,
    });
    await user.click(await screen.findByRole('button', { name: 'মুছে ফেলুন' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'মুছে ফেলুন' }));
    expect(await screen.findByText('আবেদনটি এর মধ্যে বদলেছে। আবার লোড করুন।')).toBeInTheDocument();
  });
});

describe('the identity questions of the new application follow the project', () => {
  const DOCUMENT_HINT = 'থাকলে দিন।';
  const MOBILE_HINT = 'নম্বর না থাকলে ফাঁকা রাখুন, যোগাযোগ হবে স্বেচ্ছাসেবকের মাধ্যমে।';
  const { identityRules: _rules, ...withoutRules } = project;
  const number = () => screen.getByRole('textbox', { name: /^nid_or_birth_reg/ });
  const mobile = () => screen.getByRole('textbox', { name: /^mobile/ });

  /**
   * The first part of a new person's form on a phone, with everything answered but the mobile, in
   * a project whose read carries the given rules; `undefined` is a read without any.
   */
  async function firstPart(user: ReturnType<typeof userEvent.setup>, rules: unknown) {
    onPhone();
    refreshAs(VOLUNTEER);
    serve({ found: false });
    server.use(
      http.get(`*/api/v1/me/projects/${PROJECT}`, () =>
        envelope(rules === undefined ? withoutRules : { ...withoutRules, identityRules: rules }),
      ),
    );
    renderApp(<ApplicationFormPage />, 'bn', {
      path: '/my-projects/:projectId/apply',
      initialPath: `/my-projects/${PROJECT}/apply`,
    });
    await lookUp(user, '9876543210');
    await user.click(
      await screen.findByRole('button', { name: 'নতুন ব্যক্তির জন্য ফর্ম পূরণ করুন' }),
    );
    await user.type(await screen.findByRole('textbox', { name: /^name/ }), 'নমুনা উপকারভোগী');
    await user.type(screen.getByRole('textbox', { name: /^father_or_husband_name/ }), 'নমুনা পিতা');
    await user.click(screen.getByRole('radio', { name: 'female' }));
  }

  it('asks neither where the project lets both stay empty, and goes on without the mobile', async () => {
    const user = userEvent.setup();
    await firstPart(user, { ...DEFAULT_IDENTITY_RULES, document: 'optional', mobile: 'optional' });
    expect(number()).not.toBeRequired();
    expect(number()).toHaveAccessibleDescription(DOCUMENT_HINT);
    expect(mobile()).not.toBeRequired();
    expect(mobile()).toHaveAccessibleDescription(MOBILE_HINT);
    expect(screen.getByRole('textbox', { name: /^name/ })).toBeRequired();
    await user.click(await screen.findByRole('button', { name: 'পরের অংশ' }));
    expect(
      await screen.findByRole('combobox', { name: /^বিভাগ/ }, { timeout: 15_000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/সমস্যা ঠিক করুন/)).not.toBeInTheDocument();
  }, 60_000);

  it('asks the mobile where the project lets only the document stay empty', async () => {
    const user = userEvent.setup();
    await firstPart(user, { ...DEFAULT_IDENTITY_RULES, document: 'optional' });
    expect(number()).not.toBeRequired();
    expect(mobile()).toBeRequired();
    expect(screen.queryByText(MOBILE_HINT)).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'পরের অংশ' }));
    expect(
      await screen.findByText('পরের অংশে যাওয়ার আগে 1টি সমস্যা ঠিক করুন'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /^বিভাগ/ })).not.toBeInTheDocument();
  }, 60_000);

  it.each([
    ['requires both', DEFAULT_IDENTITY_RULES],
    ['carries no rules', undefined],
    ['carries rules that are not whole', { document: 'optional', mobile: 'optional' }],
  ])(
    'asks both as today where the project read %s',
    async (_case, rules) => {
      const user = userEvent.setup();
      await firstPart(user, rules);
      expect(number()).toBeRequired();
      expect(mobile()).toBeRequired();
      expect(screen.queryByText(DOCUMENT_HINT)).not.toBeInTheDocument();
      expect(screen.queryByText(MOBILE_HINT)).not.toBeInTheDocument();
      await user.click(await screen.findByRole('button', { name: 'পরের অংশ' }));
      expect(
        await screen.findByText('পরের অংশে যাওয়ার আগে 1টি সমস্যা ঠিক করুন'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('combobox', { name: /^বিভাগ/ })).not.toBeInTheDocument();
      expect(created).toEqual([]);
    },
    60_000,
  );
});

describe('the start without an identity document', () => {
  const HELP = bn.applications.new.no_document_help;
  const START = bn.applications.new.start_without_document;
  const OPTIONAL = { ...DEFAULT_IDENTITY_RULES, document: 'optional', mobile: 'optional' };
  const { identityRules: _rules, ...withoutRules } = project;
  const number = () => screen.getByRole('textbox', { name: /^nid_or_birth_reg/ });
  const keysOf = (payload: unknown) =>
    ((payload as { answers?: { fieldKey: string }[] }).answers ?? []).map((a) => a.fieldKey);

  /** The new application's first screen on a phone, in a project whose read carries the given rules. */
  function open(rules: unknown, locale: 'bn' | 'en' = 'bn') {
    onPhone();
    refreshAs(VOLUNTEER);
    serve({ found: false });
    server.use(
      http.get(`*/api/v1/me/projects/${PROJECT}`, () =>
        envelope(rules === undefined ? withoutRules : { ...withoutRules, identityRules: rules }),
      ),
    );
    return renderApp(<ApplicationFormPage />, locale, {
      path: '/my-projects/:projectId/apply',
      initialPath: `/my-projects/${PROJECT}/apply`,
    });
  }

  const M = bn.applications.new.match;
  /** The name lookup: the name, the father's or husband's name, the union and the village, then the search. */
  async function lookUpTheName(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: START }));
    const step = await screen.findByRole('region', { name: M.section });
    await user.type(within(step).getByRole('textbox', { name: M.name }), 'নমুনা উপকারভোগী');
    await user.type(within(step).getByRole('textbox', { name: M.father }), 'নমুনা পিতা');
    await user.click(within(step).getByRole('combobox', { name: /^বিভাগ/ }));
    for (const name of ['ঢাকা বিভাগ', 'ঢাকা জেলা', 'সাভার', 'আশুলিয়া'])
      await user.click(await screen.findByRole('option', { name }, { timeout: 15_000 }));
    await user.type(await within(step).findByRole('textbox', { name: M.village }), 'নমুনা গ্রাম');
    await user.click(within(step).getByRole('button', { name: M.search }));
    return step;
  }
  /** The form started without a number, with the first part answered but the two numbers. */
  async function startWithTheName(user: ReturnType<typeof userEvent.setup>) {
    // nobody is here under the name: the form starts as for a new person
    await lookUpTheName(user);
    await user.click(await screen.findByRole('button', { name: M.start_new }));
    await user.type(await screen.findByRole('textbox', { name: /^name/ }), 'নমুনা উপকারভোগী');
    await user.type(screen.getByRole('textbox', { name: /^father_or_husband_name/ }), 'নমুনা পিতা');
    await user.click(screen.getByRole('radio', { name: 'female' }));
  }
  /** The next part answered: the four levels of the address and the village. */
  async function giveTheAddress(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: 'পরের অংশ' }));
    await user.click(await screen.findByRole('combobox', { name: /^বিভাগ/ }, { timeout: 15_000 }));
    for (const name of ['ঢাকা বিভাগ', 'ঢাকা জেলা', 'সাভার', 'আশুলিয়া'])
      await user.click(await screen.findByRole('option', { name }, { timeout: 15_000 }));
    await user.type(await screen.findByRole('textbox', { name: /^village/ }), 'নমুনা গ্রাম');
  }

  it.each([
    ['requires the document', DEFAULT_IDENTITY_RULES],
    ['lets only the mobile stay empty', { ...DEFAULT_IDENTITY_RULES, mobile: 'optional' }],
    ['carries no rules', undefined],
    ['carries rules that are not whole', { document: 'optional', mobile: 'optional' }],
  ])('is not offered where the project read %s', async (_case, rules) => {
    open(rules);
    expect(await screen.findByRole('textbox', { name: /NID নম্বর/ })).toBeInTheDocument();
    expect(screen.queryByText(HELP)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: START })).not.toBeInTheDocument();
  });

  it('is offered under the lookup where the project takes an application without a document, in both languages', async () => {
    const view = open(OPTIONAL);
    expect(await screen.findByRole('button', { name: START })).toBeInTheDocument();
    expect(screen.getByText(HELP)).toBeInTheDocument();
    // the lookup by number stays the first way in
    expect(screen.getByRole('textbox', { name: /NID নম্বর/ })).toBeInTheDocument();
    await expectNoAxeViolations(view.container);
    view.unmount();
    resetClientForTests();
    const english = open(OPTIONAL, 'en');
    expect(
      await screen.findByRole('button', { name: 'No identity document: start with the name' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'This project takes an application without an identity document. If there is a number, enter it above and search.',
      ),
    ).toBeInTheDocument();
    await expectNoAxeViolations(english.container);
  });

  it('opens the form with the document question empty and free, and saves and sends without a number', async () => {
    const user = userEvent.setup();
    open(OPTIONAL);
    await startWithTheName(user);
    expect(number()).toHaveValue('');
    expect(number()).not.toBeRequired();
    expect(number()).not.toHaveAttribute('readonly');
    expect(number()).toHaveAccessibleDescription('থাকলে দিন।');
    // the names are typed, never locked: nobody was looked up
    expect(screen.getByRole('textbox', { name: /^name/ })).not.toHaveAttribute('readonly');
    await giveTheAddress(user);
    // the draft is made at the address part, as for a new person, with no number and no mobile
    await user.click(screen.getByRole('button', { name: 'পরের অংশ' }));
    await waitFor(() => expect(created).toHaveLength(1), { timeout: 15_000 });
    expect(keysOf(created[0])).toEqual(
      expect.arrayContaining(['name', 'father_or_husband_name', 'gender', 'address', 'village']),
    );
    expect(keysOf(created[0])).not.toContain('nid_or_birth_reg');
    expect(keysOf(created[0])).not.toContain('mobile');
    await user.type(
      await screen.findByRole('textbox', { name: /মন্তব্য/ }, { timeout: 15_000 }),
      'শীতের কাপড় দরকার',
    );
    await user.click(screen.getByRole('button', { name: 'পরের অংশ' }));
    expect(await screen.findByText('পাঠানোর আগে দেখে নিন')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'অফিসে পাঠান' }));
    expect(
      await screen.findByText('আবেদন পাঠানো হয়েছে', {}, { timeout: 15_000 }),
    ).toBeInTheDocument();
    expect(acted).toEqual(['submit']);
    expect(patched.length).toBeGreaterThan(0);
    for (const payload of patched) {
      expect(keysOf(payload)).not.toContain('nid_or_birth_reg');
      expect(keysOf(payload)).not.toContain('mobile');
    }
  }, 60_000);

  it('shows the server’s refusal of a typed number under the identity question until it is changed', async () => {
    const REFUSAL = bn.errors.beneficiary.already_applied;
    const user = userEvent.setup();
    open(OPTIONAL);
    // the server refuses the draft: the number belongs to a person who already applied here
    server.use(
      http.post('*/api/v1/sync/batch', async ({ request }) => {
        const body = (await request.json()) as { records: BatchRecord[] };
        return HttpResponse.json({
          data: {
            serverTime: new Date().toISOString(),
            results: body.records.map((r) => ({
              clientUuid: r.clientUuid,
              result: 'failed',
              code: 'beneficiary.already_applied',
            })),
          },
          meta: { requestId: 'r' },
        });
      }),
    );
    await startWithTheName(user);
    await user.type(number(), '1234567890123');
    await giveTheAddress(user);
    await user.click(screen.getByRole('button', { name: 'পরের অংশ' }));
    // said at once where the person stands
    expect(await screen.findByRole('alert', {}, { timeout: 15_000 })).toHaveTextContent(REFUSAL);
    // and under the question it is about, on that question's own part
    await user.click(screen.getByRole('button', { name: 'আগের অংশ' }));
    await waitFor(() => expect(number()).toHaveAccessibleDescription(REFUSAL));
    await user.type(number(), '4');
    expect(screen.queryByText(REFUSAL)).not.toBeInTheDocument();
  }, 60_000);
});

describe('the people already here under the name', () => {
  const M = bn.applications.new.match;
  const START = bn.applications.new.start_without_document;
  const OPTIONAL = { ...DEFAULT_IDENTITY_RULES, document: 'optional', mobile: 'optional' };
  const helped = {
    name: 'মোঃ করিম উদ্দিন',
    fatherOrHusbandName: 'আব্দুল জব্বার',
    village: 'চরপাড়া',
    helpedYears: [2024, 2025],
    projects: [{ name: { bn: 'শীতবস্ত্র 2024', en: 'Winter 2024' }, year: 2024 }],
    pickable: true,
    pickToken: 'sealed-token-1',
  };
  const unpickable = {
    ...helped,
    name: 'রহিম মিয়া',
    helpedYears: [],
    projects: [],
    pickable: false,
    pickToken: null,
  };
  let asked: Record<string, unknown>[];
  function open(people: unknown[], total = people.length, locale: 'bn' | 'en' = 'bn') {
    onPhone();
    refreshAs(VOLUNTEER);
    serve({ found: false });
    asked = [];
    server.use(
      http.get(`*/api/v1/me/projects/${PROJECT}`, () =>
        envelope({ ...project, identityRules: OPTIONAL }),
      ),
      http.post('*/api/v1/beneficiaries/match', async ({ request }) => {
        asked.push((await request.json()) as Record<string, unknown>);
        return envelope({ total, people });
      }),
    );
    return renderApp(<ApplicationFormPage />, locale, {
      path: '/my-projects/:projectId/apply',
      initialPath: `/my-projects/${PROJECT}/apply`,
    });
  }
  async function lookUpTheName(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: START }));
    const step = await screen.findByRole('region', { name: M.section });
    await user.type(within(step).getByRole('textbox', { name: M.name }), 'করিম উদ্দিন');
    await user.type(within(step).getByRole('textbox', { name: M.father }), 'আব্দুল জব্বার');
    await user.click(within(step).getByRole('combobox', { name: /^বিভাগ/ }));
    for (const name of ['ঢাকা বিভাগ', 'ঢাকা জেলা', 'সাভার', 'আশুলিয়া'])
      await user.click(await screen.findByRole('option', { name }, { timeout: 15_000 }));
    await user.type(await within(step).findByRole('textbox', { name: M.village }), 'চরপাড়া');
    await user.click(within(step).getByRole('button', { name: M.search }));
    return step;
  }
  const payloadOf = (i: number) =>
    created[i] as { answers: { fieldKey: string; value: unknown }[]; pickToken?: string };

  it('asks the name, the father’s or husband’s name, the union and the village first, and lists the people already here', async () => {
    const user = userEvent.setup();
    // the count stops one past the five a full answer shows: six says there are more
    const view = open([helped, unpickable], 6);
    const step = await lookUpTheName(user);
    expect(await within(step).findByRole('heading', { name: M.found_title })).toBeInTheDocument();
    expect(asked).toEqual([
      {
        projectId: PROJECT,
        name: 'করিম উদ্দিন',
        fatherOrHusbandName: 'আব্দুল জব্বার',
        unionId: UNION,
        village: 'চরপাড়া',
      },
    ]);
    expect(within(step).getByText('মোঃ করিম উদ্দিন')).toBeInTheDocument();
    expect(within(step).getAllByText('পিতা/স্বামী: আব্দুল জব্বার')).toHaveLength(2);
    expect(within(step).getByText('সাহায্য পেয়েছেন: 2024, 2025')).toBeInTheDocument();
    expect(within(step).getByText('প্রকল্প: শীতবস্ত্র 2024')).toBeInTheDocument();
    // a person who cannot be picked here gets one neutral line, never the reason
    const picks = within(step).getAllByRole('button', { name: M.pick });
    expect(picks[0]).toBeEnabled();
    expect(picks[1]).toBeDisabled();
    expect(within(step).getByText(M.not_pickable)).toBeInTheDocument();
    expect(within(step).queryByText(bn.applications.new.blocked)).not.toBeInTheDocument();
    // more than shown, and no number of how many
    expect(within(step).getByText(M.more)).toBeInTheDocument();
    expect(within(step).getByRole('button', { name: M.none_of_them })).toBeInTheDocument();
    await expectNoAxeViolations(view.container);
  }, 60_000);

  it('starts the form for the picked person with the names locked, and the draft carries the token', async () => {
    const user = userEvent.setup();
    open([helped]);
    const step = await lookUpTheName(user);
    await user.click(await within(step).findByRole('button', { name: M.pick }));
    const name = await screen.findByRole('textbox', { name: /^name/ });
    // the profile's names as written, locked as a known person's are
    expect(name).toHaveValue('মোঃ করিম উদ্দিন');
    expect(name).toHaveAttribute('readonly');
    expect(screen.getByRole('textbox', { name: /^father_or_husband_name/ })).toHaveAttribute(
      'readonly',
    );
    // the document question stays free: a number given stays in the application
    expect(screen.getByRole('textbox', { name: /^nid_or_birth_reg/ })).not.toHaveAttribute(
      'readonly',
    );
    await user.click(screen.getByRole('radio', { name: 'female' }));
    await user.click(screen.getByRole('button', { name: 'পরের অংশ' }));
    await waitFor(() => expect(created).toHaveLength(1), { timeout: 15_000 });
    expect(payloadOf(0).pickToken).toBe('sealed-token-1');
    expect(payloadOf(0).answers).toEqual(
      expect.arrayContaining([
        { fieldKey: 'name', value: { t: 'short_text', v: 'মোঃ করিম উদ্দিন' } },
        { fieldKey: 'village', value: { t: 'short_text', v: 'চরপাড়া' } },
      ]),
    );
  }, 60_000);

  it('starts an empty form for a new person when none of them is the person', async () => {
    const user = userEvent.setup();
    open([helped]);
    const step = await lookUpTheName(user);
    await user.click(await within(step).findByRole('button', { name: M.none_of_them }));
    const name = await screen.findByRole('textbox', { name: /^name/ });
    expect(name).toHaveValue('');
    expect(name).not.toHaveAttribute('readonly');
    expect(screen.queryByRole('region', { name: M.section })).not.toBeInTheDocument();
  }, 60_000);

  it('says when nobody is here under the name, with the same start, in English too', async () => {
    const user = userEvent.setup();
    const view = open([]);
    const step = await lookUpTheName(user);
    expect(await within(step).findByText(M.nobody)).toBeInTheDocument();
    expect(within(step).getByRole('button', { name: M.start_new })).toBeInTheDocument();
    view.unmount();
    resetClientForTests();
    open([], 0, 'en');
    await user.click(
      await screen.findByRole('button', { name: 'No identity document: start with the name' }),
    );
    expect(await screen.findByRole('region', { name: 'Search by name' })).toBeInTheDocument();
  }, 60_000);

  it('leaves the lookup out without network, says so, and starts the form at once', async () => {
    const user = userEvent.setup();
    let onLine = true;
    Object.defineProperty(navigator, 'onLine', { get: () => onLine, configurable: true });
    try {
      open([helped]);
      const start = await screen.findByRole('button', { name: START });
      onLine = false;
      await user.click(start);
      expect(await screen.findByText(M.offline)).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: M.section })).not.toBeInTheDocument();
      expect(asked).toEqual([]);
      expect(await screen.findByRole('textbox', { name: /^name/ })).toHaveValue('');
    } finally {
      Object.defineProperty(navigator, 'onLine', { get: () => true, configurable: true });
    }
  }, 60_000);
});

describe('the volunteer’s own application of a person without a document or a mobile', () => {
  const NO_DOCUMENT = bn.common.person.no_document;
  const THROUGH_VOLUNTEER = bn.common.person.through_volunteer;
  const submitted = (over: Record<string, unknown>) =>
    record({
      appNo: 'WC-2026-00021',
      status: 'submitted',
      beneficiaryId: PERSON,
      submittedAt: '2026-11-02T10:00:00Z',
      availableActions: [],
      answers: [
        { fieldKey: 'name', repeatIndex: 0, value: { t: 'short_text', v: 'নমুনা উপকারভোগী' } },
      ],
      ...over,
    });
  const open = (over: Record<string, unknown>) => {
    refreshAs(VOLUNTEER);
    serve();
    server.use(
      http.get(`*/api/v1/applications/${APP}`, () => envelope(submitted(over))),
      http.get(`*/api/v1/applications/${APP}/timeline`, () => envelope([])),
    );
    return renderApp(<ApplicationDetailPage />, 'bn', {
      path: '/my-applications/:applicationId',
      initialPath: `/my-applications/${APP}`,
    });
  };

  it('shows the chip beside the state and the volunteer in the place of the mobile', async () => {
    open({ identityKind: 'none', hasDocument: false, hasMobile: false });
    expect(await screen.findByText('WC-2026-00021')).toBeInTheDocument();
    expect(screen.getByText(NO_DOCUMENT)).toBeInTheDocument();
    const answers = screen.getByRole('region', { name: 'basic_info' });
    expect(within(answers).getByText(THROUGH_VOLUNTEER)).toBeInTheDocument();
  });

  it('shows neither for a person who has both, nor before the person is known', async () => {
    const first = open({ identityKind: 'nid', hasDocument: true, hasMobile: true });
    expect(await screen.findByText('WC-2026-00021')).toBeInTheDocument();
    expect(screen.queryByText(NO_DOCUMENT)).not.toBeInTheDocument();
    expect(screen.queryByText(THROUGH_VOLUNTEER)).not.toBeInTheDocument();
    first.unmount();
    resetClientForTests();
    open({ status: 'needs_verification', beneficiaryId: null, hasDocument: null, hasMobile: null });
    expect(await screen.findByText('WC-2026-00021')).toBeInTheDocument();
    expect(screen.queryByText(NO_DOCUMENT)).not.toBeInTheDocument();
    expect(screen.queryByText(THROUGH_VOLUNTEER)).not.toBeInTheDocument();
  });
});
