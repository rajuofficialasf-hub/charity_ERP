import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../api/client';
import { ProgramsProjectsPage } from '../projects/ProgramsProjectsPage';

// The program dialog of the programs and projects tab: the global roles create a program from the
// tab and edit one from its card; the others never see either. Test data only.
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

/** The program as its card reads it. */
const CARD = {
  id: PROGRAM.id,
  code: PROGRAM.code,
  name: PROGRAM.name,
  description: null,
  coverFileId: null,
  active: true,
  pm: { id: PROGRAM.pmUserId, name: PROGRAM.pmName },
  rpms: { people: [], total: 0 },
  projects: 2,
  runningProjects: 1,
  beneficiaries: 40,
  applications: 12,
  volunteers: 3,
  canCreate: true,
};

function serve(rows: unknown[] = [CARD]) {
  created = [];
  patched = [];
  listed = 0;
  server.use(
    http.get('*/api/v1/program-cards', () => {
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

const open = () => renderApp(<ProgramsProjectsPage />, 'bn', { path: '/admin/projects' });

/** Turns a program's card to its back, where "প্রোগ্রাম এডিট করুন" is. */
async function turn(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole('button', { name: `${name}: বিস্তারিত দেখুন` }));
}

beforeEach(() => {
  resetClientForTests();
});

describe('the program dialog of the programs and projects tab', () => {
  it('opens on the program\u2019s card without accessibility violations', async () => {
    refreshAs(HEAD);
    serve();
    const user = userEvent.setup();
    const { container } = open();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'প্রোগ্রাম ও প্রকল্প' }),
    ).toBeInTheDocument();
    await turn(user, 'মানবিক সহায়তা');
    await user.click(screen.getByRole('button', { name: 'প্রোগ্রাম এডিট করুন' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('textbox', { name: /বাংলায় নাম/ })).toHaveValue(
      'মানবিক সহায়তা',
    );
    await expectNoAxeViolations(container);
  });

  it('offers the new program and the edit only to the global roles', async () => {
    refreshAs(PM);
    serve();
    const user = userEvent.setup();
    open();
    await turn(user, 'মানবিক সহায়তা');
    expect(screen.queryByRole('button', { name: 'নতুন প্রোগ্রাম' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'প্রোগ্রাম এডিট করুন' })).not.toBeInTheDocument();
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

  it('opens the PM field on the program managers before any text and saves the one chosen', async () => {
    refreshAs(HEAD);
    serve();
    const searches: URLSearchParams[] = [];
    server.use(
      http.get('*/api/v1/users', ({ request }) => {
        searches.push(new URL(request.url).searchParams);
        return HttpResponse.json({
          data: [
            {
              id: 'u-pm1',
              displayName: 'নমুনা পিএম এক',
              designation: null,
              roles: ['program_manager'],
            },
            {
              id: 'u-pm2',
              displayName: 'নমুনা পিএম দুই',
              designation: null,
              roles: ['program_manager'],
            },
          ],
          meta: {},
        });
      }),
    );
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'নতুন প্রোগ্রাম' }));
    const dialog = await screen.findByRole('dialog');
    // nothing is asked of the server until the field opens
    expect(searches).toEqual([]);
    await user.click(within(dialog).getByRole('combobox', { name: /প্রোগ্রাম ম্যানেজার/ }));
    await user.click(await screen.findByRole('option', { name: 'নমুনা পিএম দুই' }));
    expect(searches[0]?.get('role')).toBe('program_manager');
    expect(searches[0]?.get('state')).toBe('active');
    expect(searches[0]?.has('q')).toBe(false);
    await user.type(within(dialog).getByRole('textbox', { name: /প্রোগ্রাম কোড/ }), 'NEW');
    await user.type(within(dialog).getByRole('textbox', { name: /বাংলায় নাম/ }), 'নতুন');
    await user.type(within(dialog).getByRole('textbox', { name: /ইংরেজিতে নাম/ }), 'New');
    await user.click(within(dialog).getByRole('button', { name: 'সংরক্ষণ' }));
    await waitFor(() =>
      expect(created).toEqual([
        { code: 'NEW', name: { bn: 'নতুন', en: 'New' }, pmUserId: 'u-pm2' },
      ]),
    );
  });

  it('deactivates a program with its current version', async () => {
    refreshAs(HEAD);
    serve();
    const user = userEvent.setup();
    open();
    await turn(user, 'মানবিক সহায়তা');
    await user.click(screen.getByRole('button', { name: 'প্রোগ্রাম এডিট করুন' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('switch', { name: /সক্রিয়/ }));
    await user.click(within(dialog).getByRole('button', { name: 'সংরক্ষণ' }));
    await waitFor(() => expect(patched).toEqual([{ body: { active: false }, ifMatch: '"v1"' }]));
    expect(await screen.findByText('প্রোগ্রাম HUM সংরক্ষিত হয়েছে।')).toBeInTheDocument();
  });

  it('says the new program was created', async () => {
    refreshAs(HEAD);
    serve();
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'নতুন প্রোগ্রাম' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: /প্রোগ্রাম কোড/ }), 'NEW');
    await user.type(within(dialog).getByRole('textbox', { name: /বাংলায় নাম/ }), 'নতুন');
    await user.type(within(dialog).getByRole('textbox', { name: /ইংরেজিতে নাম/ }), 'New');
    await user.click(within(dialog).getByRole('button', { name: 'সংরক্ষণ' }));
    expect(await screen.findByText('প্রোগ্রাম NEW তৈরি হয়েছে।')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows a rename on the card at once when the PM assignment after it fails', async () => {
    refreshAs(HEAD);
    serve();
    let renamed = false;
    server.use(
      http.get('*/api/v1/program-cards', () => {
        listed += 1;
        return HttpResponse.json({
          data: [renamed ? { ...CARD, name: { bn: 'নতুন নাম', en: 'New name' } } : CARD],
          meta: {},
        });
      }),
      http.patch('*/api/v1/programs/:id', async ({ request }) => {
        patched.push({ body: await request.json(), ifMatch: request.headers.get('if-match') });
        renamed = true;
        return HttpResponse.json({
          data: { ...PROGRAM, name: { bn: 'নতুন নাম', en: 'New name' } },
          meta: {},
        });
      }),
      http.post('*/api/v1/programs/:id/pm', () =>
        HttpResponse.json(
          {
            error: {
              code: 'program.pm_role_missing',
              message: 'এই ব্যক্তির প্রোগ্রাম ম্যানেজারের ভূমিকা নেই।',
              requestId: 'req_pm',
            },
          },
          { status: 422 },
        ),
      ),
      http.get('*/api/v1/users', () =>
        HttpResponse.json({
          data: [{ id: 'u-pm2', displayName: 'নমুনা পিএম দুই', designation: null, roles: [] }],
          meta: {},
        }),
      ),
    );
    const user = userEvent.setup();
    open();
    await turn(user, 'মানবিক সহায়তা');
    await user.click(screen.getByRole('button', { name: 'প্রোগ্রাম এডিট করুন' }));
    const dialog = await screen.findByRole('dialog');
    const bn = within(dialog).getByRole('textbox', { name: /বাংলায় নাম/ });
    await user.clear(bn);
    await user.type(bn, 'নতুন নাম');
    await user.click(within(dialog).getByRole('combobox', { name: /প্রোগ্রাম ম্যানেজার/ }));
    await user.click(await screen.findByRole('option', { name: 'নমুনা পিএম দুই' }));
    const before = listed;
    await user.click(within(dialog).getByRole('button', { name: 'সংরক্ষণ' }));
    // the dialog stays with the refusal, and the card behind it already has the new name
    expect(await within(dialog).findByText(/প্রোগ্রাম ম্যানেজারের ভূমিকা নেই/)).toBeInTheDocument();
    await waitFor(() => expect(listed).toBeGreaterThan(before));
    // (behind the modal dialog, so hidden from the accessibility tree for now)
    expect(
      await screen.findByRole('article', { name: 'নতুন নাম', hidden: true }),
    ).toBeInTheDocument();
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
