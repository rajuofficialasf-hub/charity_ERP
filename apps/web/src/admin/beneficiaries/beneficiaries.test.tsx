import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../api/client';
import { BeneficiariesPage } from './BeneficiariesPage';
import { BeneficiaryProfilePage } from './BeneficiaryProfilePage';
import { bn, type MessageKey } from '@css/shared/i18n';
import { expectOnScreenColumns, serveExports } from '../../../test/msw/exports';
import { stubScreen } from '../../../test/match-media';

// The beneficiary tab and the 360° shell (docs/ui/SCREENS.md "Beneficiary tab" and "Beneficiary 360 profile and merge"): counts,
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
  addIdentity: false,
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
  it('offers the export, with the table’s own columns ticked first, in its order', async () => {
    refreshAs(HEAD);
    serve(fullRow, { total: 2, assistedThisYear: 1, blocked: 0 });
    serveExports('beneficiaries');
    const user = userEvent.setup();
    openList();
    // the BEN number's column is the page's "ben", the times helped its "helps"
    const PAGE_COLUMN = new Map([
      ['ben_no', 'ben'],
      ['help_count', 'helps'],
    ]);
    await expectOnScreenColumns(
      user,
      'beneficiaries',
      (id) => `admin.beneficiaries.column.${PAGE_COLUMN.get(id) ?? id}` as MessageKey,
    );
  });

  it('shows the counts and the rows, without accessibility violations', async () => {
    refreshAs(HEAD);
    serve(fullRow, { total: 2000000, assistedThisYear: 125000, blocked: 12 });
    const { container } = openList();
    const counts = await screen.findByRole('group', { name: 'উপকারভোগীর হিসাব' });
    expect(await within(counts).findByText('20,00,000')).toBeInTheDocument();
    // the page header: the area and what the page is for, above the known title
    expect(screen.getByText('উপকারভোগী সেবা')).toBeInTheDocument();
    expect(
      screen.getByText('নিবন্ধন, যাচাই, সহায়তা এবং সেবার ইতিহাস এক জায়গা থেকে পরিচালনা করুন।'),
    ).toBeInTheDocument();
    // the name opens the person's profile
    expect(screen.getAllByRole('link', { name: 'নমুনা উপকারভোগী' })[0]).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/admin\/beneficiaries\/[0-9a-f-]+$/),
    );
    expect(within(counts).getByRole('button', { name: 'ব্লক লিস্ট 12' })).toHaveAttribute(
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
    await user.click(await screen.findByRole('combobox', { name: /বছর/ }));
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
    expect(screen.queryByRole('combobox', { name: /ইউনিয়ন/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('combobox', { name: /উপজেলা/ }).length).toBeGreaterThan(0);
    expect(
      screen.queryByRole('columnheader', { name: 'পিতা বা স্বামীর নাম' }),
    ).not.toBeInTheDocument();
    const counts = await screen.findByRole('group', { name: 'উপকারভোগীর হিসাব' });
    expect(within(counts).queryByText('ব্লক লিস্ট')).not.toBeInTheDocument();
  });

  it('shows the times helped, filters the people helped more than once in a year and orders by the count, all in the URL', async () => {
    refreshAs(HEAD);
    serve({ ...fullRow, helpCount: 3 }, { total: 1, assistedThisYear: 0, blocked: 0 });
    const user = userEvent.setup();
    const { router } = openList();
    const table = await screen.findByRole('table', { name: 'উপকারভোগী' });
    expect(within(table).getByRole('columnheader', { name: /কতবার সাহায্য/ })).toBeInTheDocument();
    expect(await within(table).findByText('3')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /^ফিল্টার/, expanded: false }));
    await user.click(await screen.findByRole('combobox', { name: /সাহায্য/ }));
    await user.click(await screen.findByRole('option', { name: 'এক বছরে একাধিকবার পেয়েছেন' }));
    await waitFor(() =>
      expect(router.state.location.search).toContain('helpedMoreThanOnceInYear=true'),
    );
    await waitFor(() =>
      expect(listUrls.at(-1)?.searchParams.get('helpedMoreThanOnceInYear')).toBe('true'),
    );
    expect(statUrls.at(-1)?.searchParams.get('helpedMoreThanOnceInYear')).toBe('true');
    // the order by the count: from the column's header, kept in the URL, never sent to the counts;
    // the first press orders the fewest first, the second the most first
    const sortOf = () => new URLSearchParams(router.state.location.search).get('sort');
    await user.click(within(table).getByRole('button', { name: /কতবার সাহায্য/ }));
    await waitFor(() => expect(sortOf()).toBe('helpCount'));
    await waitFor(() => expect(listUrls.at(-1)?.searchParams.get('sort')).toBe('helpCount'));
    expect(
      screen.getByRole('button', { name: 'ক্রম: সাহায্য কম থেকে বেশি সরান' }),
    ).toBeInTheDocument();
    await user.click(
      within(await screen.findByRole('table', { name: 'উপকারভোগী' })).getByRole('button', {
        name: /কতবার সাহায্য/,
      }),
    );
    await waitFor(() => expect(sortOf()).toBe('-helpCount'));
    await waitFor(() => expect(listUrls.at(-1)?.searchParams.get('sort')).toBe('-helpCount'));
    expect(
      screen.getByRole('button', { name: 'ক্রম: সাহায্য বেশি থেকে কম সরান' }),
    ).toBeInTheDocument();
    expect(statUrls.every((u) => !u.searchParams.has('sort'))).toBe(true);
  });

  it('restores the order from the URL and takes it away with its chip', async () => {
    refreshAs(HEAD);
    serve({ ...fullRow, helpCount: 3 }, { total: 1, assistedThisYear: 0, blocked: 0 });
    const user = userEvent.setup();
    const { router } = openList('/admin/beneficiaries?sort=-helpCount');
    await waitFor(() => expect(listUrls[0]?.searchParams.get('sort')).toBe('-helpCount'));
    await user.click(await screen.findByRole('button', { name: /^ফিল্টার/, expanded: false }));
    await user.click(screen.getByRole('button', { name: 'ক্রম: সাহায্য বেশি থেকে কম সরান' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
    await waitFor(() => expect(listUrls.at(-1)?.searchParams.has('sort')).toBe(false));
  });

  it('gives the Media Team no times helped, no repeat filter and no order, whatever the URL says', async () => {
    refreshAs(MEDIA);
    serve(mediaRow, { total: 1, assistedThisYear: 0 });
    const user = userEvent.setup();
    openList('/admin/beneficiaries?helpedMoreThanOnceInYear=true&sort=-helpCount');
    expect((await screen.findAllByText('নমুনা উপকারভোগী')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('columnheader', { name: /কতবার সাহায্য/ })).not.toBeInTheDocument();
    expect(listUrls[0]!.searchParams.has('helpedMoreThanOnceInYear')).toBe(false);
    expect(listUrls[0]!.searchParams.has('sort')).toBe(false);
    await user.click(await screen.findByRole('button', { name: /^ফিল্টার/, expanded: false }));
    expect(screen.queryByRole('combobox', { name: /সাহায্য/ })).not.toBeInTheDocument();
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
    await user.click(within(counts).getByRole('button', { name: 'ব্লক লিস্ট 1', pressed: false }));
    await waitFor(() => expect(router.state.location.search).toBe('?blocked=true'));
    await waitFor(() => expect(listUrls.at(-1)?.searchParams.get('blocked')).toBe('true'));
    expect(statUrls.at(-1)?.searchParams.get('blocked')).toBeNull();
    const table = await screen.findByRole('table', { name: 'উপকারভোগী' });
    await user.click(await within(table).findByRole('button', { name: 'নমুনা উপকারভোগী-এর কাজ' }));
    expect(await screen.findByRole('menuitem', { name: 'প্রোফাইল দেখুন' })).toHaveAttribute(
      'href',
      expect.stringContaining('/admin/beneficiaries/'),
    );
  });

  it('counts the men and the women, and a press on one filters the list without narrowing the counts', async () => {
    refreshAs(HEAD);
    serve(fullRow, { total: 30, assistedThisYear: 2, blocked: 1, male: 12, female: 18 });
    const user = userEvent.setup();
    const { router } = openList();
    const counts = await screen.findByRole('group', { name: 'উপকারভোগীর হিসাব' });
    expect(await within(counts).findByRole('button', { name: 'পুরুষ 12' })).toBeInTheDocument();
    // everyone, the men, the women, those assisted this year, the blocklist
    const order = ['মোট উপকারভোগী', 'পুরুষ', 'মহিলা', 'এই বছর সহায়তা পেয়েছেন', 'ব্লক লিস্ট'].map(
      (label) => counts.textContent!.indexOf(label),
    );
    expect(order.every((at, i) => at >= 0 && (i === 0 || at > order[i - 1]!))).toBe(true);
    await user.click(within(counts).getByRole('button', { name: 'মহিলা 18', pressed: false }));
    await waitFor(() => expect(router.state.location.search).toBe('?gender=female'));
    await waitFor(() => expect(listUrls.at(-1)?.searchParams.get('gender')).toBe('female'));
    expect(statUrls.at(-1)?.searchParams.get('gender')).toBeNull();
    expect(within(counts).getByRole('button', { name: 'মহিলা 18' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // the chosen gender is a filter chip too, and the chip takes it away
    await user.click(screen.getByRole('button', { name: /লিঙ্গ: মহিলা/ }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('shows no gender counts to a caller who does not see the gender', async () => {
    refreshAs(HEAD);
    serve(fullRow, { total: 30, assistedThisYear: 2 });
    openList();
    const counts = await screen.findByRole('group', { name: 'উপকারভোগীর হিসাব' });
    expect(await within(counts).findByText('মোট উপকারভোগী')).toBeInTheDocument();
    expect(within(counts).queryByText('পুরুষ')).toBeNull();
    expect(within(counts).queryByText('মহিলা')).toBeNull();
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
    // in the banner's facts and in the identity section
    expect((await screen.findAllByText('1000000000777')).length).toBeGreaterThan(0);
    expect(screen.getByText('APP-2026-0001')).toBeInTheDocument();
    expect(screen.getAllByText(/শীতবস্ত্র 2026/).length).toBeGreaterThan(0);
  });

  it('says how often the person was helped, with the marks and the number of a repeated year', async () => {
    refreshAs(HEAD);
    const winter = { id: PROJECT, code: 'WIN26', nameBn: 'শীতবস্ত্র 2026', nameEn: 'Winter 2026' };
    const help = {
      total: 5,
      firstYear: 2023,
      thisYear: 2,
      repeatedInYear: true,
      repeatedInProject: true,
      years: [
        { year: 2026, count: 2, projects: [{ ...winter, count: 2 }], unnamed: 0 },
        {
          year: 2024,
          count: 2,
          projects: [
            {
              id: '01900000-0000-7000-8000-0000000000b1',
              code: 'IFT24',
              nameBn: 'ইফতার 2024',
              nameEn: 'Iftar 2024',
              count: 1,
            },
          ],
          unnamed: 1,
        },
        { year: 2023, count: 1, projects: [], unnamed: 1 },
      ],
    };
    serve(fullRow, {}, { ...empty360, help });
    const { container } = openProfile();
    const section = (
      await screen.findByRole('heading', { level: 2, name: 'সাহায্যের হিসাব' })
    ).closest('section') as HTMLElement;
    const card = within(section ?? container);
    expect(card.getByText('মোট 5 বার সাহায্য পেয়েছেন')).toBeInTheDocument();
    expect(card.getByText('2023 সাল থেকে')).toBeInTheDocument();
    expect(card.getByText('এই বছর 2 বার')).toBeInTheDocument();
    expect(card.getByText('এক বছরে একাধিকবার')).toBeInTheDocument();
    expect(card.getByText('একই প্রকল্পে একাধিকবার')).toBeInTheDocument();
    // a year with two shows its number; the project helped twice shows it too
    expect(card.getAllByText('2 বার')).toHaveLength(3);
    expect(card.getByText('শীতবস্ত্র 2026')).toBeInTheDocument();
    expect(card.getByText('ইফতার 2024')).toBeInTheDocument();
    expect(card.getAllByText('অন্য প্রকল্পে 1 বার, নাম আপনার জন্য দেখানো হয় না')).toHaveLength(2);
    await expectNoAxeViolations(container);
  });

  it('says so for a person never helped, in English too', async () => {
    refreshAs(HEAD);
    const help = {
      total: 0,
      firstYear: null,
      thisYear: 0,
      repeatedInYear: false,
      repeatedInProject: false,
      years: [],
    };
    serve(fullRow, {}, { ...empty360, help });
    const first = openProfile();
    expect(await screen.findByText('এখনো কোনো সাহায্য পাননি।')).toBeInTheDocument();
    expect(screen.queryByText('এক বছরে একাধিকবার')).not.toBeInTheDocument();
    first.unmount();
    renderApp(<BeneficiaryProfilePage />, 'en', {
      path: '/admin/beneficiaries/:beneficiaryId',
      initialPath: `/admin/beneficiaries/${ID}`,
    });
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Help received' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Not helped yet.')).toBeInTheDocument();
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

  it('shows the published media works with YouTube’s own image and a card for Facebook', async () => {
    refreshAs(HEAD);
    serve(
      fullRow,
      {},
      {
        ...empty360,
        media: [
          {
            referralId: '01900000-0000-7000-8000-0000000000a1',
            workId: '01900000-0000-7000-8000-0000000000a2',
            title: 'সেলাই মেশিনে ঘুরে দাঁড়ানো',
            program: { id: PROJECT, name: { bn: 'স্বাবলম্বী প্রোগ্রাম', en: 'Self-reliance' } },
            project: {
              id: PROJECT,
              name: { bn: 'স্বাবলম্বী 2026', en: 'Self-reliance 2026' },
              year: 2026,
            },
            stageCode: 'published',
            contentType: 'video',
            summary: 'তিন মাসে নিজের দোকান দিয়েছেন।',
            publishedOn: '2026-10-12',
            publications: [
              {
                platformCode: 'asf_youtube',
                link: 'https://youtu.be/dQw4w9WgXcQ',
                publishedOn: '2026-10-12',
                youtubeId: 'dQw4w9WgXcQ',
              },
              {
                platformCode: 'asf_facebook',
                link: 'https://www.facebook.com/AsSunnahFoundation/videos/1',
                publishedOn: '2026-10-13',
                youtubeId: null,
              },
            ],
            members: [
              {
                userId: '01900000-0000-7000-8000-0000000000a3',
                name: 'রুবেল আহমেদ',
                roles: ['cinematographer'],
              },
            ],
          },
        ],
      },
    );
    server.use(
      http.get('*/api/v1/reference-lists/:list', ({ params }) =>
        HttpResponse.json({
          data:
            params.list === 'media_platform'
              ? [
                  {
                    code: 'asf_youtube',
                    label: { bn: 'আস-সুন্নাহ ইউটিউব', en: 'ASF YouTube' },
                    active: true,
                    sortOrder: 1,
                    system: false,
                    kind: 'youtube',
                  },
                  {
                    code: 'asf_facebook',
                    label: { bn: 'আস-সুন্নাহ ফেসবুক', en: 'ASF Facebook' },
                    active: true,
                    sortOrder: 2,
                    system: false,
                    kind: 'facebook',
                  },
                ]
              : params.list === 'media_role'
                ? [
                    {
                      code: 'cinematographer',
                      label: { bn: 'ক্যামেরা', en: 'Camera' },
                      active: true,
                      sortOrder: 1,
                      system: false,
                      kind: null,
                    },
                  ]
                : [],
          meta: {},
        }),
      ),
    );
    const { container } = openProfile();
    const section = await screen.findByRole('region', { name: 'মিডিয়া' });
    expect(await within(section).findByText('তিন মাসে নিজের দোকান দিয়েছেন।')).toBeInTheDocument();
    const youtube = await within(section).findByRole('link', { name: 'আস-সুন্নাহ ইউটিউব-এ দেখুন' });
    expect(youtube).toHaveAttribute('href', 'https://youtu.be/dQw4w9WgXcQ');
    expect(youtube).toHaveAttribute('target', '_blank');
    const images = section.querySelectorAll('img');
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute('src', 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    expect(images[0]).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(
      within(section).getByRole('link', { name: 'আস-সুন্নাহ ফেসবুক-এ দেখুন' }),
    ).toBeInTheDocument();
    expect(within(section).getAllByText('রুবেল আহমেদ (ক্যামেরা)')).toHaveLength(2);
    await expectNoAxeViolations(container);
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
    for (const section of [
      'পরিবার',
      'সাহায্যের হিসাব',
      'আবেদনের ইতিহাস',
      'দাওয়াহ',
      'ফলো-আপ',
      'কার্যক্রমের ইতিহাস',
    ])
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
    // nothing is asked before a project is chosen
    expect(within(dialog).getByRole('button', { name: 'খুঁজুন' })).toBeDisabled();
    await user.click(await within(dialog).findByRole('combobox', { name: /প্রকল্প/ }));
    await user.click(await screen.findByRole('option', { name: 'শীতবস্ত্র বিতরণ 2026 (WC)' }));
    // a new project starts a new lookup, so the field is drawn afresh
    await user.type(within(dialog).getByRole('textbox', { name: /NID নম্বর/ }), '1000001000');
    await user.click(within(dialog).getByRole('button', { name: 'খুঁজুন' }));
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

  it('offers the identity document only where the server allows it, on a profile without one', async () => {
    refreshAs(RPM);
    serve(fullRow, {}, { ...empty360, nid: '1234567890', actions: ALL_ACTIONS });
    const first = openProfile();
    await screen.findByRole('button', { name: 'সংশোধনের অনুরোধ করুন' });
    expect(screen.queryByRole('button', { name: 'পরিচয়পত্র যোগ করুন' })).not.toBeInTheDocument();
    first.unmount();
    resetClientForTests();
    serve(
      fullRow,
      {},
      {
        ...empty360,
        nid: null,
        birthReg: null,
        hasDocument: false,
        actions: { ...NO_ACTIONS, addIdentity: true },
      },
    );
    openProfile();
    expect(await screen.findByRole('button', { name: 'পরিচয়পত্র যোগ করুন' })).toBeInTheDocument();
  });

  it('adds the identity document with the version of the profile, and links the profile that holds a taken number', async () => {
    refreshAs(RPM);
    serve(
      fullRow,
      {},
      {
        ...empty360,
        nid: null,
        birthReg: null,
        hasDocument: false,
        actions: { ...NO_ACTIONS, addIdentity: true },
      },
    );
    const sent: { ifMatch: string | null; body: unknown }[] = [];
    server.use(
      http.post('*/api/v1/beneficiaries/:id/identity', async ({ request }) => {
        sent.push({ ifMatch: request.headers.get('If-Match'), body: await request.json() });
        if (sent.length === 1)
          return HttpResponse.json(
            {
              error: {
                code: 'beneficiary.identity_taken',
                message: 'এই নম্বর অন্য একটি প্রোফাইলে আছে। একই মানুষ হলে মার্জের প্রস্তাব দিন।',
                requestId: 'r',
                details: [
                  {
                    path: 'number',
                    code: 'beneficiary.identity_taken',
                    message:
                      'এই নম্বর অন্য একটি প্রোফাইলে আছে। একই মানুষ হলে মার্জের প্রস্তাব দিন।',
                    params: { benNo: 'BEN-0000077', beneficiaryId: OTHER_ID },
                  },
                ],
              },
            },
            { status: 409 },
          );
        return HttpResponse.json({
          data: { beneficiaryId: ID, kind: 'nid' },
          meta: { requestId: 'req_test', etag: ETAG },
        });
      }),
    );
    const user = userEvent.setup();
    const view = openProfile();
    await user.click(await screen.findByRole('button', { name: 'পরিচয়পত্র যোগ করুন' }));
    const dialog = await screen.findByRole('dialog', { name: 'পরিচয়পত্র যোগ করুন' });
    const add = within(dialog).getByRole('button', { name: 'যোগ করুন' });
    expect(add).toBeDisabled();
    await user.click(within(dialog).getByRole('combobox', { name: /পরিচয়পত্রের ধরন/ }));
    await user.click(await screen.findByRole('option', { name: 'NID' }));
    const number = within(dialog).getByRole('textbox', { name: /নম্বর/ });
    await user.type(number, '১২৩৪');
    await user.click(add);
    // a number of the wrong length is refused here, before any request
    expect(number).toHaveAccessibleDescription('এনআইডি 10, 13 বা 17 অঙ্কের হতে হবে।');
    expect(sent).toEqual([]);
    await user.clear(number);
    await user.type(number, '১২৩৪-৫৬৭ ৮৯০');
    await user.click(add);
    expect(
      await within(dialog).findByRole('link', { name: 'দুটি প্রোফাইল মিলিয়ে দেখুন' }),
    ).toHaveAttribute('href', expect.stringContaining(`b=${OTHER_ID}`));
    await expectNoAxeViolations(view.container);
    await user.clear(number);
    await user.type(number, '1234567891');
    await user.click(add);
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]).toEqual({ ifMatch: ETAG, body: { kind: 'nid', number: '1234567891' } });
    expect(await screen.findByText('পরিচয়পত্রের নম্বর প্রোফাইলে যোগ হয়েছে')).toBeInTheDocument();
  }, 15_000);

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

  it('keeps the contact dialog open with the reason when the save is refused', async () => {
    refreshAs(RPM);
    serve(fullRow, {}, { ...empty360, actions: ALL_ACTIONS });
    const answers = [
      HttpResponse.json(
        {
          error: {
            code: 'request.precondition_failed',
            message: 'প্রোফাইলটি এর মধ্যে বদলেছে। আবার খুলে চেষ্টা করুন।',
            requestId: 'r',
          },
        },
        { status: 412 },
      ),
      HttpResponse.json(
        {
          error: {
            code: 'validation.failed',
            message: 'তথ্য ঠিক নেই।',
            requestId: 'r',
            details: [
              { path: 'postCode', code: 'validation.failed', message: '4 অঙ্কের পোস্ট কোড দিন।' },
            ],
          },
        },
        { status: 422 },
      ),
    ];
    server.use(http.patch('*/api/v1/beneficiaries/:id/contact', () => answers.shift()));
    const user = userEvent.setup();
    openProfile();
    await user.click(await screen.findByRole('button', { name: 'যোগাযোগের তথ্য বদলান' }));
    const dialog = await screen.findByRole('dialog', { name: 'যোগাযোগের তথ্য বদলান' });
    const mobile = within(dialog).getByRole('textbox', { name: /মোবাইল/ });
    await user.clear(mobile);
    await user.type(mobile, '01911000002');
    const save = within(dialog).getByRole('button', { name: 'সংরক্ষণ করুন' });
    await user.click(save);
    expect(
      await within(dialog).findByText('প্রোফাইলটি এর মধ্যে বদলেছে। আবার খুলে চেষ্টা করুন।'),
    ).toBeInTheDocument();
    await user.click(save);
    expect(await within(dialog).findByText('4 অঙ্কের পোস্ট কোড দিন।')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'যোগাযোগের তথ্য বদলান' })).toBeInTheDocument();
  });

  it('asks for a correction of a locked field with the number in plain digits', async () => {
    refreshAs(RPM);
    serve(fullRow, {}, { ...empty360, nid: '1234567890', actions: ALL_ACTIONS });
    const sent: unknown[] = [];
    let refuse = true;
    server.use(
      http.post('*/api/v1/beneficiaries/:id/correction-requests', async ({ request }) => {
        sent.push(await request.json());
        if (refuse) {
          refuse = false;
          return HttpResponse.json(
            {
              error: {
                code: 'validation.failed',
                message: 'তথ্য ঠিক নেই।',
                requestId: 'r',
                details: [{ path: 'reason', code: 'validation.too_long', message: 'অনেক লম্বা।' }],
              },
            },
            { status: 422 },
          );
        }
        return HttpResponse.json(
          { data: { id: REQUEST_ID }, meta: { requestId: 'req_test' } },
          { status: 201 },
        );
      }),
    );
    const user = userEvent.setup();
    openProfile();
    await user.click(await screen.findByRole('button', { name: 'সংশোধনের অনুরোধ করুন' }));
    const dialog = await screen.findByRole('dialog', { name: 'সংশোধনের অনুরোধ' });
    const send = within(dialog).getByRole('button', { name: 'অনুরোধ পাঠান' });
    expect(send).toBeDisabled();
    await user.click(within(dialog).getByRole('combobox', { name: /কোন তথ্য ঠিক করতে হবে/ }));
    await user.click(await screen.findByRole('option', { name: 'NID' }));
    const value = within(dialog).getByRole('textbox', { name: /সঠিক মান/ });
    expect(value).toHaveAccessibleDescription('এখন আছে: 1234567890');
    await user.type(value, '১২৩৪');
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), 'এনআইডি দেখে');
    await user.click(send);
    // a number of the wrong length is refused here, before any request
    expect(value).toHaveAccessibleDescription('এনআইডি 10, 13 বা 17 অঙ্কের হতে হবে।');
    expect(sent).toEqual([]);
    await user.clear(value);
    await user.type(value, '১২৩৪-৫৬৭ ৮৯০');
    await user.click(send);
    expect(await within(dialog).findByText('অনেক লম্বা।')).toBeInTheDocument();
    await user.click(send);
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]).toEqual({ field: 'nid', newValue: '1234567890', reason: 'এনআইডি দেখে' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'সংশোধনের অনুরোধ' })).not.toBeInTheDocument(),
    );
  }, 15_000);

  it('shows why an approval of a correction was refused and keeps the dialog open', async () => {
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
      { ...empty360, actions: { ...NO_ACTIONS, decideCorrection: true }, corrections: [request] },
    );
    server.use(
      http.post('*/api/v1/beneficiary-corrections/:requestId/decision', () =>
        HttpResponse.json(
          {
            error: {
              code: 'beneficiary.correction_stale',
              message: 'প্রোফাইলের মান এর মধ্যে বদলেছে।',
              requestId: 'r',
            },
          },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    openProfile();
    const heading = await screen.findByRole('heading', { level: 2, name: 'সংশোধনের অনুরোধ' });
    const section = heading.closest('section') ?? document.body;
    await user.click(within(section).getByRole('button', { name: 'অনুমোদন করুন' }));
    const approve = await screen.findByRole('alertdialog');
    await user.click(within(approve).getByRole('button', { name: 'অনুমোদন করুন' }));
    expect(await within(approve).findByText('প্রোফাইলের মান এর মধ্যে বদলেছে।')).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
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

describe('a person without an identity document or a mobile', () => {
  const NO_DOCUMENT = bn.common.person.no_document;
  const THROUGH_VOLUNTEER = bn.common.person.through_volunteer;
  const light = { ...fullRow, mobile: null, hasDocument: false };

  it('marks the row of the list with the two chips, and no other row', async () => {
    refreshAs(HEAD);
    serve(light, { total: 1, assistedThisYear: 0, blocked: 0 });
    const first = openList();
    expect((await screen.findAllByText(NO_DOCUMENT)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(THROUGH_VOLUNTEER).length).toBeGreaterThan(0);
    first.unmount();
    // a person who has both shows neither
    resetClientForTests();
    serve({ ...fullRow, hasDocument: true }, { total: 1, assistedThisYear: 0, blocked: 0 });
    const second = openList();
    expect((await screen.findAllByText('নমুনা উপকারভোগী')).length).toBeGreaterThan(0);
    expect(screen.queryByText(NO_DOCUMENT)).not.toBeInTheDocument();
    expect(screen.queryByText(THROUGH_VOLUNTEER)).not.toBeInTheDocument();
    second.unmount();
    // the Media Team's rows carry neither fact, so nothing is said
    resetClientForTests();
    refreshAs(MEDIA);
    serve(mediaRow, { total: 1, assistedThisYear: 0 });
    openList();
    expect((await screen.findAllByText('নমুনা উপকারভোগী')).length).toBeGreaterThan(0);
    expect(screen.queryByText(NO_DOCUMENT)).not.toBeInTheDocument();
    expect(screen.queryByText(THROUGH_VOLUNTEER)).not.toBeInTheDocument();
  });

  it('shows the chip on the profile and the volunteer in the place of the number', async () => {
    refreshAs(HEAD);
    serve(light, {}, { ...empty360, mobile: null, hasDocument: false, nid: null, birthReg: null });
    const { container } = openProfile();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'নমুনা উপকারভোগী' }),
    ).toBeInTheDocument();
    // beside the state, and where the number stands in the details
    expect(screen.getAllByText(NO_DOCUMENT)).toHaveLength(2);
    // in the details and in the contact panel
    expect(screen.getAllByText(THROUGH_VOLUNTEER)).toHaveLength(2);
    expect(screen.queryByRole('link', { name: /কল/ })).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('shows neither on the profile of a person who has both', async () => {
    refreshAs(HEAD);
    serve(fullRow, {}, { ...empty360, hasDocument: true, nid: '1234567890', birthReg: null });
    openProfile();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'নমুনা উপকারভোগী' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(NO_DOCUMENT)).not.toBeInTheDocument();
    expect(screen.queryByText(THROUGH_VOLUNTEER)).not.toBeInTheDocument();
    expect(screen.getAllByText('01911000001').length).toBeGreaterThan(0);
  });
});

describe('whose number the mobile is, on the profile', () => {
  const full = { ...empty360, hasDocument: true, nid: '1234567890', birthReg: null };
  const WHOSE = 'কার নম্বর';
  /** The value beside the line's label in the details. */
  const line = () => screen.getByText(WHOSE).closest('div')!;
  const opened = async () => {
    openProfile();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'নমুনা উপকারভোগী' }),
    ).toBeInTheDocument();
  };

  it('says whose it is in the list’s words, with the owner’s name in brackets', async () => {
    refreshAs(HEAD);
    serve(fullRow, {}, { ...full, mobileOwnerCode: 'neighbour', mobileOwnerName: 'করিম মিয়া' });
    await opened();
    expect(within(line()).getByText('প্রতিবেশীর (করিম মিয়া)')).toBeInTheDocument();
  });

  it('says only whose it is when no name is on file, in English too', async () => {
    refreshAs(HEAD);
    serve(fullRow, {}, { ...full, mobileOwnerCode: 'own', mobileOwnerName: null });
    renderApp(<BeneficiaryProfilePage />, 'en', {
      path: '/admin/beneficiaries/:beneficiaryId',
      initialPath: `/admin/beneficiaries/${ID}`,
    });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'নমুনা উপকারভোগী' }),
    ).toBeInTheDocument();
    const english = screen.getByText('Whose number').closest('div')!;
    expect(within(english).getByText('Own')).toBeInTheDocument();
    expect(within(english).queryByText(/\(/)).not.toBeInTheDocument();
  });

  it.each([
    ['the owner is empty', { mobileOwnerCode: null, mobileOwnerName: null }],
    // a limited view's answer carries no contact data at all
    ['the server left it out', {}],
    ['a name stands without an owner', { mobileOwnerCode: null, mobileOwnerName: 'করিম মিয়া' }],
  ])('shows no line when %s', async (_case, owner) => {
    refreshAs(HEAD);
    serve(fullRow, {}, { ...full, ...owner });
    await opened();
    expect(screen.queryByText(WHOSE)).not.toBeInTheDocument();
    expect(screen.queryByText(/করিম মিয়া/)).not.toBeInTheDocument();
  });
});

describe('the father’s or husband’s name, on the profile', () => {
  const full = { ...empty360, hasDocument: true, nid: '1234567890', birthReg: null };
  /** The label beside the name in the details. */
  const labelOf = () => screen.getByText('নমুনা স্বামী').closest('div')!;
  const opened = async () => {
    openProfile();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'নমুনা উপকারভোগী' }),
    ).toBeInTheDocument();
  };

  it.each([
    ['husband', 'স্বামীর নাম'],
    ['father', 'পিতার নাম'],
  ])('is called by the relation the profile holds: %s', async (code, label) => {
    refreshAs(HEAD);
    serve(fullRow, {}, { ...full, guardianRelationCode: code });
    await opened();
    expect(within(labelOf()).getByText(label)).toBeInTheDocument();
    expect(screen.queryByText('পিতা বা স্বামীর নাম')).not.toBeInTheDocument();
  });

  it.each([
    ['the relation is not known', { guardianRelationCode: null }],
    ['the server left it out', {}],
  ])('keeps the label of both when %s', async (_case, relation) => {
    refreshAs(HEAD);
    serve(fullRow, {}, { ...full, ...relation });
    await opened();
    expect(within(labelOf()).getByText('পিতা বা স্বামীর নাম')).toBeInTheDocument();
  });

  it('says it in English too', async () => {
    refreshAs(HEAD);
    serve(fullRow, {}, { ...full, guardianRelationCode: 'husband' });
    renderApp(<BeneficiaryProfilePage />, 'en', {
      path: '/admin/beneficiaries/:beneficiaryId',
      initialPath: `/admin/beneficiaries/${ID}`,
    });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'নমুনা উপকারভোগী' }),
    ).toBeInTheDocument();
    expect(within(labelOf()).getByText("Husband's name")).toBeInTheDocument();
  });
});

