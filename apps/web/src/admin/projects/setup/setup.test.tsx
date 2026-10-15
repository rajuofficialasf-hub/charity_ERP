import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../../test/auth';
import { server } from '../../../../test/msw/server';
import { resetClientForTests } from '../../../lib/api';
import { ProjectSetupPage } from './ProjectSetupPage';

// The project setup wizard (SCR-060, UX-20): one step at a time, Back and Next saving the step,
// save and exit, the step indicator with its marks, the first step creating the draft, the review
// that activates, the state and phone rules and a stale version. Test data only.
const PM: Me = { ...ME, roles: ['program_manager'] };
const ID = '01900000-0000-7000-8000-0000000000c1';
const PROGRAM = '01900000-0000-7000-8000-0000000000b1';

let project: Record<string, unknown>;
let writes: { path: string; body: unknown }[];
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
    http.get(`*/api/v1/projects/${ID}/fund-sources`, () =>
      HttpResponse.json({ data: [], meta: {} }),
    ),
    http.get(`*/api/v1/projects/${ID}/areas`, () => HttpResponse.json({ data: [], meta: {} })),
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
    http.post('*/api/v1/projects', async ({ request }) => {
      const body = (await request.json()) as { code: string };
      writes.push({ path: 'create', body });
      if (body.code === 'WC')
        return HttpResponse.json(
          {
            error: {
              code: 'project.code_taken',
              messageKey: 'errors.project.code_taken',
              message: 'এই প্রকল্প কোড আগেই ব্যবহার করা হয়েছে।',
              requestId: 'req_x',
            },
          },
          { status: 409 },
        );
      return HttpResponse.json(
        { data: { ...project, ...body, id: 'new-id' }, meta: {} },
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
    expect(router.state.location.search).toBe('');
    const list = steps();
    expect(within(list).getByRole('button', { name: 'মৌলিক তথ্য' })).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'উপাদান, বাকি আছে' })).toBeInTheDocument();
    expect(
      within(list).getByRole('button', { name: 'বাজেট ও তহবিলের উৎস, বাকি আছে' }),
    ).toBeInTheDocument();
    expect(screen.getByText('ধাপ 2/7')).toBeInTheDocument();
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
    expect(await screen.findByText('দুই ভাষায় নাম আর চার অঙ্কের বছর দিন।')).toBeInTheDocument();
    expect(writes).toHaveLength(before);
    expect(router.state.location.search).toBe('?step=basics');
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
    expect(await within(budget).findByRole('alert')).toHaveTextContent(
      'তহবিলের উৎসগুলোর মোট পরিকল্পিত বাজেটের সমান নয়। সক্রিয় প্রকল্প সমান হলেই সংরক্ষণ হয়।',
    );
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
    await user.click(within(staff).getByRole('button', { name: /ভূমিকা/ }));
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
    await waitFor(() => expect(router.state.location.pathname).toBe(`/admin/projects/${ID}`));
    expect(writes).toEqual([{ path: 'activate', body: '"p1"' }]);
    expect(router.state.location.state).toEqual({ notice: 'প্রকল্প সক্রিয় হয়েছে।' });
  });

  it('keeps the year read-only while active and every field on a closed project', async () => {
    serve('active');
    const { unmount } = open('basics');
    const basics = await section('মৌলিক তথ্য');
    expect(within(basics).getByRole('textbox', { name: /বছর/ })).toHaveAttribute('readonly');
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
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches: query.includes('max-width'),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
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
    expect(within(basics).getByRole('textbox', { name: /বছর/ })).toHaveAttribute('readonly');
  });
});

describe('a new project', () => {
  it('refuses a lower-case code before sending, shows a taken code, and opens the next step of the new draft', async () => {
    serve();
    const user = userEvent.setup();
    const { router, container } = renderApp(<ProjectSetupPage />, 'bn', {
      path: '/admin/projects/new',
      initialPath: '/admin/projects/new',
    });
    const basics = await section('মৌলিক তথ্য');
    expect(screen.getByRole('heading', { level: 1, name: 'নতুন প্রকল্প' })).toBeInTheDocument();
    const code = within(basics).getByRole('textbox', { name: /প্রকল্প কোড/ });
    await user.type(code, 'wc');
    await user.type(within(basics).getByRole('textbox', { name: /বাংলায় নাম/ }), 'শীতবস্ত্র');
    await user.type(within(basics).getByRole('textbox', { name: /ইংরেজিতে নাম/ }), 'Winter');
    await user.click(within(basics).getByRole('button', { name: /প্রোগ্রাম/ }));
    await user.click(await screen.findByRole('option', { name: /মানবিক সহায়তা/ }));
    await user.click(within(basics).getByRole('button', { name: /ওয়ার্কফ্লো/ }));
    await user.click(await screen.findByRole('option', { name: 'বিতরণ' }));
    await user.click(next());
    expect(
      await within(basics).findByText('2 থেকে 8টি ইংরেজি বড় হাতের অক্ষর (A-Z) দিন।'),
    ).toBeInTheDocument();
    expect(writes).toEqual([]);
    await user.clear(code);
    await user.type(code, 'WC');
    await user.click(next());
    expect(await screen.findByText('এই প্রকল্প কোড আগেই ব্যবহার করা হয়েছে।')).toBeInTheDocument();
    await user.clear(code);
    await user.type(code, 'WCB');
    await user.click(next());
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/admin/projects/new-id/setup'),
    );
    expect(router.state.location.search).toBe('?step=components');
    expect(writes.at(-1)).toEqual({
      path: 'create',
      body: {
        programId: PROGRAM,
        code: 'WCB',
        year: new Date().getFullYear(),
        name: { bn: 'শীতবস্ত্র', en: 'Winter' },
        source: { kind: 'workflow', workflowKey: 'distribution' },
      },
    });
    await expectNoAxeViolations(container);
  }, 20_000);
});
