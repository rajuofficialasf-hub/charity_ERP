import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../api/client';
import { CARDS_KEY, programCards } from './cards-api';
import { ProjectFrame } from './frame/ProjectFrame';
import { ProjectOverviewPage } from './ProjectOverviewPage';

// A session's summary inside its frame, with the lifecycle moves of the header: the main move as a
// button, the others and the template in the menu. Test data only.
const PM: Me = { ...ME, roles: ['program_manager'] };
const RPM: Me = { ...ME, roles: ['regional_program_manager'] };
const ID = '01900000-0000-7000-8000-0000000000c1';

let moves: { action: string; body: unknown; ifMatch: string | null }[];
let refusal: unknown;

function serve(status: string) {
  moves = [];
  refusal = null;
  server.use(
    http.get(`*/api/v1/projects/${ID}`, () =>
      HttpResponse.json({
        data: {
          id: ID,
          code: 'WC',
          year: 2026,
          name: { bn: 'শীতবস্ত্র বিতরণ', en: 'Winter clothing' },
          status,
          workflowKey: 'distribution',
          applyFrom: '2026-11-01',
          applyTo: '2026-12-31',
          perVolunteerLimit: 50,
          dawahEnabled: false,
          programId: '01900000-0000-7000-8000-0000000000b1',
          seriesId: '01900000-0000-7000-8000-0000000000d1',
          periodFrom: '2026-06',
          periodTo: '2027-07',
          sessionLabel: '2026-27',
          costPerBeneficiary: '1000.00',
          targetBeneficiaries: 100,
          budgetPlanned: '100000.00',
        },
        meta: { etag: '"p1"' },
      }),
    ),
    http.get('*/api/v1/programs', () => HttpResponse.json({ data: [], meta: {} })),
    http.get('*/api/v1/project-series/01900000-0000-7000-8000-0000000000d1', () =>
      HttpResponse.json({
        data: {
          id: '01900000-0000-7000-8000-0000000000d1',
          programId: '01900000-0000-7000-8000-0000000000b1',
          code: 'WC',
          name: { bn: 'শীতবস্ত্র বিতরণ', en: 'Winter clothing' },
          description: null,
          coverFileId: null,
          sessionCount: 1,
          beneficiaries: 0,
          current: null,
          canCreate: true,
          program: {
            id: '01900000-0000-7000-8000-0000000000b1',
            name: { bn: 'স্বাবলম্বী প্রোগ্রাম', en: 'Self-reliance' },
          },
          sessions: [],
        },
        meta: {},
      }),
    ),
    http.post(`*/api/v1/projects/${ID}/:action`, async ({ request, params }) => {
      const text = await request.text();
      moves.push({
        action: String(params.action),
        body: text ? JSON.parse(text) : null,
        ifMatch: request.headers.get('if-match'),
      });
      if (refusal) return HttpResponse.json(refusal, { status: 409 });
      return HttpResponse.json({ data: {}, meta: {} });
    }),
  );
}

const open = () =>
  renderApp(<ProjectFrame />, 'bn', {
    path: '/admin/projects/:projectId',
    initialPath: `/admin/projects/${ID}`,
    children: [{ index: true, element: <ProjectOverviewPage /> }],
  });
const buttons = (names: string[]) =>
  Promise.all(names.map((name) => screen.findByRole('button', { name })));
/** The moves on offer: the main one as a button, the others in the "more actions" menu. */
async function offered(user: ReturnType<typeof userEvent.setup>) {
  const actions = await screen.findByRole('region', { name: 'প্রকল্পের কাজ' });
  await waitFor(() => expect(within(actions).getAllByRole('button').length).toBeGreaterThan(1));
  const main = within(actions)
    .getAllByRole('button')
    .map((b) => b.textContent ?? '')
    .filter((text) => text && text !== 'আরও কাজ');
  const more = within(actions).queryByRole('button', { name: 'আরও কাজ' });
  if (!more) return main;
  await user.click(more);
  const items = within(await screen.findByRole('menu'))
    .getAllByRole('menuitem')
    .map((item) => item.textContent ?? '');
  await user.keyboard('{Escape}');
  return [...main, ...items];
}
/** Starts a move from the main button or from the menu. */
async function startMove(user: ReturnType<typeof userEvent.setup>, name: string) {
  const actions = await screen.findByRole('region', { name: 'প্রকল্পের কাজ' });
  const button = within(actions).queryByRole('button', { name });
  if (button) return user.click(button);
  await user.click(await within(actions).findByRole('button', { name: 'আরও কাজ' }));
  await user.click(await screen.findByRole('menuitem', { name }));
}

beforeEach(() => {
  resetClientForTests();
});

