import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@css/ui/testing';
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
    expect((await screen.findAllByText('খসড়া')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('সক্রিয়').length).toBeGreaterThan(0);
    expect((await screen.findAllByText('মানবিক সহায়তা')).length).toBeGreaterThan(0);
    await expectNoAxeViolations(container);
  });

  it('keeps the state, program and year filters in the URL and asks the server with them', async () => {
    refreshAs(PM);
    serve();
    const user = userEvent.setup();
    const { router } = open(`/admin/projects?programId=${PROGRAM.id}&year=2026`);
    await waitFor(() => expect(listUrls.length).toBeGreaterThan(0));
    expect(listUrls[0]!.searchParams.get('programId')).toBe(PROGRAM.id);
    expect(listUrls[0]!.searchParams.get('year')).toBe('2026');
    await user.click(await screen.findByRole('button', { name: 'বন্ধ হচ্ছে', pressed: false }));
    await waitFor(() => expect(router.state.location.search).toContain('status=closing'));
    expect(router.state.location.search).toContain('year=2026');
    await waitFor(() => expect(listUrls.at(-1)?.searchParams.get('status')).toBe('closing'));
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

describe('the new-project dialog', () => {
  it('refuses a lower-case code before sending, shows a taken code, and opens the new draft', async () => {
    refreshAs(PM);
    serve();
    const user = userEvent.setup();
    const { router } = open();
    await user.click(await screen.findByRole('button', { name: 'নতুন প্রকল্প' }));
    const dialog = await screen.findByRole('dialog');
    const code = within(dialog).getByRole('textbox', { name: /প্রকল্প কোড/ });
    await user.type(code, 'wc');
    await user.type(within(dialog).getByRole('textbox', { name: /বাংলায় নাম/ }), 'শীতবস্ত্র');
    await user.type(within(dialog).getByRole('textbox', { name: /ইংরেজিতে নাম/ }), 'Winter');
    await user.click(within(dialog).getByRole('button', { name: /প্রোগ্রাম/ }));
    await user.click(await screen.findByRole('option', { name: /মানবিক সহায়তা/ }));
    await user.click(within(dialog).getByRole('button', { name: /ওয়ার্কফ্লো/ }));
    await user.click(await screen.findByRole('option', { name: 'বিতরণ' }));
    const submit = within(dialog).getByRole('button', { name: 'খসড়া তৈরি করুন' });
    await user.click(submit);
    expect(
      await within(dialog).findByText('2 থেকে 8টি ইংরেজি বড় হাতের অক্ষর (A-Z) দিন।'),
    ).toBeInTheDocument();
    expect(created).toEqual([]);
    await user.clear(code);
    await user.type(code, 'WC');
    await user.click(submit);
    expect(
      await within(dialog).findByText('এই প্রকল্প কোড আগেই ব্যবহার করা হয়েছে।'),
    ).toBeInTheDocument();
    await user.clear(code);
    await user.type(code, 'WCB');
    await user.click(submit);
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/projects/new'));
    expect(created.at(-1)).toEqual({
      programId: PROGRAM.id,
      code: 'WCB',
      year: new Date().getFullYear(),
      name: { bn: 'শীতবস্ত্র', en: 'Winter' },
      source: { kind: 'workflow', workflowKey: 'distribution' },
    });
    // many keystrokes: slower than the default timeout while the whole suite runs
  }, 20_000);
});
