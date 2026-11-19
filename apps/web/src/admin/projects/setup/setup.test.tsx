import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../../test/auth';
import { server } from '../../../../test/msw/server';
import { resetClientForTests } from '../../../api/client';
import { ProjectSetupPage } from './ProjectSetupPage';
import { stubMatchMedia } from '../../../../test/match-media';

// The project setup wizard (docs/ui/SCREENS.md "Project setup with component toggles"): one step at a time, Back and Next saving the step,
// save and exit, the step indicator with its marks, the first step creating the draft, the review
// that activates, the state and phone rules and a stale version. Test data only.
const PM: Me = { ...ME, roles: ['program_manager'] };
const ID = '01900000-0000-7000-8000-0000000000c1';
const PROGRAM = '01900000-0000-7000-8000-0000000000b1';
const SERIES = '01900000-0000-7000-8000-0000000000d1';

let project: Record<string, unknown>;
let writes: { path: string; body: unknown }[];
let quotaRows: {
  level: string;
  locationId: string;
  locationName?: { bn: string; en: string };
  target: number;
  received?: number;
  approved?: number;
  full?: boolean;
}[];
let patchStatus: number;
let componentAnswer: { status: number; body: Record<string, unknown> } | null;
let staffRows: Record<string, unknown>[];

const criteria = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    code: `c_${i + 1}`,
    label: { bn: `মান ${i + 1}`, en: `Quality ${i + 1}` },
  }));
const COMPONENTS = [
  { componentKey: 'distribution', enabled: true, settings: { source: {} }, etag: '"d1"' },
  {
    componentKey: 'rating_criteria',
    enabled: true,
    settings: { criteria: criteria(5) },
    etag: '"r1"',
  },
  { componentKey: 'dawah', enabled: false, settings: {}, etag: '"w1"' },
];

function serve(status = 'draft') {
  project = {
    id: ID,
    code: 'WC',
    year: 2026,
    periodFrom: '2026-01',
    periodTo: '2026-12',
    sessionLabel: '2026',
    seriesId: SERIES,
    name: { bn: 'শীতবস্ত্র বিতরণ', en: 'Winter clothing' },
    status,
    workflowKey: 'distribution',
    applyFrom: '2026-11-01',
    applyTo: '2026-12-31',
    perVolunteerLimit: null,
    dawahEnabled: false,
    programId: PROGRAM,
    description: null,
    costPerBeneficiary: null,
    targetBeneficiaries: null,
    budgetPlanned: null,
  };
  writes = [];
  quotaRows = [];
  patchStatus = 200;
  componentAnswer = null;
  staffRows = [];
  server.use(
    http.get(`*/api/v1/projects/${ID}`, () =>
      HttpResponse.json({ data: project, meta: { etag: '"p1"' } }),
    ),
    http.patch(`*/api/v1/projects/${ID}`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      writes.push({ path: 'project', body });
      if (patchStatus === 412)
        return HttpResponse.json(
          {
            error: {
              code: 'precondition.failed',
              messageKey: 'errors.precondition.failed',
              message: 'stale',
              requestId: 'req_x',
            },
          },
          { status: 412 },
        );
      project = { ...project, ...body };
      return HttpResponse.json({ data: project, meta: { etag: '"p2"' } });
    }),
    http.get(`*/api/v1/projects/${ID}/components`, () =>
      HttpResponse.json({ data: COMPONENTS, meta: {} }),
    ),
    http.patch(`*/api/v1/projects/${ID}/components/:key`, async ({ request, params }) => {
      writes.push({ path: `component:${String(params.key)}`, body: await request.json() });
      if (componentAnswer)
        return HttpResponse.json(componentAnswer.body, { status: componentAnswer.status });
      return HttpResponse.json({ data: COMPONENTS[0], meta: {} });
    }),
    http.get(`*/api/v1/projects/${ID}/forms`, () =>
      HttpResponse.json({
        data: [
          {
            id: '01900000-0000-7000-8000-0000000000f1',
            key: 'default',
            title: { bn: 'আবেদন', en: 'Application' },
            publishedVersionId: '01900000-0000-7000-8000-0000000000f2',
            draftVersionId: null,
            kind: 'beneficiary_application',
          },
        ],
        meta: { requestId: 'req_test' },
      }),
    ),
    http.get(`*/api/v1/projects/${ID}/fund-sources`, () =>
      HttpResponse.json({ data: [], meta: {} }),
    ),
    // saved rules: the rules texts are not what these tests look at
    http.get(`*/api/v1/projects/${ID}/rules`, () =>
      HttpResponse.json({
        data: {
          version: 1,
          rules: {
            volunteer_duties: { bn: 'দায়িত্ব', en: 'Duties' },
            implementation_process: { bn: 'প্রক্রিয়া', en: 'Process' },
            misconduct: { bn: 'অনিয়ম', en: 'Misconduct' },
          },
        },
        meta: {},
      }),
    ),
    http.get(`*/api/v1/projects/${ID}/areas`, () => HttpResponse.json({ data: [], meta: {} })),
    http.get(`*/api/v1/projects/${ID}/quotas`, () =>
      HttpResponse.json({ data: quotaRows, meta: {} }),
    ),
    http.patch(`*/api/v1/projects/${ID}/quotas`, async ({ request }) => {
      const body = (await request.json()) as { quotas: typeof quotaRows };
      writes.push({ path: 'quotas', body });
      quotaRows = body.quotas.map((q) => ({
        ...q,
        locationName: { bn: 'সাভার', en: 'Savar' },
        received: 0,
        approved: 0,
        full: false,
      }));
      return HttpResponse.json({ data: quotaRows, meta: {} });
    }),
    http.get(`*/api/v1/projects/${ID}/staff`, () =>
      HttpResponse.json({ data: staffRows, meta: {} }),
    ),
    http.patch(`*/api/v1/projects/${ID}/fund-sources`, async ({ request }) => {
      writes.push({ path: 'fund-sources', body: await request.json() });
      return HttpResponse.json({ data: [], meta: {} });
    }),
    http.post(`*/api/v1/projects/${ID}/staff`, async ({ request }) => {
      writes.push({ path: 'staff', body: await request.json() });
      return HttpResponse.json({ data: staffRows, meta: {} }, { status: 201 });
    }),
    http.post('*/api/v1/project-staff/:id/end', async ({ request, params }) => {
      writes.push({ path: `end:${String(params.id)}`, body: await request.json() });
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(`*/api/v1/projects/${ID}/candidates`, ({ request }) => {
      writes.push({ path: 'candidates', body: new URL(request.url).searchParams.get('role') });
      return HttpResponse.json({
        data: [
          {
            id: '01900000-0000-7000-8000-0000000000e1',
            displayName: 'নমুনা এক্সিকিউটিভ',
            designation: null,
          },
        ],
        meta: {},
      });
    }),
    http.get('*/api/v1/programs', () =>
      HttpResponse.json({
        data: [
          {
            id: PROGRAM,
            code: 'HUM',
            name: { bn: 'মানবিক সহায়তা', en: 'Humanitarian' },
            pmUserId: null,
            pmName: null,
            active: true,
          },
        ],
        meta: {},
      }),
    ),
    http.get('*/api/v1/locations', () => HttpResponse.json({ data: [], meta: {} })),
    // the program's name, from the cards
    http.get('*/api/v1/program-cards', () =>
      HttpResponse.json({
        data: [
          {
            id: PROGRAM,
            code: 'HUM',
            name: { bn: 'মানবিক সহায়তা', en: 'Humanitarian' },
            description: null,
            coverFileId: null,
            active: true,
            pm: null,
            rpms: { people: [], total: 0 },
            projects: 1,
            runningProjects: 1,
            beneficiaries: 0,
            applications: 0,
            volunteers: 0,
            canCreate: true,
          },
        ],
        meta: {},
      }),
    ),
    // the series the first step starts a session of
    http.get(`*/api/v1/project-series/${SERIES}`, () =>
      HttpResponse.json({
        data: {
          id: SERIES,
          programId: PROGRAM,
          code: 'WC',
          name: { bn: 'শীতবস্ত্র বিতরণ', en: 'Winter clothing' },
          description: null,
          coverFileId: null,
          sessionCount: 0,
          beneficiaries: 0,
          current: null,
          canCreate: true,
          program: { id: PROGRAM, name: { bn: 'মানবিক সহায়তা', en: 'Humanitarian' } },
          sessions: [],
        },
        meta: {},
      }),
    ),
    http.post('*/api/v1/projects', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      writes.push({ path: 'create', body });
      return HttpResponse.json(
        { data: { ...project, id: 'new-id', seriesId: body.seriesId }, meta: {} },
        { status: 201 },
      );
    }),
    http.post(`*/api/v1/projects/${ID}/activate`, ({ request }) => {
      writes.push({ path: 'activate', body: request.headers.get('if-match') });
      return HttpResponse.json({ data: { ...project, status: 'active' }, meta: {} });
    }),
  );
}

