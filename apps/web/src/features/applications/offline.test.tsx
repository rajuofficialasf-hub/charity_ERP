import type { Me } from '@css/shared/auth';
import type { Answer } from '@css/shared/forms';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ME, refreshAs, renderApp, TEST_SESSION_ID } from '../../../test/auth';
import { definition, field, section } from '../../../test/forms';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../lib/api';
import { afterSignIn } from '../../offline/keys';
import { offlineDb } from '../../offline/db';
import { readSecret } from '../../offline/outbox';
import { applySnapshot, replaceLocations, storeDetail } from '../../offline/snapshot';
import type { SnapshotView } from '../../offline/sync-api';
import { ApplicationDetailPage } from './ApplicationDetailPage';
import { ApplicationFormPage } from './ApplicationFormPage';
import { MyApplicationsPage } from './MyApplicationsPage';

// The volunteer's application work without network: the same screens take the draft, keep it
// on the phone and send it when the network returns; a draft the phone holds opens and saves
// offline; a correction joins the outbox. Test data only.
const VOLUNTEER: Me = { ...ME, kind: 'volunteer', roles: ['volunteer_general'] };
const PROJECT = '01900000-0000-7000-8000-0000000000c1';
const VERSION = '01900000-0000-7000-8000-0000000000c2';
const APP = '01900000-0000-7000-8000-0000000000c3';
const LOCAL = '01900000-0000-7000-8000-0000000000e1';
const UNLOCK = '01900000-0000-7000-8000-0000000000f1';
const DIVISION = '01900000-0000-7000-8000-0000000000a1';
const DISTRICT = '01900000-0000-7000-8000-0000000000a2';
const UPAZILA = '01900000-0000-7000-8000-0000000000a3';
const UNION = '01900000-0000-7000-8000-0000000000a4';

const project = {
  projectId: PROJECT,
  code: 'WC',
  year: 2026,
  name: { bn: 'শীতবস্ত্র বিতরণ', en: 'Winter clothing' },
  status: 'active' as const,
  applyFrom: '2026-11-01',
  applyTo: '2026-12-31',
  perVolunteerLimit: 50,
  dawahEnabled: false,
  via: 'assignment' as const,
  permissionSet: null,
  isPaid: false,
  consentStatus: 'accepted' as const,
  rulesVersion: 2,
  applicationsCounted: 7,
  applicationsLeft: 43,
  leadsTeam: true,
};
const form = {
  id: VERSION,
  formId: '01900000-0000-7000-8000-0000000000c4',
  projectId: PROJECT,
  versionNo: 1,
  status: 'published',
  publishedAt: '2026-10-01T00:00:00Z',
  ...definition(
    section('note', [field('note', 'long_text', { label: { bn: 'মন্তব্য', en: 'Note' } })]),
  ),
};
/** A complete set of answers, as a draft the volunteer finished holds. */
const answers = (name: string, note: string): Answer[] => [
  { fieldKey: 'nid_or_birth_reg', repeatIndex: 0, value: { t: 'short_text', v: '9876543210' } },
  { fieldKey: 'mobile', repeatIndex: 0, value: { t: 'phone', v: '01711111111' } },
  { fieldKey: 'name', repeatIndex: 0, value: { t: 'short_text', v: name } },
  { fieldKey: 'father_or_husband_name', repeatIndex: 0, value: { t: 'short_text', v: 'পিতা' } },
  { fieldKey: 'gender', repeatIndex: 0, value: { t: 'single_select', v: 'female' } },
  {
    fieldKey: 'address',
    repeatIndex: 0,
    value: {
      t: 'bd_address',
      division_id: DIVISION,
      district_id: DISTRICT,
      upazila_id: UPAZILA,
      union_id: UNION,
    },
  },
  { fieldKey: 'village', repeatIndex: 0, value: { t: 'short_text', v: 'নমুনা গ্রাম' } },
  { fieldKey: 'note', repeatIndex: 0, value: { t: 'long_text', v: note } },
];
const summary = {
  id: APP,
  appNo: null,
  projectId: PROJECT,
  beneficiaryId: null,
  beneficiaryName: 'নমুনা উপকারভোগী',
  ownerVolunteerId: null,
  status: 'draft',
  stage: null,
  outcome: null,
  flags: [],
  districtId: DISTRICT,
  unionId: UNION,
  submittedAt: null,
  waitingDays: null,
  etag: '"v1"',
};
const detail = {
  ...summary,
  formVersionId: VERSION,
  createdByUserId: ME.id,
  identityKind: null as 'nid' | null,
  rejectionMessage: null,
  answers: answers('নমুনা উপকারভোগী', 'পুরনো মন্তব্য'),
  reviewedAt: null,
  approvedAt: null,
  familyDuplicateWarnings: [],
  availableActions: ['submit', 'delete'],
};
const view: SnapshotView = {
  serverTime: '2026-10-31T10:00:00.000Z',
  nextSince: '2026-10-31T09:59:00.000Z',
  nextAfterId: null,
  hasMore: false,
  projects: [project],
  formVersions: [form as unknown as SnapshotView['formVersions'][number]],
  applications: [summary],
  applicationIds: [APP],
  locationsVersion: '1.1',
};
const place = (id: string, parentId: string | null, level: string, bn: string) => ({
  id,
  parentId,
  level,
  code: id.slice(-2),
  name: { bn, en: bn },
  active: true,
});

