import { DEFAULT_IDENTITY_RULES } from '@css/shared/projects';
import type { Me } from '@css/shared/auth';
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
    const alert = await screen.findByRole('alert', {}, { timeout: 5000 });
    expect(alert).toHaveTextContent('req_project');
    failing = false;
    await user.click(within(alert).getByRole('button', { name: 'আবার চেষ্টা করুন' }));
    expect(await screen.findByRole('textbox', { name: /NID নম্বর/ })).toBeInTheDocument();
  });

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
    const pending = await screen.findByRole('tab', { name: /পেন্ডিং/ });
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
