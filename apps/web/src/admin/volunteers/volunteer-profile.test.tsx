import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../lib/api';
import { VolunteerProfilePage } from './VolunteerProfilePage';

// The official view of one volunteer (SCR-043; DECISION_LOG O-67, D-094): the sections, the parts
// the server leaves out, and a button only for an action the server allows. Test data only.
const HEAD: Me = { ...ME, roles: ['department_head'] };
const VOLUNTEER_ID = '01900000-0000-7000-8000-0000000000a1';
const USER_ID = '01900000-0000-7000-8000-0000000000a2';
const DIVISION = '01900000-0000-7000-8000-0000000000d1';
const SESSION = '01900000-0000-7000-8000-0000000000e1';

const actions = (over: Record<string, boolean> = {}) => ({
  approve: false,
  requestCorrection: false,
  block: false,
  unblock: false,
  viewSessions: false,
  revokeSessions: false,
  ...over,
});

const profile = (over: Record<string, unknown> = {}) => ({
  id: VOLUNTEER_ID,
  userId: USER_ID,
  displayName: 'নমুনা স্বেচ্ছাসেবক',
  type: 'general',
  state: 'active',
  mobile: '01700000501',
  email: null,
  whatsapp: null,
  fatherName: 'নমুনা পিতা',
  motherName: 'নমুনা মাতা',
  divisionId: DIVISION,
  districtId: DIVISION,
  upazilaId: DIVISION,
  unionId: DIVISION,
  addressLine: 'নমুনা গ্রাম',
  facebookId: null,
  education: null,
  experience: null,
  workDescription: null,
  previousProjects: null,
  tshirtSize: null,
  volunteeringArea: null,
  profession: null,
  professionDetails: {},
  interestAreas: [],
  vehicle: null,
  canSwim: null,
  availability: null,
  emergencyFullTime: null,
  educationDetails: {},
  permanentAddress: null,
  photoFileId: null,
  registeredAt: '2026-10-01T04:00:00.000Z',
  approvedAt: '2026-10-02T04:00:00.000Z',
  projects: [],
  team: [],
  blocklist: { blocked: false },
  actions: actions(),
  ...over,
});

let calls: { url: string; body: unknown }[];

