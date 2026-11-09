import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../lib/api';
import { ProjectsPage } from './ProjectsPage';

// The project list, the new-project dialog and the project page. Test data only.
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
  ...over,
});

let listUrls: URL[];
let created: unknown[];

function serve(rows: unknown[] = [project(), project({ id: 'c2', code: 'IF', status: 'active' })]) {
  listUrls = [];
  created = [];
  server.use(
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
              code: 'project.code_taken',
              messageKey: 'errors.project.code_taken',
              message: 'এই প্রকল্প কোড আগেই ব্যবহার করা হয়েছে।',
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

const open = (initialPath = '/admin/projects') =>
  renderApp(<ProjectsPage />, 'bn', { path: '/admin/projects', initialPath });

beforeEach(() => {
  resetClientForTests();
});

describe('the project list', () => {
  it('shows the state of each project without accessibility violations', async () => {
    refreshAs(PM);
    serve();
    const { container } = open();
    expect(await screen.findByRole('heading', { level: 1, name: 'প্রকল্প' })).toBeInTheDocument();
    expect(screen.getByText('প্রকল্প ব্যবস্থাপনা')).toBeInTheDocument();
    expect(screen.getByText(/প্রকল্পের অবস্থা দেখুন/)).toBeInTheDocument();
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
    const { router } = open(`/admin/projects?programId=${PROGRAM.id}&year=2026`);
    await waitFor(() => expect(pages().length).toBeGreaterThan(0));
    expect(pages()[0]!.searchParams.get('programId')).toBe(PROGRAM.id);
    expect(pages()[0]!.searchParams.get('year')).toBe('2026');
    const states = within(await screen.findByRole('group', { name: 'অবস্থা অনুযায়ী প্রকল্প' }));
    await user.click(await states.findByRole('button', { name: /^বন্ধ হচ্ছে/, pressed: false }));
    await waitFor(() => expect(router.state.location.search).toContain('status=closing'));
    expect(router.state.location.search).toContain('year=2026');
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
  it('opens the setup wizard at its first step', async () => {
    refreshAs(PM);
    serve();
    const user = userEvent.setup();
    const { router } = open();
    await user.click(await screen.findByRole('button', { name: 'নতুন প্রকল্প' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/projects/new'));
  });
});
