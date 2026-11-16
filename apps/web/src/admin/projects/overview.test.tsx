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
import { ProjectOverviewPage } from './ProjectOverviewPage';

// The project overview with its lifecycle buttons. Test data only.
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
          costPerBeneficiary: '1000.00',
          targetBeneficiaries: 100,
          budgetPlanned: '100000.00',
        },
        meta: { etag: '"p1"' },
      }),
    ),
    http.get('*/api/v1/programs', () => HttpResponse.json({ data: [], meta: {} })),
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
  renderApp(<ProjectOverviewPage />, 'bn', {
    path: '/admin/projects/:projectId',
    initialPath: `/admin/projects/${ID}`,
  });
const buttons = (names: string[]) =>
  Promise.all(names.map((name) => screen.findByRole('button', { name })));

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
    expect(screen.getByText('01-11-2026 – 31-12-2026')).toBeInTheDocument();
    expect(screen.getByText('৳ 1,00,000')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'সেটআপ' })).toHaveAttribute(
      'href',
      `/admin/projects/${ID}/setup`,
    );
    await expectNoAxeViolations(container);
  });

  it.each([
    ['draft', ['সক্রিয় করুন', 'বাতিল করুন'], ['আবার খুলুন']],
    ['active', ['সময়সীমা বাড়ান', 'বন্ধ শুরু করুন'], ['সক্রিয় করুন']],
    ['closing', ['প্রকল্প বন্ধ করুন', 'আবার খুলুন'], ['বন্ধ শুরু করুন']],
    ['closed', ['আবার খুলুন'], ['প্রকল্প বন্ধ করুন']],
  ])('offers the moves of a %s project', async (status, shown, hidden) => {
    refreshAs(PM);
    serve(status);
    open();
    await buttons(shown);
    for (const name of hidden)
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
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
        <ProjectOverviewPage />
        <Cards />
      </>,
      'bn',
      { path: '/admin/projects/:projectId', initialPath: `/admin/projects/${ID}` },
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
    const [extend] = await buttons(['সময়সীমা বাড়ান']);
    await user.click(extend!);
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
    const [cancel] = await buttons(['বাতিল করুন']);
    await user.click(cancel!);
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
    await user.click(await screen.findByRole('button', { name: 'টেমপ্লেট হিসেবে সংরক্ষণ' }));
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
    expect(
      screen.queryByRole('button', { name: 'টেমপ্লেট হিসেবে সংরক্ষণ' }),
    ).not.toBeInTheDocument();
  });
});
