import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../api/client';
import { ProgramsProjectsPage } from './ProgramsProjectsPage';

// The programs and projects tab: the program cards for the five roles of the overview, and the
// list of the sessions as its second view. Test data only.
const HEAD: Me = { ...ME, roles: ['department_head'] };
const PM: Me = { ...ME, roles: ['program_manager'] };
const RPM: Me = { ...ME, roles: ['regional_program_manager'] };
const VOLUNTEER: Me = { ...ME, kind: 'volunteer', roles: ['volunteer_general'] };
const PROGRAM = {
  id: '01900000-0000-7000-8000-0000000000b1',
  code: 'HUM',
  name: { bn: 'মানবিক সহায়তা', en: 'Humanitarian' },
  pmUserId: null,
  pmName: null,
  active: true,
};
const project = (over: Record<string, unknown> = {}) => ({
  id: '01900000-0000-7000-8000-0000000000c1',
  code: 'WC',
  year: 2026,
  name: { bn: 'শীতবস্ত্র বিতরণ', en: 'Winter clothing' },
  status: 'draft',
  workflowKey: 'distribution',
  applyFrom: null,
  applyTo: null,
  perVolunteerLimit: null,
  dawahEnabled: false,
  programId: PROGRAM.id,
  seriesId: SERIES,
  periodFrom: '2026-06',
  periodTo: '2027-07',
  sessionLabel: '2026-27',
  ...over,
});
const SERIES = '01900000-0000-7000-8000-0000000000d1';

/** A program as its card reads it. */
const card = (over: Record<string, unknown> = {}) => ({
  id: PROGRAM.id,
  code: PROGRAM.code,
  name: PROGRAM.name,
  description: { bn: 'প্রতি বছরের মানবিক সহায়তা।', en: 'Humanitarian help every year.' },
  coverFileId: null,
  active: true,
  pm: { id: '01900000-0000-7000-8000-0000000000b2', name: 'নমুনা পিএম' },
  rpms: {
    people: [{ id: '01900000-0000-7000-8000-0000000000e1', name: 'আরপিএম এক', photoFileId: null }],
    total: 1,
  },
  projects: 4,
  runningProjects: 3,
  beneficiaries: 1240,
  applications: 980,
  volunteers: 21,
  canCreate: false,
  ...over,
});
const THREE = [
  card(),
  card({
    id: '01900000-0000-7000-8000-0000000000b3',
    code: 'UCD',
    name: { bn: 'কমিউনিটি উন্নয়ন', en: 'Community development' },
    pm: null,
  }),
  card({
    id: '01900000-0000-7000-8000-0000000000b4',
    code: 'ERR',
    name: { bn: 'জরুরি সাড়া', en: 'Emergency response' },
  }),
];
/** A project series as its card reads it, for the project filter of the list. */
const SERIES_CARD = {
  id: SERIES,
  programId: PROGRAM.id,
  code: 'WC',
  name: { bn: 'শীতবস্ত্র বিতরণ', en: 'Winter clothing' },
  description: null,
  coverFileId: null,
  sessionCount: 2,
  beneficiaries: 10,
  current: null,
  canCreate: false,
};

let listUrls: URL[];
let created: unknown[];
let cards: unknown[];

function serve(rows: unknown[] = [project(), project({ id: 'c2', code: 'IF', status: 'active' })]) {
  listUrls = [];
  created = [];
  cards = [card()];
  server.use(
    http.get('*/api/v1/program-cards', () => HttpResponse.json({ data: cards, meta: {} })),
    http.get('*/api/v1/project-series', () => HttpResponse.json({ data: [SERIES_CARD], meta: {} })),
    http.get('*/api/v1/projects', ({ request }) => {
      listUrls.push(new URL(request.url));
      return HttpResponse.json({
        data: rows,
        meta: { nextCursor: null, prevCursor: null, total: rows.length },
      });
    }),
    http.get('*/api/v1/projects/:id', () =>
      HttpResponse.json({ data: project(), meta: { etag: '"v1"' } }),
    ),
    http.get('*/api/v1/programs', () => HttpResponse.json({ data: [PROGRAM], meta: {} })),
    http.post('*/api/v1/projects', async ({ request }) => {
      const body = (await request.json()) as { code: string };
      created.push(body);
      if (body.code === 'WC')
        return HttpResponse.json(
          {
            error: {
              code: 'project.session_year_taken',
              messageKey: 'errors.project.session_year_taken',
              message: 'এই বছরে এই প্রকল্পের একটি সেশন আগে থেকেই আছে।',
              requestId: 'req_x',
            },
          },
          { status: 409 },
        );
      return HttpResponse.json(
        { data: project({ ...body, id: 'new' }), meta: {} },
        { status: 201 },
      );
    }),
  );
}

