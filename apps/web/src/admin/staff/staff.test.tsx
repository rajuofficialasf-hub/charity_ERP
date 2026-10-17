import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../lib/api';
import { StaffPage } from './StaffPage';

// The officials' directory, the new official, the set-password link and the profile edit
// (DECISION_LOG D-097). Test data only.
const HEAD: Me = { ...ME, roles: ['department_head'] };
const PM: Me = { ...ME, roles: ['program_manager'] };
const VOLUNTEER: Me = { ...ME, kind: 'volunteer', roles: ['volunteer_general'] };

const PROGRAM = {
  id: '01900000-0000-7000-8000-0000000000c1',
  code: 'HUM',
  name: { bn: 'মানবিক সহায়তা', en: 'Humanitarian' },
  pmUserId: null,
  pmName: null,
  active: true,
};
const DIVISION = { id: '01900000-0000-7000-8000-0000000000d1', name: { bn: 'ঢাকা', en: 'Dhaka' } };
const official = (over: Record<string, unknown> = {}) => ({
  id: '01900000-0000-7000-8000-0000000000e1',
  displayName: 'আরপিএম ঢাকা',
  kind: 'staff',
  state: 'active',
  designation: 'Regional Program Manager',
  roles: ['regional_program_manager'],
  jobId: 'CSS-201',
  affiliation: 'department',
  affiliationUnit: null,
  homeProgramId: PROGRAM.id,
  homeDivisionId: DIVISION.id,
  supervisorUserId: null,
  awaitingPassword: false,
  ...over,
});
const WAITING = official({
  id: '01900000-0000-7000-8000-0000000000e2',
  displayName: 'নতুন কর্মকর্তা',
  jobId: 'CSS-310',
  state: 'pending',
  designation: 'Project Executive',
  roles: ['project_executive'],
  awaitingPassword: true,
});
const PARTNER = official({
  id: '01900000-0000-7000-8000-0000000000e3',
  displayName: 'সহযোগী প্রতিনিধি',
  jobId: 'PRT-01',
  affiliation: 'external',
  affiliationUnit: 'সহযোগী সংস্থা',
});
const ISSUED = {
  userId: WAITING.id,
  link: 'http://127.0.0.1:3000/invite#AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  expiresAt: '2026-10-20T06:00:00Z',
  emailed: false,
};

let listQueries: URLSearchParams[];
let created: unknown[];
let renewed: unknown[];
let profiles: { body: unknown; ifMatch: string | null }[];

function serve() {
  listQueries = [];
  created = [];
  renewed = [];
  profiles = [];
  server.use(
    http.get('*/api/v1/programs', () => HttpResponse.json({ data: [PROGRAM], meta: {} })),
    http.get('*/api/v1/roles', () =>
      HttpResponse.json({
        data: [
          {
            key: 'department_head',
            name: { bn: 'ডিপার্টমেন্ট হেড', en: 'Department Head' },
            kind: 'official',
            globalScope: true,
          },
          {
            key: 'project_executive',
            name: { bn: 'প্রজেক্ট এক্সিকিউটিভ', en: 'Project Executive' },
            kind: 'official',
            globalScope: false,
          },
          {
            key: 'regional_program_manager',
            name: { bn: 'রিজিওনাল প্রোগ্রাম ম্যানেজার', en: 'Regional Program Manager' },
            kind: 'official',
            globalScope: false,
          },
          {
            key: 'volunteer_general',
            name: { bn: 'জেনারেল স্বেচ্ছাসেবক', en: 'General Volunteer' },
            kind: 'volunteer',
            globalScope: false,
          },
        ],
        meta: {},
      }),
    ),
    http.get('*/api/v1/locations', () => HttpResponse.json({ data: [DIVISION], meta: {} })),
    http.get('*/api/v1/users', ({ request }) => {
      const params = new URL(request.url).searchParams;
      listQueries.push(params);
      const rows = params.get('affiliation') === 'external' ? [PARTNER] : [official(), WAITING];
      return HttpResponse.json({ data: rows, meta: { nextCursor: null } });
    }),
    http.get('*/api/v1/users/:id', ({ params }) =>
      HttpResponse.json({
        data: params.id === WAITING.id ? WAITING : official(),
        meta: { etag: '"u1"' },
      }),
    ),
    http.post('*/api/v1/users', async ({ request }) => {
      const body = (await request.json()) as { jobId: string };
      created.push(body);
      if (body.jobId === 'TAKEN-1')
        return HttpResponse.json(
          {
            error: {
              code: 'user.job_id_taken',
              messageKey: 'errors.user.job_id_taken',
              message: 'এই Job ID অন্য একটি অ্যাকাউন্টে আছে।',
              requestId: 'req_x',
            },
          },
          { status: 409 },
        );
      return HttpResponse.json({ data: ISSUED, meta: {} }, { status: 201 });
    }),
    http.post('*/api/v1/users/:id/invitation', async ({ request }) => {
      renewed.push(await request.json());
      return HttpResponse.json({ data: { ...ISSUED, emailed: true }, meta: {} }, { status: 201 });
    }),
    http.put('*/api/v1/users/:id/profile', async ({ request }) => {
      profiles.push({ body: await request.json(), ifMatch: request.headers.get('if-match') });
      return HttpResponse.json({ data: official({ designation: 'Senior RPM' }), meta: {} });
    }),
  );
}

