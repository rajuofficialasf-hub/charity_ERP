import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../../test/auth';
import { server } from '../../../../test/msw/server';
import { resetClientForTests } from '../../../api/client';
import { ComingSoonPage } from './ComingSoonPage';
import { ProjectFrame } from './ProjectFrame';

// The frame of a session's pages: the header with the cover, the name, the state, the facts and
// the actions, and the tabs that stay on top of every page of the session. Test data only.
const PM: Me = { ...ME, roles: ['program_manager'] };
const RPM: Me = { ...ME, roles: ['regional_program_manager'] };
const PROCUREMENT: Me = { ...ME, roles: ['procurement_team'] };
const ID = '01900000-0000-7000-8000-0000000000c1';
const SERIES = '01900000-0000-7000-8000-0000000000d1';
const PROGRAM = '01900000-0000-7000-8000-0000000000b1';

function serve(status: string) {
  server.use(
    http.get(`*/api/v1/projects/${ID}`, () =>
      HttpResponse.json({
        data: {
          id: ID,
          code: 'WNT',
          year: 2026,
          name: { bn: 'শীতবস্ত্র বিতরণ', en: 'Winter clothing' },
          status,
          workflowKey: 'distribution',
          applyFrom: '2026-11-01',
          applyTo: '2026-12-31',
          perVolunteerLimit: 50,
          dawahEnabled: false,
          programId: PROGRAM,
          seriesId: SERIES,
          periodFrom: '2026-06',
          periodTo: '2027-07',
          sessionLabel: '2026-27',
          description: 'সেশনের নিজের বিবরণ',
          targetBeneficiaries: 100,
          budgetPlanned: '100000.00',
        },
        meta: { etag: '"p1"' },
      }),
    ),
    http.get(`*/api/v1/project-series/${SERIES}`, () =>
      HttpResponse.json({
        data: {
          id: SERIES,
          programId: PROGRAM,
          code: 'WNT',
          name: { bn: 'শীতবস্ত্র বিতরণ', en: 'Winter clothing' },
          description: { bn: 'শীতে অসহায় মানুষের পাশে', en: 'Beside people in need in winter' },
          coverFileId: null,
          sessionCount: 1,
          beneficiaries: 0,
          current: null,
          canCreate: true,
          program: { id: PROGRAM, name: { bn: 'হিউম্যানিটেরিয়ান প্রোগ্রাম', en: 'Humanitarian' } },
          sessions: [],
        },
        meta: {},
      }),
    ),
    http.get(`*/api/v1/projects/${ID}/summary`, () =>
      HttpResponse.json({
        data: {
          applications: 0,
          approved: 0,
          waiting: 0,
          waitlisted: 0,
          volunteers: 0,
          districts: 0,
          target: null,
          daysLeft: null,
        },
        meta: {},
      }),
    ),
    http.get('*/api/v1/program-cards', () => HttpResponse.json({ data: [], meta: {} })),
  );
}

const open = (at = `/admin/projects/${ID}`) =>
  renderApp(<ProjectFrame />, 'bn', {
    path: '/admin/projects/:projectId',
    initialPath: at,
    children: [
      { index: true, element: <p>the summary</p> },
      { path: 'applications', element: <p>the applications</p> },
      { path: 'setup', element: <p>the setup</p> },
      { path: 'distribution', element: <ComingSoonPage tab="distribution" /> },
    ],
  });

const TABS = ['সারসংক্ষেপ', 'সেটআপ', 'স্বেচ্ছাসেবক', 'আবেদন', 'বিতরণ', 'রিপোর্ট', 'কার্যক্রম'];

async function tabNames() {
  const nav = await screen.findByRole('navigation', { name: 'প্রকল্পের অংশ' });
  return within(nav)
    .getAllByRole('link')
    .map((link) => link.textContent);
}

beforeEach(() => {
  resetClientForTests();
});