// the list pages, not the counts of the state cards (one row each)
const pages = () => listUrls.filter((u) => u.searchParams.get('limit') !== '1');

const open = (initialPath = '/admin/projects?view=list') =>
  renderApp(<ProgramsProjectsPage />, 'bn', { path: '/admin/projects', initialPath });

beforeEach(() => {
  resetClientForTests();
});

describe('the project list', () => {
  it('shows the state of each project without accessibility violations', async () => {
    refreshAs(PM);
    serve();
    const { container } = open();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'প্রোগ্রাম ও প্রকল্প' }),
    ).toBeInTheDocument();
    expect(screen.getByText('প্রকল্প ব্যবস্থাপনা')).toBeInTheDocument();
    expect((await screen.findAllByText('খসড়া')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('সক্রিয়').length).toBeGreaterThan(0);
    expect((await screen.findAllByText('মানবিক সহায়তা')).length).toBeGreaterThan(0);
    // the count line under the list: the rows shown of the total
    expect(await screen.findByText(/^\d+টির মধ্যে \d+টি$/)).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('keeps the state, program and year filters in the URL and asks the server with them', async () => {
    refreshAs(PM);
    serve();
    const user = userEvent.setup();
    const { router } = open(`/admin/projects?view=list&programId=${PROGRAM.id}&year=2026`);
    await waitFor(() => expect(pages().length).toBeGreaterThan(0));
    expect(pages()[0]!.searchParams.get('programId')).toBe(PROGRAM.id);
    expect(pages()[0]!.searchParams.get('year')).toBe('2026');
    const states = within(await screen.findByRole('group', { name: 'অবস্থা অনুযায়ী প্রকল্প' }));
    await user.click(await states.findByRole('button', { name: /^বন্ধ হচ্ছে/, pressed: false }));
    await waitFor(() => expect(router.state.location.search).toContain('status=closing'));
    expect(router.state.location.search).toContain('year=2026');
    // the view stays the list
    expect(router.state.location.search).toContain('view=list');
    await waitFor(() => expect(pages().at(-1)?.searchParams.get('status')).toBe('closing'));
    expect(states.getByRole('button', { name: /^বন্ধ হচ্ছে/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('counts the projects of each state for the program and year chosen', async () => {
    refreshAs(PM);
    serve();
    open(`/admin/projects?year=2026&status=active`);
    const states = within(await screen.findByRole('group', { name: 'অবস্থা অনুযায়ী প্রকল্প' }));
    expect(await states.findByRole('button', { name: 'সব প্রকল্প 2' })).toBeInTheDocument();
    const counts = listUrls.filter((u) => u.searchParams.get('limit') === '1');
    // one count per state and one for every project; none narrowed by the chosen state
    expect(counts.map((u) => u.searchParams.get('status')).sort()).toEqual(
      [null, 'active', 'cancelled', 'closed', 'closing', 'draft'].sort(),
    );
    expect(counts.every((u) => u.searchParams.get('year') === '2026')).toBe(true);
  });

  it('shows the error of the counts with a retry, and the list still loads', async () => {
    refreshAs(PM);
    serve();
    let failing = true;
    server.use(
      http.get('*/api/v1/projects', ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('limit') !== '1' || !failing) return undefined;
        return HttpResponse.json(
          { error: { code: 'rate_limited', message: 'অনেক অনুরোধ', requestId: 'req_c' } },
          { status: 429 },
        );
      }),
    );
    const user = userEvent.setup();
    open();
    expect((await screen.findAllByText('শীতবস্ত্র বিতরণ')).length).toBeGreaterThan(0);
    const retry = await screen.findByRole('button', { name: 'আবার চেষ্টা করুন' });
    expect(
      screen.queryByRole('group', { name: 'অবস্থা অনুযায়ী প্রকল্প' }),
    ).not.toBeInTheDocument();
    failing = false;
    await user.click(retry);
    expect(
      await screen.findByRole('group', { name: 'অবস্থা অনুযায়ী প্রকল্প' }),
    ).toBeInTheDocument();
  });

  it('asks for the windows ending soon when the link of the home carries that filter', async () => {
    refreshAs(PM);
    serve();
    open('/admin/projects?status=active&endingSoon=true');
    await waitFor(() => expect(pages().length).toBeGreaterThan(0));
    expect(pages()[0]!.searchParams.get('endingSoon')).toBe('true');
    expect(pages()[0]!.searchParams.get('status')).toBe('active');
  });

  it('offers a new project only to those who may create one', async () => {
    refreshAs(RPM);
    serve();
    open();
    expect((await screen.findAllByText('শীতবস্ত্র বিতরণ')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'নতুন প্রকল্প' })).not.toBeInTheDocument();
  });

  it('shows the forbidden content to a volunteer', async () => {
    refreshAs(VOLUNTEER);
    serve();
    open();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'প্রবেশাধিকার নেই' }),
    ).toBeInTheDocument();
    expect(listUrls).toEqual([]);
  });
});