function serve(data: unknown) {
  calls = [];
  server.use(
    http.get('*/api/v1/volunteers/:volunteerId', () =>
      HttpResponse.json({ data, meta: { requestId: 'req_test' } }),
    ),
    http.get('*/api/v1/locations', () => HttpResponse.json({ data: [] })),
    http.get('*/api/v1/users/:userId/sessions', () =>
      HttpResponse.json({
        data: [
          {
            id: SESSION,
            deviceName: 'নমুনা ফোন',
            platform: 'android',
            appVersion: '1.0.0',
            createdAt: '2026-10-10T04:00:00.000Z',
            lastSeenAt: '2026-10-14T04:00:00.000Z',
            current: false,
            revokedAt: null,
          },
        ],
        meta: { requestId: 'req_test' },
      }),
    ),
    http.post('*/api/v1/users/:userId/sessions/:sessionId/revoke', async ({ request }) => {
      calls.push({ url: new URL(request.url).pathname, body: await request.json() });
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

const open = () =>
  renderApp(<VolunteerProfilePage />, 'bn', {
    path: '/admin/volunteers/:volunteerId',
    initialPath: `/admin/volunteers/${VOLUNTEER_ID}`,
  });

beforeEach(() => {
  resetClientForTests();
  refreshAs(HEAD);
});

describe('the volunteer profile for officials', () => {
  it('shows the sections and says what is not shown, never an empty value', async () => {
    serve(profile());
    const { container } = open();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'নমুনা স্বেচ্ছাসেবক' }),
    ).toBeInTheDocument();
    for (const section of ['পরিচয়', 'ঠিকানা', 'শিক্ষা', 'কাজ', 'প্রজেক্ট ও অনুমতি', 'টিম'])
      expect(screen.getByRole('heading', { level: 2, name: section })).toBeInTheDocument();
    const identity = screen.getByRole('region', { name: 'পরিচয়' });
    // the NID, the date of birth and the blood group were left out by the server
    expect(within(identity).getAllByText('আপনার জন্য দেখানো হয় না')).toHaveLength(3);
    expect(screen.getByText('এখনো কোনো প্রজেক্টে যুক্ত হননি।')).toBeInTheDocument();
    expect(screen.getByText('কোনো টিম মেম্বার নেই।')).toBeInTheDocument();
    // no rating section without the category, and no action button without a flag
    expect(screen.queryByRole('heading', { name: 'রেটিং ও ক্যাটাগরি' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ব্লকলিস্টে দিন' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'ডিভাইস' })).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('shows the NID, the projects, the team and the category when the answer has them', async () => {
    serve(
      profile({
        nid: '1000000000501',
        bloodGroup: 'O+',
        dateOfBirth: '1990-05-17',
        projects: [
          {
            id: '01900000-0000-7000-8000-0000000000b1',
            code: 'WIN26',
            nameBn: 'শীতবস্ত্র 2026',
            nameEn: 'Winter 2026',
            year: 2026,
            permissionSet: 'application_distribution',
            isPaid: true,
            assignedAt: '2026-10-05T04:00:00.000Z',
          },
        ],
        team: [
          {
            id: '01900000-0000-7000-8000-0000000000c1',
            displayName: 'টিম সদস্য',
            type: 'team_member',
            state: 'active',
          },
        ],
        category: 'B',
        inactiveFlag: false,
        ratings: [],
      }),
    );
    open();
    expect(await screen.findByText('1000000000501')).toBeInTheDocument();
    expect(screen.getByText('17-05-1990')).toBeInTheDocument();
    expect(screen.getByText('শীতবস্ত্র 2026')).toBeInTheDocument();
    expect(screen.getByText('পেইড ভলান্টিয়ার')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'টিম সদস্য' })).toHaveAttribute(
      'href',
      '/admin/volunteers/01900000-0000-7000-8000-0000000000c1',
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'রেটিং ও ক্যাটাগরি' }),
    ).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('offers the block action and the devices only when the server allows them', async () => {
    serve(profile({ actions: actions({ block: true, viewSessions: true, revokeSessions: true }) }));
    const user = userEvent.setup();
    open();
    expect(await screen.findByRole('button', { name: 'ব্লকলিস্টে দিন' })).toBeInTheDocument();
    expect(await screen.findByText('নমুনা ফোন')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'এই ডিভাইস থেকে লগআউট করুন' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), 'ফোন হারিয়েছে');
    await user.click(within(dialog).getByRole('button', { name: 'লগআউট করুন' }));
    await waitFor(() =>
      expect(calls).toEqual([
        {
          url: `/api/v1/users/${USER_ID}/sessions/${SESSION}/revoke`,
          body: { reason: 'ফোন হারিয়েছে' },
        },
      ]),
    );
    expect(await screen.findByText('ডিভাইসটি থেকে লগআউট করা হয়েছে।')).toBeInTheDocument();
  });

  it('says when the volunteer is not found', async () => {
    server.use(
      http.get('*/api/v1/volunteers/:volunteerId', () =>
        HttpResponse.json(
          { error: { code: 'permission.not_found', message: 'Not found.', requestId: 'r' } },
          { status: 404 },
        ),
      ),
    );
    open();
    expect(await screen.findByText('এই স্বেচ্ছাসেবককে পাওয়া যায়নি।')).toBeInTheDocument();
  });

  it('shows the forbidden content to a volunteer', async () => {
    refreshAs({ ...ME, kind: 'volunteer', roles: ['volunteer_general'] });
    serve(profile());
    open();
    expect(await screen.findByRole('heading', { level: 1 })).not.toHaveTextContent(
      'নমুনা স্বেচ্ছাসেবক',
    );
  });
});