describe('the family members on the profile', () => {
  const MEMBERS = [
    {
      id: '0190a1b2-0000-7000-8000-00000000f001',
      name: 'রহিমা খাতুন',
      relationshipCode: 'spouse',
      relationship: { bn: 'স্বামী/স্ত্রী', en: 'Spouse' },
      ageYears: 34,
      occupationCode: null,
      monthlyIncome: 3000,
    },
    {
      id: '0190a1b2-0000-7000-8000-00000000f002',
      name: 'করিম',
      relationshipCode: null,
      relationship: null,
      ageYears: null,
      occupationCode: null,
      monthlyIncome: null,
    },
  ];
  /** The body of a section of the profile, by its title. */
  const sectionOf = (name: string) => screen.getByRole('region', { name });
  const opened = async (locale: 'bn' | 'en' = 'bn') => {
    const view = renderApp(<BeneficiaryProfilePage />, locale, {
      path: '/admin/beneficiaries/:beneficiaryId',
      initialPath: `/admin/beneficiaries/${ID}`,
    });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'নমুনা উপকারভোগী' }),
    ).toBeInTheDocument();
    return view;
  };

  it('lists each member with the relationship in its list’s words, the age and the monthly income', async () => {
    refreshAs(HEAD);
    serve(fullRow, {}, { ...empty360, familyMembers: MEMBERS });
    const { container } = await opened();
    const section = within(sectionOf('পরিবার'));
    for (const header of ['নাম', 'সম্পর্ক', 'বয়স', 'মাসিক আয়', 'প্রোফাইল'])
      expect(section.getByRole('columnheader', { name: header })).toBeInTheDocument();
    const [first, second] = section.getAllByRole('row').slice(1);
    expect(within(first!).getByText('রহিমা খাতুন')).toBeInTheDocument();
    expect(within(first!).getByText('স্বামী/স্ত্রী')).toBeInTheDocument();
    expect(within(first!).getByText('34 বছর')).toBeInTheDocument();
    expect(within(first!).getByText('৳ 3,000')).toBeInTheDocument();
    // what is not known about a member reads as empty, never as a code or a zero
    expect(within(second!).getByText('করিম')).toBeInTheDocument();
    expect(within(second!).queryByText(/৳/)).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('shows every member of a large household, none cut off', async () => {
    refreshAs(HEAD);
    const thirty = Array.from({ length: 30 }, (_, i) => ({
      ...MEMBERS[1]!,
      id: `0190a1b2-0000-7000-8000-0000000010${String(i).padStart(2, '0')}`,
      name: `সদস্য ${i + 1}`,
    }));
    serve(fullRow, {}, { ...empty360, familyMembers: thirty });
    await opened();
    const rows = within(sectionOf('পরিবার')).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(30);
    expect(within(rows[29]!).getByText('সদস্য 30')).toBeInTheDocument();
  });

  it('says it in English too', async () => {
    refreshAs(HEAD);
    serve(fullRow, {}, { ...empty360, familyMembers: MEMBERS.slice(0, 1) });
    await opened('en');
    const section = within(sectionOf('Family'));
    expect(section.getByRole('columnheader', { name: 'Monthly income' })).toBeInTheDocument();
    expect(section.getByText('Spouse')).toBeInTheDocument();
    expect(section.getByText('34 years')).toBeInTheDocument();
  });

  it.each([
    ['no member is known', { familyMembers: [] }],
    ['the server left the section out', {}],
  ])('draws no family section when %s', async (_case, family) => {
    refreshAs(HEAD);
    const { familyMembers: _members, ...rest } = empty360;
    serve(fullRow, {}, { ...rest, ...family });
    await opened();
    expect(screen.getByRole('heading', { level: 2, name: 'ঠিকানা' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'পরিবার' })).not.toBeInTheDocument();
  });

  const SON = '0190a1b2-0000-7000-8000-00000000f101';
  const HEAD_OF = '0190a1b2-0000-7000-8000-00000000f102';
  const linked = [
    { ...MEMBERS[0]!, profile: { beneficiaryId: SON, benNo: 'BEN-0000007', name: 'সালাম' } },
    { ...MEMBERS[1]!, profile: null },
  ];
  const familyHelp = {
    total: 3,
    firstYear: 2024,
    thisYear: 0,
    repeatedInYear: false,
    repeatedInProject: false,
    years: [
      {
        year: 2025,
        count: 2,
        projects: [
          {
            id: '0190a1b2-0000-7000-8000-00000000f201',
            code: 'WC',
            nameBn: 'শীতবস্ত্র ২০২৫',
            nameEn: 'Winter 2025',
            count: 2,
          },
        ],
        unnamed: 0,
      },
      {
        year: 2024,
        count: 1,
        projects: [
          {
            id: '0190a1b2-0000-7000-8000-00000000f202',
            code: 'IF',
            nameBn: 'ইফতার ২০২৪',
            nameEn: 'Iftar 2024',
            count: 1,
          },
        ],
        unnamed: 0,
      },
    ],
    people: 2,
    notShown: 1,
  };

  it('links a member to the profile it probably is, and shows nothing for a member without one', async () => {
    refreshAs(HEAD);
    serve(fullRow, {}, { ...empty360, familyMembers: linked });
    const { container } = await opened();
    const section = within(sectionOf('পরিবার'));
    const [first, second] = section.getAllByRole('row').slice(1);
    expect(
      within(first!).getByRole('link', { name: 'সম্ভবত সালাম (BEN-0000007)' }),
    ).toHaveAttribute('href', `/admin/beneficiaries/${SON}`);
    expect(within(second!).queryByRole('link')).not.toBeInTheDocument();
    expect(within(second!).queryByText(/সম্ভবত/)).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('names the family that probably holds the person, with a link to its head', async () => {
    refreshAs(HEAD);
    serve(
      fullRow,
      {},
      {
        ...empty360,
        familyMembers: [],
        memberOf: [
          {
            head: { beneficiaryId: HEAD_OF, benNo: 'BEN-0000003', name: 'রহিম' },
            relationships: [
              { code: 'son', name: { bn: 'ছেলে', en: 'son' } },
              { code: 'nephew', name: { bn: 'ভাতিজা', en: 'nephew' } },
            ],
          },
        ],
      },
    );
    await opened();
    expect(
      within(sectionOf('পরিবার')).getByRole('link', {
        name: 'সম্ভবত রহিম (BEN-0000003)-এর পরিবারের ছেলে বা ভাতিজা',
      }),
    ).toHaveAttribute('href', `/admin/beneficiaries/${HEAD_OF}`);
  });

  it('shows what the family received by year, and the profiles not shown as a bare count', async () => {
    refreshAs(HEAD);
    serve(fullRow, {}, { ...empty360, familyMembers: linked, familyHelp });
    await opened();
    const section = within(sectionOf('পরিবার'));
    expect(
      section.getByRole('heading', { level: 3, name: 'এই পরিবার যা পেয়েছে' }),
    ).toBeInTheDocument();
    expect(section.getByText('2 জনের প্রোফাইল মিলিয়ে মোট 3 বার সাহায্য')).toBeInTheDocument();
    expect(section.getByText('শীতবস্ত্র ২০২৫')).toBeInTheDocument();
    expect(section.getByText('ইফতার ২০২৪')).toBeInTheDocument();
    expect(section.getByText('আরও 1 জন দেখানো হয়নি')).toBeInTheDocument();
  });

  it('says what the family received in English', async () => {
    refreshAs(HEAD);
    serve(fullRow, {}, { ...empty360, familyMembers: linked, familyHelp });
    await opened('en');
    expect(
      within(sectionOf('Family')).getByText('3 times in all, from 2 profiles'),
    ).toBeInTheDocument();
  });

  it('shows each member as a card on a phone, with the age, the income and the link', async () => {
    stubScreen(360);
    try {
      refreshAs(HEAD);
      serve(fullRow, {}, { ...empty360, familyMembers: linked });
      await opened();
      const section = within(sectionOf('পরিবার'));
      // no table on a phone: the cards hold the same facts
      expect(section.queryByRole('columnheader', { name: 'মাসিক আয়' })).not.toBeInTheDocument();
      expect(section.getByText('বয়স 34 বছর · মাসিক আয় ৳ 3,000')).toBeInTheDocument();
      expect(section.getByRole('link', { name: 'সম্ভবত সালাম (BEN-0000007)' })).toHaveAttribute(
        'href',
        `/admin/beneficiaries/${SON}`,
      );
      expect(section.getByText('করিম')).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('shows only the count where no member links to a profile the viewer reaches', async () => {
    refreshAs(HEAD);
    serve(fullRow, {}, { ...empty360, familyMembers: MEMBERS, familyHelp: { notShown: 2 } });
    await opened();
    const section = within(sectionOf('পরিবার'));
    expect(section.getByText('আরও 2 জন দেখানো হয়নি')).toBeInTheDocument();
    expect(
      section.queryByRole('heading', { name: 'এই পরিবার যা পেয়েছে' }),
    ).not.toBeInTheDocument();
  });

  it('draws no family help where the server sent none', async () => {
    refreshAs(HEAD);
    serve(fullRow, {}, { ...empty360, familyMembers: linked });
    await opened();
    expect(
      within(sectionOf('পরিবার')).queryByRole('heading', { name: 'এই পরিবার যা পেয়েছে' }),
    ).not.toBeInTheDocument();
  });
});