describe('a new project', () => {
  it('starts on its program’s page, which the program card opens', async () => {
    refreshAs(PM);
    serve();
    cards = [card({ canCreate: true })];
    const user = userEvent.setup();
    open('/admin/projects');
    expect(await screen.findByRole('region', { name: 'প্রোগ্রাম' })).toBeInTheDocument();
    // the tab's header offers no new project of its own
    expect(screen.queryByRole('button', { name: 'নতুন প্রকল্প' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'মানবিক সহায়তা' })).toHaveAttribute(
      'href',
      `/admin/projects/programs/${PROGRAM.id}`,
    );
    await user.click(screen.getByRole('button', { name: 'মানবিক সহায়তা: বিস্তারিত দেখুন' }));
    expect(screen.getByRole('link', { name: /সব প্রকল্প দেখুন/ })).toHaveAttribute(
      'href',
      `/admin/projects/programs/${PROGRAM.id}`,
    );
  });
});

describe('the program cards', () => {
  it('shows an RPM three program cards with their figures, and no new program', async () => {
    refreshAs(RPM);
    serve();
    cards = THREE;
    const { container } = open('/admin/projects');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'প্রোগ্রাম ও প্রকল্প' }),
    ).toBeInTheDocument();
    const grid = within(await screen.findByRole('region', { name: 'প্রোগ্রাম' }));
    expect(grid.getAllByRole('article')).toHaveLength(3);
    const first = within(grid.getByRole('article', { name: 'মানবিক সহায়তা' }));
    for (const label of ['মোট প্রকল্প', 'চলমান প্রকল্প', 'মোট উপকারভোগী'])
      expect(first.getByText(label)).toBeInTheDocument();
    expect(first.getByText('1,240')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'নতুন প্রোগ্রাম' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'নতুন প্রকল্প' })).not.toBeInTheDocument();
    // the list of the sessions is not read until it is asked for
    expect(listUrls).toEqual([]);
    await expectNoAxeViolations(container);
  });

  it('gives the Head "নতুন প্রোগ্রাম" and "প্রোগ্রাম এডিট করুন"', async () => {
    refreshAs(HEAD);
    serve();
    const user = userEvent.setup();
    open('/admin/projects');
    expect(await screen.findByRole('button', { name: 'নতুন প্রোগ্রাম' })).toBeInTheDocument();
    await user.click(
      await screen.findByRole('button', { name: 'মানবিক সহায়তা: বিস্তারিত দেখুন' }),
    );
    expect(screen.getByRole('button', { name: 'প্রোগ্রাম এডিট করুন' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /সব প্রকল্প দেখুন/ })).toHaveAttribute(
      'href',
      `/admin/projects/programs/${PROGRAM.id}`,
    );
  });

  it('says "PM দেওয়া হয়নি" for a program without its manager', async () => {
    refreshAs(RPM);
    serve();
    cards = THREE;
    const user = userEvent.setup();
    open('/admin/projects');
    await user.click(
      await screen.findByRole('button', { name: 'কমিউনিটি উন্নয়ন: বিস্তারিত দেখুন' }),
    );
    const back = within(screen.getByRole('article', { name: 'কমিউনিটি উন্নয়ন' }));
    expect(back.getByText('PM দেওয়া হয়নি')).toBeInTheDocument();
    expect(back.getByText('1 জন RPM')).toBeInTheDocument();
  });

  it('shows "আপনার করণীয়" only when the read gives the caller\u2019s own work', async () => {
    refreshAs(RPM);
    serve();
    cards = [
      card(),
      card({
        id: '01900000-0000-7000-8000-0000000000b3',
        name: { bn: 'কমিউনিটি উন্নয়ন', en: 'Community development' },
        todo: { reviewsWaiting: 38, waitlisted: 21 },
      }),
    ];
    const user = userEvent.setup();
    open('/admin/projects');
    await user.click(
      await screen.findByRole('button', { name: 'মানবিক সহায়তা: বিস্তারিত দেখুন' }),
    );
    expect(
      within(screen.getByRole('article', { name: 'মানবিক সহায়তা' })).queryByText('আপনার করণীয়'),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'কমিউনিটি উন্নয়ন: বিস্তারিত দেখুন' }));
    const work = within(
      within(screen.getByRole('article', { name: 'কমিউনিটি উন্নয়ন' })).getByRole('region', {
        name: 'আপনার করণীয়',
      }),
    );
    expect(work.getByText('38')).toBeInTheDocument();
    expect(work.getByText('21')).toBeInTheDocument();
  });

  it('marks an inactive program on its cover, shows its description on the front and its missing RPMs on the back', async () => {
    refreshAs(RPM);
    serve();
    cards = [
      card({
        active: false,
        rpms: { people: [], total: 0 },
        description: { bn: 'আগের বছরের কাজ, এখন বন্ধ।', en: 'Earlier work, now stopped.' },
      }),
    ];
    const user = userEvent.setup();
    open('/admin/projects');
    const program = within(await screen.findByRole('article', { name: 'মানবিক সহায়তা' }));
    expect(program.getByText('নিষ্ক্রিয়')).toBeInTheDocument();
    const front = screen
      .getByRole('article', { name: 'মানবিক সহায়তা' })
      .querySelector('[data-face="front"]') as HTMLElement;
    expect(within(front).getByText('আগের বছরের কাজ, এখন বন্ধ।')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'মানবিক সহায়তা: বিস্তারিত দেখুন' }));
    const backFace = screen
      .getByRole('article', { name: 'মানবিক সহায়তা' })
      .querySelector('[data-face="back"]') as HTMLElement;
    // the back no longer repeats the description
    expect(within(backFace).queryByText('আগের বছরের কাজ, এখন বন্ধ।')).not.toBeInTheDocument();
    const back = within(screen.getByRole('article', { name: 'মানবিক সহায়তা' }));
    expect(back.getByText('এখনো কোনো RPM দেওয়া হয়নি')).toBeInTheDocument();
    expect(back.queryByText(/জন RPM/)).not.toBeInTheDocument();
  });

  it('offers "নতুন প্রোগ্রাম" on the cards only, not in the list', async () => {
    refreshAs(HEAD);
    serve();
    const user = userEvent.setup();
    open('/admin/projects');
    expect(await screen.findByRole('button', { name: 'নতুন প্রোগ্রাম' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'তালিকা' }));
    expect(
      await screen.findByRole('group', { name: 'অবস্থা অনুযায়ী প্রকল্প' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'নতুন প্রোগ্রাম' })).not.toBeInTheDocument();
  });

  it('offers a retry when the cards cannot be read, then says there is no program', async () => {
    refreshAs(RPM);
    serve();
    cards = [];
    let failing = true;
    server.use(
      http.get('*/api/v1/program-cards', () =>
        failing
          ? HttpResponse.json(
              { error: { code: 'rate_limited', message: 'অনেক অনুরোধ', requestId: 'req_b' } },
              { status: 429 },
            )
          : HttpResponse.json({ data: [], meta: {} }),
      ),
    );
    const user = userEvent.setup();
    open('/admin/projects');
    const retry = await screen.findByRole('button', { name: 'আবার চেষ্টা করুন' });
    failing = false;
    await user.click(retry);
    expect(await screen.findByText('এখনো কোনো প্রোগ্রাম নেই।')).toBeInTheDocument();
  });

  it('shows the forbidden content to a volunteer, who reads no card', async () => {
    refreshAs(VOLUNTEER);
    let read = 0;
    serve();
    server.use(
      http.get('*/api/v1/program-cards', () => {
        read += 1;
        return HttpResponse.json({ data: [], meta: {} });
      }),
    );
    open('/admin/projects');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'প্রবেশাধিকার নেই' }),
    ).toBeInTheDocument();
    expect(read).toBe(0);
  });
});

