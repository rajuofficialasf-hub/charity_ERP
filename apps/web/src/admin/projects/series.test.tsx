import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../api/client';
import { ProgramPage } from './ProgramPage';
import { ProjectSeriesPage } from './ProjectSeriesPage';

// A program's page with its permanent projects as cards, a project's page with its sessions, and
// the dialogs of a new project and a new session. Test data only.
const PM: Me = { ...ME, roles: ['program_manager'] };
const RPM: Me = { ...ME, roles: ['regional_program_manager'] };
const PROGRAM = '01900000-0000-7000-8000-0000000000b1';
const SERIES = '01900000-0000-7000-8000-0000000000d1';
const NOW = '01900000-0000-7000-8000-0000000000c2';
const BEFORE = '01900000-0000-7000-8000-0000000000c1';

const people = { people: [], total: 0 };
const programCard = (over: Record<string, unknown> = {}) => ({
  id: PROGRAM,
  code: 'UCD',
  name: { bn: 'স্বাবলম্বী প্রোগ্রাম', en: 'Self-reliance' },
  description: null,
  coverFileId: null,
  active: true,
  pm: null,
  rpms: people,
  projects: 1,
  runningProjects: 1,
  beneficiaries: 10,
  applications: 980,
  volunteers: 21,
  canCreate: false,
  ...over,
});
const current = (over: Record<string, unknown> = {}) => ({
  id: NOW,
  sessionLabel: '2026-27',
  periodFrom: '2026-06',
  periodTo: '2027-07',
  status: 'active',
  applyTo: '2026-12-31',
  daysLeft: 45,
  target: 600,
  approved: 412,
  applications: 980,
  rpms: {
    people: [{ id: '01900000-0000-7000-8000-0000000000e1', name: 'আরপিএম এক', photoFileId: null }],
    total: 1,
  },
  volunteers: 21,
  districts: 4,
  ...over,
});
const seriesCard = (over: Record<string, unknown> = {}) => ({
  id: SERIES,
  programId: PROGRAM,
  code: 'SWB',
  name: { bn: 'স্বাবলম্বী প্রকল্প', en: 'Self-reliance project' },
  description: null,
  coverFileId: null,
  sessionCount: 2,
  beneficiaries: 1240,
  current: current(),
  canCreate: false,
  ...over,
});
const sessions = (inside: boolean) => [
  {
    id: NOW,
    year: 2026,
    sessionLabel: '2026-27',
    periodFrom: '2026-06',
    periodTo: '2027-07',
    status: 'active',
    applications: 980,
    approved: 412,
    canOpen: inside,
  },
  {
    id: BEFORE,
    year: 2025,
    sessionLabel: '2025',
    periodFrom: '2025-01',
    periodTo: '2025-12',
    status: 'closed',
    applications: 700,
    approved: 650,
    canOpen: true,
  },
];
const detail = (over: Record<string, unknown> = {}) => ({
  ...seriesCard(),
  program: { id: PROGRAM, name: { bn: 'স্বাবলম্বী প্রোগ্রাম', en: 'Self-reliance' } },
  sessions: sessions(true),
  ...over,
});

let made: { body: unknown; key: string | null }[];
let seriesMade: unknown[];
let answer: () => Response;

function serve({
  programs = [programCard()],
  cards = [seriesCard()],
  one = detail(),
}: { programs?: unknown[]; cards?: unknown[]; one?: unknown } = {}) {
  made = [];
  seriesMade = [];
  answer = () => HttpResponse.json({ data: { id: 'new-session' }, meta: {} }, { status: 201 });
  server.use(
    http.get('*/api/v1/program-cards', () => HttpResponse.json({ data: programs, meta: {} })),
    http.get('*/api/v1/project-series', () => HttpResponse.json({ data: cards, meta: {} })),
    http.get(`*/api/v1/project-series/${SERIES}`, () =>
      HttpResponse.json({ data: one, meta: { etag: '"s1"' } }),
    ),
    http.post(`*/api/v1/project-series/${SERIES}/sessions`, async ({ request }) => {
      made.push({ body: await request.json(), key: request.headers.get('idempotency-key') });
      return answer();
    }),
    http.post('*/api/v1/project-series', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      seriesMade.push(body);
      return HttpResponse.json(
        { data: { ...detail(), ...body, id: 'new-series', sessions: [] }, meta: {} },
        { status: 201 },
      );
    }),
  );
}

const openProgram = () =>
  renderApp(<ProgramPage />, 'bn', {
    path: '/admin/projects/programs/:programId',
    initialPath: `/admin/projects/programs/${PROGRAM}`,
  });