describe('the frame of a session', () => {
  it('heads the page with the name, the state, the facts and the description, without accessibility violations', async () => {
    refreshAs(PM);
    serve('active');
    const { container } = open();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'শীতবস্ত্র বিতরণ' }),
    ).toBeInTheDocument();
    expect(screen.getByText('সক্রিয়')).toBeInTheDocument();
    // in the header's facts and in the trail
    expect(screen.getAllByText('সেশন 2026-27').length).toBeGreaterThan(0);
    expect(screen.getByText('WNT')).toBeInTheDocument();
    // the program in the facts and as a link of the trail
    expect((await screen.findAllByText('হিউম্যানিটেরিয়ান প্রোগ্রাম')).length).toBeGreaterThan(1);
    expect(await screen.findByText('শীতে অসহায় মানুষের পাশে')).toBeInTheDocument();
    expect(await tabNames()).toEqual(TABS);
    expect(screen.getByRole('link', { name: 'সারসংক্ষেপ' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'আবেদন' })).toHaveAttribute(
      'href',
      `/admin/projects/${ID}/applications`,
    );
    expect(screen.getByRole('link', { name: 'সম্পাদনা' })).toHaveAttribute(
      'href',
      `/admin/projects/${ID}/setup`,
    );
    expect(screen.getByText('the summary')).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it.each([
    ['draft', 'সক্রিয় করুন', ['বাতিল করুন']],
    ['active', 'বন্ধ শুরু করুন', ['সময়সীমা বাড়ান']],
    ['closing', 'প্রকল্প বন্ধ করুন', ['আবার খুলুন']],
    ['closed', 'আবার খুলুন', []],
  ])(
    'gives a %s session one main move and puts the others in the menu',
    async (status, main, others) => {
      refreshAs(PM);
      serve(status);
      const user = userEvent.setup();
      open();
      const actions = await screen.findByRole('region', { name: 'প্রকল্পের কাজ' });
      expect(await within(actions).findByRole('button', { name: main })).toBeInTheDocument();
      await user.click(within(actions).getByRole('button', { name: 'আরও কাজ' }));
      const menu = await screen.findByRole('menu');
      const items = within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent);
      expect(items).toEqual([...others, 'টেমপ্লেট হিসেবে সংরক্ষণ']);
    },
  );

  it('asks for a reason before a move from the menu and sends it with the version', async () => {
    refreshAs(PM);
    serve('active');
    const moves: { action: string; body: unknown; ifMatch: string | null }[] = [];
    server.use(
      http.post(`*/api/v1/projects/${ID}/:action`, async ({ request, params }) => {
        moves.push({
          action: String(params.action),
          body: await request.json(),
          ifMatch: request.headers.get('if-match'),
        });
        return HttpResponse.json({ data: {}, meta: {} });
      }),
    );
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'বন্ধ শুরু করুন' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), 'কাজ শেষ');
    await user.click(within(dialog).getByRole('button', { name: 'বন্ধ শুরু করুন' }));
    await waitFor(() =>
      expect(moves).toEqual([
        { action: 'start-closing', body: { reason: 'কাজ শেষ' }, ifMatch: '"p1"' },
      ]),
    );
  });

  it('shows an RPM every tab and no lifecycle move', async () => {
    refreshAs(RPM);
    serve('active');
    open();
    expect(await tabNames()).toEqual(TABS);
    expect(screen.queryByRole('button', { name: 'বন্ধ শুরু করুন' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'আরও কাজ' })).not.toBeInTheDocument();
  });

  it('shows the Procurement Team only the tabs it may open, with the drawn cover and the session’s own description', async () => {
    refreshAs(PROCUREMENT);
    serve('active');
    const { container } = open();
    expect(await tabNames()).toEqual(['সারসংক্ষেপ', 'আবেদন', 'বিতরণ', 'রিপোর্ট', 'কার্যক্রম']);
    expect(container.querySelector('[data-cover-seed]')).not.toBeNull();
    expect(screen.getByText('সেশনের নিজের বিবরণ')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'সম্পাদনা' })).not.toBeInTheDocument();
  });

  it('copies the session’s address inside the app', async () => {
    refreshAs(RPM);
    serve('active');
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'লিংক কপি করুন' }));
    expect(await navigator.clipboard.readText()).toBe(
      `${window.location.origin}/admin/projects/${ID}`,
    );
  });

  it('keeps the header and the tabs on another tab’s page, in its compact form', async () => {
    refreshAs(PM);
    serve('active');
    const user = userEvent.setup();
    open();
    await screen.findByText('শীতে অসহায় মানুষের পাশে');
    await user.click(screen.getByRole('link', { name: 'আবেদন' }));
    expect(await screen.findByText('the applications')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'শীতবস্ত্র বিতরণ' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'আবেদন' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByText('শীতে অসহায় মানুষের পাশে')).not.toBeInTheDocument();
  });

  it('offers no main move on the setup, which activates at its own last step', async () => {
    refreshAs(PM);
    serve('draft');
    open(`/admin/projects/${ID}/setup`);
    expect(await screen.findByText('the setup')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'আরও কাজ' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'সক্রিয় করুন' })).not.toBeInTheDocument();
  });

  it('opens a tab not built yet on a page that says it is coming', async () => {
    refreshAs(PM);
    serve('active');
    open(`/admin/projects/${ID}/distribution`);
    expect(await screen.findByText('শীঘ্রই আসছে')).toBeInTheDocument();
    expect(
      screen.getByText('বিতরণের তালিকা, ছবি আর মজুদের হিসাব এখানে দেখা যাবে।'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'বিতরণ' })).toHaveAttribute('aria-current', 'page');
  });

  it('refuses a volunteer without reading the session', async () => {
    refreshAs({ ...ME, kind: 'volunteer', roles: ['general_volunteer'] });
    let reads = 0;
    server.use(
      http.get(`*/api/v1/projects/${ID}`, () => {
        reads += 1;
        return HttpResponse.json({}, { status: 403 });
      }),
    );
    open();
    expect(await screen.findByRole('heading', { name: 'প্রবেশাধিকার নেই' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'প্রকল্পের অংশ' })).not.toBeInTheDocument();
    expect(reads).toBe(0);
  });

  it('offers to try again when the session cannot be read', async () => {
    refreshAs(PM);
    server.use(
      http.get(`*/api/v1/projects/${ID}`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'server.internal',
              messageKey: 'errors.server.internal',
              message: 'কিছু একটা ভুল হয়েছে। আবার চেষ্টা করুন।',
              requestId: 'req_y',
            },
          },
          { status: 500 },
        ),
      ),
    );
    open();
    // a server error is asked again before it shows
    expect(
      await screen.findByRole('button', { name: 'আবার চেষ্টা করুন' }, { timeout: 10_000 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'প্রকল্পের অংশ' })).not.toBeInTheDocument();
  }, 15_000);

  it('keeps the page when the session cannot be read again after a move', async () => {
    refreshAs(PM);
    serve('active');
    const user = userEvent.setup();
    open();
    expect(await screen.findByText('the summary')).toBeInTheDocument();
    server.use(
      http.post(`*/api/v1/projects/${ID}/:action`, () => HttpResponse.json({ data: {}, meta: {} })),
      http.get(`*/api/v1/projects/${ID}`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'server.internal',
              messageKey: 'errors.server.internal',
              message: 'কিছু একটা ভুল হয়েছে। আবার চেষ্টা করুন।',
              requestId: 'req_z',
            },
          },
          { status: 500 },
        ),
      ),
    );
    await user.click(screen.getByRole('button', { name: 'বন্ধ শুরু করুন' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), 'কাজ শেষ');
    await user.click(within(dialog).getByRole('button', { name: 'বন্ধ শুরু করুন' }));
    expect(
      await screen.findByRole('button', { name: 'আবার চেষ্টা করুন' }, { timeout: 10_000 }),
    ).toBeInTheDocument();
    expect(screen.getByText('the summary')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'প্রকল্পের অংশ' })).toBeInTheDocument();
    // the read is asked again on a server error before the retry shows
  }, 15_000);

  it('says so when the session does not exist', async () => {
    refreshAs(PM);
    server.use(
      http.get(`*/api/v1/projects/${ID}`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'permission.not_found',
              messageKey: 'errors.permission.not_found',
              message: 'পাওয়া যায়নি',
              requestId: 'req_x',
            },
          },
          { status: 404 },
        ),
      ),
    );
    open();
    expect(await screen.findByText('এই প্রকল্প পাওয়া যায়নি।')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'প্রকল্পের অংশ' })).not.toBeInTheDocument();
  });
});