describe('the project overview', () => {
  it('shows the facts and the setup link without accessibility violations', async () => {
    refreshAs(PM);
    serve('draft');
    const { container } = open();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'শীতবস্ত্র বিতরণ' }),
    ).toBeInTheDocument();
    // the window in the facts and on the stage it belongs to
    expect(screen.getAllByText('01-11-2026 – 31-12-2026').length).toBeGreaterThan(0);
    expect(await screen.findByText('৳ 1,00,000')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'সেটআপ' })).toHaveAttribute(
      'href',
      `/admin/projects/${ID}/setup`,
    );
    await expectNoAxeViolations(container);
  });

  it('names the session in its heading, the program for an RPM, and leads up to the program and the project', async () => {
    refreshAs(RPM);
    serve('active');
    server.use(
      http.get('*/api/v1/program-cards', () =>
        HttpResponse.json({
          data: [
            {
              id: '01900000-0000-7000-8000-0000000000b1',
              code: 'UCD',
              name: { bn: 'স্বাবলম্বী প্রোগ্রাম', en: 'Self-reliance' },
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
              canCreate: false,
            },
          ],
          meta: {},
        }),
      ),
    );
    open();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'শীতবস্ত্র বিতরণ' }),
    ).toBeInTheDocument();
    const trail = await screen.findByRole('navigation', { name: /অবস্থান|Breadcrumb|পথ/ });
    expect(
      await within(trail).findByRole('link', { name: 'স্বাবলম্বী প্রোগ্রাম' }),
    ).toHaveAttribute('href', '/admin/projects/programs/01900000-0000-7000-8000-0000000000b1');
    expect(within(trail).getByRole('link', { name: 'শীতবস্ত্র বিতরণ' })).toHaveAttribute(
      'href',
      '/admin/projects/series/01900000-0000-7000-8000-0000000000d1',
    );
    // the facts name the program and the period
    expect(screen.getAllByText('স্বাবলম্বী প্রোগ্রাম').length).toBeGreaterThan(1);
    expect(screen.getByText('06-2026 – 07-2027')).toBeInTheDocument();
  });

  it.each([
    ['draft', ['সক্রিয় করুন', 'বাতিল করুন', 'টেমপ্লেট হিসেবে সংরক্ষণ']],
    ['active', ['বন্ধ শুরু করুন', 'সময়সীমা বাড়ান', 'টেমপ্লেট হিসেবে সংরক্ষণ']],
    ['closing', ['প্রকল্প বন্ধ করুন', 'আবার খুলুন', 'টেমপ্লেট হিসেবে সংরক্ষণ']],
    ['closed', ['আবার খুলুন', 'টেমপ্লেট হিসেবে সংরক্ষণ']],
  ])('offers the moves of a %s project', async (status, shown) => {
    refreshAs(PM);
    serve(status);
    const user = userEvent.setup();
    open();
    expect(await offered(user)).toEqual(shown);
  });

  it('asks for a reason before a move and sends it with the version', async () => {
    refreshAs(PM);
    serve('active');
    const user = userEvent.setup();
    open();
    const [start] = await buttons(['বন্ধ শুরু করুন']);
    await user.click(start!);
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'বন্ধ শুরু করুন' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), 'কা');
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), 'জ শেষ');
    await user.click(confirm);
    await waitFor(() =>
      expect(moves).toEqual([
        { action: 'start-closing', body: { reason: 'কাজ শেষ' }, ifMatch: '"p1"' },
      ]),
    );
  });

  it('refreshes the program cards after a move, so their counts are current', async () => {
    refreshAs(PM);
    serve('active');
    let cardReads = 0;
    server.use(
      http.get('*/api/v1/program-cards', () => {
        cardReads += 1;
        return HttpResponse.json({ data: [], meta: {} });
      }),
    );
    // a cards read kept by another screen of the session
    function Cards() {
      useQuery({ queryKey: [...CARDS_KEY, 'programs'], queryFn: programCards });
      return null;
    }
    const user = userEvent.setup();
    renderApp(
      <>
        <ProjectFrame />
        <Cards />
      </>,
      'bn',
      {
        path: '/admin/projects/:projectId',
        initialPath: `/admin/projects/${ID}`,
        children: [{ index: true, element: <ProjectOverviewPage /> }],
      },
    );
    await waitFor(() => expect(cardReads).toBe(1));
    await user.click(await screen.findByRole('button', { name: 'বন্ধ শুরু করুন' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), 'কাজ শেষ');
    await user.click(within(dialog).getByRole('button', { name: 'বন্ধ শুরু করুন' }));
    await waitFor(() => expect(moves).toHaveLength(1));
    await waitFor(() => expect(cardReads).toBe(2));
  });

  it('lists what is missing when the server refuses the activation', async () => {
    refreshAs(PM);
    serve('draft');
    refusal = {
      error: {
        code: 'workflow.guard.project_setup_complete',
        messageKey: 'errors.workflow.guard.project_setup_complete',
        message: 'প্রকল্পের সেটআপ এখনও সম্পূর্ণ নয়।',
        requestId: 'req_x',
        details: [
          { path: 'area', code: 'validation.required', message: '' },
          { path: 'photo_rule', code: 'validation.required', message: '' },
        ],
      },
    };
    const user = userEvent.setup();
    open();
    const [activate] = await buttons(['সক্রিয় করুন']);
    await user.click(activate!);
    // a cancelled question sends nothing; the confirmed one is refused with what is missing
    await user.click(
      within(
        await screen.findByRole('alertdialog', { name: 'প্রকল্পটি সক্রিয় করবেন?' }),
      ).getByRole('button', { name: 'বাতিল' }),
    );
    expect(moves).toEqual([]);
    await user.click(activate!);
    await user.click(
      within(
        await screen.findByRole('alertdialog', { name: 'প্রকল্পটি সক্রিয় করবেন?' }),
      ).getByRole('button', { name: 'সক্রিয় করুন' }),
    );
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('আরপিএমসহ একটি এলাকা')).toBeInTheDocument();
    expect(within(alert).getByText('ছবির নিয়ম')).toBeInTheDocument();
    expect(moves).toEqual([{ action: 'activate', body: null, ifMatch: '"p1"' }]);
  });

  it('shows an RPM the overview without the lifecycle buttons', async () => {
    refreshAs(RPM);
    serve('active');
    open();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'শীতবস্ত্র বিতরণ' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'বন্ধ শুরু করুন' })).not.toBeInTheDocument();
  });

  it('extends the deadline only to a later date, with a reason', async () => {
    refreshAs(PM);
    serve('active');
    const user = userEvent.setup();
    open();
    await startMove(user, 'সময়সীমা বাড়ান');
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'সময়সীমা বাড়ান' });
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), 'শীত বেশি');
    const [day] = within(dialog).getAllByRole('spinbutton');
    await user.click(day!);
    await user.keyboard('31122026');
    // the current end date is not later than itself
    expect(confirm).toBeDisabled();
    await user.click(day!);
    await user.keyboard('15012027');
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);
    await waitFor(() =>
      expect(moves).toEqual([
        {
          action: 'extend-deadline',
          body: { reason: 'শীত বেশি', newApplyTo: '2027-01-15' },
          ifMatch: '"p1"',
        },
      ]),
    );
  });

  it('cancels a draft with a reason and no version', async () => {
    refreshAs(PM);
    serve('draft');
    const user = userEvent.setup();
    open();
    await startMove(user, 'বাতিল করুন');
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), 'ভুল প্রকল্প');
    await user.click(within(dialog).getByRole('button', { name: 'বাতিল করুন' }));
    await waitFor(() =>
      expect(moves).toEqual([{ action: 'cancel', body: { reason: 'ভুল প্রকল্প' }, ifMatch: null }]),
    );
  });
});

