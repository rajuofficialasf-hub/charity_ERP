import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../lib/api';
import type { ChangeRequest, OwnProfile } from './profile-api';
import { ProfileView } from './ProfileView';

// The own profile, correction answers and edit requests (BR-030, BR-031 as amended by D-085;
// plan docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md, unit U12).
const VOLUNTEER = '01900000-0000-7000-8000-0000000000b1';
const DIVISION = '01900000-0000-7000-8000-0000000000d1';
const DISTRICT = '01900000-0000-7000-8000-0000000000d2';
const UPAZILA = '01900000-0000-7000-8000-0000000000d3';
const UNION = '01900000-0000-7000-8000-0000000000d4';

const profile = (over: Partial<OwnProfile> = {}): OwnProfile => ({
  userId: ME.id,
  volunteerId: VOLUNTEER,
  state: 'pending',
  displayName: 'নমুনা স্বেচ্ছাসেবক',
  mobile: '01700000301',
  email: 'volunteer@example.org',
  inAnyProject: false,
  fatherName: 'নমুনা পিতা',
  motherName: 'নমুনা মাতা',
  nid: '1000000000301',
  type: 'general',
  whatsapp: null,
  divisionId: DIVISION,
  districtId: DISTRICT,
  upazilaId: UPAZILA,
  unionId: UNION,
  addressLine: null,
  education: 'এসএসসি',
  experience: null,
  workDescription: null,
  previousProjects: null,
  facebookId: null,
  bank: { bankName: 'Test Bank', accountNumber: '0000111122223333', branchName: 'Savar Branch' },
  photoFileId: null,
  nidPhotoFileId: null,
  nidPhotoBackFileId: null,
  ...over,
});

const row = (id: string, field: string, over: Partial<ChangeRequest> = {}): ChangeRequest => ({
  id,
  volunteerId: VOLUNTEER,
  kind: 'registration_correction',
  field,
  note: 'ঠিক করুন',
  status: 'open',
  ...over,
});

const list = (rows: ChangeRequest[]) =>
  HttpResponse.json({ data: rows, meta: { limit: rows.length, nextCursor: null } });

let calls: { method: string; url: string; body: unknown }[] = [];

function serve(me: OwnProfile, rows: () => ChangeRequest[]) {
  server.use(
    http.get('*/api/v1/volunteers/me', () => HttpResponse.json({ data: me })),
    http.get('*/api/v1/me/change-requests', () => list(rows())),
    http.get('*/api/v1/locations', ({ request }) => {
      const parent = new URL(request.url).searchParams.get('parentId');
      const id =
        parent === null
          ? DIVISION
          : parent === DIVISION
            ? DISTRICT
            : parent === DISTRICT
              ? UPAZILA
              : UNION;
      return HttpResponse.json({
        data: [
          {
            id,
            parentId: parent,
            level: 'x',
            code: 'x',
            name: { bn: 'স্থান', en: 'Place' },
            active: true,
          },
        ],
      });
    }),
    http.all('*/api/v1/me/*', async ({ request }) => {
      const body = request.method === 'GET' ? undefined : await request.json().catch(() => null);
      calls.push({ method: request.method, url: new URL(request.url).pathname, body });
      if (request.url.endsWith('/resubmit') || request.url.includes('/otp'))
        return new HttpResponse(null, { status: 204 });
      return HttpResponse.json({ data: row('01900000-0000-7000-8000-0000000000c9', 'education') });
    }),
  );
}

beforeEach(() => {
  resetClientForTests();
  calls = [];
});

describe('ProfileView of a pending registrant', () => {
  it('shows the no-project message and only the requested corrections; submit again once all are answered', async () => {
    const user = userEvent.setup();
    refreshAs({ ...ME, kind: 'volunteer', state: 'pending', roles: [] });
    let rows = [
      row('01900000-0000-7000-8000-0000000000c1', 'fatherName'),
      row('01900000-0000-7000-8000-0000000000c2', 'education', { status: 'submitted' }),
    ];
    serve(profile(), () => rows);
    const { container } = renderApp(<ProfileView />, 'bn', { path: '/account/profile' });
    expect(await screen.findByText('আপনি এখনো কোনো প্রজেক্টে যুক্ত হননি।')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'সংশোধনের অনুরোধ' })).toBeInTheDocument();
    // the own NID and bank details in full (DECISION_LOG D-081)
    expect(screen.getByText('1000000000301')).toBeInTheDocument();
    expect(screen.getByText(/0000111122223333, Savar Branch/)).toBeInTheDocument();
    // only the two requested fields can be answered
    expect(screen.getAllByRole('form')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'আবার জমা দিন' })).not.toBeInTheDocument();
    // before approval nothing else can be changed (BR-031)
    expect(screen.queryByRole('button', { name: /সম্পাদনা/ })).not.toBeInTheDocument();
    await expectNoAxeViolations(container);

    await user.type(screen.getByRole('textbox', { name: /পিতার নাম/ }), 'সংশোধিত পিতা');
    rows = rows.map((r) => ({ ...r, status: 'submitted' }));
    await user.click(screen.getAllByRole('button', { name: 'উত্তর দিন' })[0]!);
    await user.click(await screen.findByRole('button', { name: 'আবার জমা দিন' }));
    expect(await screen.findByText(/সংশোধন জমা হয়েছে/)).toBeInTheDocument();
    expect(calls.map((c) => [c.method, c.url, c.body])).toEqual([
      [
        'PATCH',
        '/api/v1/me/change-requests/01900000-0000-7000-8000-0000000000c1',
        { newValue: 'সংশোধিত পিতা' },
      ],
      ['POST', '/api/v1/me/registration/resubmit', null],
    ]);
  }, 15_000);
});

