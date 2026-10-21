import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../lib/api';
import { BeneficiariesPage } from './BeneficiariesPage';
import { BeneficiaryProfilePage } from './BeneficiaryProfilePage';

// The beneficiary tab and the 360° shell (SCR-044, SCR-045; DECISION_LOG O-67, D-094): counts,
// filters in the URL, the limited view of the Media Team and the sections. Test data only.
const PROJECT_ID = '01900000-0000-7000-8000-0000000000c1';
const HEAD: Me = { ...ME, roles: ['department_head'] };
const MEDIA: Me = { ...ME, roles: ['media_team'] };
const ID = '01900000-0000-7000-8000-0000000000b1';
const DIVISION = '01900000-0000-7000-8000-0000000000d1';
const DISTRICT = '01900000-0000-7000-8000-0000000000d2';
const UPAZILA = '01900000-0000-7000-8000-0000000000d3';
const PROJECT = '01900000-0000-7000-8000-0000000000c1';
const ETAG = 'W/"1760000000000"';
const NO_ACTIONS = {
  block: false,
  unblock: false,
  editContact: false,
  requestCorrection: false,
  decideCorrection: false,
  proposeMerge: false,
  merge: false,
  revertMerge: false,
};
/** What the server adds to every profile, whoever asks. */
const profileBase = {
  benNo: 123,
  mergedInto: null,
  actions: NO_ACTIONS,
  corrections: [],
  merges: [],
};

const fullRow = {
  id: ID,
  benNo: 123,
  name: 'নমুনা উপকারভোগী',
  fatherOrHusbandName: 'নমুনা স্বামী',
  classCode: 'widow',
  status: 'active',
  divisionId: DIVISION,
  districtId: DISTRICT,
  upazilaId: UPAZILA,
  unionId: DIVISION,
  village: 'নমুনা গ্রাম',
  mobile: '01911000001',
  isBlocked: false,
};
const mediaRow = {
  id: ID,
  benNo: 123,
  name: 'নমুনা উপকারভোগী',
  status: 'active',
  divisionId: DIVISION,
  districtId: DISTRICT,
  upazilaId: UPAZILA,
};

let listUrls: URL[];
let statUrls: URL[];

function serve(row: unknown, stats: unknown, profile?: unknown) {
  listUrls = [];
  statUrls = [];
  server.use(
    http.get('*/api/v1/projects', () =>
      HttpResponse.json({
        data: [
          {
            id: PROJECT_ID,
            code: 'WC',
            year: 2026,
            name: { bn: 'শীতবস্ত্র বিতরণ', en: 'Winter clothing' },
            status: 'active',
          },
        ],
        meta: { nextCursor: null, prevCursor: null },
      }),
    ),
    http.get('*/api/v1/beneficiaries', ({ request }) => {
      listUrls.push(new URL(request.url));
      return HttpResponse.json({
        data: [row],
        meta: { requestId: 'req_test', limit: 25, nextCursor: null, prevCursor: null, total: 1 },
      });
    }),
    http.get('*/api/v1/beneficiaries/statistics', ({ request }) => {
      statUrls.push(new URL(request.url));
      return HttpResponse.json({ data: stats, meta: { requestId: 'req_test' } });
    }),
    http.get('*/api/v1/beneficiaries/:id', () =>
      HttpResponse.json(
        { data: profile, meta: { requestId: 'req_test', etag: ETAG } },
        { headers: { ETag: ETAG } },
      ),
    ),
    http.get('*/api/v1/locations', () => HttpResponse.json({ data: [] })),
  );
}

const openList = (initialPath = '/admin/beneficiaries') =>
  renderApp(<BeneficiariesPage />, 'bn', { path: '/admin/beneficiaries', initialPath });
const openProfile = () =>
  renderApp(<BeneficiaryProfilePage />, 'bn', {
    path: '/admin/beneficiaries/:beneficiaryId',
    initialPath: `/admin/beneficiaries/${ID}`,
  });

