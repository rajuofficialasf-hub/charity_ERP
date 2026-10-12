import { expectNoAxeViolations } from '@css/ui/testing';
import { screen } from '@testing-library/react';
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
  bank: { bankName: 'Test Bank', accountNumber: '0000111122223333' },
  photoFileId: null,
  nidPhotoFileId: null,
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
    // the own NID and bank details in full (D-081)
    expect(screen.getByText('1000000000301')).toBeInTheDocument();
    expect(screen.getByText(/0000111122223333/)).toBeInTheDocument();
    // only the two requested fields can be answered
    expect(screen.getAllByRole('form')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'আবার জমা দিন' })).not.toBeInTheDocument();
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

  it('asks for an address change with the new value', async () => {
    const user = userEvent.setup();
    serve(profile({ state: 'active', inAnyProject: true }), () => []);
    const { container } = renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    await screen.findByRole('heading', { name: 'Ask to change a detail' });
    expect(screen.queryByText('You have not joined any project yet.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Which detail/ }));
    await user.click(await screen.findByRole('option', { name: 'Address' }));
    for (const label of [/Division/, /(^|\s)District/, /Upazila/, /Union/]) {
      await user.click(await screen.findByRole('button', { name: label }));
      await user.click(await screen.findByRole('option', { name: 'Place' }));
    }
    await user.click(screen.getByRole('button', { name: 'Send request' }));
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
    await expectNoAxeViolations(container);
  }, 15_000);

  it('a new mobile waits for its code before it reaches the approver', async () => {
    const user = userEvent.setup();
    const open = row('01900000-0000-7000-8000-0000000000c5', 'mobile', {
      kind: 'profile_edit',
      status: 'open',
      newValue: '01700000999',
      contactVerified: false,
      note: null,
    });
    serve(profile({ state: 'active', inAnyProject: true }), () => [open]);
    renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    expect(await screen.findByText('Waiting for you')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByText('The code was sent.')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: /^Code/ }), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify code' }));
    await screen.findByRole('button', { name: 'Verify code' });
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