const open = () => renderApp(<StaffPage />, 'bn', { path: '/admin/staff' });

beforeEach(() => {
  resetClientForTests();
});

describe('the officials page', () => {
  it('lists the department staff with job ID and state, without accessibility violations', async () => {
    refreshAs(HEAD);
    serve();
    const { container } = open();
    expect(await screen.findByRole('heading', { level: 1, name: 'কর্মী' })).toBeInTheDocument();
    expect((await screen.findAllByText('CSS-201')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('পাসওয়ার্ডের অপেক্ষায়').length).toBeGreaterThan(0);
    expect(listQueries[0]!.get('kind')).toBe('staff');
    expect(listQueries[0]!.get('affiliation')).toBe('department');
    await expectNoAxeViolations(container);
  });

  it('keeps outside partners in their own tab', async () => {
    refreshAs(HEAD);
    serve();
    const user = userEvent.setup();
    open();
    await screen.findAllByText('CSS-201');
    await user.click(screen.getByRole('tab', { name: 'বাইরের সহযোগী' }));
    expect((await screen.findAllByText('সহযোগী সংস্থা')).length).toBeGreaterThan(0);
    expect(listQueries.at(-1)!.get('affiliation')).toBe('external');
    expect(screen.queryByText('CSS-201')).not.toBeInTheDocument();
  });

  it('offers the new official and the edits only to the global roles', async () => {
    refreshAs(PM);
    serve();
    open();
    await screen.findAllByText('CSS-201');
    expect(screen.queryByRole('button', { name: 'নতুন অফিসিয়াল' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /প্রোফাইল সম্পাদনা/ })).not.toBeInTheDocument();
  });

  it('creates an official and shows the link to copy once', async () => {
    refreshAs(HEAD);
    serve();
    const user = userEvent.setup();
    // after the setup, which gives the page a clipboard of its own
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    open();
    await user.click(await screen.findByRole('button', { name: 'নতুন অফিসিয়াল' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: /^Job ID/ }), 'css-310');
    await user.type(within(dialog).getByRole('textbox', { name: /^নাম/ }), 'নতুন কর্মকর্তা');
    await user.type(within(dialog).getByRole('textbox', { name: /^পদবি/ }), 'Project Executive');
    await user.type(within(dialog).getByRole('textbox', { name: /^ইমেইল/ }), 'New@Example.org');
    await user.click(within(dialog).getByRole('button', { name: /ভূমিকা/ }));
    // the Department Head role is never offered
    expect(screen.queryByRole('option', { name: 'ডিপার্টমেন্ট হেড' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'প্রজেক্ট এক্সিকিউটিভ' }));
    await user.click(within(dialog).getByRole('button', { name: 'অ্যাকাউন্ট তৈরি করুন' }));
    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toMatchObject({
      jobId: 'css-310',
      email: 'new@example.org',
      mobile: null,
      roleKey: 'project_executive',
      affiliation: 'department',
      affiliationUnit: null,
      homeProgramId: null,
      supervisorUserId: null,
    });
    const linkDialog = await screen.findByRole('dialog', { name: /পাসওয়ার্ড লিঙ্ক/ });
    expect(within(linkDialog).getByText(/ইমেইল পাঠানো যায়নি/)).toBeInTheDocument();
    expect(within(linkDialog).getByRole('textbox', { name: /লিঙ্ক/ })).toHaveValue(ISSUED.link);
    await user.click(within(linkDialog).getByRole('button', { name: 'লিঙ্ক কপি করুন' }));
    expect(writeText).toHaveBeenCalledWith(ISSUED.link);
    expect(await within(linkDialog).findByText('লিঙ্ক কপি হয়েছে।')).toBeInTheDocument();
  }, 15_000);

  it('shows the server message when the job ID is taken', async () => {
    refreshAs(HEAD);
    serve();
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'নতুন অফিসিয়াল' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: /^Job ID/ }), 'TAKEN-1');
    await user.type(within(dialog).getByRole('textbox', { name: /^নাম/ }), 'নাম');
    await user.type(within(dialog).getByRole('textbox', { name: /^পদবি/ }), 'পদ');
    await user.type(within(dialog).getByRole('textbox', { name: /^ইমেইল/ }), 'x@example.org');
    await user.click(within(dialog).getByRole('button', { name: /ভূমিকা/ }));
    await user.click(screen.getByRole('option', { name: 'প্রজেক্ট এক্সিকিউটিভ' }));
    await user.click(within(dialog).getByRole('button', { name: 'অ্যাকাউন্ট তৈরি করুন' }));
    expect(
      await within(dialog).findByText('এই Job ID অন্য একটি অ্যাকাউন্টে আছে।'),
    ).toBeInTheDocument();
  }, 15_000);

  it('asks the unit of an outside partner', async () => {
    refreshAs(HEAD);
    serve();
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'নতুন অফিসিয়াল' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('textbox', { name: /প্রতিষ্ঠানের নাম/ })).toBeNull();
    await user.click(within(dialog).getByRole('radio', { name: 'বাইরের সহযোগী' }));
    expect(within(dialog).getByRole('textbox', { name: /প্রতিষ্ঠানের নাম/ })).toBeInTheDocument();
  });

  it('sends a new link to a corrected email', async () => {
    refreshAs(HEAD);
    serve();
    const user = userEvent.setup();
    open();
    const [renew] = await screen.findAllByRole('button', {
      name: 'নতুন কর্মকর্তা-এর জন্য নতুন পাসওয়ার্ড লিঙ্ক',
    });
    await user.click(renew!);
    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByRole('textbox', { name: /সংশোধিত ইমেইল/ }),
      'Right@Example.org',
    );
    await user.click(within(dialog).getByRole('button', { name: 'নতুন লিঙ্ক পাঠান' }));
    await waitFor(() => expect(renewed).toEqual([{ email: 'right@example.org' }]));
    expect(await screen.findByText(/লিঙ্কটি ইমেইলে পাঠানো হয়েছে/)).toBeInTheDocument();
  });

  it('saves a profile with the version read when it opened', async () => {
    refreshAs(HEAD);
    serve();
    const user = userEvent.setup();
    open();
    const [edit] = await screen.findAllByRole('button', {
      name: 'আরপিএম ঢাকা-এর প্রোফাইল সম্পাদনা',
    });
    await user.click(edit!);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('textbox', { name: /^ইমেইল/ })).toBeNull();
    const designation = within(dialog).getByRole('textbox', { name: /^পদবি/ });
    await user.clear(designation);
    await user.type(designation, 'Senior RPM');
    await user.click(within(dialog).getByRole('button', { name: 'সংরক্ষণ' }));
    await waitFor(() => expect(profiles).toHaveLength(1));
    expect(profiles[0]).toEqual({
      ifMatch: '"u1"',
      body: {
        jobId: 'CSS-201',
        displayName: 'আরপিএম ঢাকা',
        designation: 'Senior RPM',
        affiliation: 'department',
        affiliationUnit: null,
        homeProgramId: PROGRAM.id,
        homeDivisionId: DIVISION.id,
        supervisorUserId: null,
      },
    });
    expect(await screen.findByText('আরপিএম ঢাকা-এর প্রোফাইল সংরক্ষিত হয়েছে।')).toBeInTheDocument();
  });

  it('shows the forbidden content to a volunteer', async () => {
    refreshAs(VOLUNTEER);
    serve();
    open();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'প্রবেশাধিকার নেই' }),
    ).toBeInTheDocument();
    expect(listQueries).toHaveLength(0);
  });
});