beforeEach(() => {
  resetClientForTests();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('the beneficiary tab', () => {
  it('shows the counts and the rows, without accessibility violations', async () => {
    refreshAs(HEAD);
    serve(fullRow, { total: 2000000, assistedThisYear: 125000, blocked: 12 });
    const { container } = openList();
    const counts = await screen.findByRole('group', { name: 'উপকারভোগীর হিসাব' });
    expect(await within(counts).findByText('20,00,000')).toBeInTheDocument();
    expect(within(counts).getByRole('button', { name: 'ব্লক করা 12' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect((await screen.findAllByText('নমুনা উপকারভোগী')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('বিধবা').length).toBeGreaterThan(0);
    await expectNoAxeViolations(container);
  });

  it('keeps the year filter in the URL and restores the filters from it', async () => {
    refreshAs(HEAD);
    serve(fullRow, { total: 1, assistedThisYear: 0, blocked: 0 });
    // the year list counts back from today: a fixed date keeps the options the same
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T06:00:00Z'));
    const user = userEvent.setup();
    const { router } = openList(`/admin/beneficiaries?type=widow&blocked=false`);
    await waitFor(() => expect(listUrls.length).toBeGreaterThan(0));
    expect(listUrls[0]!.searchParams.get('type')).toBe('widow');
    expect(listUrls[0]!.searchParams.get('blocked')).toBe('false');
    const year = '2025';
    await user.click(await screen.findByRole('button', { name: /^ফিল্টার/, expanded: false }));
    // the filters from the URL show as chips
    expect(screen.getByRole('button', { name: 'ধরন: বিধবা সরান' })).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /বছর$/ }));
    await user.click(await screen.findByRole('option', { name: year }));
    await waitFor(() => expect(router.state.location.search).toContain(`year=${year}`));
    await user.type(screen.getByRole('searchbox'), '01911000001');
    await waitFor(() => expect(listUrls.at(-1)?.searchParams.get('q')).toBe('01911000001'));
    expect(router.state.location.search).not.toContain('01911000001');
  });

  it('gives the Media Team no type, blocklist or union filter and no hidden columns', async () => {
    refreshAs(MEDIA);
    serve(mediaRow, { total: 1, assistedThisYear: 0 });
    const user = userEvent.setup();
    openList();
    expect((await screen.findAllByText('নমুনা উপকারভোগী')).length).toBeGreaterThan(0);
    await user.click(await screen.findByRole('button', { name: /^ফিল্টার/, expanded: false }));
    expect(screen.queryByRole('button', { name: /ধরন/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ব্লকলিস্ট/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ইউনিয়ন/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /উপজেলা/ }).length).toBeGreaterThan(0);
    expect(
      screen.queryByRole('columnheader', { name: 'পিতা বা স্বামীর নাম' }),
    ).not.toBeInTheDocument();
    const counts = await screen.findByRole('group', { name: 'উপকারভোগীর হিসাব' });
    expect(within(counts).queryByText('ব্লক করা')).not.toBeInTheDocument();
  });

  it('filters by the blocked count without narrowing the counts, shows the assisted count as a number, and offers the profile from the row menu', async () => {
    refreshAs(HEAD);
    serve(fullRow, { total: 3, assistedThisYear: 2, blocked: 1 });
    const user = userEvent.setup();
    const { router } = openList();
    const counts = await screen.findByRole('group', { name: 'উপকারভোগীর হিসাব' });
    // approved help this year matches no list filter, so its card is not a button
    expect(await within(counts).findByText('এই বছর সহায়তা পেয়েছেন')).toBeInTheDocument();
    expect(
      within(counts).queryByRole('button', { name: /^এই বছর সহায়তা পেয়েছেন/ }),
    ).not.toBeInTheDocument();
    await user.click(within(counts).getByRole('button', { name: 'ব্লক করা 1', pressed: false }));
    await waitFor(() => expect(router.state.location.search).toBe('?blocked=true'));
    await waitFor(() => expect(listUrls.at(-1)?.searchParams.get('blocked')).toBe('true'));
    expect(statUrls.at(-1)?.searchParams.get('blocked')).toBeNull();
    const table = screen.getByRole('grid', { name: 'উপকারভোগী' });
    await user.click(within(table).getByRole('button', { name: 'নমুনা উপকারভোগী-এর কাজ' }));
    expect(await screen.findByRole('menuitem', { name: 'প্রোফাইল দেখুন' })).toHaveAttribute(
      'href',
      expect.stringContaining('/admin/beneficiaries/'),
    );
  });

  it('shows the forbidden content to a volunteer', async () => {
    refreshAs({ ...ME, kind: 'volunteer', roles: ['volunteer_general'] });
    serve(fullRow, {});
    openList();
    expect(await screen.findByRole('heading', { level: 1 })).not.toHaveTextContent('উপকারভোগী');
    // give a stray request the time to arrive before saying there was none
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(listUrls).toEqual([]);
  });
});

const empty360 = {
  ...fullRow,
  ...profileBase,
  motherName: null,
  genderCode: 'female',
  ageYears: 62,
  classOtherText: null,
  occupationCode: null,
  photoFileId: null,
  postOffice: null,
  postCode: null,
  landmark: null,
  familyMembers: [],
  isBlocked: false,
  projectsByYear: [],
  applications: [],
  distributions: [],
  dawah: { attendance: [], progress: [], exams: [] },
  followUps: { calls: [], evaluations: [] },
  activities: [],
};

describe('the 360° profile', () => {
  it('shows every section with an empty state, and the NID as not shown when the server left it out', async () => {
    refreshAs(HEAD);
    serve(fullRow, {}, empty360);
    const { container } = openProfile();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'নমুনা উপকারভোগী' }),
    ).toBeInTheDocument();
    for (const section of [
      'মূল তথ্য',
      'ঠিকানা',
      'পরিবার',
      'বছরভিত্তিক প্রজেক্ট',
      'আবেদনের ইতিহাস',
      'বিতরণ ও বাস্তবায়ন',
      'দাওয়াহ',
      'ফলো-আপ',
      'কার্যক্রমের ইতিহাস',
    ])
      expect(screen.getByRole('heading', { level: 2, name: section })).toBeInTheDocument();
    expect(screen.getAllByText('এখনো কিছু নেই।').length).toBeGreaterThan(5);
    expect(screen.getByText('আপনার জন্য দেখানো হয় না')).toBeInTheDocument();
    // the gender in its section and as a chip of the header
    expect(screen.getAllByText('নারী')).toHaveLength(2);
    await expectNoAxeViolations(container);
  });

  it('lists the projects by year and the application history', async () => {
    refreshAs(HEAD);
    serve(
      fullRow,
      {},
      {
        ...empty360,
        nid: '1000000000777',
        projectsByYear: [
          {
            year: 2026,
            projects: [
              {
                id: PROJECT,
                code: 'WIN26',
                nameBn: 'শীতবস্ত্র 2026',
                nameEn: 'Winter 2026',
                status: 'approved',
              },
            ],
          },
        ],
        applications: [
          {
            id: '01900000-0000-7000-8000-0000000000a9',
            appNo: 'APP-2026-0001',
            projectId: PROJECT,
            status: 'approved',
            submittedAt: '2026-10-01T04:00:00.000Z',
            reviewedAt: null,
            approvedAt: null,
          },
        ],
      },
    );
    openProfile();
    expect(await screen.findByText('1000000000777')).toBeInTheDocument();
    expect(screen.getByText('APP-2026-0001')).toBeInTheDocument();
    expect(screen.getAllByText(/শীতবস্ত্র 2026/).length).toBeGreaterThan(0);
  });

  it('refuses a volunteer without asking the server', async () => {
    refreshAs({ ...ME, kind: 'volunteer', roles: ['volunteer_general'] });
    let asked = false;
    server.use(
      http.get('*/api/v1/beneficiaries/:id', () => {
        asked = true;
        return HttpResponse.json({ data: empty360, meta: { requestId: 'req_test', etag: ETAG } });
      }),
    );
    openProfile();
    expect(await screen.findByRole('heading', { level: 1 })).not.toHaveTextContent(
      'নমুনা উপকারভোগী',
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(asked).toBe(false);
  });

  it('says when the beneficiary is not found, and offers a retry on an error', async () => {
    refreshAs(HEAD);
    server.use(
      http.get('*/api/v1/beneficiaries/:id', () =>
        HttpResponse.json(
          { error: { code: 'permission.not_found', message: 'Not found.', requestId: 'r' } },
          { status: 404 },
        ),
      ),
    );
    const first = openProfile();
    expect(await screen.findByText('এই উপকারভোগীকে পাওয়া যায়নি।')).toBeInTheDocument();
    first.unmount();
    resetClientForTests();
    let calls = 0;
    server.use(
      http.get('*/api/v1/beneficiaries/:id', () => {
        calls += 1;
        return HttpResponse.json(
          { error: { code: 'rate_limit.exceeded', message: 'Too many.', requestId: 'r' } },
          { status: 429 },
        );
      }),
    );
    const user = userEvent.setup();
    openProfile();
    await user.click(await screen.findByRole('button', { name: /আবার চেষ্টা করুন/ }));
    await waitFor(() => expect(calls).toBe(2));
  });

  it('shows no identity chip when the server left the NID out, even with a birth registration number', async () => {
    refreshAs(HEAD);
    const { nid: _nid, ...withoutNid } = empty360 as typeof empty360 & { nid?: unknown };
    serve(fullRow, {}, { ...withoutNid, birthReg: '20171234567890123' });
    openProfile();
    await screen.findByRole('heading', { level: 1, name: 'নমুনা উপকারভোগী' });
    expect(screen.queryByText(/^NID বা জন্মনিবন্ধন:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/20171234567890123/)).not.toBeInTheDocument();
    expect(screen.getByText('আপনার জন্য দেখানো হয় না')).toBeInTheDocument();
  });

  it('shows the Media Team only the sections the server sent', async () => {
    refreshAs(MEDIA);
    serve(
      mediaRow,
      {},
      {
        ...mediaRow,
        ...profileBase,
        projectsByYear: [],
        distributions: [],
      },
    );
    openProfile();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'নমুনা উপকারভোগী' }),
    ).toBeInTheDocument();
    for (const section of ['পরিবার', 'আবেদনের ইতিহাস', 'দাওয়াহ', 'ফলো-আপ', 'কার্যক্রমের ইতিহাস'])
      expect(screen.queryByRole('heading', { level: 2, name: section })).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'বিতরণ ও বাস্তবায়ন' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('নমুনা স্বামী')).not.toBeInTheDocument();
  });
});