const open = (step?: string) =>
  renderApp(<ProjectSetupPage />, 'bn', {
    path: '/admin/projects/:projectId/setup',
    initialPath: `/admin/projects/${ID}/setup${step ? `?step=${step}` : ''}`,
  });
const section = async (name: string) => screen.findByRole('region', { name });
const steps = () => screen.getByRole('list', { name: 'সেটআপের ধাপ' });
const next = () => screen.getByRole('button', { name: 'পরের ধাপ' });
// the session's frame holds the page's main heading; the setup names its own page under it
const heading = () => screen.getByRole('heading', { level: 2, name: /^সেটআপ:/ });
/** The first step of a new session of the series. */
const openNew = (search = `?seriesId=${SERIES}`) =>
  renderApp(<ProjectSetupPage />, 'bn', {
    path: '/admin/projects/new',
    initialPath: `/admin/projects/new${search}`,
  });

beforeEach(() => {
  resetClientForTests();
  refreshAs(PM);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the setup wizard', () => {
  it('opens the first step with something missing and marks the checked steps, without accessibility violations', async () => {
    serve();
    const { container, router } = open();
    // the photo rule is missing, so the components come first after the complete basics
    expect(await section('উপাদান')).toBeInTheDocument();
    // the opening step is written to the address, so a later save keeps the user on it
    await waitFor(() => expect(router.state.location.search).toBe('?step=components'));
    const list = steps();
    expect(within(list).getByRole('button', { name: 'মৌলিক তথ্য' })).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'উপাদান, বাকি আছে' })).toBeInTheDocument();
    expect(
      within(list).getByRole('button', { name: 'বাজেট ও তহবিলের উৎস, বাকি আছে' }),
    ).toBeInTheDocument();
    expect(screen.getByText('ধাপ 2/8')).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('saves only the step on screen with Next and moves on; an unchanged step moves without a save', async () => {
    serve();
    const user = userEvent.setup();
    const { router } = open('window');
    const window = await section('আবেদনের সময়সীমা ও সীমা');
    await user.type(within(window).getByRole('textbox', { name: /আবেদন সীমা/ }), '50');
    await user.click(next());
    await waitFor(() => expect(router.state.location.search).toBe('?step=areas'));
    expect(writes).toEqual([{ path: 'project', body: { perVolunteerLimit: 50 } }]);
    expect(await section('এলাকা ও আরপিএম')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'আগের ধাপ' }));
    await waitFor(() => expect(router.state.location.search).toBe('?step=window'));
    expect(writes).toHaveLength(1);
  }, 20_000);

  it('says a window ending before it opens at once, keeps the step, and saves nothing on Enter', async () => {
    serve();
    const user = userEvent.setup();
    const { router } = open('window');
    const window = await section('আবেদনের সময়সীমা ও সীমা');
    const end = within(window).getByRole('group', { name: /^আবেদনের শেষ তারিখ/ });
    await user.click(within(end).getAllByRole('spinbutton')[0]!);
    await user.keyboard('01102026');
    expect(
      await within(window).findByText('শেষ তারিখ শুরুর তারিখের আগে হতে পারে না।'),
    ).toBeInTheDocument();
    await user.type(within(window).getByRole('textbox', { name: /আবেদন সীমা/ }), '50{Enter}');
    await user.click(next());
    expect(
      await within(window).findAllByText('শেষ তারিখ শুরুর তারিখের আগে হতে পারে না।'),
    ).toHaveLength(2);
    expect(writes).toEqual([]);
    expect(router.state.location.search).toBe('?step=window');
  });

  it('saves before a step of the indicator opens', async () => {
    serve();
    const user = userEvent.setup();
    const { router } = open('window');
    const window = await section('আবেদনের সময়সীমা ও সীমা');
    await user.type(within(window).getByRole('textbox', { name: /আবেদন সীমা/ }), '20');
    await user.click(within(steps()).getByRole('button', { name: /^পর্যালোচনা/ }));
    await waitFor(() => expect(router.state.location.search).toBe('?step=review'));
    expect(writes).toEqual([{ path: 'project', body: { perVolunteerLimit: 20 } }]);
  });

  it('saves the draft and exits to the project', async () => {
    serve();
    const user = userEvent.setup();
    const { router } = open('basics');
    const basics = await section('মৌলিক তথ্য');
    await user.type(within(basics).getByRole('textbox', { name: /ইংরেজিতে নাম/ }), ' 2026');
    await user.click(screen.getByRole('button', { name: 'খসড়া সেভ করে বের হন' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/admin/projects/${ID}`));
    expect(router.state.location.state).toEqual({ notice: 'খসড়া সংরক্ষিত হয়েছে।' });
    expect(writes).toEqual([
      { path: 'project', body: { name: { bn: 'শীতবস্ত্র বিতরণ', en: 'Winter clothing 2026' } } },
    ]);
  });

  it('stays on a step the server refuses or the user left incomplete', async () => {
    serve();
    patchStatus = 412;
    const user = userEvent.setup();
    const { router } = open('basics');
    let basics = await section('মৌলিক তথ্য');
    await user.type(within(basics).getByRole('textbox', { name: /ইংরেজিতে নাম/ }), ' 2026');
    await user.click(next());
    // someone else changed the project: the step reloads with the notice and stays
    expect(
      await screen.findByText(
        'এর মধ্যে অন্য কেউ এই অংশ বদলেছেন। সর্বশেষ তথ্য দেখানো হচ্ছে; আবার সংরক্ষণ করুন।',
      ),
    ).toBeInTheDocument();
    expect(router.state.location.search).toBe('?step=basics');
    basics = await section('মৌলিক তথ্য');
    await user.clear(within(basics).getByRole('textbox', { name: /ইংরেজিতে নাম/ }));
    const before = writes.length;
    await user.click(next());
    expect(await screen.findByText('দুই ভাষায় নাম আর ঠিক সময়কাল দিন।')).toBeInTheDocument();
    expect(writes).toHaveLength(before);
    expect(router.state.location.search).toBe('?step=basics');
  });

  it('shows the saved settings when the dialog opens again before the list is read anew', async () => {
    serve();
    const saved = {
      ...COMPONENTS[1]!,
      settings: { criteria: criteria(4) },
      etag: '"r2"',
    };
    // the list's second read never answers: the dialog opens again while it is on its way
    let reads = 0;
    const versions: (string | null)[] = [];
    server.use(
      http.patch(`*/api/v1/projects/${ID}/components/:key`, ({ request }) => {
        versions.push(request.headers.get('If-Match'));
        return HttpResponse.json({ data: saved, meta: {} });
      }),
      http.get(`*/api/v1/projects/${ID}/components`, async () => {
        reads += 1;
        if (reads > 1) await new Promise(() => undefined);
        return HttpResponse.json({ data: COMPONENTS, meta: {} });
      }),
    );
    const user = userEvent.setup();
    open('components');
    const settingsOf = 'রেটিংয়ের মানদণ্ড-এর সেটিংস';
    await user.click(await screen.findByRole('button', { name: settingsOf }));
    let dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'সংরক্ষণ' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: settingsOf }));
    dialog = await screen.findByRole('dialog');
    // four criteria now, so a fifth may be added, and the next save carries the new version
    expect(within(dialog).getByRole('button', { name: 'যোগ করুন (সর্বোচ্চ 5)' })).toBeEnabled();
    await user.click(within(dialog).getByRole('button', { name: 'সংরক্ষণ' }));
    await waitFor(() => expect(versions).toEqual(['"r1"', '"r2"']));
  });

  it('refuses a sixth rating criterion and shows the server field error', async () => {
    serve();
    componentAnswer = {
      status: 422,
      body: {
        error: {
          code: 'validation.failed',
          messageKey: 'errors.validation.failed',
          message: 'যাচাই ব্যর্থ হয়েছে।',
          requestId: 'req_x',
          details: [{ path: 'settings.criteria.0.label', code: 'validation.failed', message: '' }],
        },
      },
    };
    const user = userEvent.setup();
    open('components');
    await user.click(await screen.findByRole('button', { name: 'রেটিংয়ের মানদণ্ড-এর সেটিংস' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'যোগ করুন (সর্বোচ্চ 5)' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'সংরক্ষণ' }));
    expect(
      await within(dialog).findByText('গ্রহণযোগ্য নয়: settings.criteria.0.label'),
    ).toBeInTheDocument();
  });

  it('holds an active budget until its fund sources are equal, and saves them together', async () => {
    serve('active');
    project = { ...project, costPerBeneficiary: '100.00', targetBeneficiaries: 10 };
    const user = userEvent.setup();
    const { router } = open('budget');
    const budget = await section('বাজেট ও তহবিলের উৎস');
    await user.click(within(budget).getByRole('button', { name: 'তহবিলের উৎস যোগ করুন' }));
    await user.type(within(budget).getByRole('textbox', { name: /পরিমাণ/ }), '900');
    await user.click(next());
    // the section's own note and the warning the step's Next found
    expect(
      await within(budget).findAllByText(
        'তহবিলের উৎসগুলোর মোট পরিকল্পিত বাজেটের সমান নয়। সক্রিয় প্রকল্প সমান হলেই সংরক্ষণ হয়।',
      ),
    ).toHaveLength(2);
    expect(writes).toEqual([]);
    await user.clear(within(budget).getByRole('textbox', { name: /পরিমাণ/ }));
    await user.type(within(budget).getByRole('textbox', { name: /পরিমাণ/ }), '1000');
    await user.click(next());
    await waitFor(() => expect(router.state.location.search).toBe('?step=window'));
    expect(writes).toEqual([
      {
        path: 'fund-sources',
        body: {
          costPerBeneficiary: '100.00',
          targetBeneficiaries: 10,
          fundSources: [{ source: 'general', amount: '1000' }],
        },
      },
    ]);
  }, 20_000);

  it('gives staff access with its role and ends it only with a reason', async () => {
    serve();
    staffRows = [
      {
        id: '01900000-0000-7000-8000-0000000000f1',
        userId: '01900000-0000-7000-8000-0000000000f2',
        displayName: 'নমুনা দায়ী',
        roleKey: 'official_daee',
        areaLocationId: null,
        canView: true,
        canEdit: false,
        canDelete: false,
      },
    ];
    const user = userEvent.setup();
    open('staff');
    const staff = await section('স্টাফের অ্যাক্সেস');
    await user.click(within(staff).getByRole('combobox', { name: /ভূমিকা/ }));
    await user.click(await screen.findByRole('option', { name: 'প্রজেক্ট এক্সিকিউটিভ' }));
    await user.type(within(staff).getByRole('combobox', { name: /কর্মকর্তা/ }), 'নমুনা');
    await user.click(await screen.findByRole('option', { name: 'নমুনা এক্সিকিউটিভ' }));
    expect(writes).toContainEqual({ path: 'candidates', body: 'project_executive' });
    await user.click(within(staff).getByRole('checkbox', { name: 'সম্পাদনা' }));
    await user.click(within(staff).getByRole('button', { name: 'অ্যাক্সেস দিন' }));
    await waitFor(() =>
      expect(writes.filter((w) => w.path === 'staff').at(-1)).toEqual({
        path: 'staff',
        body: {
          userId: '01900000-0000-7000-8000-0000000000e1',
          roleKey: 'project_executive',
          canView: true,
          canEdit: true,
          canDelete: false,
        },
      }),
    );
    await user.click(
      within(staff).getByRole('button', { name: 'নমুনা দায়ী-এর অ্যাক্সেস শেষ করুন' }),
    );
    const dialog = await screen.findByRole('dialog');
    const end = within(dialog).getByRole('button', { name: 'অ্যাক্সেস শেষ করুন' });
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), 'বদ');
    expect(end).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), 'লি');
    await user.click(end);
    await waitFor(() =>
      expect(writes.at(-1)).toEqual({
        path: 'end:01900000-0000-7000-8000-0000000000f1',
        body: { reason: 'বদলি' },
      }),
    );
  }, 20_000);

  it('reviews what is missing, opens its step, and activates a draft', async () => {
    serve();
    const user = userEvent.setup();
    const { router } = open('review');
    const review = await section('পর্যালোচনা');
    const missing = within(review).getByRole('list');
    expect(within(missing).getByText('প্রতি স্বেচ্ছাসেবকের আবেদন সীমা')).toBeInTheDocument();
    const [openStep] = within(missing).getAllByRole('button', { name: 'ধাপটি খুলুন' });
    await user.click(openStep!);
    await waitFor(() => expect(router.state.location.search).not.toBe('?step=review'));
    expect(writes).toEqual([]);

    await user.click(within(steps()).getByRole('button', { name: /^পর্যালোচনা/ }));
    await user.click(await screen.findByRole('button', { name: 'সক্রিয় করুন' }));
    // the activation asks first, saying what follows from it, and nothing is sent until then
    const ask = await screen.findByRole('alertdialog', { name: 'প্রকল্পটি সক্রিয় করবেন?' });
    expect(ask).toHaveTextContent('কোড, প্রোগ্রাম, বছর ও ওয়ার্কফ্লো আর বদলানো যাবে না।');
    expect(writes).toEqual([]);
    await user.click(within(ask).getByRole('button', { name: 'সক্রিয় করুন' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/admin/projects/${ID}`));
    expect(writes).toEqual([{ path: 'activate', body: '"p1"' }]);
    expect(router.state.location.state).toEqual({ notice: 'প্রকল্প সক্রিয় হয়েছে।' });
  });

  it('leads a missing published form to the builder, or to a new form without one', async () => {
    serve();
    // the activation asks for a published form only while the application form is on
    const draftOnly = (rows: unknown[]) =>
      server.use(
        http.get(`*/api/v1/projects/${ID}/forms`, () =>
          HttpResponse.json({ data: rows, meta: { requestId: 'req_test' } }),
        ),
        http.get(`*/api/v1/projects/${ID}/components`, () =>
          HttpResponse.json({
            data: [
              ...COMPONENTS,
              { componentKey: 'application_form', enabled: true, settings: {}, etag: '"a1"' },
            ],
            meta: {},
          }),
        ),
      );
    draftOnly([
      {
        id: '01900000-0000-7000-8000-0000000000f1',
        key: 'default',
        title: { bn: 'আবেদন', en: 'Application' },
        publishedVersionId: null,
        draftVersionId: '01900000-0000-7000-8000-0000000000f3',
        kind: 'beneficiary_application',
      },
    ]);
    const first = open('review');
    let review = within(await section('পর্যালোচনা'));
    expect(await review.findByText('প্রকাশিত আবেদন ফর্ম')).toBeInTheDocument();
    expect(review.getByRole('link', { name: 'ফর্ম বিল্ডার খুলুন' })).toHaveAttribute(
      'href',
      `/admin/projects/${ID}/forms/01900000-0000-7000-8000-0000000000f1`,
    );
    first.unmount();
    resetClientForTests();
    refreshAs({ ...ME, roles: ['program_manager'] });
    draftOnly([]);
    open('review');
    review = within(await section('পর্যালোচনা'));
    expect(await review.findByRole('link', { name: 'ফর্ম বিল্ডার খুলুন' })).toHaveAttribute(
      'href',
      `/admin/projects/${ID}/forms?new=1`,
    );
  });

  it('links the application form component to the project form in the builder', async () => {
    serve();
    server.use(
      http.get(`*/api/v1/projects/${ID}/components`, () =>
        HttpResponse.json({
          data: [
            ...COMPONENTS,
            { componentKey: 'application_form', enabled: true, settings: {}, etag: '"a1"' },
          ],
          meta: {},
        }),
      ),
    );
    open('components');
    const components = within(await section('উপাদান'));
    expect(await components.findByRole('link', { name: 'ফর্ম বিল্ডার খুলুন' })).toHaveAttribute(
      'href',
      `/admin/projects/${ID}/forms/01900000-0000-7000-8000-0000000000f1`,
    );
  });

  describe('what the application asks', () => {
    const FORM_ID = '01900000-0000-7000-8000-0000000000f1';
    const withForm = (settings: Record<string, unknown>) =>
      server.use(
        http.get(`*/api/v1/projects/${ID}/components`, () =>
          HttpResponse.json({
            data: [
              ...COMPONENTS,
              { componentKey: 'application_form', enabled: true, settings, etag: '"a1"' },
            ],
            meta: {},
          }),
        ),
      );
    const openDrawer = async (user: ReturnType<typeof userEvent.setup>) => {
      open('components');
      await user.click(await screen.findByRole('button', { name: 'আবেদন ফর্ম-এর সেটিংস' }));
      return within(await screen.findByRole('dialog'));
    };
    const chosen = (dialog: ReturnType<typeof within>, group: string) =>
      within(dialog.getByRole('radiogroup', { name: group }))
        .getAllByRole('radio')
        .filter((radio) => (radio as HTMLInputElement).checked)
        .map((radio) => radio.getAttribute('value'));

    it('shows the four choices as a project that never said anything reads, and sends only what the PM changes', async () => {
      serve();
      withForm({ form_ids: [FORM_ID] });
      const user = userEvent.setup();
      const dialog = await openDrawer(user);
      expect(dialog.getByText('আবেদনে যা চাওয়া হবে')).toBeInTheDocument();
      expect(dialog.getByText('এখানে যা বদলাবেন, শুধু এই প্রকল্পে বদলাবে।')).toBeInTheDocument();
      const document = within(
        dialog.getByRole('radiogroup', { name: 'পরিচয়পত্র (এনআইডি বা জন্মনিবন্ধন)' }),
      );
      expect(document.getByRole('radio', { name: 'বাধ্যতামূলক' })).toBeChecked();
      expect(document.getByRole('radio', { name: 'থাকলে দিন' })).not.toBeChecked();
      const mobile = within(dialog.getByRole('radiogroup', { name: 'মোবাইল নম্বর' }));
      expect(mobile.getByRole('radio', { name: 'বাধ্যতামূলক' })).toBeChecked();
      expect(
        mobile.getByRole('radio', { name: 'না থাকলে স্বেচ্ছাসেবকের মাধ্যমে যোগাযোগ' }),
      ).not.toBeChecked();
      for (const name of ['একই মানুষ আবার এলে', 'একই পরিবারের কেউ আবার এলে']) {
        const repeat = within(dialog.getByRole('radiogroup', { name }));
        expect(repeat.getByRole('radio', { name: 'অনুমোদনের আগে কারণ লিখতে হবে' })).toBeChecked();
        expect(repeat.getByRole('radio', { name: 'শুধু জানাবে' })).not.toBeChecked();
      }

      await user.click(document.getByRole('radio', { name: 'থাকলে দিন' }));
      await user.click(
        within(dialog.getByRole('radiogroup', { name: 'একই পরিবারের কেউ আবার এলে' })).getByRole(
          'radio',
          { name: 'শুধু জানাবে' },
        ),
      );
      expect(chosen(dialog, 'পরিচয়পত্র (এনআইডি বা জন্মনিবন্ধন)')).toEqual(['optional']);
      await user.click(dialog.getByRole('button', { name: 'সংরক্ষণ' }));
      await waitFor(() =>
        expect(writes).toContainEqual({
          path: 'component:application_form',
          // the forms the component names stay, and the two untouched choices are not written
          body: {
            settings: { form_ids: [FORM_ID], identity_document: 'optional', repeat_family: 'tell' },
          },
        }),
      );
    });

    it('shows the starting review checklist, and writes the PM’s items and switch', async () => {
      serve();
      withForm({ form_ids: [FORM_ID] });
      const user = userEvent.setup();
      const dialog = await openDrawer(user);
      const list = within(dialog.getByRole('group', { name: 'রিভিউ চেকলিস্ট' }));
      expect(list.getByDisplayValue('পরিচয় যাচাই')).toBeInTheDocument();
      expect(list.getByDisplayValue('ঠিকানা যাচাই')).toBeInTheDocument();
      expect(list.getByDisplayValue('যোগ্যতা যাচাই')).toBeInTheDocument();
      const required = dialog.getByRole('switch', {
        name: 'সব বিষয় দেখা না হলে অনুমোদনের জন্য পাঠানো যাবে না',
      });
      expect(required).not.toBeChecked();
      // the address goes, a project item comes, and the checklist becomes required
      await user.click(list.getByRole('button', { name: 'আইটেম 2 সরান' }));
      await user.click(list.getByRole('button', { name: /যোগ করুন/ }));
      const fields = list.getAllByRole('textbox');
      await user.type(fields.at(-2)!, 'জমির কাগজ দেখা');
      await user.type(fields.at(-1)!, 'Land papers seen');
      await user.click(required);
      await user.click(dialog.getByRole('button', { name: 'সংরক্ষণ' }));
      await waitFor(() =>
        expect(writes).toContainEqual({
          path: 'component:application_form',
          body: {
            settings: {
              form_ids: [FORM_ID],
              review_checklist: {
                required: true,
                items: [
                  { code: 'identity', label: { bn: 'পরিচয় যাচাই', en: 'Identity checked' } },
                  {
                    code: 'eligibility',
                    label: { bn: 'যোগ্যতা যাচাই', en: 'Eligibility checked' },
                  },
                  {
                    code: expect.stringMatching(/^item_\d+$/),
                    label: { bn: 'জমির কাগজ দেখা', en: 'Land papers seen' },
                  },
                ],
              },
            },
          },
        }),
      );
    });

    it('shows the choices the project has stored, and takes one back', async () => {
      serve();
      withForm({
        identity_document: 'optional',
        mobile: 'optional',
        repeat_person: 'tell',
        repeat_family: 'tell',
      });
      const user = userEvent.setup();
      const dialog = await openDrawer(user);
      expect(chosen(dialog, 'পরিচয়পত্র (এনআইডি বা জন্মনিবন্ধন)')).toEqual(['optional']);
      expect(chosen(dialog, 'মোবাইল নম্বর')).toEqual(['optional']);
      expect(chosen(dialog, 'একই মানুষ আবার এলে')).toEqual(['tell']);
      expect(chosen(dialog, 'একই পরিবারের কেউ আবার এলে')).toEqual(['tell']);
      await user.click(
        within(dialog.getByRole('radiogroup', { name: 'মোবাইল নম্বর' })).getByRole('radio', {
          name: 'বাধ্যতামূলক',
        }),
      );
      await user.click(dialog.getByRole('button', { name: 'সংরক্ষণ' }));
      await waitFor(() =>
        expect(writes).toContainEqual({
          path: 'component:application_form',
          body: {
            settings: {
              identity_document: 'optional',
              mobile: 'required',
              repeat_person: 'tell',
              repeat_family: 'tell',
            },
          },
        }),
      );
    });

    it('only shows the choices on a closed project', async () => {
      serve('closed');
      withForm({ mobile: 'optional' });
      const dialog = await openDrawer(userEvent.setup());
      for (const radio of dialog.getAllByRole('radio')) expect(radio).toBeDisabled();
      expect(chosen(dialog, 'মোবাইল নম্বর')).toEqual(['optional']);
      expect(dialog.queryByRole('button', { name: 'সংরক্ষণ' })).not.toBeInTheDocument();
    });

    it('offers the choices in English too', async () => {
      serve();
      withForm({});
      renderApp(<ProjectSetupPage />, 'en', {
        path: '/admin/projects/:projectId/setup',
        initialPath: `/admin/projects/${ID}/setup?step=components`,
      });
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: /Application form/ }));
      const dialog = within(await screen.findByRole('dialog'));
      expect(dialog.getByText('What the application asks')).toBeInTheDocument();
      expect(
        dialog.getByText('What you change here changes this project only.'),
      ).toBeInTheDocument();
      const document = within(
        dialog.getByRole('radiogroup', { name: 'Identity document (NID or birth registration)' }),
      );
      expect(document.getByRole('radio', { name: 'Required' })).toBeChecked();
      expect(document.getByRole('radio', { name: 'If they have one' })).toBeInTheDocument();
      expect(
        within(dialog.getByRole('radiogroup', { name: 'Mobile number' })).getByRole('radio', {
          name: 'If none, contact through the volunteer',
        }),
      ).toBeInTheDocument();
      for (const name of [
        'When the same person appears again',
        'When someone of the same family appears again',
      ]) {
        const repeat = within(dialog.getByRole('radiogroup', { name }));
        expect(repeat.getByRole('radio', { name: 'Only tell' })).toBeInTheDocument();
        expect(
          repeat.getByRole('radio', { name: 'A written reason before approval' }),
        ).toBeChecked();
      }
    });
  });

  it('shows the code, the program and the session, and keeps the period fixed while active and every field on a closed project', async () => {
    serve('active');
    const { unmount } = open('basics');
    const basics = await section('মৌলিক তথ্য');
    expect(within(basics).getByText('WC')).toBeInTheDocument();
    expect(await within(basics).findByText('মানবিক সহায়তা')).toBeInTheDocument();
    for (const month of ['শুরুর মাস', 'শেষের মাস'])
      for (const part of within(
        within(basics).getByRole('group', { name: new RegExp(month) }),
      ).getAllByRole('spinbutton'))
        expect(part).toHaveAttribute('aria-disabled', 'true');
    expect(heading()).toHaveTextContent('সেটআপ: শীতবস্ত্র বিতরণ · সেশন 2026');
    expect(within(basics).getByRole('textbox', { name: /বাংলায় নাম/ })).not.toHaveAttribute(
      'readonly',
    );
    unmount();

    resetClientForTests();
    refreshAs(PM);
    serve('closed');
    open('basics');
    expect(
      await screen.findByText('প্রকল্পটি এখন বন্ধ; এর সেটআপ বদলানো যায় না।'),
    ).toBeInTheDocument();
    const closed = await section('মৌলিক তথ্য');
    expect(within(closed).getByRole('textbox', { name: /বাংলায় নাম/ })).toHaveAttribute(
      'readonly',
    );
    expect(screen.queryByRole('button', { name: /সেভ করে বের হন/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'সক্রিয় করুন' })).not.toBeInTheDocument();
  });

  it('shows an RPM the steps without the budget', async () => {
    refreshAs({ ...ME, roles: ['regional_program_manager'] });
    serve('active');
    open();
    expect(await section('মৌলিক তথ্য')).toBeInTheDocument();
    expect(within(steps()).queryByRole('button', { name: /বাজেট/ })).not.toBeInTheDocument();
  });

  it('on a phone keeps only the name, the dates and the switches editable', async () => {
    stubMatchMedia((query) => query.includes('max-width'));
    serve();
    open('basics');
    expect(
      await screen.findByText(
        'ফোনে শুধু নাম, তারিখ আর চালু/বন্ধ বদলানো যায়। বাকিটা কম্পিউটারে করুন।',
      ),
    ).toBeInTheDocument();
    const basics = await section('মৌলিক তথ্য');
    expect(within(basics).getByRole('textbox', { name: /বাংলায় নাম/ })).not.toHaveAttribute(
      'readonly',
    );
    // the period is set on a computer, as the year was
    for (const part of within(
      within(basics).getByRole('group', { name: /শুরুর মাস/ }),
    ).getAllByRole('spinbutton'))
      expect(part).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('a new project', () => {
  it('shows the series read-only, asks for the start and end month, and opens the next step of the new draft', async () => {
    serve();
    const user = userEvent.setup();
    const { router, container } = openNew();
    const basics = await section('মৌলিক তথ্য');
    expect(screen.getByRole('heading', { level: 1, name: 'নতুন প্রকল্প' })).toBeInTheDocument();
    // the code, the name and the program come from the series and are never typed
    expect(within(basics).getByText('WC')).toBeInTheDocument();
    expect(within(basics).getByText('শীতবস্ত্র বিতরণ')).toBeInTheDocument();
    expect(within(basics).getByText('মানবিক সহায়তা')).toBeInTheDocument();
    expect(within(basics).queryByRole('textbox', { name: /প্রকল্প কোড/ })).not.toBeInTheDocument();
    expect(within(basics).getByRole('group', { name: /শুরুর মাস/ })).toBeInTheDocument();
    expect(within(basics).getByRole('group', { name: /শেষের মাস/ })).toBeInTheDocument();
    await user.click(within(basics).getByRole('combobox', { name: /ওয়ার্কফ্লো/ }));
    await user.click(await screen.findByRole('option', { name: 'বিতরণ' }));
    await user.click(next());
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/admin/projects/new-id/setup'),
    );
    expect(router.state.location.search).toBe('?step=components');
    // one session of the series, for the whole of this year unless changed
    const year = new Date().getFullYear();
    expect(writes).toEqual([
      {
        path: 'create',
        body: {
          seriesId: SERIES,
          periodFrom: `${year}-01`,
          periodTo: `${year}-12`,
          source: { kind: 'workflow', workflowKey: 'distribution' },
        },
      },
    ]);
    await expectNoAxeViolations(container);
  }, 20_000);

  it('says where a new project starts when the address names no series', async () => {
    serve();
    openNew('');
    expect(await screen.findByText(/আগে প্রকল্পটি বেছে নিন/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'প্রোগ্রাম ও প্রকল্পে যান' })).toHaveAttribute(
      'href',
      '/admin/projects',
    );
    expect(screen.queryByRole('button', { name: 'পরের ধাপ' })).not.toBeInTheDocument();
  });

  it('is refused to a role that sees projects but cannot create them', async () => {
    refreshAs({ ...ME, roles: ['regional_program_manager'] });
    serve();
    openNew();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'প্রবেশাধিকার নেই' }),
    ).toBeInTheDocument();
    expect(writes).toEqual([]);
  });
});

