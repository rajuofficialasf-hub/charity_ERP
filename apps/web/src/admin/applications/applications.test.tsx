import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiError, ME, refreshAs, renderApp } from '../../../test/auth';
import { definition, field, section } from '../../../test/forms';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../api/client';
import { ApplicationReviewPage } from './ApplicationReviewPage';
import { ApplicationsPage } from './ApplicationsPage';
import { bn, type MessageKey } from '@css/shared/i18n';
import { expectOnScreenColumns, serveExports, tickedColumns } from '../../../test/msw/exports';

// The office's application screens: the list with its filters in the address and the bulk
// actions, and the review page with the signals, the answers, the steps with their actors, the
// change log and the decisions with their texts. Test data only.
const EXECUTIVE: Me = { ...ME, roles: ['project_executive'] };
const VOLUNTEER: Me = { ...ME, kind: 'volunteer', roles: ['volunteer_general'] };
const PROJECT = '01900000-0000-7000-8000-0000000000c1';
const VERSION = '01900000-0000-7000-8000-0000000000c2';
const A1 = '01900000-0000-7000-8000-0000000000e1';
const A2 = '01900000-0000-7000-8000-0000000000e2';
const DISTRICT = '01900000-0000-7000-8000-0000000000a2';
const DIVISION = '01900000-0000-7000-8000-0000000000a1';
const UNION = '01900000-0000-7000-8000-0000000000a4';
const form = {
  id: VERSION,
  formId: '01900000-0000-7000-8000-0000000000c4',
  versionNo: 1,
  status: 'published',
  publishedAt: '2026-10-01T00:00:00Z',
  ...definition(
    section(
      'office',
      [field('office_note', 'short_text', { label: { bn: 'অফিসের নোট', en: 'Office note' } })],
      {
        visibility: 'official_only',
      },
    ),
  ),
};
const envelope = (data: unknown, etag = '"v1"') =>
  HttpResponse.json({ data, meta: { requestId: 'r', etag } });
const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  appNo: 'WC-2026-00012',
  projectId: PROJECT,
  beneficiaryId: '01900000-0000-7000-8000-0000000000b1',
  beneficiaryName: 'নমুনা উপকারভোগী',
  ownerVolunteerId: '01900000-0000-7000-8000-0000000000d1',
  status: 'submitted',
  stage: null,
  outcome: null,
  flags: [],
  districtId: DISTRICT,
  unionId: UNION,
  submittedAt: '2026-11-02T10:00:00Z',
  waitingDays: 3,
  etag: '"v1"',
  ...over,
});
const record = (over: Record<string, unknown> = {}) => ({
  ...row(A1),
  formVersionId: VERSION,
  createdByUserId: null,
  identityKind: 'nid',
  rejectionMessage: null,
  decisionComment: null,
  answers: [
    { fieldKey: 'nid_or_birth_reg', repeatIndex: 0, value: { t: 'short_text', v: '1234567890' } },
    { fieldKey: 'mobile', repeatIndex: 0, value: { t: 'phone', v: '01711111111' } },
    { fieldKey: 'name', repeatIndex: 0, value: { t: 'short_text', v: 'নমুনা উপকারভোগী' } },
    {
      fieldKey: 'father_or_husband_name',
      repeatIndex: 0,
      value: { t: 'short_text', v: 'নমুনা পিতা' },
    },
    { fieldKey: 'gender', repeatIndex: 0, value: { t: 'single_select', v: 'female' } },
    {
      fieldKey: 'address',
      repeatIndex: 0,
      value: {
        t: 'bd_address',
        division_id: '01900000-0000-7000-8000-0000000000a1',
        district_id: DISTRICT,
        upazila_id: '01900000-0000-7000-8000-0000000000a3',
        union_id: UNION,
      },
    },
    { fieldKey: 'village', repeatIndex: 0, value: { t: 'short_text', v: 'নমুনা গ্রাম' } },
    { fieldKey: 'office_note', repeatIndex: 0, value: { t: 'short_text', v: 'যাচাই হয়েছে' } },
  ],
  reviewedAt: null,
  approvedAt: null,
  familyDuplicateWarnings: [],
  familyMemberSignals: [],
  samePersonSignals: [],
  availableActions: ['review', 'delete'],
  decisionHints: {},
  totalScore: null,
  scoreItems: null,
  form,
  ...over,
});
/** The comment the server asks for, naming why. */
const commentAsked = (reason: 'against_score' | 'quota_full' | 'family_match') =>
  HttpResponse.json(
    {
      error: {
        code: 'workflow.comment_required',
        messageKey: 'errors.workflow.comment_required',
        message: 'এই সিদ্ধান্তে মন্তব্য লিখুন।',
        requestId: 'req_test',
        details: [{ path: reason, code: 'workflow.comment_required', message: 'মন্তব্য লিখুন' }],
      },
    },
    { status: 422 },
  );

const unlockOf = (over: Record<string, unknown> = {}) => ({
  id: '01900000-0000-7000-8000-0000000000f1',
  applicationId: A1,
  fieldKey: 'village',
  repeatIndex: 0,
  state: 'updated',
  oldValue: { t: 'short_text', v: 'নমুনা গ্রাম' },
  newValue: { t: 'short_text', v: 'নতুন গ্রাম' },
  reason: 'গ্রামের নাম ভুল',
  openedBy: 'u-rpm',
  openedAt: '2026-11-04T10:00:00Z',
  enteredBy: 'u-volunteer',
  enteredAt: '2026-11-05T10:00:00Z',
  decidedBy: null,
  decidedAt: null,
  decision: null,
  decisionReason: null,
  mayFill: false,
  mayDecide: true,
  mayCancel: true,
  ...over,
});

let listCalls: string[];
let bulkBodies: unknown[];
let acted: { action: string; body: unknown }[];
let patched: { ifMatch: string | null; body: unknown }[];
let pulls: { key: string | null; body: unknown }[];
function serve(
  rows: unknown[] = [row(A1), row(A2, { appNo: 'WC-2026-00013', beneficiaryName: 'দ্বিতীয় জন' })],
  quotas: unknown[] = [],
) {
  listCalls = [];
  bulkBodies = [];
  acted = [];
  patched = [];
  pulls = [];
  server.use(
    http.get(`*/api/v1/projects/${PROJECT}/quotas`, () =>
      HttpResponse.json({ data: quotas, meta: { requestId: 'r' } }),
    ),
    http.post(`*/api/v1/projects/${PROJECT}/waitlist/pull-next`, async ({ request }) => {
      pulls.push({ key: request.headers.get('Idempotency-Key'), body: await request.json() });
      return envelope({ id: A2, appNo: 'WC-2026-00013' });
    }),
    http.get('*/api/v1/locations', () => HttpResponse.json({ data: [], meta: { requestId: 'r' } })),
    http.get(`*/api/v1/projects/${PROJECT}`, () =>
      envelope({
        id: PROJECT,
        code: 'WC',
        year: 2026,
        name: { bn: 'শীতবস্ত্র', en: 'Winter' },
        status: 'active',
      }),
    ),
    http.get(`*/api/v1/projects/${PROJECT}/applications`, ({ request }) => {
      listCalls.push(new URL(request.url).search);
      return HttpResponse.json({
        data: rows,
        meta: { requestId: 'r', nextCursor: null, prevCursor: null, total: rows.length },
      });
    }),
    http.post(`*/api/v1/projects/${PROJECT}/bulk/review`, async ({ request }) => {
      const body = (await request.json()) as { rows: { clientUuid: string }[] };
      bulkBodies.push(body);
      return HttpResponse.json({
        data: {
          results: body.rows.map((r, i) => ({
            clientUuid: r.clientUuid,
            result: i === 0 ? 'done' : 'failed',
            code: i === 0 ? null : 'conflict.stale_version',
            serverId: null,
            status: i === 0 ? 'under_review' : null,
            stage: null,
          })),
        },
        meta: { requestId: 'r' },
      });
    }),
    http.get(`*/api/v1/applications/${A1}`, () => envelope(record())),
    http.get(`*/api/v1/applications/${A1}/timeline`, () =>
      envelope([
        {
          id: 't1',
          at: '2026-11-02T10:00:00Z',
          action: 'application.submit',
          from: 'draft',
          to: 'submitted',
          automatic: false,
          actor: { id: 'u1', name: 'নমুনা স্বেচ্ছাসেবক' },
          reason: null,
          comment: null,
          message: null,
        },
      ]),
    ),
    http.get(`*/api/v1/applications/${A1}/changes`, () =>
      HttpResponse.json({
        data: [
          {
            id: 'c1',
            field: 'office_note',
            kind: 'review_edit',
            oldValue: null,
            newValue: { t: 'short_text', v: 'যাচাই হয়েছে' },
            reason: null,
            createdAt: '2026-11-03T10:00:00Z',
          },
        ],
        meta: { requestId: 'r', nextCursor: null, prevCursor: null },
      }),
    ),
    http.patch(`*/api/v1/applications/${A1}`, async ({ request }) => {
      const body = await request.json();
      patched.push({ ifMatch: request.headers.get('If-Match'), body });
      if (patched.length > 1) return apiError(412, 'conflict.stale_version', 'পুরনো সংস্করণ');
      return envelope(
        record({ status: 'under_review', availableActions: ['send_for_approval'] }),
        '"v2"',
      );
    }),
    http.post(`*/api/v1/applications/${A1}/actions/:action`, async ({ params, request }) => {
      const body = await request.json().catch(() => ({}));
      acted.push({ action: String(params.action), body });
      if (params.action === 'approve')
        return apiError(412, 'conflict.stale_version', 'পুরনো সংস্করণ');
      if (params.action === 'send_for_approval')
        return apiError(403, 'auth.forbidden', 'এই কাজের অনুমতি আপনার নেই।');
      return envelope(
        record({ status: 'under_review', availableActions: ['send_for_approval'] }),
        '"v2"',
      );
    }),
  );
}