const RPM: Me = { ...ME, roles: ['regional_program_manager'] };
const OTHER_ID = '01900000-0000-7000-8000-0000000000e9';
const REQUEST_ID = '01900000-0000-7000-8000-0000000000f1';
const ALL_ACTIONS = { ...NO_ACTIONS, block: true, editContact: true, requestCorrection: true };
const LOOKUP_BUTTON = 'NID / জন্মনিবন্ধন দিয়ে খুঁজুন';

describe('BEN numbers and the lookup', () => {
  it('shows the BEN number of each row and offers the lookup to the RPM, not to the Media Team', async () => {
    refreshAs(RPM);
    serve(fullRow, { total: 1, assistedThisYear: 0, blocked: 0 });
    const first = openList();
    expect((await screen.findAllByText('BEN-0000123')).length).toBeGreaterThan(0);
    expect(screen.getByRole('columnheader', { name: 'BEN নম্বর' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: LOOKUP_BUTTON })).toBeInTheDocument();
    first.unmount();
    resetClientForTests();
    refreshAs(MEDIA);
    serve(mediaRow, { total: 1, assistedThisYear: 0 });
    openList();
    expect((await screen.findAllByText('BEN-0000123')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: LOOKUP_BUTTON })).not.toBeInTheDocument();
  });

  it('looks a number up inside the chosen project and links to the found profile', async () => {
    refreshAs(RPM);
    serve(fullRow, { total: 1, assistedThisYear: 0, blocked: 0 });
    let body: unknown;
    server.use(
      http.post('*/api/v1/beneficiaries/lookup', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          data: {
            found: true,
            blocked: false,
            alreadyAppliedInProject: false,
            mobileIsCallerOwn: false,
            autofill: {
              beneficiaryId: ID,
              benNo: 123,
              name: 'নমুনা উপকারভোগী',
              fatherOrHusbandName: 'নমুনা স্বামী',
              motherName: null,
              mobile: '01911000001',
              genderCode: 'female',
              dob: null,
              ageYears: 62,
              divisionId: DIVISION,
              districtId: DISTRICT,
              upazilaId: UPAZILA,
              unionId: DIVISION,
              village: 'নমুনা গ্রাম',
              postOffice: null,
              postCode: null,
              landmark: null,
              members14Plus: null,
              childrenUnder14: null,
              lockedFields: ['name', 'father_or_husband_name', 'nid', 'birth_reg'],
            },
          },
          meta: { requestId: 'req_test' },
        });
      }),
    );
    const user = userEvent.setup();
    openList();
    await user.click(await screen.findByRole('button', { name: LOOKUP_BUTTON }));
    const dialog = await screen.findByRole('dialog', { name: 'NID বা জন্মনিবন্ধন দিয়ে খুঁজুন' });
    const search = within(dialog).getByRole('button', { name: 'খুঁজুন' });
    // nothing is asked before a project is chosen
    expect(search).toBeDisabled();
    await user.click(await within(dialog).findByRole('button', { name: /প্রকল্প/ }));
    await user.click(await screen.findByRole('option', { name: 'শীতবস্ত্র বিতরণ 2026 (WC)' }));
    await user.type(within(dialog).getByRole('textbox', { name: /NID নম্বর/ }), '1000001000');
    await user.click(search);
    expect(
      await within(dialog).findByText('প্রোফাইল পাওয়া গেছে: BEN-0000123'),
    ).toBeInTheDocument();
    expect(body).toEqual({ nid: '1000001000', projectId: PROJECT_ID });
    expect(within(dialog).getByRole('link', { name: 'প্রোফাইল দেখুন' })).toHaveAttribute(
      'href',
      `/admin/beneficiaries/${ID}`,
    );
  });
});