describe('a half-filled form', () => {
  it('keeps the areas step open with its reason instead of dropping the choice', async () => {
    serve();
    const user = userEvent.setup();
    const { router } = open('areas');
    const areas = await section('এলাকা ও আরপিএম');
    await user.type(within(areas).getByRole('combobox', { name: /আরপিএম/ }), 'নমুনা');
    await user.click(await screen.findByRole('option', { name: 'নমুনা এক্সিকিউটিভ' }));
    await user.click(next());
    expect(
      await within(areas).findByText('এলাকা যোগ করতে বিভাগ বা জেলা আর আরপিএম দুটোই দিন।'),
    ).toBeInTheDocument();
    expect(router.state.location.search).toBe('?step=areas');
  });
});

describe('the quotas', () => {
  const UNION = '01900000-0000-7000-8000-0000000000d4';
  it('change a target and take a quota away, saved as one list', async () => {
    serve();
    quotaRows = [
      {
        level: 'union',
        locationId: UNION,
        locationName: { bn: 'সাভার', en: 'Savar' },
        target: 50,
        received: 72,
        approved: 40,
        full: false,
      },
    ];
    const user = userEvent.setup();
    const view = open('areas');
    const quotas = await section('কোটা');
    expect(within(quotas).getByText('লক্ষ্য 50 · এসেছে 72 · অনুমোদিত 40')).toBeInTheDocument();
    const target = within(quotas).getByRole('textbox', { name: 'সাভার: লক্ষ্য' });
    await user.clear(target);
    await user.type(target, '45');
    await user.click(within(quotas).getByRole('button', { name: 'কোটা সংরক্ষণ করুন' }));
    await waitFor(() => expect(writes.filter((w) => w.path === 'quotas')).toHaveLength(1));
    expect(writes.at(-1)!.body).toEqual({
      quotas: [{ level: 'union', locationId: UNION, target: 45 }],
    });
    await user.click(within(quotas).getByRole('button', { name: 'সাভার-এর কোটা সরান' }));
    await user.click(within(quotas).getByRole('button', { name: 'কোটা সংরক্ষণ করুন' }));
    await waitFor(() => expect(writes.filter((w) => w.path === 'quotas')).toHaveLength(2));
    expect(writes.at(-1)!.body).toEqual({ quotas: [] });
    await expectNoAxeViolations(view.container);
  });
});