describe('the view of the tab', () => {
  it('keeps the list when the only filter of the address is cleared', async () => {
    refreshAs(PM);
    serve();
    const user = userEvent.setup();
    const { router } = open('/admin/projects?status=draft');
    const states = within(await screen.findByRole('group', { name: 'অবস্থা অনুযায়ী প্রকল্প' }));
    await user.click(await states.findByRole('button', { name: /^সব প্রকল্প/ }));
    await waitFor(() => expect(router.state.location.search).toBe('?view=list'));
    expect(screen.getByRole('group', { name: 'অবস্থা অনুযায়ী প্রকল্প' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'প্রোগ্রাম' })).not.toBeInTheDocument();
  });

  it('opens the list with the draft chip chosen for `?status=draft`', async () => {
    refreshAs(PM);
    serve();
    open('/admin/projects?status=draft');
    const states = within(await screen.findByRole('group', { name: 'অবস্থা অনুযায়ী প্রকল্প' }));
    expect(await states.findByRole('button', { name: /^খসড়া/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'তালিকা' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(pages()[0]?.searchParams.get('status')).toBe('draft'));
  });

  it('switches to the list and back to the cards, the list\u2019s filters in the address', async () => {
    refreshAs(PM);
    serve();
    const user = userEvent.setup();
    const { router } = open('/admin/projects');
    await user.click(await screen.findByRole('button', { name: 'তালিকা' }));
    await waitFor(() => expect(router.state.location.search).toBe('?view=list'));
    const states = within(await screen.findByRole('group', { name: 'অবস্থা অনুযায়ী প্রকল্প' }));
    await user.click(await states.findByRole('button', { name: /^সক্রিয়/ }));
    await waitFor(() => expect(router.state.location.search).toContain('status=active'));
    expect(router.state.location.search).toContain('view=list');
    await user.click(screen.getByRole('button', { name: 'কার্ড' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(await screen.findByRole('region', { name: 'প্রোগ্রাম' })).toBeInTheDocument();
  });

  it('shows "সেশন 2026-27" beside the name, and filters by project', async () => {
    refreshAs(PM);
    serve();
    const { router } = open(`/admin/projects?view=list&seriesId=${SERIES}`);
    expect((await screen.findAllByText(/WC · সেশন 2026-27/)).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('columnheader', { name: 'সেশন' }).length).toBeGreaterThan(0);
    await waitFor(() => expect(pages()[0]?.searchParams.get('seriesId')).toBe(SERIES));
    expect(router.state.location.search).toContain(`seriesId=${SERIES}`);
  });
});