describe('the profile actions', () => {
  it('shows the BEN number and no action without its flag', async () => {
    refreshAs(HEAD);
    serve(fullRow, {}, empty360);
    openProfile();
    await screen.findByRole('heading', { level: 1, name: 'নমুনা উপকারভোগী' });
    expect(screen.getAllByText(/BEN-0000123/).length).toBeGreaterThan(0);
    for (const name of [
      'যোগাযোগের তথ্য বদলান',
      'সংশোধনের অনুরোধ করুন',
      'ব্লকলিস্টে দিন',
      'ব্লক তুলুন',
    ])
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  });

  it('offers each action whose flag is set, and the lift of a block instead of a block', async () => {
    refreshAs(RPM);
    serve(fullRow, {}, { ...empty360, actions: ALL_ACTIONS });
    const first = openProfile();
    for (const name of ['যোগাযোগের তথ্য বদলান', 'সংশোধনের অনুরোধ করুন', 'ব্লকলিস্টে দিন'])
      expect(await screen.findByRole('button', { name })).toBeInTheDocument();
    first.unmount();
    resetClientForTests();
    serve(fullRow, {}, { ...empty360, isBlocked: true, actions: { ...NO_ACTIONS, unblock: true } });
    openProfile();
    expect(await screen.findByRole('button', { name: 'ব্লক তুলুন' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ব্লকলিস্টে দিন' })).not.toBeInTheDocument();
  });

  it('saves a new mobile with the version of the profile and shows the shared-mobile warning', async () => {
    refreshAs(RPM);
    serve(fullRow, {}, { ...empty360, actions: ALL_ACTIONS });
    let sent: { ifMatch: string | null; body: unknown } | undefined;
    server.use(
      http.patch('*/api/v1/beneficiaries/:id/contact', async ({ request }) => {
        sent = { ifMatch: request.headers.get('If-Match'), body: await request.json() };
        return HttpResponse.json({
          data: {
            ...fullRow,
            mobile: '01911000002',
            postOffice: null,
            postCode: null,
            landmark: null,
            warnings: [{ code: 'beneficiary.mobile_shared', count: 1, benNos: ['BEN-0000077'] }],
          },
          meta: { requestId: 'req_test', etag: ETAG },
        });
      }),
    );
    const user = userEvent.setup();
    openProfile();
    await user.click(await screen.findByRole('button', { name: 'যোগাযোগের তথ্য বদলান' }));
    const dialog = await screen.findByRole('dialog', { name: 'যোগাযোগের তথ্য বদলান' });
    const save = within(dialog).getByRole('button', { name: 'সংরক্ষণ করুন' });
    // nothing changed yet, so there is nothing to save
    expect(save).toBeDisabled();
    const mobile = within(dialog).getByRole('textbox', { name: /মোবাইল/ });
    await user.clear(mobile);
    await user.type(mobile, '01911000002');
    await user.click(save);
    expect(
      await screen.findByText('এই মোবাইল নম্বর আরও 1টি প্রোফাইলে আছে: BEN-0000077'),
    ).toBeInTheDocument();
    expect(sent).toEqual({ ifMatch: ETAG, body: { mobile: '01911000002' } });
  });

  it("lets a deciding official approve or reject another official's correction request", async () => {
    refreshAs(ME);
    const request = {
      id: REQUEST_ID,
      beneficiaryId: ID,
      field: 'name',
      oldValue: 'নমুনা উপকারভোগী',
      newValue: 'নমুনা উপকারভোগী বেগম',
      reason: 'জাতীয় পরিচয়পত্রে এই নাম',
      status: 'submitted',
      requestedBy: OTHER_ID,
      requestedAt: '2026-10-20T04:00:00.000Z',
      decidedBy: null,
      decidedAt: null,
    };
    serve(
      fullRow,
      {},
      {
        ...empty360,
        actions: { ...NO_ACTIONS, decideCorrection: true },
        corrections: [request, { ...request, id: OTHER_ID, requestedBy: ME.id }],
      },
    );
    const decisions: unknown[] = [];
    server.use(
      http.post('*/api/v1/beneficiary-corrections/:requestId/decision', async ({ request: r }) => {
        decisions.push(await r.json());
        return HttpResponse.json({
          data: { ...request, status: 'approved' },
          meta: { requestId: 'req_test' },
        });
      }),
    );
    const user = userEvent.setup();
    const { container } = openProfile();
    const heading = await screen.findByRole('heading', { level: 2, name: 'সংশোধনের অনুরোধ' });
    const section = heading.closest('section') ?? document.body;
    // the caller's own request gets no decision buttons
    expect(within(section).getAllByRole('button', { name: 'অনুমোদন করুন' })).toHaveLength(1);
    await expectNoAxeViolations(container);

    await user.click(within(section).getByRole('button', { name: 'নাকচ করুন' }));
    const reject = await screen.findByRole('dialog', {
      name: 'নাম-এর সংশোধনের অনুরোধ নাকচ করবেন?',
    });
    await user.type(within(reject).getByRole('textbox', { name: /কারণ/ }), 'প্রমাণ মেলেনি');
    await user.click(within(reject).getByRole('button', { name: 'নাকচ করুন' }));
    await waitFor(() =>
      expect(decisions).toEqual([{ decision: 'reject', reason: 'প্রমাণ মেলেনি' }]),
    );

    await user.click(within(section).getByRole('button', { name: 'অনুমোদন করুন' }));
    const approve = await screen.findByRole('alertdialog');
    await user.click(within(approve).getByRole('button', { name: 'অনুমোদন করুন' }));
    await waitFor(() => expect(decisions).toHaveLength(2));
    expect(decisions[1]).toEqual({ decision: 'approve' });
  });

  it('blocks a beneficiary with a reason', async () => {
    refreshAs(RPM);
    serve(fullRow, {}, { ...empty360, actions: ALL_ACTIONS });
    let body: unknown;
    server.use(
      http.post('*/api/v1/beneficiaries/:id/block', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: {}, meta: { requestId: 'req_test' } }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    openProfile();
    await user.click(await screen.findByRole('button', { name: 'ব্লকলিস্টে দিন' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(
      within(dialog).getByText(
        'ব্লক থাকা অবস্থায় এই ব্যক্তির জন্য কোনো প্রকল্পে নতুন আবেদন করা যাবে না। চলমান আবেদন আগের মতোই চলবে।',
      ),
    ).toBeInTheDocument();
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), 'ভুয়া তথ্য দিয়েছেন');
    await user.click(within(dialog).getByRole('button', { name: 'ব্লক করুন' }));
    expect(await screen.findByText('উপকারভোগীকে ব্লকলিস্টে দেওয়া হয়েছে')).toBeInTheDocument();
    expect(body).toEqual({ reason: 'ভুয়া তথ্য দিয়েছেন' });
  });

  it('leads from a merged profile to the kept one and lists the history sections, in English too', async () => {
    refreshAs(HEAD);
    serve(
      fullRow,
      {},
      {
        ...empty360,
        mergedInto: { id: OTHER_ID, benNo: 77 },
        contactLog: [
          {
            field: 'mobile',
            oldValue: '01911000000',
            newValue: '01911000001',
            by: null,
            at: '2026-10-19T04:00:00.000Z',
          },
        ],
        blocks: [
          {
            id: REQUEST_ID,
            reason: 'ভুয়া তথ্য',
            active: false,
            blockedAt: '2026-10-01T04:00:00.000Z',
            releasedAt: '2026-10-05T04:00:00.000Z',
            releaseReason: 'তথ্য ঠিক হয়েছে',
          },
        ],
        merges: [
          {
            id: REQUEST_ID,
            role: 'merged',
            otherId: OTHER_ID,
            otherBenNo: 77,
            status: 'merged',
            mergedAt: '2026-10-18T04:00:00.000Z',
            revertedAt: null,
            leftBehind: 1,
          },
        ],
        files: [{ fileId: REQUEST_ID, slot: 'photo', kind: 'profile_photo' }],
      },
    );
    const first = openProfile();
    expect(
      await screen.findByText('এই প্রোফাইল BEN-0000077 প্রোফাইলে মার্জ হয়েছে।'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'রাখা প্রোফাইল দেখুন' })).toHaveAttribute(
      'href',
      `/admin/beneficiaries/${OTHER_ID}`,
    );
    for (const section of [
      'যোগাযোগের তথ্যের পরিবর্তন',
      'ব্লকের ইতিহাস',
      'মার্জের ইতিহাস',
      'ছবি ও ফাইল',
    ])
      expect(screen.getByRole('heading', { level: 2, name: section })).toBeInTheDocument();
    expect(screen.getByText('01911000000 থেকে 01911000001')).toBeInTheDocument();
    expect(screen.getByText('প্রোফাইল ছবি')).toBeInTheDocument();
    first.unmount();
    const { container } = renderApp(<BeneficiaryProfilePage />, 'en', {
      path: '/admin/beneficiaries/:beneficiaryId',
      initialPath: `/admin/beneficiaries/${ID}`,
    });
    expect(
      await screen.findByText('This profile was merged into BEN-0000077.'),
    ).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});