describe('the rules step', () => {
  const rulesWith = (rules: Record<string, unknown>, version = 1) =>
    http.get(`*/api/v1/projects/${ID}/rules`, () =>
      HttpResponse.json({ data: { version, rules }, meta: {} }),
    );

  it('saves the texts in both languages with Next, and lists what is missing on the review', async () => {
    serve();
    const saved: unknown[] = [];
    server.use(
      rulesWith({}, 0),
      http.put(`*/api/v1/projects/${ID}/rules`, async ({ request }) => {
        const body = await request.json();
        saved.push(body);
        return HttpResponse.json({ data: { version: 1, rules: body }, meta: {} });
      }),
    );
    const user = userEvent.setup();
    const { router } = open('rules');
    const rules = await section('নিয়মাবলি');
    // without dawah the Local দায়ী part is not asked
    expect(
      within(rules).queryByRole('textbox', { name: /স্থানীয় দায়ীর দায়িত্ব/ }),
    ).not.toBeInTheDocument();
    expect(
      within(steps()).getByRole('button', { name: 'নিয়মাবলি, বাকি আছে' }),
    ).toBeInTheDocument();
    await user.type(
      within(rules).getByRole('textbox', { name: /স্বেচ্ছাসেবকের দায়িত্ব \(বাংলা\)/ }),
      'সময়মতো উপস্থিত থাকুন',
    );
    await user.type(
      within(rules).getByRole('textbox', { name: /স্বেচ্ছাসেবকের দায়িত্ব \(ইংরেজি\)/ }),
      'Be on time',
    );
    await user.click(next());
    await waitFor(() => expect(router.state.location.search).toBe('?step=review'));
    expect(saved).toEqual([
      { volunteer_duties: { bn: 'সময়মতো উপস্থিত থাকুন', en: 'Be on time' } },
    ]);
    // a draft keeps unfinished rules: the review names the parts still missing
    expect(await screen.findByText('নিয়মাবলি: বাস্তবায়ন প্রক্রিয়া')).toBeInTheDocument();
  }, 20_000);

  it('asks the Local দায়ী duties while dawah is on', async () => {
    serve();
    project = { ...project, dawahEnabled: true };
    server.use(rulesWith({}, 0));
    open('rules');
    const rules = await section('নিয়মাবলি');
    expect(
      within(rules).getByRole('textbox', { name: /স্থানীয় দায়ীর দায়িত্ব \(বাংলা\)/ }),
    ).toBeInTheDocument();
  });

  it('keeps an active project from saving a required text empty', async () => {
    serve('active');
    const full = {
      volunteer_duties: { bn: 'দায়িত্ব', en: 'Duties' },
      implementation_process: { bn: 'প্রক্রিয়া', en: 'Process' },
      misconduct: { bn: 'অনিয়ম', en: 'Misconduct' },
    };
    server.use(rulesWith(full, 3));
    const user = userEvent.setup();
    const { router } = open('rules');
    const rules = await section('নিয়মাবলি');
    expect(within(rules).getByText(/সংস্করণ 3/)).toBeInTheDocument();
    await user.clear(
      within(rules).getByRole('textbox', { name: /অনিয়মের ক্ষেত্রে ব্যবস্থা \(ইংরেজি\)/ }),
    );
    await user.click(next());
    expect(await screen.findByText('দরকারি প্রতিটি নিয়ম দুই ভাষায় লিখুন।')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?step=rules');
  });
});

describe('where a new project starts', () => {
  const TEMPLATE = '01900000-0000-7000-8000-0000000000d1';
  const OLD = '01900000-0000-7000-8000-0000000000e1';
  const startNew = async () => {
    const user = userEvent.setup();
    openNew();
    const basics = await section('মৌলিক তথ্য');
    return { user, basics };
  };

  it('starts from a template of the library', async () => {
    serve();
    server.use(
      http.get('*/api/v1/templates', () =>
        HttpResponse.json({
          data: [
            {
              id: TEMPLATE,
              name: { bn: 'শীতবস্ত্র টেমপ্লেট', en: 'Winter template' },
              description: null,
              workflowKey: 'distribution',
              active: true,
              version: 1,
              sourceProjectId: null,
              updatedAt: '2026-10-17T00:00:00Z',
              updatedByName: null,
            },
          ],
          meta: {},
        }),
      ),
    );
    const { user, basics } = await startNew();
    await user.click(within(basics).getByText('টেমপ্লেট থেকে'));
    await user.click(within(basics).getByRole('combobox', { name: /টেমপ্লেট/ }));
    await user.click(await screen.findByRole('option', { name: /শীতবস্ত্র টেমপ্লেট/ }));
    await user.click(next());
    await waitFor(() => expect(writes.find((w) => w.path === 'create')).toBeDefined());
    expect((writes.find((w) => w.path === 'create')!.body as { source: unknown }).source).toEqual({
      kind: 'template',
      templateId: TEMPLATE,
    });
  }, 20_000);

  it('copies a previous project', async () => {
    serve();
    server.use(
      http.get('*/api/v1/projects', () =>
        HttpResponse.json({
          data: [{ ...project, id: OLD, code: 'OLD', year: 2025, sessionLabel: '2025' }],
          meta: { nextCursor: null, prevCursor: null },
        }),
      ),
    );
    const { user, basics } = await startNew();
    await user.click(within(basics).getByText('আগের প্রকল্প থেকে কপি'));
    await user.click(within(basics).getByRole('combobox', { name: /যে প্রকল্প কপি হবে/ }));
    await user.click(await screen.findByRole('option', { name: /সেশন 2025 \(OLD\)/ }));
    await user.click(next());
    await waitFor(() => expect(writes.find((w) => w.path === 'create')).toBeDefined());
    expect((writes.find((w) => w.path === 'create')!.body as { source: unknown }).source).toEqual({
      kind: 'copy',
      projectId: OLD,
    });
  }, 20_000);
});