const openSeries = () =>
  renderApp(<ProjectSeriesPage />, 'bn', {
    path: '/admin/projects/series/:seriesId',
    initialPath: `/admin/projects/series/${SERIES}`,
  });

beforeEach(() => {
  resetClientForTests();
});

describe('the project cards of a program', () => {
  it('shows the running session, the days left, the approved against the target and the target met', async () => {
    refreshAs(RPM);
    serve();
    const { container } = openProgram();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'স্বাবলম্বী প্রোগ্রাম' }),
    ).toBeInTheDocument();
    const card = within(await screen.findByRole('article', { name: 'স্বাবলম্বী প্রকল্প' }));
    expect(card.getByText('সেশন 2026-27 · সক্রিয়')).toBeInTheDocument();
    expect(card.getByText('আবেদন আর 45 দিন')).toBeInTheDocument();
    expect(card.getByText('412 / 600 অনুমোদিত')).toBeInTheDocument();
    expect(card.getByText('লক্ষ্য পূরণ')).toBeInTheDocument();
    expect(card.getByText('69%')).toBeInTheDocument();
    expect(card.getByRole('link', { name: 'স্বাবলম্বী প্রকল্প' })).toHaveAttribute(
      'href',
      `/admin/projects/series/${SERIES}`,
    );
    // the trail leads back to the tab, and an RPM starts nothing here
    expect(screen.getByRole('link', { name: 'প্রোগ্রাম ও প্রকল্প' })).toHaveAttribute(
      'href',
      '/admin/projects',
    );
    expect(screen.queryByRole('button', { name: 'নতুন প্রকল্প' })).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('says "শিগগির শেষ" with five days left', async () => {
    refreshAs(RPM);
    serve({ cards: [seriesCard({ current: current({ daysLeft: 5 }) })] });
    openProgram();
    expect(await screen.findByText('শিগগির শেষ · আবেদন আর 5 দিন')).toBeInTheDocument();
  });

  it('says there is no running session, and when the last one was', async () => {
    refreshAs(RPM);
    serve({
      cards: [
        seriesCard({
          current: current({ sessionLabel: '2025', status: 'closed', daysLeft: null }),
        }),
      ],
    });
    openProgram();
    expect(await screen.findByText('চলমান সেশন নেই · শেষ 2025')).toBeInTheDocument();
    expect(screen.queryByText(/আবেদন আর/)).not.toBeInTheDocument();
  });

  it('shows the caller’s own work with the budget on the back only when the read gives it', async () => {
    const user = userEvent.setup();
    refreshAs(PM);
    serve({
      cards: [
        seriesCard({ todo: { reviewsWaiting: 38, waitlisted: 21, budgetPlanned: '600000.00' } }),
      ],
    });
    openProgram();
    await user.click(
      await screen.findByRole('button', { name: 'স্বাবলম্বী প্রকল্প: বিস্তারিত দেখুন' }),
    );
    const work = within(screen.getByRole('region', { name: 'আপনার করণীয়' }));
    expect(work.getByText('38')).toBeInTheDocument();
    expect(work.getByText('বাজেট')).toBeInTheDocument();
    expect(screen.getByText('জেলায় কাজ চলছে')).toBeInTheDocument();
    expect(screen.getByText('1 জন RPM')).toBeInTheDocument();
  });

  it('offers "নতুন প্রকল্প" by the server’s answer, and a new project opens the setup of its first session', async () => {
    const user = userEvent.setup();
    refreshAs(PM);
    serve({ programs: [programCard({ canCreate: true })] });
    const { router } = openProgram();
    await user.click(await screen.findByRole('button', { name: 'নতুন প্রকল্প' }));
    const dialog = await screen.findByRole('dialog', { name: 'নতুন প্রকল্প' });
    expect(within(dialog).getByText('স্বাবলম্বী প্রোগ্রাম')).toBeInTheDocument();
    await user.type(within(dialog).getByRole('textbox', { name: /প্রকল্প কোড/ }), 'NEWP');
    await user.type(within(dialog).getByRole('textbox', { name: /বাংলায় নাম/ }), 'নতুন প্রকল্প');
    await user.type(within(dialog).getByRole('textbox', { name: /ইংরেজিতে নাম/ }), 'New');
    await user.type(
      within(dialog).getByRole('textbox', { name: /ছোট বিবরণ \(বাংলা\)/ }),
      'ছোট কথা',
    );
    await user.click(within(dialog).getByRole('button', { name: 'সেভ করুন' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/projects/new'));
    expect(router.state.location.search).toBe('?seriesId=new-series');
    expect(seriesMade).toEqual([
      {
        programId: PROGRAM,
        code: 'NEWP',
        name: { bn: 'নতুন প্রকল্প', en: 'New' },
        description: { bn: 'ছোট কথা', en: '' },
      },
    ]);
  });
});

describe('a project’s page', () => {
  it('opens a session the RPM reaches and says "অনুমতি নেই" for one outside the region, with no new session', async () => {
    refreshAs(RPM);
    serve({ one: detail({ sessions: sessions(false) }) });
    const { container } = openSeries();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'স্বাবলম্বী প্রকল্প' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('অনুমতি নেই').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'সেশন 2025 খুলুন' })[0]).toHaveAttribute(
      'href',
      `/admin/projects/${BEFORE}`,
    );
    expect(screen.queryByRole('link', { name: 'সেশন 2026-27 খুলুন' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'নতুন সেশন শুরু করুন' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'প্রকল্প এডিট করুন' })).not.toBeInTheDocument();
    // the trail goes up to the program
    expect(screen.getByRole('link', { name: 'স্বাবলম্বী প্রোগ্রাম' })).toHaveAttribute(
      'href',
      `/admin/projects/programs/${PROGRAM}`,
    );
    expect(screen.getByText('1,240')).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});

describe('a new session', () => {
  const start = async () => {
    const user = userEvent.setup();
    refreshAs(PM);
    serve({ one: detail({ canCreate: true }) });
    const view = openSeries();
    await user.click(await screen.findByRole('button', { name: 'নতুন সেশন শুরু করুন' }));
    const dialog = await screen.findByRole('dialog', { name: 'নতুন সেশন শুরু করুন' });
    return { user, dialog: within(dialog), view };
  };

  it('starts a year after the newest session, names it, copies the newest and says what is copied', async () => {
    const { user, dialog, view } = await start();
    expect(dialog.getByText('2027-28')).toBeInTheDocument();
    expect(dialog.getByRole('combobox', { name: /যেখান থেকে কপি হবে/ })).toHaveTextContent(
      'সেশন 2026-27',
    );
    for (const item of [
      'উপাদান ও তাদের সেটিং',
      'আবেদন ফর্ম',
      'নিয়মাবলি',
      'দাওয়াহ সিলেবাস',
      'স্কোরের নিয়ম',
    ])
      expect(
        within(dialog.getByRole('region', { name: 'কপি হবে' })).getByText(item),
      ).toBeInTheDocument();
    for (const item of [
      'তারিখ ও আবেদনের সময়',
      'বাজেটের অঙ্ক',
      'এলাকা ও RPM',
      'স্বেচ্ছাসেবক',
      'কোটার লক্ষ্য',
    ])
      expect(
        within(dialog.getByRole('region', { name: 'নতুন করে দিতে হবে' })).getByText(item),
      ).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'খসড়া তৈরি করুন' }));
    await waitFor(() =>
      expect(view.router.state.location.pathname).toBe('/admin/projects/new-session/setup'),
    );
    expect(made).toHaveLength(1);
    expect(made[0]!.body).toEqual({
      periodFrom: '2027-06',
      periodTo: '2028-07',
      sourceProjectId: NOW,
    });
    expect(made[0]!.key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('shows the refusal of a year already taken, and keeps "খসড়া তৈরি করুন" busy while it runs', async () => {
    const { user, dialog } = await start();
    let release: () => void = () => undefined;
    answer = () => {
      const refusal = HttpResponse.json(
        {
          error: {
            code: 'project.session_year_taken',
            messageKey: 'errors.project.session_year_taken',
            message: 'এই বছরে এই প্রকল্পের একটি সেশন আগে থেকেই আছে।',
            requestId: 'req_y',
          },
        },
        { status: 409 },
      );
      return new Promise<Response>((resolve) => {
        release = () => resolve(refusal);
      }) as unknown as Response;
    };
    const create = dialog.getByRole('button', { name: 'খসড়া তৈরি করুন' });
    await user.click(create);
    await waitFor(() => expect(made).toHaveLength(1));
    expect(dialog.getByRole('button', { name: /খসড়া তৈরি করুন/ })).toBeDisabled();
    release();
    expect(
      await dialog.findByText('এই বছরে এই প্রকল্পের একটি সেশন আগে থেকেই আছে।'),
    ).toBeInTheDocument();
  });
});
