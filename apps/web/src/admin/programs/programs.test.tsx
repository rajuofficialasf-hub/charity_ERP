import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../lib/api';
import { ProgramsPage } from './ProgramsPage';

// The programs page: officials see the programs in their scope; the global roles create and edit
// them. Test data only.
const HEAD: Me = { ...ME, roles: ['department_head'] };
const PM: Me = { ...ME, roles: ['program_manager'] };
const VOLUNTEER: Me = { ...ME, kind: 'volunteer', roles: ['volunteer_general'] };

const PROGRAM = {
  id: '01900000-0000-7000-8000-0000000000b1',
  code: 'HUM',
  name: { bn: 'মানবিক সহায়তা', en: 'Humanitarian' },
  pmUserId: '01900000-0000-7000-8000-0000000000b2',
  pmName: 'নমুনা পিএম',
  active: true,
};

let created: unknown[];
let patched: unknown[];
let listed: number;

function serve(rows: unknown[] = [PROGRAM]) {
  created = [];
  patched = [];
  listed = 0;
  server.use(
    http.get('*/api/v1/programs', () => {
      listed += 1;
      return HttpResponse.json({ data: rows, meta: {} });
    }),
    http.get('*/api/v1/programs/:id', () =>
      HttpResponse.json({ data: PROGRAM, meta: { etag: '"v1"' } }),
    ),
    http.post('*/api/v1/programs', async ({ request }) => {
      const body = (await request.json()) as { code: string };
      created.push(body);
      if (body.code === 'TAKEN')
        return HttpResponse.json(
          {
            error: {
              code: 'program.code_taken',
              messageKey: 'errors.program.code_taken',
              message: 'এই প্রোগ্রাম কোড আগেই ব্যবহার করা হয়েছে।',
              requestId: 'req_x',
            },
          },
          { status: 409 },
        );
      return HttpResponse.json(
        { data: { ...PROGRAM, ...body, id: 'new' }, meta: {} },
        { status: 201 },
      );
    }),
    http.patch('*/api/v1/programs/:id', async ({ request }) => {
      patched.push({ body: await request.json(), ifMatch: request.headers.get('if-match') });
      return HttpResponse.json({ data: { ...PROGRAM, active: false }, meta: {} });
    }),
  );
}

const open = () => renderApp(<ProgramsPage />, 'bn', { path: '/admin/programs' });

beforeEach(() => {
  resetClientForTests();
});

describe('the programs page', () => {
  it('shows code, name, PM and state without accessibility violations', async () => {
    refreshAs(HEAD);
    serve();
    const { container } = open();
    expect(await screen.findByRole('heading', { level: 1, name: 'প্রোগ্রাম' })).toBeInTheDocument();
    expect((await screen.findAllByText('মানবিক সহায়তা')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('HUM').length).toBeGreaterThan(0);
    expect(screen.getAllByText('নমুনা পিএম').length).toBeGreaterThan(0);
    expect(screen.getAllByText('সক্রিয়').length).toBeGreaterThan(0);
    await expectNoAxeViolations(container);
  });

  it('counts the active and inactive programs and those without a PM', async () => {
    refreshAs(HEAD);
    serve([
      PROGRAM,
      { ...PROGRAM, id: 'p2', code: 'ERR', pmUserId: null, pmName: null },
      { ...PROGRAM, id: 'p3', code: 'OLD', active: false },
    ]);
    open();
    expect(await screen.findByText('কর্মসূচি পরিচালনা')).toBeInTheDocument();
    const counts = within(await screen.findByRole('region', { name: 'প্রোগ্রামের হিসাব' }));
    const card = (label: string) => counts.getByText(label).closest('.ui-card')!;
    await waitFor(() => expect(card('সক্রিয় প্রোগ্রাম')).toHaveTextContent('2'));
    expect(card('নিষ্ক্রিয় প্রোগ্রাম')).toHaveTextContent('1');
    expect(card('পিএম ছাড়া প্রোগ্রাম')).toHaveTextContent('1');
  });

  it('offers the new program and the edit only to the global roles', async () => {
    refreshAs(PM);
    serve();
    open();
    expect((await screen.findAllByText('মানবিক সহায়তা')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'নতুন প্রোগ্রাম' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /সম্পাদনা/ })).not.toBeInTheDocument();
  });

  it('refuses a lower-case code before sending and shows the server message for a taken code', async () => {
    refreshAs(HEAD);
    serve();
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'নতুন প্রোগ্রাম' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: /প্রোগ্রাম কোড/ }), 'hum');
    await user.type(within(dialog).getByRole('textbox', { name: /বাংলায় নাম/ }), 'নতুন');
    await user.type(within(dialog).getByRole('textbox', { name: /ইংরেজিতে নাম/ }), 'New');
    await user.click(within(dialog).getByRole('button', { name: 'সংরক্ষণ' }));
    expect(
      await within(dialog).findByText('2 থেকে 12টি ইংরেজি বড় হাতের অক্ষর (A-Z) দিন।'),
    ).toBeInTheDocument();
    expect(created).toEqual([]);
    const code = within(dialog).getByRole('textbox', { name: /প্রোগ্রাম কোড/ });
    await user.clear(code);
    await user.type(code, 'TAKEN');
    await user.click(within(dialog).getByRole('button', { name: 'সংরক্ষণ' }));
    expect(
      await within(dialog).findByText('এই প্রোগ্রাম কোড আগেই ব্যবহার করা হয়েছে।'),
    ).toBeInTheDocument();
    expect(created).toEqual([{ code: 'TAKEN', name: { bn: 'নতুন', en: 'New' } }]);
  });

  it('deactivates a program with its current version', async () => {
    refreshAs(HEAD);
    serve();
    const user = userEvent.setup();
    open();
    const [edit] = await screen.findAllByRole('button', { name: 'মানবিক সহায়তা সম্পাদনা' });
    await user.click(edit!);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('switch', { name: /সক্রিয়/ }));
    await user.click(within(dialog).getByRole('button', { name: 'সংরক্ষণ' }));
    await waitFor(() => expect(patched).toEqual([{ body: { active: false }, ifMatch: '"v1"' }]));
    expect(await screen.findByText('প্রোগ্রাম HUM সংরক্ষিত হয়েছে।')).toBeInTheDocument();
  });

  it('shows the forbidden content to a volunteer', async () => {
    refreshAs(VOLUNTEER);
    serve();
    open();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'প্রবেশাধিকার নেই' }),
    ).toBeInTheDocument();
    expect(listed).toBe(0);
  });
});
