import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiError, ME, refreshAs, renderApp } from '../../../test/auth';
import { definition, field, section } from '../../../test/forms';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../lib/api';
import { ApplicationReviewPage } from './ApplicationReviewPage';
import { ApplicationsPage } from './ApplicationsPage';

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
  availableActions: ['review', 'delete'],
  form,
  ...over,
});

let listCalls: string[];
let bulkBodies: unknown[];
let acted: { action: string; body: unknown }[];
let patched: { ifMatch: string | null; body: unknown }[];
function serve(
  rows: unknown[] = [row(A1), row(A2, { appNo: 'WC-2026-00013', beneficiaryName: 'দ্বিতীয় জন' })],
) {
  listCalls = [];
  bulkBodies = [];
  acted = [];
  patched = [];
  server.use(
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
    const grid = screen.getByRole('grid');
    await user.click(within(grid).getByRole('checkbox', { name: /নমুনা উপকারভোগী/ }));
    await user.click(within(grid).getByRole('checkbox', { name: /দ্বিতীয় জন/ }));
    expect(screen.getByText('2টি বাছাই করা')).toBeInTheDocument();
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
    const grid = await screen.findByRole('grid');
    await user.click(within(grid).getByRole('checkbox', { name: /নমুনা উপকারভোগী/ }));
    await user.click(within(grid).getByRole('checkbox', { name: /দ্বিতীয় জন/ }));
    expect(screen.getByRole('button', { name: 'রিভিউ শুরু' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'অনুমোদন করুন' }));
    await waitFor(() => expect(bulkBodies).toHaveLength(1));
    expect(bulkBodies[0]).toMatchObject({ action: 'approve' });
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

  it('reads in English too', async () => {
    refreshAs(EXECUTIVE);
    serve();
    const view = openReview('en');
    expect(await screen.findByRole('button', { name: 'Start review' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Change log' })).toBeInTheDocument();
    await expectNoAxeViolations(view.container);
  });
});