let onLine = true;
beforeEach(() => {
  resetClientForTests();
  sessionStorage.clear();
  onLine = true;
  Object.defineProperty(navigator, 'onLine', { get: () => onLine, configurable: true });
  // every request to the server fails on the way while the phone is offline
  server.use(
    http.all('*/api/v1/*', () => (onLine ? undefined : HttpResponse.error())),
    http.get('*/api/v1/me/projects', () => HttpResponse.json({ data: [project], meta: {} })),
    http.get(`*/api/v1/me/projects/${PROJECT}`, () =>
      HttpResponse.json({ data: { ...project, rules: { version: 2, parts: [] } }, meta: {} }),
    ),
    http.get(`*/api/v1/projects/${PROJECT}/application-form`, () =>
      HttpResponse.json({ data: form, meta: {} }),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

/** The phone holds the volunteer's data set, as after a sign-in with network. */
async function seedPhone() {
  await afterSignIn({ sessionId: TEST_SESSION_ID, userId: ME.id, deviceKey: 'k'.repeat(43) });
  await applySnapshot(view, new Date());
  await storeDetail(detail, '"v1"');
  await replaceLocations(
    [
      place(DIVISION, null, 'division', 'ঢাকা বিভাগ'),
      place(DISTRICT, DIVISION, 'district', 'ঢাকা জেলা'),
      place(UPAZILA, DISTRICT, 'upazila', 'সাভার'),
      place(UNION, UPAZILA, 'union', 'আশুলিয়া'),
    ],
    '1.1',
  );
}

/** The batch endpoint accepting every record as the one application. */
function serveBatch(posted: string[]) {
  server.use(
    http.post('*/api/v1/sync/batch', async ({ request }) => {
      const body = (await request.json()) as { records: { clientUuid: string; kind: string }[] };
      posted.push(...body.records.map((r) => r.kind));
      return HttpResponse.json({
        data: {
          serverTime: new Date().toISOString(),
          results: body.records.map((r) => ({
            clientUuid: r.clientUuid,
            result: 'synced',
            serverId: APP,
            status: r.kind === 'application_submit' ? 'submitted' : 'draft',
          })),
        },
        meta: {},
      });
    }),
    http.get('*/api/v1/sync/snapshot', () => HttpResponse.json({ data: view, meta: {} })),
    http.get('*/api/v1/locations/all', () => HttpResponse.json({ data: [], meta: {} })),
  );
}

describe('applications without network', () => {
  it('starts a new application offline without the lookup, from the cached project and form', async () => {
    const user = userEvent.setup();
    refreshAs(VOLUNTEER);
    await seedPhone();
    onLine = false;
    renderApp(<ApplicationFormPage />, 'bn', {
      path: '/my-projects/:projectId/apply',
      initialPath: `/my-projects/${PROJECT}/apply`,
    });
    await user.type(await screen.findByRole('textbox', { name: /NID নম্বর/ }), '9876543210');
    await user.click(screen.getByRole('button', { name: 'খুঁজুন' }));
    expect(await screen.findByText(/নেট নেই, তাই যাচাই পরে হবে/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'নতুন ব্যক্তির জন্য ফর্ম পূরণ করুন' }));
    const name = await screen.findByRole('textbox', { name: /^name/ });
    expect(name).not.toHaveAttribute('readonly');
    expect(screen.getByRole('textbox', { name: /^nid_or_birth_reg/ })).toHaveValue('9876543210');
  });

  it('keeps a finished draft on the phone when sent offline, and sends it when the network returns', async () => {
    const user = userEvent.setup();
    refreshAs(VOLUNTEER);
    await seedPhone();
    const store = await import('../../offline/applications-store');
    onLine = false;
    // the draft the phone made, opened again for its last part
    await store.saveDraft({
      projectId: PROJECT,
      formVersionId: VERSION,
      clientUuid: LOCAL,
      answers: answers('অফলাইন উপকারভোগী', 'প্রথম মন্তব্য'),
    });
    renderApp(<ApplicationFormPage />, 'bn', {
      path: '/my-applications/:applicationId/edit',
      initialPath: `/my-applications/${LOCAL}/edit`,
    });
    const note = await screen.findByRole('textbox', { name: /মন্তব্য/ }, { timeout: 5000 });
    expect(note).toHaveValue('প্রথম মন্তব্য');
    await user.clear(note);
    await user.type(note, 'অফলাইনে শেষ');
    await user.click(screen.getByRole('button', { name: 'অফিসে পাঠান' }));
    expect(await screen.findByText('ফোনে জমা আছে', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText('এই ফোনে জমা হয়েছে। নেট এলে অফিসে যাবে।')).toBeInTheDocument();
    const rows = await offlineDb().outbox.toArray();
    expect(rows.map((r) => [r.kind, r.state])).toEqual(
      expect.arrayContaining([
        ['application_draft', 'pending'],
        ['application_submit', 'pending'],
      ]),
    );
    const draft = rows.find((r) => r.kind === 'application_draft')!;
    expect(JSON.stringify({ ...draft, data: undefined })).not.toContain('9876543210');
    expect(await readSecret(draft)).toMatchObject({
      payload: {
        answers: expect.arrayContaining([
          { fieldKey: 'note', repeatIndex: 0, value: { t: 'long_text', v: 'অফলাইনে শেষ' } },
        ]),
      },
    });
    expect(rows.find((r) => r.kind === 'application_submit')?.dependencies).toEqual([LOCAL]);
    // the network returns: the draft and its send go in order, and the phone learns the id
    onLine = true;
    const posted: string[] = [];
    serveBatch(posted);
    const { syncEngine } = await import('../../offline/sync-engine');
    await syncEngine.flush('manual');
    expect(posted).toEqual(['application_draft', 'application_submit']);
    expect(await offlineDb().outbox.get(LOCAL)).toMatchObject({ state: 'synced', serverId: APP });
  });

  it('lists a draft the server does not know yet with its badge, from the phone alone', async () => {
    refreshAs(VOLUNTEER);
    await seedPhone();
    const store = await import('../../offline/applications-store');
    onLine = false;
    await store.saveDraft({
      projectId: PROJECT,
      formVersionId: VERSION,
      clientUuid: LOCAL,
      answers: answers('ফোনের খসড়া', ''),
    });
    renderApp(<MyApplicationsPage />, 'bn', {
      path: '/my-applications',
      initialPath: '/my-applications?tab=draft',
    });
    const list = await screen.findByRole('list', {}, { timeout: 5000 });
    expect(within(list).getByText('ফোনের খসড়া')).toBeInTheDocument();
    expect(within(list).getByText('পাঠানোর অপেক্ষায়')).toBeInTheDocument();
    // the server's own draft comes from the phone's data set
    expect(within(list).getByText('নমুনা উপকারভোগী')).toBeInTheDocument();
  });

  it('opens a record the phone holds and takes a correction into the outbox offline', async () => {
    const user = userEvent.setup();
    refreshAs(VOLUNTEER);
    await seedPhone();
    await storeDetail(
      {
        ...detail,
        status: 'implementation',
        appNo: 'WC-2026-00012',
        availableActions: [],
        unlocks: [
          {
            id: UNLOCK,
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
          },
        ],
      },
      '"v1"',
    );
    onLine = false;
    renderApp(<ApplicationDetailPage />, 'bn', {
      path: '/my-applications/:applicationId',
      initialPath: `/my-applications/${APP}`,
    });
    expect(await screen.findByText('WC-2026-00012', {}, { timeout: 5000 })).toBeInTheDocument();
    const box = await screen.findByRole('textbox', { name: /মন্তব্য/ });
    await user.clear(box);
    await user.type(box, 'নতুন মন্তব্য');
    await user.click(screen.getByRole('button', { name: 'পাঠান' }));
    expect(
      await screen.findByText('এই ফোনে জমা হয়েছে। নেট এলে অফিসে যাবে।', {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    const correction = (await offlineDb().outbox.toArray()).find((r) => r.kind === 'field_update');
    expect(correction).toMatchObject({ target: UNLOCK, state: 'pending' });
    expect(await readSecret(correction!)).toMatchObject({
      payload: { unlockId: UNLOCK, value: { t: 'long_text', v: 'নতুন মন্তব্য' } },
    });
  });

  it('opens the server’s draft from the phone and saves an edit offline as an update', async () => {
    const user = userEvent.setup();
    refreshAs(VOLUNTEER);
    await seedPhone();
    onLine = false;
    renderApp(<ApplicationFormPage />, 'bn', {
      path: '/my-applications/:applicationId/edit',
      initialPath: `/my-applications/${APP}/edit`,
    });
    const note = await screen.findByRole('textbox', { name: /মন্তব্য/ }, { timeout: 5000 });
    expect(note).toHaveValue('পুরনো মন্তব্য');
    await user.clear(note);
    await user.type(note, 'অফলাইনে বদলানো');
    await user.click(screen.getByRole('button', { name: 'অফিসে পাঠান' }));
    await waitFor(
      async () =>
        expect(
          (await offlineDb().outbox.toArray()).map((r) => [r.kind, r.target, r.state]),
        ).toEqual(
          expect.arrayContaining([
            ['application_update', APP, 'pending'],
            ['application_submit', APP, 'pending'],
          ]),
        ),
      { timeout: 5000 },
    );
    expect(await screen.findByText('ফোনে জমা আছে')).toBeInTheDocument();
  });
});
