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

const fullRow = {
  id: ID,
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
      HttpResponse.json({ data: profile, meta: { requestId: 'req_test' } }),
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
        return HttpResponse.json({ data: empty360, meta: { requestId: 'req_test' } });
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