describe('ProfileView of an approved volunteer', () => {
  beforeEach(() =>
    refreshAs({ ...ME, kind: 'volunteer', state: 'active', roles: ['volunteer_general'] }),
  );

  it('arranges the details by section, with an edit button beside each changeable one', async () => {
    serve(profile({ state: 'active', inAnyProject: true }), () => []);
    const { container } = renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    for (const name of [
      'Personal details',
      'Contact',
      'Address',
      'Work details',
      'Bank details',
      'Photos',
    ])
      expect(await screen.findByRole('heading', { level: 2, name })).toBeInTheDocument();
    expect(screen.queryByText('You have not joined any project yet.')).not.toBeInTheDocument();
    const personal = screen.getByRole('region', { name: 'Personal details' });
    expect(within(personal).getByText('1000000000301')).toBeInTheDocument();
    expect(
      within(personal).getByRole('button', { name: "Edit Father's name" }),
    ).toBeInTheDocument();
    // the type decides the role: no edit button
    const work = screen.getByRole('region', { name: 'Work details' });
    expect(within(work).getByText('General volunteer')).toBeInTheDocument();
    expect(
      within(work).queryByRole('button', { name: /Edit Volunteer type/ }),
    ).not.toBeInTheDocument();
    // the address with its names
    expect(
      await within(screen.getByRole('region', { name: 'Address' })).findByText(/Place/),
    ).toBeInTheDocument();
    const photos = screen.getByRole('region', { name: 'Photos' });
    for (const label of ['Edit Photo', 'Edit NID card, first page', 'Edit NID card, second page'])
      expect(within(photos).getByRole('button', { name: label })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  }, 15_000);

  it('adds the bank details with a branch from the edit button of the bank section', async () => {
    const user = userEvent.setup();
    serve(profile({ state: 'active', inAnyProject: true, bank: {} }), () => []);
    renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    const bank = await screen.findByRole('region', { name: 'Bank details' });
    expect(within(bank).getByText('Not given')).toBeInTheDocument();
    await user.click(within(bank).getByRole('button', { name: 'Edit Bank details' }));
    const dialog = await screen.findByRole('dialog', { name: 'Request to change Bank details' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Bank name' }), 'Test Bank');
    await user.type(within(dialog).getByRole('textbox', { name: 'Branch' }), 'Savar Branch');
    await user.click(within(dialog).getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText('The request was sent.')).toBeInTheDocument();
    expect(calls).toEqual([
      {
        method: 'POST',
        url: '/api/v1/me/change-requests',
        body: { field: 'bank', newValue: { bankName: 'Test Bank', branchName: 'Savar Branch' } },
      },
    ]);
  }, 15_000);

  it('asks for an address change from the edit button beside the address', async () => {
    const user = userEvent.setup();
    serve(profile({ state: 'active', inAnyProject: true }), () => []);
    renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    await user.click(await screen.findByRole('button', { name: 'Edit Address' }));
    const dialog = await screen.findByRole('dialog', { name: 'Request to change Address' });
    for (const label of [/Division/, /(^|\s)District/, /Upazila/, /Union/]) {
      await user.click(await within(dialog).findByRole('button', { name: label }));
      await user.click(await screen.findByRole('option', { name: 'Place' }));
    }
    await user.click(within(dialog).getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText('The request was sent.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(calls).toEqual([
      {
        method: 'POST',
        url: '/api/v1/me/change-requests',
        body: {
          field: 'address',
          newValue: {
            divisionId: DIVISION,
            districtId: DISTRICT,
            upazilaId: UPAZILA,
            unionId: UNION,
          },
        },
      },
    ]);
  }, 15_000);

  it('a request that reaches no server says so in the dialog', async () => {
    const user = userEvent.setup();
    serve(profile({ state: 'active', inAnyProject: true }), () => []);
    server.use(http.post('*/api/v1/me/change-requests', () => HttpResponse.error()));
    renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    await user.click(await screen.findByRole('button', { name: 'Edit Education' }));
    const dialog = await screen.findByRole('dialog', { name: 'Request to change Education' });
    await user.type(within(dialog).getByRole('textbox', { name: /New value/ }), 'BA');
    await user.click(within(dialog).getByRole('button', { name: 'Send request' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/\S/);
  }, 15_000);

  it('a detail with a request waiting for approval shows that instead of the button', async () => {
    serve(profile({ state: 'active', inAnyProject: true }), () => [
      row('01900000-0000-7000-8000-0000000000c6', 'education', {
        kind: 'profile_edit',
        status: 'submitted',
        newValue: 'স্নাতক',
        note: null,
      }),
    ]);
    renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    const work = await screen.findByRole('region', { name: 'Work details' });
    expect(await within(work).findByText('Waiting for approval')).toBeInTheDocument();
    expect(within(work).queryByRole('button', { name: 'Edit Education' })).not.toBeInTheDocument();
    expect(within(work).getByRole('button', { name: 'Edit Experience' })).toBeInTheDocument();
  });

  it('a new mobile waits for its code before it reaches the approver', async () => {
    const user = userEvent.setup();
    const open = row('01900000-0000-7000-8000-0000000000c5', 'mobile', {
      kind: 'profile_edit',
      status: 'open',
      newValue: '01700000999',
      note: null,
    });
    let rows = [open];
    serve(profile({ state: 'active', inAnyProject: true }), () => rows);
    renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    expect(await screen.findByText('Waiting for you')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByText('The code was sent.')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: /^Code/ }), '123456');
    // after the code the request waits for the approver
    rows = [{ ...open, status: 'submitted' }];
    await user.click(screen.getByRole('button', { name: 'Verify code' }));
    expect(await screen.findByText('Waiting for approval')).toBeInTheDocument();
    expect(calls.map((c) => [c.method, c.url, c.body])).toEqual([
      ['POST', '/api/v1/me/change-requests/01900000-0000-7000-8000-0000000000c5/otp', null],
      [
        'POST',
        '/api/v1/me/change-requests/01900000-0000-7000-8000-0000000000c5/otp/verify',
        { code: '123456' },
      ],
    ]);
  });
});

describe('ProfileView states', () => {
  it('an official without a volunteer profile sees the empty state', async () => {
    refreshAs({ ...ME, kind: 'staff', state: 'active' });
    server.use(
      http.get('*/api/v1/volunteers/me', () =>
        HttpResponse.json(
          { error: { code: 'permission.not_found', message: 'Not found.', requestId: 'r' } },
          { status: 404 },
        ),
      ),
      http.get('*/api/v1/me/change-requests', () => list([])),
    );
    renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    expect(await screen.findByText("This page is for a volunteer's profile.")).toBeInTheDocument();
  });

  it('a failed request list shows an error with retry, not an empty list', async () => {
    refreshAs({ ...ME, kind: 'volunteer', state: 'pending', roles: [] });
    server.use(
      http.get('*/api/v1/volunteers/me', () => HttpResponse.json({ data: profile() })),
      http.get('*/api/v1/me/change-requests', () =>
        HttpResponse.json(
          // a client error is not retried, so the screen shows it at once
          { error: { code: 'permission.denied', message: 'Not allowed.', requestId: 'r' } },
          { status: 403 },
        ),
      ),
    );
    renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    expect(await screen.findByRole('button', { name: /Retry/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Correction requests' })).not.toBeInTheDocument();
  });

  it('shows a refused answer on its field', async () => {
    const user = userEvent.setup();
    refreshAs({ ...ME, kind: 'volunteer', state: 'pending', roles: [] });
    serve(profile(), () => [row('01900000-0000-7000-8000-0000000000c7', 'nid')]);
    server.use(
      http.patch('*/api/v1/me/change-requests/:id', () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation.failed',
              message: 'Some information is not valid.',
              details: [
                {
                  path: 'newValue',
                  code: 'validation.nid_format',
                  message: 'The NID must have 10, 13 or 17 digits.',
                },
              ],
              requestId: 'r',
            },
          },
          { status: 422 },
        ),
      ),
    );
    renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    await user.type(await screen.findByRole('textbox', { name: /NID number/ }), '123');
    await user.click(screen.getByRole('button', { name: 'Answer' }));
    expect(await screen.findByRole('textbox', { name: /NID number/ })).toHaveAccessibleDescription(
      /10, 13 or 17 digits/,
    );
  });
});