beforeEach(() => {
  resetClientForTests();
});

const openList = (initialPath = `/admin/projects/${PROJECT}/applications`) =>
  renderApp(<ApplicationsPage />, 'bn', {
    path: '/admin/projects/:projectId/applications',
    initialPath,
  });
const openReview = (locale: 'bn' | 'en' = 'bn') =>
  renderApp(<ApplicationReviewPage />, locale, {
    path: '/admin/applications/:applicationId',
    initialPath: `/admin/applications/${A1}`,
  });

describe('the list', () => {
  it('offers the export, with the table’s own columns ticked first, in its order', async () => {
    refreshAs(EXECUTIVE);
    // an official sees the score, so the page shows its column
    serve([row(A1, { totalScore: 42 })]);
    const { columnUrls } = serveExports('applications');
    const user = userEvent.setup();
    openList();
    // the application number sits in the person's cell
    await expectOnScreenColumns(
      user,
      'applications',
      (id) => `applications.office.column.${id === 'app_no' ? 'person' : id}` as MessageKey,
    );
    expect(columnUrls[0]?.searchParams.get('projectId')).toBe(PROJECT);
  });

  it('exports the rows the list shows, with the filters its API reads', async () => {
    refreshAs(EXECUTIVE);
    serve();
    const { bodies } = serveExports('applications');
    const user = userEvent.setup();
    openList(
      `/admin/projects/${PROJECT}/applications?status=submitted&divisionId=${DIVISION}&districtId=${DISTRICT}`,
    );
    await user.click(await screen.findByRole('button', { name: 'এক্সপোর্ট' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(tickedColumns(dialog).length).toBeGreaterThan(0));
    await user.click(within(dialog).getByRole('button', { name: 'এক্সপোর্ট শুরু করুন' }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    // the division only narrows the page's address picker; the list's API never reads it
    expect(bodies[0]).toMatchObject({
      kind: 'applications',
      projectId: PROJECT,
      filters: { status: 'submitted', districtId: DISTRICT },
    });
    expect((bodies[0] as { filters: Record<string, string> }).filters).not.toHaveProperty(
      'divisionId',
    );
  });

  it('keeps the filters in the address, lists the rows and starts the review of the ticked ones in one request', async () => {
    const user = userEvent.setup();
    refreshAs(EXECUTIVE);
    serve();
    const view = openList(`/admin/projects/${PROJECT}/applications?status=submitted`);
    expect(
      await screen.findByRole('heading', { level: 1, name: /আবেদন: শীতবস্ত্র/ }),
    ).toBeInTheDocument();
    expect((await screen.findAllByText('WC-2026-00012')).length).toBeGreaterThan(0);
    await waitFor(() => expect(listCalls[0]).toContain('status=submitted'));
    expect(listCalls[0]).toContain('include=total');
    // the ticked rows take one request; the outcome counts the rows that moved and the ones that did not
    const grid = await screen.findByRole('table');
    await user.click(await within(grid).findByRole('checkbox', { name: /নমুনা উপকারভোগী/ }));
    await user.click(within(grid).getByRole('checkbox', { name: /দ্বিতীয় জন/ }));
    expect(screen.getByText('2টি বেছে নেওয়া হয়েছে')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'রিভিউ শুরু' }));
    expect(await screen.findByText('1টি হয়েছে, 1টি হয়নি')).toBeInTheDocument();
    expect(bulkBodies).toHaveLength(1);
    expect(bulkBodies[0]).toMatchObject({
      action: 'review',
      rows: [
        { applicationId: A1, ifMatch: '"v1"' },
        { applicationId: A2, ifMatch: '"v1"' },
      ],
    });
    await expectNoAxeViolations(view.container);
  });

  it('sends the district and the union of the address path only, and takes the approval of ticked reviewed rows', async () => {
    const user = userEvent.setup();
    refreshAs(EXECUTIVE);
    serve([
      row(A1, { status: 'reviewed' }),
      row(A2, { appNo: 'WC-2026-00013', beneficiaryName: 'দ্বিতীয় জন', status: 'reviewed' }),
    ]);
    openList(
      `/admin/projects/${PROJECT}/applications?divisionId=d1&districtId=${DISTRICT}&upazilaId=u1&unionId=${UNION}`,
    );
    await waitFor(() => expect(listCalls).toHaveLength(1));
    expect(listCalls[0]).toContain(`districtId=${DISTRICT}`);
    expect(listCalls[0]).toContain(`unionId=${UNION}`);
    expect(listCalls[0]).not.toContain('divisionId');
    expect(listCalls[0]).not.toContain('upazilaId');
    const grid = await screen.findByRole('table');
    await user.click(await within(grid).findByRole('checkbox', { name: /নমুনা উপকারভোগী/ }));
    await user.click(within(grid).getByRole('checkbox', { name: /দ্বিতীয় জন/ }));
    expect(screen.getByRole('button', { name: 'রিভিউ শুরু' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'অনুমোদন করুন' }));
    await waitFor(() => expect(bulkBodies).toHaveLength(1));
    expect(bulkBodies[0]).toMatchObject({ action: 'approve' });
  });

  it('orders by score on request, shows the score and the quotas, and pulls the next of an area in one request', async () => {
    const user = userEvent.setup();
    refreshAs(EXECUTIVE);
    serve(
      [
        row(A1, { totalScore: 60, status: 'reviewed' }),
        row(A2, { appNo: 'WC-2026-00013', beneficiaryName: 'দ্বিতীয় জন', totalScore: 35 }),
      ],
      [
        {
          level: 'union',
          locationId: UNION,
          locationName: { bn: 'নমুনা ইউনিয়ন', en: 'Sample union' },
          target: 50,
          received: 72,
          approved: 40,
          full: false,
        },
        {
          level: 'union',
          locationId: '01900000-0000-7000-8000-0000000000a9',
          locationName: { bn: 'পূর্ণ ইউনিয়ন', en: 'Full union' },
          target: 10,
          received: 14,
          approved: 10,
          full: true,
        },
      ],
    );
    const view = openList(`/admin/projects/${PROJECT}/applications?sort=-score`);
    await waitFor(() => expect(listCalls[0]).toContain('sort=-score'));
    const grid = await screen.findByRole('table');
    expect(within(grid).getByRole('columnheader', { name: 'স্কোর' })).toBeInTheDocument();
    expect(within(grid).getByText('60')).toBeInTheDocument();
    const quotas = (await screen.findByRole('heading', { level: 2, name: 'এলাকার কোটা' })).closest(
      'section',
    )!;
    expect(within(quotas).getByText('লক্ষ্য 50 · এসেছে 72 · অনুমোদিত 40')).toBeInTheDocument();
    expect(within(quotas).getByText('কোটা পূর্ণ')).toBeInTheDocument();
    await user.click(within(quotas).getByRole('button', { name: 'পরেরজনকে আনুন (নমুনা ইউনিয়ন)' }));
    expect(
      await screen.findByText('WC-2026-00013 অপেক্ষমাণ তালিকা থেকে অনুমোদিত হয়েছে।'),
    ).toBeInTheDocument();
    expect(pulls).toHaveLength(1);
    expect(pulls[0]?.body).toEqual({ areaId: UNION });
    expect(pulls[0]?.key).toBeTruthy();
    await expectNoAxeViolations(view.container);
  });

  it('shows no score for a form without points, and pulls for the whole project without quotas', async () => {
    const user = userEvent.setup();
    refreshAs(EXECUTIVE);
    serve([row(A1, { totalScore: null, status: 'waitlisted' })]);
    openList();
    const grid = await screen.findByRole('table');
    expect(within(grid).queryByRole('columnheader', { name: 'স্কোর' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'সাজানো' })).toBeNull();
    await user.click(await screen.findByRole('button', { name: 'পরেরজনকে আনুন' }));
    await waitFor(() => expect(pulls).toHaveLength(1));
    expect(pulls[0]?.body).toEqual({});
  });

  it('asks a comment when the pull meets a full quota, and sends it with a fresh key', async () => {
    const user = userEvent.setup();
    refreshAs(EXECUTIVE);
    serve([row(A1, { status: 'waitlisted' })]);
    server.use(
      http.post(`*/api/v1/projects/${PROJECT}/waitlist/pull-next`, async ({ request }) => {
        pulls.push({ key: request.headers.get('Idempotency-Key'), body: await request.json() });
        return pulls.length === 1
          ? commentAsked('quota_full')
          : envelope({ id: A1, appNo: 'WC-2026-00012' });
      }),
    );
    openList();
    await user.click(await screen.findByRole('button', { name: 'পরেরজনকে আনুন' }));
    const dialog = await screen.findByRole('dialog', { name: 'পরেরজনকে আনুন' });
    expect(
      within(dialog).getByText('এই এলাকার কোটা পূর্ণ। তবু কেন অনুমোদন দিচ্ছেন?'),
    ).toBeInTheDocument();
    await user.type(
      within(dialog).getByRole('textbox', { name: /মন্তব্য/ }),
      'বাড়তি মালামাল এসেছে',
    );
    await user.click(within(dialog).getByRole('button', { name: 'পরেরজনকে আনুন' }));
    expect(
      await screen.findByText('WC-2026-00012 অপেক্ষমাণ তালিকা থেকে অনুমোদিত হয়েছে।'),
    ).toBeInTheDocument();
    expect(pulls[1]?.body).toEqual({ comment: 'বাড়তি মালামাল এসেছে' });
    expect(pulls[1]?.key).not.toBe(pulls[0]?.key);
  });

  it('switches to the entries waiting for verification', async () => {
    const user = userEvent.setup();
    refreshAs(EXECUTIVE);
    serve();
    openList();
    await screen.findByRole('table');
    await user.click(screen.getByRole('radio', { name: 'যাচাইয়ের অপেক্ষায়' }));
    await waitFor(() => expect(listCalls.at(-1)).toContain('status=needs_verification'));
  });

  it('refuses a volunteer the office screens', async () => {
    refreshAs(VOLUNTEER);
    serve();
    openList();
    expect(await screen.findByText('এই পাতায় আপনার প্রবেশাধিকার নেই।')).toBeInTheDocument();
  });
});

describe('the review page', () => {
  it('shows the signals, the official section, the steps with their actors, the change log, and only the allowed actions', async () => {
    refreshAs(EXECUTIVE);
    serve();
    server.use(
      http.get(`*/api/v1/applications/${A1}`, () =>
        envelope(
          record({
            flags: ['public_entry', 'existing_identity'],
            status: 'needs_verification',
            availableActions: ['reject_unverified'],
            familyDuplicateWarnings: [
              { beneficiaryId: 'b2', benNo: 'BEN-0000007', name: 'অন্য জন', matchedOn: ['mobile'] },
            ],
          }),
        ),
      ),
    );
    const view = openReview();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'নমুনা উপকারভোগী' }),
    ).toBeInTheDocument();
    expect(screen.getByText('এই নম্বরের একটি প্রোফাইল আগে থেকেই আছে।')).toBeInTheDocument();
    expect(screen.getByText(/অন্য জন \(BEN-0000007\) — একই মোবাইল/)).toBeInTheDocument();
    // the official section is part of the office's reading
    expect(screen.getByText('যাচাই হয়েছে', { selector: 'dd' })).toBeInTheDocument();
    const steps = await screen.findByRole('list', { name: 'আবেদনের ধাপ' });
    expect(steps).toHaveTextContent('নমুনা স্বেচ্ছাসেবক');
    const log = await screen.findByRole('table', { name: 'পরিবর্তনের লগ' });
    expect(within(log).getByText('অফিসের নোট')).toBeInTheDocument();
    // a public entry offers its refusal with a reason, and no review
    expect(screen.getByRole('button', { name: 'এন্ট্রি বাতিল করুন' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'রিভিউ শুরু' })).not.toBeInTheDocument();
    await expectNoAxeViolations(view.container);
  });

  it('names the earlier family and the same person with their links, and only tells where they may not be opened', async () => {
    refreshAs(EXECUTIVE);
    serve();
    const HEAD = '01900000-0000-7000-8000-0000000000c1';
    const OTHER = '01900000-0000-7000-8000-0000000000c2';
    const signals = {
      familyMemberSignals: [
        {
          relationshipCode: 'son',
          relationship: { bn: 'ছেলে', en: 'son' },
          head: { beneficiaryId: HEAD, benNo: 'BEN-0000011', name: 'মোঃ হাবিব' },
        },
        { relationshipCode: null, relationship: null, head: null },
      ],
      samePersonSignals: [
        {
          level: 'probable',
          matchedOn: ['name_father_village'],
          other: { beneficiaryId: OTHER, benNo: 'BEN-0000012', name: 'সোহেল মিয়া' },
        },
        { level: 'probable', matchedOn: ['name_father_mobile', 'same_mobile'], other: null },
      ],
    };
    server.use(http.get(`*/api/v1/applications/${A1}`, () => envelope(record(signals))));
    const view = openReview();
    expect(await screen.findByText(/সম্ভবত মোঃ হাবিব-এর ছেলে/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'প্রোফাইল দেখুন (BEN-0000011)' })).toHaveAttribute(
      'href',
      `/admin/beneficiaries/${HEAD}`,
    );
    expect(screen.getByText('সম্ভবত অন্য এক উপকারভোগীর পরিবারের সদস্য')).toBeInTheDocument();
    expect(
      screen.getByText(
        /সম্ভবত একই ব্যক্তি: সোহেল মিয়া \(BEN-0000012\) — নাম, পিতা\/স্বামীর নাম ও গ্রাম মিলেছে/,
      ),
    ).toBeInTheDocument();
    const compare = screen.getByRole('link', { name: 'তুলনা করুন' });
    expect(compare.getAttribute('href')).toContain(`a=${row(A1).beneficiaryId}`);
    expect(compare.getAttribute('href')).toContain(`b=${OTHER}`);
    // the pair the viewer may not compare names nobody and links nowhere
    expect(
      screen.getByText(
        'অন্য একটি প্রোফাইলের সঙ্গে সম্ভবত একই ব্যক্তি — একই নাম, পিতা/স্বামী ও মোবাইল, একই মোবাইল নম্বর',
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'তুলনা করুন' })).toHaveLength(1);
    await expectNoAxeViolations(view.container);
    view.unmount();
    openReview('en');
    expect(await screen.findByText(/Probably মোঃ হাবিব's son/)).toBeInTheDocument();
    expect(screen.getByText('Probably a family member of another beneficiary')).toBeInTheDocument();
  });

  it('tells why a record from a phone waits, with the time it was taken', async () => {
    refreshAs(EXECUTIVE);
    serve();
    server.use(
      http.get(`*/api/v1/applications/${A1}`, () =>
        envelope(
          record({
            flags: ['late_sync', 'stale_form_version'],
            status: 'needs_verification',
            clientCreatedAt: '2026-10-30T08:15:00.000Z',
            availableActions: ['verify_create'],
          }),
        ),
      ),
    );
    openReview();
    await screen.findByRole('heading', { level: 1, name: 'নমুনা উপকারভোগী' });
    expect(
      screen.getByText('শেষ তারিখের আগে ফোনে নেওয়া, পরে পাঠানো হয়েছে; দেখে যাচাই করুন।'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('ফর্মের পুরোনো সংস্করণে ফোনে নেওয়া; নতুন প্রশ্নগুলো দরকার কি না দেখুন।'),
    ).toBeInTheDocument();
    expect(screen.getByText('ফোনে নেওয়া হয়েছে', { selector: 'dt' })).toBeInTheDocument();
  });

  it('asks both texts for a rejection, tells of a stale version, and starts a review', async () => {
    const user = userEvent.setup();
    refreshAs(EXECUTIVE);
    serve();
    server.use(
      http.get(`*/api/v1/applications/${A1}`, () =>
        envelope(record({ status: 'reviewed', availableActions: ['approve', 'reject'] })),
      ),
    );
    openReview();
    await user.click(await screen.findByRole('button', { name: 'বাতিল করুন' }));
    const dialog = await screen.findByRole('dialog', { name: 'আবেদন বাতিল করুন' });
    expect(
      within(dialog).getByText('অফিসের কারণ স্বেচ্ছাসেবকের কাছে কখনো যায় না।'),
    ).toBeInTheDocument();
    const confirm = within(dialog).getByRole('button', { name: 'বাতিল করুন' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox', { name: /অফিসের কারণ/ }), 'আয় সীমার উপরে');
    expect(confirm).toBeDisabled();
    await user.type(
      within(dialog).getByRole('textbox', { name: /স্বেচ্ছাসেবকের জন্য বার্তা/ }),
      'এবার সম্ভব হলো না',
    );
    await user.click(confirm);
    await waitFor(() => expect(acted).toHaveLength(1));
    expect(acted[0]).toEqual({
      action: 'reject',
      body: { reason: 'আয় সীমার উপরে', message: 'এবার সম্ভব হলো না' },
    });
    expect(await screen.findByText('আবেদন বাতিল হয়েছে।')).toBeInTheDocument();
    // the approval meets a version that changed meanwhile
    await user.click(screen.getByRole('button', { name: 'অনুমোদন করুন' }));
    expect(
      await screen.findByText('আবেদনটি এর মধ্যে বদলেছে। সর্বশেষ তথ্য দেখতে আবার লোড করুন।'),
    ).toBeInTheDocument();
  });

  it('edits the answers under review with the version it read, tells of a stale save, and shows a refusal', async () => {
    const user = userEvent.setup();
    refreshAs(EXECUTIVE);
    serve();
    server.use(
      http.get(`*/api/v1/applications/${A1}`, () =>
        envelope(record({ status: 'under_review', availableActions: ['send_for_approval'] })),
      ),
    );
    openReview();
    await user.click(await screen.findByRole('button', { name: 'উত্তর সম্পাদনা' }));
    const note = await screen.findByRole('textbox', { name: /অফিসের নোট/ });
    await user.clear(note);
    await user.type(note, 'আবার যাচাই');
    await user.click(screen.getByRole('button', { name: 'সংরক্ষণ' }));
    await waitFor(() => expect(patched).toHaveLength(1));
    expect(patched[0]?.ifMatch).toBe('"v1"');
    expect(patched[0]?.body).toMatchObject({
      answers: expect.arrayContaining([
        expect.objectContaining({
          fieldKey: 'office_note',
          value: { t: 'short_text', v: 'আবার যাচাই' },
        }),
      ]),
    });
    expect(await screen.findByText('উত্তর সংরক্ষিত হয়েছে।')).toBeInTheDocument();
    // a second save meets a version that changed meanwhile
    await user.click(await screen.findByRole('button', { name: 'উত্তর সম্পাদনা' }));
    await user.click(await screen.findByRole('button', { name: 'সংরক্ষণ' }));
    expect(
      await screen.findByText('আবেদনটি এর মধ্যে বদলেছে। সর্বশেষ তথ্য দেখতে আবার লোড করুন।'),
    ).toBeInTheDocument();
    // a refused move shows the server's words
    await user.click(screen.getByRole('button', { name: 'অনুমোদনের জন্য পাঠান' }));
    expect(await screen.findByText('এই কাজের অনুমতি আপনার নেই।')).toBeInTheDocument();
    expect(acted.at(-1)).toMatchObject({ action: 'send_for_approval' });
  });

  it('takes a rejection back with the office reason only, and deletes after a confirmation', async () => {
    const user = userEvent.setup();
    refreshAs(EXECUTIVE);
    serve();
    server.use(
      http.get(`*/api/v1/applications/${A1}`, () =>
        envelope(record({ status: 'rejected', availableActions: ['return_to_review', 'delete'] })),
      ),
    );
    openReview();
    await user.click(await screen.findByRole('button', { name: 'বাতিল ফিরিয়ে নিন' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'বাতিল ফিরিয়ে অনুমোদনের অপেক্ষায় নিন',
    });
    expect(
      within(dialog).queryByRole('textbox', { name: /স্বেচ্ছাসেবকের জন্য বার্তা/ }),
    ).toBeNull();
    await user.type(
      within(dialog).getByRole('textbox', { name: /অফিসের কারণ/ }),
      'নতুন তথ্য এসেছে',
    );
    await user.click(within(dialog).getByRole('button', { name: 'বাতিল ফিরিয়ে নিন' }));
    await waitFor(() => expect(acted).toHaveLength(1));
    expect(acted[0]).toEqual({ action: 'return_to_review', body: { reason: 'নতুন তথ্য এসেছে' } });
    await user.click(await screen.findByRole('button', { name: 'মুছে ফেলুন' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'আবেদনটি মুছে ফেলবেন?' });
    await user.click(within(confirm).getByRole('button', { name: 'মুছে ফেলুন' }));
    await waitFor(() => expect(acted).toHaveLength(2));
    expect(acted[1]).toMatchObject({ action: 'delete' });
  });

  it('shows the score breakdown, asks a reason to waitlist and a comment to approve against the order', async () => {
    const user = userEvent.setup();
    refreshAs(EXECUTIVE);
    serve();
    server.use(
      http.get(`*/api/v1/applications/${A1}`, () =>
        envelope(
          record({
            status: 'reviewed',
            totalScore: 60,
            scoreItems: [
              {
                key: 'beneficiary_type',
                label: { bn: 'উপকারভোগীর ধরন', en: 'Beneficiary type' },
                input: 'widow',
                max_points: 40,
                points: 40,
              },
              { key: 'not_previously_assisted', input: true, max_points: 20, points: 20 },
            ],
            availableActions: ['approve', 'reject', 'waitlist'],
            decisionHints: { approve: ['against_score'], waitlist: [], reject: [] },
          }),
        ),
      ),
      http.post(`*/api/v1/applications/${A1}/actions/:action`, async ({ params, request }) => {
        acted.push({ action: String(params.action), body: await request.json() });
        return envelope(record({ status: String(params.action) }), '"v2"');
      }),
    );
    const view = openReview();
    const score = (await screen.findByRole('heading', { level: 2, name: 'স্কোর' })).closest(
      'section',
    )!;
    expect(within(score).getByText('মোট 60 / 60')).toBeInTheDocument();
    expect(within(score).getByText('উপকারভোগীর ধরন')).toBeInTheDocument();
    expect(within(score).getByText('আগে সহায়তা পাননি')).toBeInTheDocument();
    expect(within(score).getAllByText('40 / 40')).toHaveLength(1);
    await expectNoAxeViolations(view.container);
    // the waitlist asks the office's reason
    await user.click(screen.getByRole('button', { name: 'অপেক্ষমাণ তালিকায় রাখুন' }));
    const waitlist = await screen.findByRole('dialog', { name: 'অপেক্ষমাণ তালিকায় রাখুন' });
    await user.type(within(waitlist).getByRole('textbox', { name: /অফিসের কারণ/ }), 'মালামাল কম');
    await user.click(within(waitlist).getByRole('button', { name: 'অপেক্ষমাণ তালিকায় রাখুন' }));
    await waitFor(() => expect(acted).toHaveLength(1));
    expect(acted[0]).toEqual({ action: 'waitlist', body: { reason: 'মালামাল কম' } });
    // an approval against the order asks why before it is sent
    await user.click(await screen.findByRole('button', { name: 'অনুমোদন করুন' }));
    const approve = await screen.findByRole('dialog', { name: 'আবেদন অনুমোদন করুন' });
    expect(
      within(approve).getByText('কেন স্কোরের ক্রম ভেঙে সিদ্ধান্ত নিচ্ছেন?'),
    ).toBeInTheDocument();
    expect(within(approve).queryByRole('textbox', { name: /অফিসের কারণ/ })).toBeNull();
    const confirm = within(approve).getByRole('button', { name: 'অনুমোদন করুন' });
    expect(confirm).toBeDisabled();
    await user.type(within(approve).getByRole('textbox', { name: /মন্তব্য/ }), 'জরুরি প্রয়োজন');
    await user.click(confirm);
    await waitFor(() => expect(acted).toHaveLength(2));
    expect(acted[1]).toEqual({ action: 'approve', body: { comment: 'জরুরি প্রয়োজন' } });
  });

  it('warns of a family match and asks why before an approval', async () => {
    const user = userEvent.setup();
    refreshAs(EXECUTIVE);
    serve();
    server.use(
      http.get(`*/api/v1/applications/${A1}`, () =>
        envelope(
          record({
            status: 'reviewed',
            availableActions: ['approve', 'reject', 'waitlist'],
            familyDuplicateWarnings: [
              {
                beneficiaryId: '01a0d000-0000-7000-8000-0000000000f1',
                benNo: 'BEN-0000042',
                name: 'রহিমা খাতুন',
                matchedOn: ['mobile'],
              },
            ],
            decisionHints: { approve: ['family_match'], waitlist: [], reject: [] },
          }),
        ),
      ),
      http.post(`*/api/v1/applications/${A1}/actions/:action`, async ({ params, request }) => {
        acted.push({ action: String(params.action), body: await request.json() });
        return envelope(record({ status: String(params.action) }), '"v2"');
      }),
    );
    const view = openReview();
    expect(
      await screen.findByText(
        'একই প্রকল্পে সম্ভাব্য একই পরিবার: রহিমা খাতুন (BEN-0000042) — একই মোবাইল',
      ),
    ).toBeInTheDocument();
    await expectNoAxeViolations(view.container);
    await user.click(screen.getByRole('button', { name: 'অনুমোদন করুন' }));
    const approve = await screen.findByRole('dialog', { name: 'আবেদন অনুমোদন করুন' });
    expect(
      within(approve).getByText('এই প্রকল্পে একই পরিবারের আরেকজন আছেন। তবু কেন অনুমোদন দিচ্ছেন?'),
    ).toBeInTheDocument();
    const confirm = within(approve).getByRole('button', { name: 'অনুমোদন করুন' });
    expect(confirm).toBeDisabled();
    await user.type(within(approve).getByRole('textbox', { name: /মন্তব্য/ }), 'আলাদা পরিবার');
    await user.click(confirm);
    await waitFor(() => expect(acted).toHaveLength(1));
    expect(acted[0]).toEqual({ action: 'approve', body: { comment: 'আলাদা পরিবার' } });
  });

  it('opens the comment box when the server asks one the screen did not expect', async () => {
    const user = userEvent.setup();
    refreshAs(EXECUTIVE);
    serve();
    server.use(
      http.get(`*/api/v1/applications/${A1}`, () =>
        envelope(record({ status: 'waitlisted', availableActions: ['pull_from_waitlist'] })),
      ),
      http.post(`*/api/v1/applications/${A1}/actions/:action`, async ({ params, request }) => {
        acted.push({ action: String(params.action), body: await request.json().catch(() => ({})) });
        return acted.length === 1
          ? commentAsked('against_score')
          : envelope(record({ status: 'approved', availableActions: [] }), '"v2"');
      }),
    );
    openReview();
    await user.click(await screen.findByRole('button', { name: 'অপেক্ষমাণ তালিকা থেকে অনুমোদন' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'অপেক্ষমাণ তালিকা থেকে অনুমোদন করুন',
    });
    expect(
      within(dialog).getByText('কেন স্কোরের ক্রম ভেঙে সিদ্ধান্ত নিচ্ছেন?'),
    ).toBeInTheDocument();
    await user.type(within(dialog).getByRole('textbox', { name: /মন্তব্য/ }), 'তিনি আগে এসেছেন');
    await user.click(within(dialog).getByRole('button', { name: 'অপেক্ষমাণ তালিকা থেকে অনুমোদন' }));
    expect(
      await screen.findByText('আবেদনটি অপেক্ষমাণ তালিকা থেকে অনুমোদিত হয়েছে।'),
    ).toBeInTheDocument();
    expect(acted[1]).toEqual({
      action: 'pull_from_waitlist',
      body: { comment: 'তিনি আগে এসেছেন' },
    });
  });

  it('opens an answer of an approved record with a reason, never the identity', async () => {
    const user = userEvent.setup();
    refreshAs(EXECUTIVE);
    serve();
    let opened: unknown = null;
    server.use(
      http.get(`*/api/v1/applications/${A1}`, () =>
        envelope(record({ status: 'implementation', availableActions: [], mayUnlock: true })),
      ),
      http.post(`*/api/v1/applications/${A1}/unlocks`, async ({ request }) => {
        opened = await request.json();
        return envelope(unlockOf({ state: 'open', newValue: null, enteredBy: null }));
      }),
    );
    const view = openReview();
    const button = await screen.findByRole('button', { name: 'সংশোধনের জন্য খুলুন: village' });
    expect(screen.queryByRole('button', { name: 'সংশোধনের জন্য খুলুন: name' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'সংশোধনের জন্য খুলুন: nid_or_birth_reg' }),
    ).toBeNull();
    await expectNoAxeViolations(view.container);
    await user.click(button);
    const dialog = await screen.findByRole('dialog', { name: '“village” সংশোধনের জন্য খুলুন' });
    const confirm = within(dialog).getByRole('button', { name: 'খুলুন' });
    expect(confirm).toBeDisabled();
    await user.type(
      within(dialog).getByRole('textbox', { name: /অফিসের কারণ/ }),
      'গ্রামের নাম ভুল',
    );
    await user.click(confirm);
    expect(await screen.findByText('উত্তরটি সংশোধনের জন্য খোলা হয়েছে।')).toBeInTheDocument();
    expect(opened).toEqual({ fieldKey: 'village', reason: 'গ্রামের নাম ভুল' });
  });

  it('accepts or sends back a new answer, and shows no decision to the one who entered it', async () => {
    const user = userEvent.setup();
    refreshAs(EXECUTIVE);
    serve();
    const decided: unknown[] = [];
    server.use(
      http.get(`*/api/v1/applications/${A1}`, () =>
        envelope(
          record({
            status: 'implementation',
            availableActions: [],
            mayUnlock: true,
            unlocks: [
              unlockOf(),
              unlockOf({
                id: '01900000-0000-7000-8000-0000000000f2',
                fieldKey: 'office_note',
                oldValue: null,
                newValue: { t: 'short_text', v: 'অফিসের নোট' },
                reason: 'অফিসের যাচাই বাকি',
                enteredBy: ME.id,
                mayDecide: false,
              }),
            ],
          }),
        ),
      ),
      http.post('*/api/v1/application-unlocks/:id/decision', async ({ request, params }) => {
        decided.push({ id: params.id, body: await request.json() });
        return envelope(unlockOf({ state: 'relocked', decision: 'accepted' }));
      }),
    );
    const view = openReview();
    const card = (
      await screen.findByRole('heading', { level: 2, name: 'সংশোধনের জন্য খোলা উত্তর' })
    ).closest('section')!;
    expect(within(card).getByText('গ্রামের নাম ভুল')).toBeInTheDocument();
    expect(within(card).getByText('নতুন গ্রাম')).toBeInTheDocument();
    // one accept for the answer the reader may decide; the other one entered it themselves
    expect(within(card).getAllByRole('button', { name: 'গ্রহণ করুন' })).toHaveLength(1);
    expect(
      within(card).getByText('নতুন উত্তরটি আপনি দিয়েছেন, তাই অন্য একজন কর্মকর্তা যাচাই করবেন।'),
    ).toBeInTheDocument();
    await expectNoAxeViolations(view.container);
    // sending back asks why
    await user.click(within(card).getByRole('button', { name: 'ফেরত দিন' }));
    const dialog = await screen.findByRole('dialog', { name: 'নতুন উত্তর ফেরত দিন' });
    await user.type(within(dialog).getByRole('textbox', { name: /অফিসের কারণ/ }), 'নাম মেলেনি');
    await user.click(within(dialog).getByRole('button', { name: 'ফেরত দিন' }));
    await waitFor(() => expect(decided).toHaveLength(1));
    expect(decided[0]).toEqual({
      id: '01900000-0000-7000-8000-0000000000f1',
      body: { decision: 'refuse', reason: 'নাম মেলেনি' },
    });
    await user.click(within(card).getByRole('button', { name: 'গ্রহণ করুন' }));
    await waitFor(() => expect(decided).toHaveLength(2));
    expect(decided[1]).toMatchObject({ body: { decision: 'accept' } });
    expect(await screen.findByText('নতুন উত্তর গ্রহণ করা হয়েছে।')).toBeInTheDocument();
  });

  it('links an entry to the profile its number has now, with a volunteer in charge', async () => {
    const user = userEvent.setup();
    refreshAs(EXECUTIVE);
    serve();
    const PERSON = '01900000-0000-7000-8000-0000000000b7';
    const VOLUNTEER_ID = '01900000-0000-7000-8000-0000000000d9';
    server.use(
      http.get(`*/api/v1/applications/${A1}`, () =>
        envelope(
          record({
            status: 'needs_verification',
            // the profile was made after the entry came: the flag does not say so
            flags: ['public_entry'],
            availableActions: ['verify_link', 'verify_create', 'reject_unverified'],
          }),
        ),
      ),
      http.post('*/api/v1/beneficiaries/lookup', () =>
        HttpResponse.json({
          data: {
            found: true,
            autofill: {
              beneficiaryId: PERSON,
              benNo: 7,
              name: 'পুরনো উপকারভোগী',
              fatherOrHusbandName: 'পুরনো পিতা',
              motherName: null,
              mobile: '01711111111',
              genderCode: 'female',
              dob: null,
              ageYears: null,
              divisionId: DISTRICT,
              districtId: DISTRICT,
              upazilaId: UNION,
              unionId: UNION,
              village: 'নমুনা গ্রাম',
              postOffice: null,
              postCode: null,
              landmark: null,
              members14Plus: null,
              childrenUnder14: null,
              lockedFields: [],
            },
          },
          meta: { requestId: 'r' },
        }),
      ),
      http.get(`*/api/v1/projects/${PROJECT}/volunteers`, () =>
        HttpResponse.json({
          data: [
            {
              id: '01900000-0000-7000-8000-0000000000d8',
              volunteerId: VOLUNTEER_ID,
              displayName: 'করিম উদ্দিন',
              type: 'general',
              regionLocationId: DISTRICT,
              permissionSet: 'application_distribution',
              isPaid: false,
              consentStatus: 'accepted',
              consentAt: null,
              applicationsCounted: 0,
              assignedAt: '2026-10-17T05:00:00Z',
            },
          ],
          meta: { requestId: 'r', nextCursor: null, prevCursor: null },
        }),
      ),
      http.post(`*/api/v1/applications/${A1}/actions/:action`, async ({ params, request }) => {
        acted.push({ action: String(params.action), body: await request.json() });
        return envelope(record({ status: 'submitted', availableActions: [] }), '"v2"');
      }),
    );
    const view = openReview();
    // a known number links; a new profile is not offered
    await user.click(await screen.findByRole('button', { name: 'যাচাই করুন' }));
    const dialog = await screen.findByRole('dialog', { name: 'এন্ট্রি যাচাই করুন' });
    expect(await within(dialog).findByText('BEN-0000007')).toBeInTheDocument();
    expect(within(dialog).getByText('পুরনো উপকারভোগী')).toBeInTheDocument();
    await expectNoAxeViolations(view.container);
    await user.click(
      within(dialog).getByRole('combobox', { name: /দায়িত্বপ্রাপ্ত স্বেচ্ছাসেবক/ }),
    );
    await user.click(await screen.findByRole('option', { name: 'করিম উদ্দিন' }));
    await user.click(within(dialog).getByRole('button', { name: 'যুক্ত করুন' }));
    await waitFor(() => expect(acted).toHaveLength(1));
    expect(acted[0]).toEqual({
      action: 'verify_link',
      body: { linkBeneficiaryId: PERSON, ownerVolunteerId: VOLUNTEER_ID },
    });
    expect(
      await screen.findByText('এন্ট্রিটি প্রোফাইলের সঙ্গে যুক্ত হয়েছে, আবেদনটি এখন পেন্ডিং।'),
    ).toBeInTheDocument();
  });

  it('creates a profile for a new number, names a blocked person, and tells of a failed lookup', async () => {
    const user = userEvent.setup();
    refreshAs(EXECUTIVE);
    serve();
    let answer: 'none' | 'blocked' | 'fail' = 'none';
    server.use(
      http.get(`*/api/v1/applications/${A1}`, () =>
        envelope(
          record({
            status: 'needs_verification',
            flags: ['public_entry'],
            availableActions: ['verify_link', 'verify_create', 'reject_unverified'],
          }),
        ),
      ),
      http.post('*/api/v1/beneficiaries/lookup', () =>
        answer === 'fail'
          ? apiError(403, 'permission.denied', 'অনুমতি নেই')
          : HttpResponse.json({
              data: answer === 'blocked' ? { found: true, blocked: true } : { found: false },
              meta: { requestId: 'r' },
            }),
      ),
      http.get(`*/api/v1/projects/${PROJECT}/volunteers`, () =>
        HttpResponse.json({
          data: [],
          meta: { requestId: 'r', nextCursor: null, prevCursor: null },
        }),
      ),
      http.post(`*/api/v1/applications/${A1}/actions/:action`, async ({ params, request }) => {
        acted.push({ action: String(params.action), body: await request.json() });
        return envelope(record({ status: 'submitted', availableActions: [] }), '"v2"');
      }),
    );
    const view = openReview();
    await user.click(await screen.findByRole('button', { name: 'যাচাই করুন' }));
    const dialog = await screen.findByRole('dialog', { name: 'এন্ট্রি যাচাই করুন' });
    await user.click(await within(dialog).findByRole('button', { name: 'তৈরি করুন' }));
    await waitFor(() => expect(acted).toHaveLength(1));
    expect(acted[0]).toEqual({ action: 'verify_create', body: {} });
    view.unmount();
    // an entry of a blocked person: the dialog names the block and takes no step
    answer = 'blocked';
    const again = openReview();
    await user.click(await screen.findByRole('button', { name: 'যাচাই করুন' }));
    const blocked = await screen.findByRole('dialog', { name: 'এন্ট্রি যাচাই করুন' });
    expect(
      await within(blocked).findByText('এই ব্যক্তি ব্লক করা আছেন। এন্ট্রিটি শুধু বাতিল করা যায়।'),
    ).toBeInTheDocument();
    expect(within(blocked).getByRole('button', { name: 'যুক্ত করুন' })).toBeDisabled();
    again.unmount();
    // a lookup that failed is an error to retry, never "no profile"
    answer = 'fail';
    resetClientForTests();
    openReview();
    await user.click(await screen.findByRole('button', { name: 'যাচাই করুন' }));
    const failed = await screen.findByRole('dialog', { name: 'এন্ট্রি যাচাই করুন' });
    expect(
      await within(failed).findByRole('button', { name: 'আবার চেষ্টা করুন' }),
    ).toBeInTheDocument();
    expect(within(failed).getByRole('button', { name: 'যুক্ত করুন' })).toBeDisabled();
  });

  it('reads in English too', async () => {
    refreshAs(EXECUTIVE);
    serve();
    const view = openReview('en');
    expect(await screen.findByRole('button', { name: 'Start review' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Change log' })).toBeInTheDocument();
    await expectNoAxeViolations(view.container);
  });
});

describe('the referral to the Media Team', () => {
  it('sends an approved application with its priority, note and story', async () => {
    const user = userEvent.setup();
    refreshAs(EXECUTIVE);
    serve();
    const sent: unknown[] = [];
    server.use(
      http.get(`*/api/v1/applications/${A1}`, () =>
        envelope(
          record({ status: 'approved', availableActions: [], mayReferToMedia: true, media: null }),
        ),
      ),
      http.post(`*/api/v1/applications/${A1}/media-referral`, async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({ data: {}, meta: {} }, { status: 201 });
      }),
    );
    const view = openReview();
    await user.click(await screen.findByRole('button', { name: 'মিডিয়া টিমে পাঠান' }));
    const dialog = await screen.findByRole('dialog', { name: 'মিডিয়া টিমে পাঠান' });
    expect(within(dialog).getByRole('button', { name: 'পাঠান' })).toBeDisabled();
    await user.click(within(dialog).getByRole('radio', { name: 'উচ্চ' }));
    await user.type(within(dialog).getByRole('textbox', { name: /^নোট/ }), 'ভালো গল্প');
    await user.type(
      within(dialog).getByRole('textbox', { name: /^গল্প \(ঐচ্ছিক\)/ }),
      'একাই সংসার চালান',
    );
    await expectNoAxeViolations(view.container);
    await user.click(within(dialog).getByRole('button', { name: 'পাঠান' }));
    await waitFor(() =>
      expect(sent).toEqual([{ priority: 'high', note: 'ভালো গল্প', story: 'একাই সংসার চালান' }]),
    );
    expect(await screen.findByText('মিডিয়া টিমে পাঠানো হলো')).toBeInTheDocument();
  });

  it('shows the media badge beside the state, and a returned referral with its comment to send again', async () => {
    refreshAs(EXECUTIVE);
    serve();
    server.use(
      http.get(`*/api/v1/applications/${A1}`, () =>
        envelope(
          record({
            status: 'approved',
            availableActions: [],
            mayReferToMedia: true,
            media: {
              referralId: 'r1',
              state: 'sent_back',
              priority: 'normal',
              decisionComment: 'পরিবারের ছবি তোলা যাবে কি না লিখুন',
              decidedAt: '2026-11-04T10:00:00Z',
              workStageCode: null,
            },
          }),
        ),
      ),
    );
    openReview();
    expect(await screen.findByText('মিডিয়া: সংশোধনে ফেরত')).toBeInTheDocument();
    expect(screen.getByText('ফেরতের কারণ: পরিবারের ছবি তোলা যাবে কি না লিখুন')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'আবার পাঠান' })).toBeInTheDocument();
  });

  it('offers nothing to send when the record does not allow it', async () => {
    refreshAs(EXECUTIVE);
    serve();
    server.use(
      http.get(`*/api/v1/applications/${A1}`, () =>
        envelope(
          record({ status: 'reviewed', availableActions: ['approve'], mayReferToMedia: false }),
        ),
      ),
    );
    openReview();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'নমুনা উপকারভোগী' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'মিডিয়া টিমে পাঠান' })).not.toBeInTheDocument();
  });
});

describe('the father’s or husband’s name on the record', () => {
  /** The label beside the father's or husband's name among the answers. */
  const labelOf = async () => (await screen.findByText('নমুনা পিতা')).closest('div')!;

  it.each([
    ['husband', 'স্বামীর নাম'],
    ['father', 'পিতার নাম'],
  ])('is called by the relation the record carries: %s', async (code, label) => {
    refreshAs(EXECUTIVE);
    serve();
    server.use(
      http.get(`*/api/v1/applications/${A1}`, () =>
        envelope(record({ guardianRelationCode: code })),
      ),
    );
    openReview();
    expect(within(await labelOf()).getByText(label)).toBeInTheDocument();
  });

  it('keeps the form’s own label where the relation is not known', async () => {
    refreshAs(EXECUTIVE);
    serve();
    server.use(
      http.get(`*/api/v1/applications/${A1}`, () =>
        envelope(record({ guardianRelationCode: null })),
      ),
    );
    openReview();
    const line = await labelOf();
    expect(within(line).queryByText('স্বামীর নাম')).not.toBeInTheDocument();
    expect(within(line).queryByText('পিতার নাম')).not.toBeInTheDocument();
  });
});

describe('a person without an identity document or a mobile', () => {
  const NO_DOCUMENT = bn.common.person.no_document;
  const THROUGH_VOLUNTEER = bn.common.person.through_volunteer;
  const BLOCK_MATCH = bn.applications.office.signals.flag.blocked_name_match;
  const CANDIDATE = '01900000-0000-7000-8000-0000000000b9';
  const withoutNumbers = record().answers.filter(
    (a) => a.fieldKey !== 'nid_or_birth_reg' && a.fieldKey !== 'mobile',
  );

  it('marks the row of the list with the two chips, and no other row', async () => {
    refreshAs(EXECUTIVE);
    serve([
      row(A1, { hasDocument: false, hasMobile: false }),
      row(A2, { beneficiaryName: 'দ্বিতীয় জন', hasDocument: true, hasMobile: true }),
    ]);
    openList();
    const light = (await screen.findByRole('link', { name: 'নমুনা উপকারভোগী' })).closest('tr')!;
    expect(within(light).getByText(NO_DOCUMENT)).toBeInTheDocument();
    expect(within(light).getByText(THROUGH_VOLUNTEER)).toBeInTheDocument();
    const full = screen.getByRole('link', { name: 'দ্বিতীয় জন' }).closest('tr')!;
    expect(within(full).queryByText(NO_DOCUMENT)).not.toBeInTheDocument();
    expect(within(full).queryByText(THROUGH_VOLUNTEER)).not.toBeInTheDocument();
  });

  it('shows the chip on the record and the volunteer in the place of the mobile answer', async () => {
    refreshAs(EXECUTIVE);
    serve();
    server.use(
      http.get(`*/api/v1/applications/${A1}`, () =>
        envelope(
          record({
            identityKind: 'none',
            hasDocument: false,
            hasMobile: false,
            answers: withoutNumbers,
          }),
        ),
      ),
    );
    openReview();
    expect(await screen.findByText(NO_DOCUMENT)).toBeInTheDocument();
    const answers = screen.getByRole('region', { name: 'basic_info' });
    expect(within(answers).getByText(THROUGH_VOLUNTEER)).toBeInTheDocument();
    expect(screen.queryByText('null')).not.toBeInTheDocument();
  });

  it('shows neither on the record of a person who has both, nor on one the server said nothing of', async () => {
    refreshAs(EXECUTIVE);
    serve();
    server.use(
      http.get(`*/api/v1/applications/${A1}`, () =>
        envelope(record({ hasDocument: true, hasMobile: true })),
      ),
    );
    const first = openReview();
    expect(await screen.findByText('01711111111')).toBeInTheDocument();
    expect(screen.queryByText(NO_DOCUMENT)).not.toBeInTheDocument();
    expect(screen.queryByText(THROUGH_VOLUNTEER)).not.toBeInTheDocument();
    first.unmount();
    // a reader who may not know: the mobile answer is withheld and nothing stands in its place
    resetClientForTests();
    server.use(
      http.get(`*/api/v1/applications/${A1}`, () =>
        envelope(record({ hasDocument: null, hasMobile: null, answers: withoutNumbers })),
      ),
    );
    openReview();
    expect(await screen.findByText('নমুনা পিতা')).toBeInTheDocument();
    expect(screen.queryByText(NO_DOCUMENT)).not.toBeInTheDocument();
    expect(screen.queryByText(THROUGH_VOLUNTEER)).not.toBeInTheDocument();
  });

  it('tells the official why an entry that looks like a blocked person waits, with that profile to compare, and makes a new person on their word', async () => {
    const user = userEvent.setup();
    refreshAs(EXECUTIVE);
    serve();
    const waiting = (flags: string[]) =>
      record({
        status: 'needs_verification',
        identityKind: null,
        beneficiaryId: null,
        flags,
        candidateBeneficiaryId: flags.includes('blocked_name_match') ? CANDIDATE : null,
        answers: withoutNumbers,
        availableActions: ['verify_link', 'verify_create', 'reject_unverified'],
      });
    let flags = ['blocked_name_match'];
    server.use(
      http.get(`*/api/v1/applications/${A1}`, () => envelope(waiting(flags))),
      http.get(`*/api/v1/projects/${PROJECT}/volunteers`, () =>
        HttpResponse.json({
          data: [],
          meta: { requestId: 'r', nextCursor: null, prevCursor: null },
        }),
      ),
      http.post(`*/api/v1/applications/${A1}/actions/:action`, async ({ params, request }) => {
        acted.push({ action: String(params.action), body: await request.json() });
        return envelope(record({ status: 'submitted', availableActions: [] }), '"v2"');
      }),
    );
    const view = openReview();
    // on the record, before the dialog opens
    expect(await screen.findByText(BLOCK_MATCH)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'যাচাই করুন' }));
    const dialog = await screen.findByRole('dialog', { name: 'এন্ট্রি যাচাই করুন' });
    expect(within(dialog).getByText(BLOCK_MATCH)).toBeInTheDocument();
    expect(
      within(dialog).getByRole('link', { name: bn.applications.office.verify.blocked_profile }),
    ).toHaveAttribute('href', `/admin/beneficiaries/${CANDIDATE}`);
    await user.click(within(dialog).getByRole('button', { name: 'তৈরি করুন' }));
    await waitFor(() => expect(acted).toHaveLength(1));
    expect(acted[0]).toEqual({ action: 'verify_create', body: {} });
    view.unmount();
    // an entry without a number that matched nobody says nothing of a block
    flags = ['public_entry'];
    resetClientForTests();
    openReview();
    await user.click(await screen.findByRole('button', { name: 'যাচাই করুন' }));
    const plain = await screen.findByRole('dialog', { name: 'এন্ট্রি যাচাই করুন' });
    expect(
      within(plain).getByText('এন্ট্রির তথ্য দিয়ে নতুন প্রোফাইল তৈরি হবে।'),
    ).toBeInTheDocument();
    expect(screen.queryByText(BLOCK_MATCH)).not.toBeInTheDocument();
  });

  it('shows the match the server finds when a new profile is asked for an entry that waits for another reason, with the profile to compare, and makes the person at the second press', async () => {
    const user = userEvent.setup();
    refreshAs(EXECUTIVE);
    serve();
    let flags = ['late_sync'];
    const sent: { action: string; version: string | null }[] = [];
    server.use(
      http.get(`*/api/v1/applications/${A1}`, () =>
        envelope(
          record({
            status: 'needs_verification',
            identityKind: null,
            beneficiaryId: null,
            flags,
            candidateBeneficiaryId: flags.includes('blocked_name_match') ? CANDIDATE : null,
            answers: withoutNumbers,
            availableActions: ['verify_link', 'verify_create', 'reject_unverified'],
          }),
          flags.includes('blocked_name_match') ? '"v2"' : '"v1"',
        ),
      ),
      http.get(`*/api/v1/projects/${PROJECT}/volunteers`, () =>
        HttpResponse.json({
          data: [],
          meta: { requestId: 'r', nextCursor: null, prevCursor: null },
        }),
      ),
      http.post(`*/api/v1/applications/${A1}/actions/:action`, ({ params, request }) => {
        sent.push({ action: String(params.action), version: request.headers.get('if-match') });
        if (flags.includes('blocked_name_match'))
          return envelope(record({ status: 'submitted', availableActions: [] }), '"v3"');
        // the server found the match: the entry stays waiting and now carries it
        flags = ['late_sync', 'blocked_name_match'];
        return apiError(409, 'application.verify_blocked_match', BLOCK_MATCH);
      }),
    );
    openReview();
    await user.click(await screen.findByRole('button', { name: 'যাচাই করুন' }));
    const dialog = await screen.findByRole('dialog', { name: 'এন্ট্রি যাচাই করুন' });
    expect(within(dialog).queryByText(BLOCK_MATCH)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'তৈরি করুন' }));
    // the dialog stays open with the line and the blocked person's profile to compare
    expect(await within(dialog).findByText(BLOCK_MATCH)).toBeInTheDocument();
    expect(
      await within(dialog).findByRole('link', {
        name: bn.applications.office.verify.blocked_profile,
      }),
    ).toHaveAttribute('href', `/admin/beneficiaries/${CANDIDATE}`);
    expect(within(dialog).getByText(bn.applications.office.verify.create_other_help)).toBeVisible();
    expect(sent).toEqual([{ action: 'verify_create', version: '"v1"' }]);
    // the official compared the two: the second press carries the version the entry has now
    await user.click(within(dialog).getByRole('button', { name: 'তৈরি করুন' }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]).toEqual({ action: 'verify_create', version: '"v2"' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'এন্ট্রি যাচাই করুন' })).not.toBeInTheDocument(),
    );
  });
});
