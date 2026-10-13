import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
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
    await user.click(screen.getByRole('button', { name: 'ব্যাংকের তথ্য' }));
    expect(screen.getByText(/0000111122223333, Savar Branch/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'ব্যক্তিগত তথ্য' }));
    // only the two requested fields can be answered
    expect(screen.getAllByRole('form')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'আবার জমা দিন' })).not.toBeInTheDocument();
    // before approval nothing else can be changed (BR-031)
    expect(screen.queryByRole('button', { name: /সম্পাদনা/ })).not.toBeInTheDocument();
    expect(screen.getByText('অনুমোদনের অপেক্ষায়')).toBeInTheDocument();
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

type User = ReturnType<typeof userEvent.setup>;

/** Opens a section by its name in the navigation. */
const openSection = (user: User, name: string) =>
  user.click(
    within(screen.getByRole('navigation', { name: 'Profile sections' })).getByRole('button', {
      name,
    }),
  );

/** Opens a section and starts its edit mode; returns the edit form. */
async function startEdit(user: User, section: string) {
  await screen.findByRole('navigation', { name: 'Profile sections' });
  await openSection(user, section);
  await user.click(await screen.findByRole('button', { name: `Edit ${section}` }));
  return screen.getByRole('form', { name: `Request to change ${section}` });
}

