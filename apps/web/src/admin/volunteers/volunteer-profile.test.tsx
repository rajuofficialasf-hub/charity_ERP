import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@/ui/testing';
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
  review: false,
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
  it('shows the header and the details by section, and says what is not shown, never an empty value', async () => {
    serve(profile());
    const user = userEvent.setup();
    const { container, router } = open();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'নমুনা স্বেচ্ছাসেবক' }),
    ).toBeInTheDocument();
    for (const section of [
      'ব্যক্তিগত তথ্য',
      'ঠিকানা',
      'শিক্ষা ও দক্ষতা',
      'পেশা ও কাজ',
      'যোগাযোগ',
      'নিবন্ধনের ইতিহাস',
    ])
      expect(screen.getByRole('region', { name: section })).toBeInTheDocument();
    // the bank details stay closed until asked for
    expect(screen.getByRole('button', { name: 'ব্যাংকের তথ্য' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    const personal = screen.getByRole('region', { name: 'ব্যক্তিগত তথ্য' });
    // the NID, the date of birth and the blood group were left out by the server
    expect(within(personal).getAllByText('আপনার জন্য দেখানো হয় না')).toHaveLength(3);
    // a value the caller may not see is never a chip of the header
    expect(screen.queryByText(/^NID নম্বর:/)).not.toBeInTheDocument();
    // the header and the contact card each copy the mobile number
    expect(screen.getAllByRole('button', { name: 'মোবাইল নম্বর কপি করুন' })).toHaveLength(2);
    // the bank details open only on a press
    expect(screen.getByRole('button', { name: 'ব্যাংকের তথ্য' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByRole('link', { name: 'কল করুন' })).toHaveAttribute(
      'href',
      'tel:01700000501',
    );
    // no action panel and no devices tab without a flag
    expect(screen.queryByRole('group', { name: 'কাজ' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ব্লকলিস্টে দিন' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'ডিভাইস' })).not.toBeInTheDocument();
    await expectNoAxeViolations(container);

    await user.click(screen.getByRole('tab', { name: 'কাজ ও প্রজেক্ট' }));
    await waitFor(() => expect(router.state.location.search).toBe('?tab=work'));
    expect(await screen.findByText('এখনো কোনো প্রজেক্টে যুক্ত হননি।')).toBeInTheDocument();
    expect(screen.getByText('কোনো টিম মেম্বার নেই।')).toBeInTheDocument();
    // no rating section without the category
    expect(screen.queryByRole('region', { name: 'রেটিং ও ক্যাটাগরি' })).not.toBeInTheDocument();
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
    const user = userEvent.setup();
    open();
    // in the banner's facts and in the personal details
    expect((await screen.findAllByText('1000000000501')).length).toBeGreaterThan(0);
    expect(screen.getByText('17-05-1990')).toBeInTheDocument();
    // the banner shows the NID and the mobile with a copy button; the rest is in the facts below
    expect(
      screen.getAllByText((_, el) => el?.textContent === 'NID নম্বর: 1000000000501').length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'NID নম্বর কপি করুন' })).toBeInTheDocument();
    expect(screen.queryByText('রক্তের গ্রুপ: O+')).toBeNull();
    expect(screen.getByText('O+')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'কাজ ও প্রজেক্ট' }));
    expect(await screen.findByText('শীতবস্ত্র 2026')).toBeInTheDocument();
    expect(screen.getByText('পেইড ভলান্টিয়ার')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'টিম সদস্য' })).toHaveAttribute(
      'href',
      '/admin/volunteers/01900000-0000-7000-8000-0000000000c1',
    );
    expect(screen.getByRole('region', { name: 'রেটিং ও ক্যাটাগরি' })).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('offers the block action and the devices only when the server allows them', async () => {
    serve(profile({ actions: actions({ block: true, viewSessions: true, revokeSessions: true }) }));
    const user = userEvent.setup();
    open();
    const panel = await screen.findByRole('region', { name: 'কাজ' });
    expect(within(panel).getByRole('button', { name: 'ব্লকলিস্টে দিন' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'ডিভাইস' }));
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
