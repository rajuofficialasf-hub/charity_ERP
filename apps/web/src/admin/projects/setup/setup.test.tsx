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

// The project setup screen (SCR-060): sections saved on their own, the activation summary, the
// state and phone rules, the component settings and a stale version. Test data only.
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
  );
}

const open = () =>
  renderApp(<ProjectSetupPage />, 'bn', {
    path: '/admin/projects/:projectId/setup',
    initialPath: `/admin/projects/${ID}/setup`,
  });
const section = async (name: string) => screen.findByRole('region', { name });

beforeEach(() => {
  resetClientForTests();
  refreshAs(PM);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the project setup', () => {
  it('saves a section on its own and updates the missing list, without accessibility violations', async () => {
    serve();
    const user = userEvent.setup();
    const { container } = open();
    const summary = await screen.findByRole('complementary', { name: 'সারসংক্ষেপ' });
    expect(within(summary).getByText('প্রতি স্বেচ্ছাসেবকের আবেদন সীমা')).toBeInTheDocument();
    expect(within(summary).getByText('ছবির নিয়ম')).toBeInTheDocument();
    await expectNoAxeViolations(container);

    const window = await section('আবেদনের সময়সীমা ও সীমা');
    await user.type(within(window).getByRole('textbox', { name: /আবেদন সীমা/ }), '50');
    await user.click(within(window).getByRole('button', { name: 'সংরক্ষণ' }));
    await waitFor(() =>
      expect(writes).toEqual([{ path: 'project', body: { perVolunteerLimit: 50 } }]),
    );
    await waitFor(() =>
      expect(
        within(summary).queryByText('প্রতি স্বেচ্ছাসেবকের আবেদন সীমা'),
      ).not.toBeInTheDocument(),
    );
  }, 20_000);

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
    open();
    await user.click(await screen.findByRole('button', { name: 'রেটিংয়ের মানদণ্ড-এর সেটিংস' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'যোগ করুন (সর্বোচ্চ 5)' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'সংরক্ষণ' }));
    expect(
      await within(dialog).findByText('গ্রহণযোগ্য নয়: settings.criteria.0.label'),
    ).toBeInTheDocument();
    expect(writes.at(-1)?.path).toBe('component:rating_criteria');
  });

  it('keeps the year read-only while active and every field on a closed project', async () => {
    serve('active');
    const { unmount } = open();
    const basics = await section('মৌলিক তথ্য');
    expect(within(basics).getByRole('textbox', { name: /বছর/ })).toHaveAttribute('readonly');
    expect(within(basics).getByRole('textbox', { name: /বাংলায় নাম/ })).not.toHaveAttribute(
      'readonly',
    );
    unmount();

    resetClientForTests();
    refreshAs(PM);
    serve('closed');
    open();
    expect(
      await screen.findByText('প্রকল্পটি এখন বন্ধ; এর সেটআপ বদলানো যায় না।'),
    ).toBeInTheDocument();
    const closed = await section('মৌলিক তথ্য');
    expect(within(closed).getByRole('textbox', { name: /বাংলায় নাম/ })).toHaveAttribute(
      'readonly',
    );
    expect(within(closed).queryByRole('button', { name: 'সংরক্ষণ' })).not.toBeInTheDocument();
  });

  it('tells about a stale version and reloads', async () => {
    serve();
    patchStatus = 412;
    const user = userEvent.setup();
    open();
    const basics = await section('মৌলিক তথ্য');
    await user.type(within(basics).getByRole('textbox', { name: /ইংরেজিতে নাম/ }), ' 2026');
    await user.click(within(basics).getByRole('button', { name: 'সংরক্ষণ' }));
    // the section reloads from the server, so it is looked up again
    expect(
      await screen.findByText(
        'এর মধ্যে অন্য কেউ এই অংশ বদলেছেন। সর্বশেষ তথ্য দেখানো হচ্ছে; আবার সংরক্ষণ করুন।',
      ),
    ).toBeInTheDocument();
    expect(
      within(await section('মৌলিক তথ্য')).getByRole('textbox', { name: /ইংরেজিতে নাম/ }),
    ).toHaveValue('Winter clothing');
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
    open();
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
    expect(
      screen.queryByRole('button', { name: 'রেটিংয়ের মানদণ্ড-এর সেটিংস' }),
    ).not.toBeInTheDocument();
  });

  it('saves the budget with its fund sources, and holds an active save until they are equal', async () => {
    serve('active');
    project = { ...project, costPerBeneficiary: '100.00', targetBeneficiaries: 10 };
    const user = userEvent.setup();
    open();
    const budget = await section('বাজেট ও তহবিলের উৎস');
    await user.click(within(budget).getByRole('button', { name: 'তহবিলের উৎস যোগ করুন' }));
    await user.type(within(budget).getByRole('textbox', { name: /পরিমাণ/ }), '900');
    expect(
      within(budget).getByText(
        'তহবিলের উৎসগুলোর মোট পরিকল্পিত বাজেটের সমান নয়। সক্রিয় প্রকল্প সমান হলেই সংরক্ষণ হয়।',
      ),
    ).toBeInTheDocument();
    expect(within(budget).getByRole('button', { name: 'সংরক্ষণ' })).toBeDisabled();
    await user.type(
      within(budget).getByRole('textbox', { name: /পরিমাণ/ }),
      '{Backspace}{Backspace}{Backspace}1000',
    );
    await user.click(within(budget).getByRole('button', { name: 'সংরক্ষণ' }));
    await waitFor(() =>
      expect(writes).toEqual([
        {
          path: 'fund-sources',
          body: {
            costPerBeneficiary: '100.00',
            targetBeneficiaries: 10,
            fundSources: [{ source: 'general', amount: '1000' }],
          },
        },
      ]),
    );
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
    open();
    const staff = await section('স্টাফের অ্যাক্সেস');
    await user.click(within(staff).getByRole('button', { name: /ভূমিকা/ }));
    await user.click(await screen.findByRole('option', { name: 'প্রজেক্ট এক্সিকিউটিভ' }));
    await user.type(within(staff).getByRole('combobox', { name: /কর্মকর্তা/ }), 'নমুনা');
    await user.click(await screen.findByRole('option', { name: 'নমুনা এক্সিকিউটিভ' }));
    // the person is looked up among the holders of the chosen role
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

  it('keeps what was typed in one section while another section saves', async () => {
    serve();
    const user = userEvent.setup();
    open();
    const basics = await section('মৌলিক তথ্য');
    const english = within(basics).getByRole('textbox', { name: /ইংরেজিতে নাম/ });
    await user.type(english, ' draft');
    const window = await section('আবেদনের সময়সীমা ও সীমা');
    await user.type(within(window).getByRole('textbox', { name: /আবেদন সীমা/ }), '25');
    await user.click(within(window).getByRole('button', { name: 'সংরক্ষণ' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    await waitFor(() => expect(within(window).getByText('সংরক্ষিত হয়েছে।')).toBeInTheDocument());
    expect(
      within(await section('মৌলিক তথ্য')).getByRole('textbox', { name: /ইংরেজিতে নাম/ }),
    ).toHaveValue('Winter clothing draft');
  }, 20_000);
});