describe('ProfileView of an approved volunteer', () => {
  beforeEach(() =>
    refreshAs({ ...ME, kind: 'volunteer', state: 'active', roles: ['volunteer_general'] }),
  );

  it('shows the person in a header and one section at a time, chosen from the navigation', async () => {
    const user = userEvent.setup();
    serve(profile({ state: 'active', inAnyProject: true }), () => []);
    const { container } = renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    const header = await screen.findByRole('region', { name: 'নমুনা স্বেচ্ছাসেবক' });
    expect(within(header).getByText('General volunteer')).toBeInTheDocument();
    expect(within(header).getByText('Active')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Profile sections' });
    expect(
      within(nav)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Personal details', 'Contact', 'Address', 'Work details', 'Bank details', 'Photos']);
    // the first section is open, the others are not shown
    expect(within(nav).getByRole('button', { name: 'Personal details' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Personal details' })).toBeInTheDocument();
    expect(screen.getByText('1000000000301')).toBeInTheDocument();
    expect(screen.queryByText(/Savar Branch/)).not.toBeInTheDocument();
    expect(screen.queryByText('You have not joined any project yet.')).not.toBeInTheDocument();
    await expectNoAxeViolations(container);

    await user.click(within(nav).getByRole('button', { name: 'Bank details' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Bank details' })).toBeInTheDocument();
    expect(screen.getByText(/0000111122223333, Savar Branch/)).toBeInTheDocument();
    expect(screen.queryByText('1000000000301')).not.toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Bank details' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await user.click(within(nav).getByRole('button', { name: 'Work details' }));
    expect(
      within(screen.getByRole('region', { name: 'Work details' })).getByText('General volunteer'),
    ).toBeInTheDocument();
    await user.click(within(nav).getByRole('button', { name: 'Address' }));
    expect(await screen.findByText(/Place/)).toBeInTheDocument();
  }, 15_000);

  it('has one edit button for the open section; the view and the edit mode pass axe in Bengali', async () => {
    const user = userEvent.setup();
    serve(profile({ state: 'active', inAnyProject: true }), () => []);
    const { container } = renderApp(<ProfileView />, 'bn', { path: '/account/profile' });
    expect(await screen.findAllByRole('button', { name: /সম্পাদনা/ })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'ব্যক্তিগত তথ্য সম্পাদনা' }));
    await expectNoAxeViolations(container);
  }, 15_000);

  it('the edit mode ticks details; none for the type or a detail with a request waiting', async () => {
    const user = userEvent.setup();
    serve(profile({ state: 'active', inAnyProject: true }), () => [
      row('01900000-0000-7000-8000-0000000000c6', 'education', {
        kind: 'profile_edit',
        status: 'submitted',
        newValue: 'স্নাতক',
        note: null,
      }),
    ]);
    renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    // before the mode, the waiting request shows its state
    await screen.findByRole('navigation', { name: 'Profile sections' });
    await openSection(user, 'Work details');
    expect(await screen.findByText('Waiting for approval')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit Work details' }));
    const form = screen.getByRole('form', { name: 'Request to change Work details' });
    expect(within(form).getByRole('checkbox', { name: 'Change Experience' })).toBeInTheDocument();
    expect(
      within(form).queryByRole('checkbox', { name: 'Change Education' }),
    ).not.toBeInTheDocument();
    expect(
      within(form).queryByRole('checkbox', { name: /Volunteer type/ }),
    ).not.toBeInTheDocument();
    expect(within(form).getByText('Waiting for approval')).toBeInTheDocument();
    expect(within(form).getByRole('button', { name: 'Send request' })).toBeDisabled();
  }, 15_000);

  it('sends one request for each ticked detail with its value and the one reason', async () => {
    const user = userEvent.setup();
    serve(profile({ state: 'active', inAnyProject: true }), () => []);
    renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    const form = await startEdit(user, 'Personal details');
    expect(within(form).getByRole('button', { name: 'Send request' })).toBeDisabled();
    // nothing is typed before a detail is ticked
    expect(within(form).queryByRole('textbox', { name: /^Father's name/ })).not.toBeInTheDocument();
    await user.click(within(form).getByRole('checkbox', { name: "Change Father's name" }));
    await user.type(within(form).getByRole('textbox', { name: /^Father's name/ }), 'নতুন পিতা');
    await user.click(within(form).getByRole('checkbox', { name: "Change Mother's name" }));
    await user.type(within(form).getByRole('textbox', { name: /^Mother's name/ }), 'নতুন মাতা');
    await user.type(within(form).getByRole('textbox', { name: 'Reason (optional)' }), 'ভুল ছিল');
    await user.click(within(form).getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText('The request was sent.')).toBeInTheDocument();
    expect(calls).toEqual([
      {
        method: 'POST',
        url: '/api/v1/me/change-requests',
        body: { field: 'fatherName', newValue: 'নতুন পিতা', note: 'ভুল ছিল' },
      },
      {
        method: 'POST',
        url: '/api/v1/me/change-requests',
        body: { field: 'motherName', newValue: 'নতুন মাতা', note: 'ভুল ছিল' },
      },
    ]);
    // the mode is over: the one edit button is back
    expect(
      screen.queryByRole('form', { name: 'Request to change Personal details' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Personal details' })).toBeInTheDocument();
  }, 20_000);

  it('cancel leaves the mode and sends nothing', async () => {
    const user = userEvent.setup();
    serve(profile({ state: 'active', inAnyProject: true }), () => []);
    const { container } = renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    const form = await startEdit(user, 'Personal details');
    await user.click(within(form).getByRole('checkbox', { name: 'Change NID number' }));
    await expectNoAxeViolations(container);
    await user.click(within(form).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Edit Personal details' })).toBeInTheDocument();
    expect(calls).toEqual([]);
  }, 15_000);

  it('adds the bank details with a branch from the bank section', async () => {
    const user = userEvent.setup();
    serve(profile({ state: 'active', inAnyProject: true, bank: {} }), () => []);
    renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    await screen.findByRole('navigation', { name: 'Profile sections' });
    await openSection(user, 'Bank details');
    expect(screen.getByText('Not given')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit Bank details' }));
    const form = screen.getByRole('form', { name: 'Request to change Bank details' });
    await user.click(within(form).getByRole('checkbox', { name: 'Change Bank details' }));
    await user.type(within(form).getByRole('textbox', { name: 'Bank name' }), 'Test Bank');
    await user.type(within(form).getByRole('textbox', { name: 'Branch' }), 'Savar Branch');
    await user.click(within(form).getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText('The request was sent.')).toBeInTheDocument();
    expect(calls).toEqual([
      {
        method: 'POST',
        url: '/api/v1/me/change-requests',
        body: { field: 'bank', newValue: { bankName: 'Test Bank', branchName: 'Savar Branch' } },
      },
    ]);
  }, 15_000);

  it('asks for an address change with the cascade', async () => {
    const user = userEvent.setup();
    serve(profile({ state: 'active', inAnyProject: true }), () => []);
    renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    const form = await startEdit(user, 'Address');
    await user.click(within(form).getByRole('checkbox', { name: 'Change Address' }));
    for (const label of [/Division/, /(^|\s)District/, /Upazila/, /Union/]) {
      await user.click(await within(form).findByRole('button', { name: label }));
      await user.click(await screen.findByRole('option', { name: 'Place' }));
    }
    await user.click(within(form).getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText('The request was sent.')).toBeInTheDocument();
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
  }, 20_000);

  it('a refused detail stays ticked with its message while the sent one leaves the mode', async () => {
    const user = userEvent.setup();
    serve(profile({ state: 'active', inAnyProject: true }), () => []);
    server.use(
      http.post('*/api/v1/me/change-requests', async ({ request }) => {
        const body = (await request.json()) as { field: string };
        if (body.field === 'nid')
          return HttpResponse.json(
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
          );
        return HttpResponse.json({ data: row('01900000-0000-7000-8000-0000000000c9', body.field) });
      }),
    );
    renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    const form = await startEdit(user, 'Personal details');
    await user.click(within(form).getByRole('checkbox', { name: "Change Father's name" }));
    await user.type(within(form).getByRole('textbox', { name: /^Father's name/ }), 'নতুন পিতা');
    await user.click(within(form).getByRole('checkbox', { name: 'Change NID number' }));
    await user.type(within(form).getByRole('textbox', { name: /^NID number/ }), '123');
    await user.click(within(form).getByRole('button', { name: 'Send request' }));
    expect(await within(form).findByText(/Some requests were not sent/)).toBeInTheDocument();
    expect(within(form).getByRole('textbox', { name: /^NID number/ })).toHaveAccessibleDescription(
      /10, 13 or 17 digits/,
    );
    expect(within(form).getByRole('checkbox', { name: 'Change NID number' })).toBeChecked();
    expect(within(form).getByRole('checkbox', { name: "Change Father's name" })).not.toBeChecked();
  }, 20_000);

  it('a request that reaches no server says so and keeps the ticks', async () => {
    const user = userEvent.setup();
    serve(profile({ state: 'active', inAnyProject: true }), () => []);
    server.use(http.post('*/api/v1/me/change-requests', () => HttpResponse.error()));
    renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    await screen.findByRole('navigation', { name: 'Profile sections' });
    await openSection(user, 'Work details');
    await user.click(await screen.findByRole('button', { name: 'Edit Work details' }));
    const form = screen.getByRole('form', { name: 'Request to change Work details' });
    await user.click(within(form).getByRole('checkbox', { name: 'Change Education' }));
    await user.type(within(form).getByRole('textbox', { name: /^Education/ }), 'BA');
    await user.click(within(form).getByRole('button', { name: 'Send request' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent(/\S/);
    expect(within(form).getByRole('checkbox', { name: 'Change Education' })).toBeChecked();
  }, 20_000);

  it('a refused photo request says why, and the sections can not be left while it is sent', async () => {
    const user = userEvent.setup();
    serve(profile({ state: 'active', inAnyProject: true }), () => []);
    server.use(
      http.post('*/api/v1/me/change-requests', () =>
        HttpResponse.json(
          { error: { code: 'conflict', message: 'A request is already open.', requestId: 'r' } },
          { status: 409 },
        ),
      ),
    );
    renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    const form = await startEdit(user, 'Photos');
    await user.click(within(form).getByRole('checkbox', { name: 'Change Photo' }));
    await user.click(within(form).getByRole('button', { name: 'Send request' }));
    expect(await within(form).findByText('A request is already open.')).toBeInTheDocument();
    expect(within(form).getByRole('checkbox', { name: 'Change Photo' })).toBeChecked();
  }, 15_000);

  it('a photo is ticked without an input; its upload follows the request', async () => {
    const user = userEvent.setup();
    serve(profile({ state: 'active', inAnyProject: true }), () => []);
    renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    const form = await startEdit(user, 'Photos');
    await user.click(within(form).getByRole('checkbox', { name: 'Change Photo' }));
    expect(within(form).getByText(/add the new photo here/)).toBeInTheDocument();
    await user.click(within(form).getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText('The request was sent.')).toBeInTheDocument();
    expect(calls).toEqual([
      { method: 'POST', url: '/api/v1/me/change-requests', body: { field: 'photo' } },
    ]);
  }, 15_000);

  it('a new mobile waits for its code before it reaches the approver, and its section is marked', async () => {
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
    const nav = await screen.findByRole('navigation', { name: 'Profile sections' });
    // the section with a request waiting for the person is marked while another one is open
    await waitFor(() =>
      expect(within(nav).getByRole('button', { name: 'Contact' })).toHaveAccessibleDescription(
        'Waiting for you',
      ),
    );
    await user.click(within(nav).getByRole('button', { name: 'Contact' }));
    const contact = screen.getByRole('region', { name: 'Contact' });
    expect(await within(contact).findByText('Waiting for you')).toBeInTheDocument();
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
  }, 20_000);
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