describe('save as template', () => {
  it('saves the project as a new template with its name, or onto an existing one', async () => {
    refreshAs(PM);
    serve('active');
    const saved: unknown[] = [];
    server.use(
      http.post(`*/api/v1/projects/${ID}/save-as-template`, async ({ request }) => {
        const body = await request.json();
        saved.push(body);
        return HttpResponse.json({
          data: {
            id: '01900000-0000-7000-8000-0000000000d1',
            name: { bn: 'শীতবস্ত্র টেমপ্লেট', en: 'Winter template' },
            description: null,
            workflowKey: 'distribution',
            active: true,
            version: 1,
            sourceProjectId: ID,
            updatedAt: '2026-10-17T05:00:00Z',
            updatedByName: null,
          },
          meta: {},
        });
      }),
    );
    const user = userEvent.setup();
    open();
    await startMove(user, 'টেমপ্লেট হিসেবে সংরক্ষণ');
    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByRole('textbox', { name: /বাংলায় নাম/ }),
      'শীতবস্ত্র টেমপ্লেট',
    );
    await user.type(
      within(dialog).getByRole('textbox', { name: /ইংরেজিতে নাম/ }),
      'Winter template',
    );
    await user.click(within(dialog).getByRole('button', { name: 'সংরক্ষণ' }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toEqual({ name: { bn: 'শীতবস্ত্র টেমপ্লেট', en: 'Winter template' } });
    expect(
      await screen.findByText('টেমপ্লেট সংরক্ষিত হয়েছে: শীতবস্ত্র টেমপ্লেট'),
    ).toBeInTheDocument();
  });

  it('is not offered to a role that cannot create projects', async () => {
    refreshAs(RPM);
    serve('active');
    open();
    expect(await screen.findByRole('link', { name: 'সেটআপ' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'আরও কাজ' })).not.toBeInTheDocument();
  });
});
