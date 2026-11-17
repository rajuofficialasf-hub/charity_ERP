import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@/ui/testing';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { fakeUploadServer } from '../../../test/upload-server';
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
/** An answer of the fake API, now or later. */
type Answer = () => Response | Promise<Response>;
let answer: Answer;
let patches: { body: unknown; ifMatch: string | null }[];
let patchAnswer: Answer;
let covers: unknown[];
/** The version the series read answers with; a write by someone else moves it. */
let etag: string;
let reads: number;

function serve({
  programs = [programCard()],
  cards = [seriesCard()],
  one = detail(),
}: { programs?: unknown[]; cards?: unknown[]; one?: unknown } = {}) {
  made = [];
  seriesMade = [];
  patches = [];
  covers = [];
  etag = '"s1"';
  reads = 0;
  answer = () => HttpResponse.json({ data: { id: 'new-session' }, meta: {} }, { status: 201 });
  patchAnswer = () => HttpResponse.json({ data: one, meta: {} });
  server.use(
    http.get('*/api/v1/program-cards', () => HttpResponse.json({ data: programs, meta: {} })),
    http.get('*/api/v1/project-series', () => HttpResponse.json({ data: cards, meta: {} })),
    http.get(`*/api/v1/project-series/${SERIES}`, () => {
      reads += 1;
      return HttpResponse.json({ data: one, meta: { etag } });
    }),
    http.patch(`*/api/v1/project-series/${SERIES}`, async ({ request }) => {
      patches.push({ body: await request.json(), ifMatch: request.headers.get('if-match') });
      return patchAnswer();
    }),
    http.put(`*/api/v1/project-series/${SERIES}/cover`, async ({ request }) => {
      covers.push(await request.json());
      return HttpResponse.json({
        data: { fileId: '0190a1b2-c3d4-7e5f-8a9b-ffffffffffff' },
        meta: {},
      });
    }),
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
afterEach(() => {
  vi.restoreAllMocks();
});

describe('the project cards of a program', () => {
  it('shows the running session, the days left, the approved against the target and the target met', async () => {
    refreshAs(RPM);
    serve();
    const { container } = openProgram();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'স্বাবলম্বী প্রোগ্রাম' }),
    ).toBeInTheDocument();
    // the tab is named as every page of the app names it: the name alone
    await waitFor(() => expect(document.title).toBe('স্বাবলম্বী প্রোগ্রাম'));
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
  }, 20_000);

  it('says a program it does not know is not found, with the way back to the tab', async () => {
    refreshAs(RPM);
    serve();
    renderApp(<ProgramPage />, 'bn', {
      path: '/admin/projects/programs/:programId',
      initialPath: '/admin/projects/programs/01900000-0000-7000-8000-000000000999',
    });
    expect(await screen.findByText('এই প্রোগ্রাম পাওয়া যায়নি।')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'প্রোগ্রাম ও প্রকল্প' })).toHaveAttribute(
      'href',
      '/admin/projects',
    );
  });

  it('sends a project card with no session to copy from to the wizard of its next session', async () => {
    const user = userEvent.setup();
    refreshAs(PM);
    serve({
      cards: [seriesCard({ canCreate: true, current: null })],
      one: detail({ canCreate: true, sessions: [], current: null }),
    });
    const { router } = openProgram();
    await user.click(
      await screen.findByRole('button', { name: 'স্বাবলম্বী প্রকল্প: বিস্তারিত দেখুন' }),
    );
    await user.click(screen.getByRole('button', { name: 'নতুন সেশন শুরু করুন' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/projects/new'));
    expect(router.state.location.search).toBe(`?seriesId=${SERIES}`);
    expect(made).toEqual([]);
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
    // the two months of a period in words, so they never run together
    expect(screen.getAllByText('06-2026 থেকে 07-2027').length).toBeGreaterThan(0);
    await expectNoAxeViolations(container);
  });
});

describe('a project\u2019s edit', () => {
  const openEdit = async () => {
    const user = userEvent.setup();
    const view = openSeries();
    await user.click(await screen.findByRole('button', { name: 'প্রকল্প এডিট করুন' }));
    const dialog = await screen.findByRole('dialog', { name: 'প্রকল্প এডিট করুন: SWB' });
    // the fields come from the record read at this opening
    await waitFor(() =>
      expect(within(dialog).getByRole('textbox', { name: /বাংলায় নাম/ })).toHaveValue(
        'স্বাবলম্বী প্রকল্প',
      ),
    );
    return { user, dialog: within(dialog), view };
  };

  it('saves a new name with the version it was opened at', async () => {
    refreshAs(PM);
    serve({ one: detail({ canCreate: true }) });
    const { user, dialog } = await openEdit();
    const bn = dialog.getByRole('textbox', { name: /বাংলায় নাম/ });
    await user.clear(bn);
    await user.type(bn, 'নতুন নাম');
    await user.click(dialog.getByRole('button', { name: 'সেভ করুন' }));
    await waitFor(() =>
      expect(patches).toEqual([
        {
          body: { name: { bn: 'নতুন নাম', en: 'Self-reliance project' } },
          ifMatch: '"s1"',
        },
      ]),
    );
    expect(await screen.findByText('প্রকল্প SWB সংরক্ষিত হয়েছে।')).toBeInTheDocument();
  }, 20_000);

  it('says an edit is stale, and the next opening reads the record and its version again', async () => {
    refreshAs(PM);
    serve({ one: detail({ canCreate: true }) });
    patchAnswer = () =>
      HttpResponse.json(
        {
          error: {
            code: 'version.stale',
            messageKey: 'errors.version.stale',
            message: 'অন্য কেউ এর মধ্যে এটি বদলেছেন। আবার খুলে নতুন করে চেষ্টা করুন।',
            requestId: 'req_s',
          },
        },
        { status: 412 },
      );
    const first = await openEdit();
    const bn = first.dialog.getByRole('textbox', { name: /বাংলায় নাম/ });
    await first.user.clear(bn);
    await first.user.type(bn, 'নতুন নাম');
    await first.user.click(first.dialog.getByRole('button', { name: 'সেভ করুন' }));
    expect(await first.dialog.findByText(/অন্য কেউ এর মধ্যে এটি বদলেছেন/)).toBeInTheDocument();
    // someone else's change moved the version; the dialog is closed and opened again
    etag = '"s2"';
    const readsBefore = reads;
    await first.user.click(first.dialog.getByRole('button', { name: 'বাতিল' }));
    patchAnswer = () => HttpResponse.json({ data: detail(), meta: {} });
    const second = await openEdit();
    expect(reads).toBeGreaterThan(readsBefore);
    const again = second.dialog.getByRole('textbox', { name: /বাংলায় নাম/ });
    await second.user.clear(again);
    await second.user.type(again, 'আবার');
    await second.user.click(second.dialog.getByRole('button', { name: 'সেভ করুন' }));
    await waitFor(() => expect(patches).toHaveLength(2));
    expect(patches[1]!.ifMatch).toBe('"s2"');
  }, 20_000);

  it('sets the chosen cover after the save with the finalized upload', async () => {
    refreshAs(PM);
    serve({ one: detail({ canCreate: true }) });
    const uploads = fakeUploadServer();
    uploads.virusScan = 'skipped';
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
    const { user, dialog } = await openEdit();
    const input = document.querySelector<HTMLInputElement>('[role="dialog"] input[type="file"]')!;
    await user.upload(
      input,
      new File([new Uint8Array([1, 2, 3])], 'cover.jpg', { type: 'image/jpeg' }),
    );
    await user.click(dialog.getByRole('button', { name: 'সেভ করুন' }));
    await waitFor(() =>
      expect(covers).toEqual([{ fileId: '0190a1b2-c3d4-7e5f-8a9b-ffffffffffff' }]),
    );
    expect(uploads.creates[0]).toMatchObject({
      kind: 'cover_photo',
      entityType: 'project_series',
      entityId: SERIES,
      slot: 'cover_upload',
    });
    // nothing else changed, so the series itself is not written
    expect(patches).toEqual([]);
  }, 20_000);
});

describe('a new session', () => {
  it('leads to the wizard from a project with no session to copy from', async () => {
    refreshAs(PM);
    serve({
      one: detail({
        canCreate: true,
        // every session is outside the caller's reach (the read leaves cancelled ones out)
        sessions: sessions(true).map((row) => ({ ...row, canOpen: false })),
      }),
    });
    openSeries();
    expect(await screen.findByRole('link', { name: 'নতুন সেশন শুরু করুন' })).toHaveAttribute(
      'href',
      `/admin/projects/new?seriesId=${SERIES}`,
    );
  });

  it('posts a whole body when Enter submits the dialog', async () => {
    const user = userEvent.setup();
    refreshAs(PM);
    serve({ one: detail({ canCreate: true }) });
    openSeries();
    await user.click(await screen.findByRole('button', { name: 'নতুন সেশন শুরু করুন' }));
    const dialog = await screen.findByRole('dialog', { name: 'নতুন সেশন শুরু করুন' });
    fireEvent.submit(within(dialog).getByRole('form'));
    await waitFor(() => expect(made).toHaveLength(1));
    expect(made[0]!.body).toEqual({
      periodFrom: '2027-06',
      periodTo: '2028-07',
      sourceProjectId: NOW,
    });
  });

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
      });
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
