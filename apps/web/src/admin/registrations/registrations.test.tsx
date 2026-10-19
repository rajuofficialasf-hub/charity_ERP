import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderInShell } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../lib/api';
import { AdminLayout } from '../AdminLayout';
import { RegistrationDetail } from './RegistrationDetail';
import { RegistrationsPage } from './RegistrationsPage';
import { VolunteerProfilePage } from '../volunteers/VolunteerProfilePage';
import { VolunteersPage } from '../volunteers/VolunteersPage';

// The registration admin page (SCR-040, BR-028 to BR-031, BD-06; plan
// docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md, U13). Test data only.
const HEAD: Me = { ...ME, displayName: 'ডিপার্টমেন্ট হেড (নমুনা)', roles: ['department_head'] };
const RPM: Me = { ...ME, displayName: 'আরপিএম (নমুনা)', roles: ['regional_program_manager'] };
const PM: Me = { ...ME, displayName: 'পিএম (নমুনা)', roles: ['program_manager'] };
const FINANCE: Me = { ...ME, displayName: 'ফাইন্যান্স (নমুনা)', roles: ['finance_team'] };

const VOLUNTEER_USER = '01900000-0000-7000-8000-0000000000a1';
const VOLUNTEER_ID = '01900000-0000-7000-8000-0000000000a2';
const STAFF_USER = '01900000-0000-7000-8000-0000000000a3';
const EDIT_ID = '01900000-0000-7000-8000-0000000000a4';
const DIVISION = '01900000-0000-7000-8000-0000000000d1';
const DISTRICT = '01900000-0000-7000-8000-0000000000d2';
const UPAZILA = '01900000-0000-7000-8000-0000000000d3';
const UNION = '01900000-0000-7000-8000-0000000000d4';
const meta = { requestId: 'req_test', limit: 50, nextCursor: null, prevCursor: null };

const pendingVolunteer = {
  userId: VOLUNTEER_USER,
  kind: 'volunteer',
  displayName: 'নতুন স্বেচ্ছাসেবক (নমুনা)',
  status: 'awaiting_review',
  submittedAt: '2026-10-12T04:00:00.000Z',
  volunteerType: 'general',
  divisionId: DIVISION,
  districtId: DISTRICT,
  designation: null,
};
const pendingStaff = {
  userId: STAFF_USER,
  kind: 'staff',
  displayName: 'নতুন কর্মকর্তা (নমুনা)',
  status: 'awaiting_review',
  submittedAt: '2026-10-12T05:00:00.000Z',
  volunteerType: null,
  divisionId: null,
  districtId: null,
  designation: 'Project Executive',
};

const volunteerDetail = (over: Record<string, unknown> = {}) => ({
  ...pendingVolunteer,
  mobile: '01700000501',
  email: 'new.volunteer@example.org',
  photoFileId: null,
  homeProgramId: null,
  homeDivisionId: null,
  volunteer: {
    id: VOLUNTEER_ID,
    userId: VOLUNTEER_USER,
    displayName: pendingVolunteer.displayName,
    type: 'general',
    state: 'pending',
    districtId: DISTRICT,
    upazilaId: UPAZILA,
    approvedAt: null,
    fatherName: 'নমুনা পিতা',
    motherName: 'নমুনা মাতা',
    mobile: '01700000501',
    whatsapp: null,
    divisionId: DIVISION,
    unionId: UNION,
    addressLine: 'নমুনা গ্রাম',
    education: 'এসএসসি',
    experience: null,
    workDescription: null,
    previousProjects: null,
    facebookId: null,
    bloodGroup: 'O+',
    dateOfBirth: '1990-05-17',
    emergencyFullTime: true,
    educationDetails: {
      highestQualification: 'hsc',
      institutionName: 'Sample College',
      passingYear: 2012,
    },
    permanentAddress: { addressLine: 'Old village' },
    tshirtSize: 'M',
    volunteeringArea: 'own_union',
    profession: 'student',
    professionDetails: { institutionName: 'Sample School' },
    interestAreas: ['media'],
    vehicle: 'none',
    canSwim: false,
    availability: 'holidays',
    nid: '1000000000501',
    nidPhotoFileId: null,
    bank: {
      bankName: null,
      accountName: null,
      accountNumber: null,
      branchName: null,
      routingNumber: null,
    },
    photoFileId: null,
    referenceVolunteerId: null,
  },
  blocklisted: false,
  corrections: [],
  ...over,
});
const staffDetail = {
  ...pendingStaff,
  mobile: '01700000502',
  email: 'new.official@example.org',
  photoFileId: null,
  homeProgramId: null,
  homeDivisionId: DIVISION,
  volunteer: null,
  blocklisted: false,
  corrections: [],
};

let calls: { method: string; url: string; body: unknown }[];
let pending: unknown[];
let detail: Record<string, unknown>;
let edits: unknown[];

async function record(request: Request) {
  const body = await request.json().catch(() => null);
  calls.push({ method: request.method, url: new URL(request.url).pathname, body });
}

function serve() {
  server.use(
    // the list answers one status at a time (awaiting_review when none is given)
    http.get('*/api/v1/registrations', ({ request }) => {
      const params = new URL(request.url).searchParams;
      const status = params.get('status');
      const kind = params.get('kind');
      return HttpResponse.json({
        data: pending.filter(
          (p) =>
            (!status || (p as { status: string }).status === status) &&
            (!kind || (p as { kind: string }).kind === kind),
        ),
        meta,
      });
    }),
    // the volunteer tab and the profile that opens the review of a pending volunteer
    http.get('*/api/v1/volunteers/statistics', () =>
      HttpResponse.json({
        data: {
          volunteers: { total: 0, active: 0, pending: 0, blocked: 0, deactivated: 0 },
          applications: { total: 0, approved: 0, underReview: 0 },
        },
        meta,
      }),
    ),
    http.get('*/api/v1/volunteers', () => {
      volunteerListCalls += 1;
      return HttpResponse.json({ data: [], meta });
    }),
    http.get('*/api/v1/volunteers/:volunteerId', () =>
      HttpResponse.json({
        data: {
          id: VOLUNTEER_ID,
          userId: VOLUNTEER_USER,
          displayName: pendingVolunteer.displayName,
          type: 'general',
          state: 'pending',
          // the parts of the profile the registration's answers do not replace
          mobile: null,
          email: null,
          whatsapp: null,
          fatherName: 'নমুনা পিতা',
          motherName: 'নমুনা মাতা',
          divisionId: DIVISION,
          districtId: DISTRICT,
          upazilaId: UPAZILA,
          unionId: UNION,
          addressLine: null,
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
          registeredAt: '2026-10-12T04:00:00.000Z',
          approvedAt: null,
          projects: [],
          team: [],
          blocklist: { blocked: false },
          actions: {
            review: true,
            approve: !profileHeld,
            requestCorrection: !profileHeld,
            block: profileBlock,
            unblock: false,
            viewSessions: false,
            revokeSessions: false,
          },
        },
        meta,
      }),
    ),
    http.get('*/api/v1/registrations/:userId', ({ params }) =>
      params.userId === STAFF_USER
        ? HttpResponse.json({ data: staffDetail })
        : HttpResponse.json({ data: detail }),
    ),
    http.get('*/api/v1/locations', ({ request }) => {
      const parent = new URL(request.url).searchParams.get('parentId');
      const [id, name] =
        parent === null
          ? [DIVISION, 'ঢাকা বিভাগ']
          : parent === DIVISION
            ? [DISTRICT, 'ঢাকা জেলা']
            : parent === DISTRICT
              ? [UPAZILA, 'সাভার উপজেলা']
              : [UNION, 'সাভার ইউনিয়ন'];
      return HttpResponse.json({
        data: [{ id, parentId: parent, level: 'x', code: 'x', name: { bn: name, en: name } }],
      });
    }),
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
            key: 'volunteer_general',
            name: { bn: 'সাধারণ স্বেচ্ছাসেবক', en: 'General volunteer' },
            kind: 'volunteer',
            globalScope: false,
          },
        ],
        meta,
      }),
    ),
    http.get('*/api/v1/edit-requests', () => HttpResponse.json({ data: edits, meta })),
    http.post('*/api/v1/registrations/:userId/approve', async ({ request }) => {
      await record(request);
      pending = pending.filter((p) => p !== pendingVolunteer);
      return HttpResponse.json({ data: { id: VOLUNTEER_ID } });
    }),
    http.post('*/api/v1/registrations/:userId/reject', async ({ request }) => {
      await record(request);
      return new HttpResponse(null, { status: 204 });
    }),
    http.post('*/api/v1/registrations/:userId/correction-requests', async ({ request }) => {
      await record(request);
      detail = { ...detail, status: 'in_correction' };
      return HttpResponse.json({ data: [], meta }, { status: 201 });
    }),
    http.post('*/api/v1/staff-registrations/:userId/decision', async ({ request }) => {
      await record(request);
      return HttpResponse.json({ data: { id: STAFF_USER } });
    }),
    http.post('*/api/v1/volunteers/:volunteerId/block', async ({ request }) => {
      await record(request);
      detail = { ...detail, blocklisted: true };
      return HttpResponse.json({ data: { id: VOLUNTEER_ID } }, { status: 201 });
    }),
    http.post('*/api/v1/volunteers/:volunteerId/unblock', async ({ request }) => {
      await record(request);
      detail = { ...detail, blocklisted: false };
      return HttpResponse.json({ data: { id: VOLUNTEER_ID } });
    }),
    http.post('*/api/v1/edit-requests/:requestId/decision', async ({ request }) => {
      await record(request);
      edits = [];
      return HttpResponse.json({ data: { id: EDIT_ID } });
    }),
  );
}

/** The profile of the pending volunteer, which opens as the registration review. */
const REVIEW = `/admin/volunteers/${VOLUNTEER_ID}`;

let volunteerListCalls = 0;
/** Whether the profile's flags allow the block action (the RPM yes, the Project Executive no). */
let profileBlock = true;
/** A correction holds the registration: the caller still reviews it, but cannot decide now. */
let profileHeld = false;

const renderPage = (me: Me, locale: 'bn' | 'en' = 'bn', path = '/admin/registrations') => {
  refreshAs(me);
  return renderInShell(
    [
      {
        path: 'admin',
        element: <AdminLayout />,
        children: [
          { path: 'registrations', element: <RegistrationsPage /> },
          { path: 'registrations/:userId', element: <RegistrationDetail /> },
          { path: 'volunteers', element: <VolunteersPage /> },
          { path: 'volunteers/:volunteerId', element: <VolunteerProfilePage /> },
        ],
      },
    ],
    path,
    locale,
  );
};

/** Opens a row of the list (the table and the phone cards both carry the link). */
async function openRow(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click((await screen.findAllByRole('link', { name }))[0]!);
  await screen.findByRole('heading', { level: 1, name });
}

beforeEach(() => {
  resetClientForTests();
  volunteerListCalls = 0;
  profileBlock = true;
  profileHeld = false;
  calls = [];
  pending = [pendingVolunteer, pendingStaff];
  detail = volunteerDetail();
  edits = [
    {
      id: EDIT_ID,
      volunteerId: VOLUNTEER_ID,
      kind: 'profile_edit',
      field: 'education',
      newValue: 'স্নাতক',
      note: 'নতুন সনদ',
      status: 'submitted',
      decidedAt: null,
      volunteerName: 'অনুমোদিত স্বেচ্ছাসেবক (নমুনা)',
    },
  ];
  serve();
});

describe('registration list', () => {
  it('shows the pending staff registrations only; volunteers are reviewed in the volunteer tab', async () => {
    const { container } = renderPage(HEAD);
    expect(await screen.findByRole('heading', { level: 1, name: 'নিবন্ধন' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'প্রধান মেনু' });
    expect(within(nav).getByRole('link', { name: 'নিবন্ধন' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const table = await screen.findByRole('grid', { name: 'অপেক্ষমাণ নিবন্ধন' });
    const staffRow = within(table)
      .getByRole('link', { name: 'নতুন কর্মকর্তা (নমুনা)' })
      .closest<HTMLElement>('[role="row"]')!;
    expect(within(staffRow).getByText('কর্মকর্তা')).toBeInTheDocument();
    expect(
      within(table).queryByRole('link', { name: 'নতুন স্বেচ্ছাসেবক (নমুনা)' }),
    ).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('sends an older link to the volunteer registrations to the volunteer tab', async () => {
    renderPage(HEAD, 'bn', '/admin/registrations?kind=volunteer');
    // the volunteer tab renders inside the shell after the redirect
    expect(
      await screen.findByRole('heading', { level: 1, name: 'স্বেচ্ছাসেবক' }, { timeout: 3000 }),
    ).toBeInTheDocument();
  });

  it('shows an empty state when nothing waits', async () => {
    pending = [];
    renderPage(HEAD);
    expect(await screen.findByText('কোনো নিবন্ধন অপেক্ষায় নেই।')).toBeInTheDocument();
  });

  it('opens for an RPM with the edit requests only, without the permission panel', async () => {
    renderPage(RPM);
    const nav = await screen.findByRole('navigation', { name: 'প্রধান মেনু' });
    expect(within(nav).getByRole('link', { name: 'নিবন্ধন' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'পারমিশন' })).not.toBeInTheDocument();
    // the RPM decides edit requests and no staff registrations
    expect((await screen.findAllByText('অনুমোদিত স্বেচ্ছাসেবক (নমুনা)')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('tab', { name: 'পরিবর্তনের অনুরোধ' })).not.toBeInTheDocument();
  });

  it('opens on the edit requests when the link asks for that tab', async () => {
    renderPage(HEAD, 'bn', '/admin/registrations?tab=edits');
    expect(
      await screen.findByRole('tab', { name: 'পরিবর্তনের অনুরোধ', selected: true }),
    ).toBeInTheDocument();
  });

  it('a Finance Team user sees the no-access screen', async () => {
    renderPage(FINANCE);
    expect(await screen.findByRole('heading', { name: 'প্রবেশাধিকার নেই' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'প্রধান মেনু' });
    expect(within(nav).queryByRole('link', { name: 'নিবন্ধন' })).not.toBeInTheDocument();
  });

  it('a Program Manager reviews volunteers in the tab and has no registrations page', async () => {
    renderPage(PM);
    const nav = await screen.findByRole('navigation', { name: 'প্রধান মেনু' });
    expect(within(nav).queryByRole('link', { name: 'নিবন্ধন' })).not.toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'স্বেচ্ছাসেবক' })).toBeInTheDocument();
  });

  it('is accessible in English', async () => {
    const { container } = renderPage(HEAD, 'en');
    await screen.findByRole('grid', { name: 'Pending registrations' });
    await expectNoAxeViolations(container);
  });
});

describe('volunteer registration detail', () => {
  it('shows the details with the address names; approving shows the success alert on the list', async () => {
    const user = userEvent.setup();
    const { container } = renderPage(RPM, 'bn', REVIEW);
    await screen.findByRole('heading', { level: 1, name: 'নতুন স্বেচ্ছাসেবক (নমুনা)' });
    expect(screen.getByText('নমুনা পিতা')).toBeInTheDocument();
    expect(screen.getByText('1000000000501')).toBeInTheDocument();
    expect(await screen.findByText(/সাভার ইউনিয়ন/)).toBeInTheDocument();
    expect(screen.getAllByText('ছবি নেই').length).toBeGreaterThan(0);
    await expectNoAxeViolations(container);

    await user.click(screen.getByRole('button', { name: 'অনুমোদন' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'অনুমোদন করুন' }));
    expect(await screen.findByText('নিবন্ধন অনুমোদিত হয়েছে')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'স্বেচ্ছাসেবক' })).toBeInTheDocument();
    expect(calls).toEqual([
      { method: 'POST', url: `/api/v1/registrations/${VOLUNTEER_USER}/approve`, body: null },
    ]);
  });

  it('keeps the review open while a correction holds it, with approval and correction held back', async () => {
    profileHeld = true;
    renderPage(RPM, 'bn', REVIEW);
    await screen.findByRole('heading', { level: 1, name: 'নতুন স্বেচ্ছাসেবক (নমুনা)' });
    expect(screen.getByRole('button', { name: 'অনুমোদন' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'সংশোধনের অনুরোধ' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'প্রত্যাখ্যান' })).toBeEnabled();
  });

  it('a decision in the review refreshes the volunteer tab it returns to', async () => {
    const user = userEvent.setup();
    const { router } = renderPage(RPM, 'bn', '/admin/volunteers?state=pending');
    await screen.findByRole('heading', { level: 1, name: 'স্বেচ্ছাসেবক' });
    await waitFor(() => expect(volunteerListCalls).toBe(1));
    await router.navigate(REVIEW);
    await screen.findByRole('heading', { level: 1, name: 'নতুন স্বেচ্ছাসেবক (নমুনা)' });
    await user.click(screen.getByRole('button', { name: 'অনুমোদন' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'অনুমোদন করুন' }));
    expect(await screen.findByText('নিবন্ধন অনুমোদিত হয়েছে')).toBeInTheDocument();
    // the cached page is not shown as it was: the list asks the server again
    await waitFor(() => expect(volunteerListCalls).toBeGreaterThan(1));
  });

  it('a hidden NID shows that it is not visible, never an empty value', async () => {
    const masked = volunteerDetail();
    const { nid: _nid, nidPhotoFileId: _photo, ...rest } = masked.volunteer;
    detail = { ...masked, volunteer: rest };
    renderPage(HEAD, 'bn', REVIEW);
    await screen.findByRole('heading', { level: 1, name: 'নতুন স্বেচ্ছাসেবক (নমুনা)' });
    expect(screen.getAllByText('আপনার জন্য দেখানো হয় না').length).toBeGreaterThan(0);
  });

  it('shows the personal, profession and skills data (O-65), and hides the protected ones without the class', async () => {
    renderPage(RPM, 'bn', REVIEW);
    await screen.findByRole('heading', { level: 1, name: 'নতুন স্বেচ্ছাসেবক (নমুনা)' });
    for (const text of ['17-05-1990', 'O+', 'নিজ ইউনিয়ন', 'ছাত্র'])
      expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.getByText(/Sample School/)).toBeInTheDocument();
    // the education, the permanent address and the full-time answer are not protected
    expect(screen.getByText(/Sample College/)).toBeInTheDocument();
    expect(screen.getByText(/Old village/)).toBeInTheDocument();
    expect(screen.getByText(/জরুরি কাজে পূর্ণ সময়: হ্যাঁ/)).toBeInTheDocument();
    expect(screen.getByText(/মিডিয়া, ফটোগ্রাফি ও ভিডিওগ্রাফি/)).toBeInTheDocument();
  });

  it('shows that a masked blood group and date of birth are not visible', async () => {
    const masked = volunteerDetail();
    const {
      bloodGroup: _blood,
      dateOfBirth: _dob,
      nid: _nid,
      nidPhotoFileId: _photo,
      ...rest
    } = masked.volunteer;
    detail = { ...masked, volunteer: rest };
    renderPage(HEAD, 'bn', REVIEW);
    await screen.findByRole('heading', { level: 1, name: 'নতুন স্বেচ্ছাসেবক (নমুনা)' });
    // each protected row says it is not visible, none shows an empty value
    for (const label of ['NID নম্বর', 'জন্মতারিখ', 'রক্তের গ্রুপ']) {
      const row = screen.getByText(label).parentElement!;
      expect(within(row).getByText('আপনার জন্য দেখানো হয় না'), label).toBeInTheDocument();
    }
    expect(screen.queryByText('17-05-1990')).not.toBeInTheDocument();
    // the other new data stays
    expect(screen.getByText('নিজ ইউনিয়ন')).toBeInTheDocument();
  });

  it('shows the photo streamed by the API', async () => {
    const PHOTO = '01900000-0000-7000-8000-0000000000f1';
    const base = volunteerDetail();
    detail = { ...base, volunteer: { ...base.volunteer, photoFileId: PHOTO } };
    server.use(
      http.get(`*/api/v1/files/${PHOTO}/content`, () =>
        HttpResponse.arrayBuffer(new Uint8Array([137, 80, 78, 71]).buffer, {
          headers: { 'Content-Type': 'image/png' },
        }),
      ),
    );
    const user = userEvent.setup();
    renderPage(RPM, 'bn', REVIEW);
    await screen.findByRole('heading', { level: 1, name: 'নতুন স্বেচ্ছাসেবক (নমুনা)' });
    // the documents beside the header open larger in a dialog
    await user.click(await screen.findByRole('button', { name: 'ছবি বড় করে দেখুন' }));
    const img = await within(await screen.findByRole('dialog')).findByRole('img', { name: 'ছবি' });
    expect(img.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
  });

  it('a correction request names the checked fields and a note', async () => {
    const user = userEvent.setup();
    renderPage(RPM, 'bn', REVIEW);
    await screen.findByRole('heading', { level: 1, name: 'নতুন স্বেচ্ছাসেবক (নমুনা)' });
    await user.click(screen.getByRole('button', { name: 'সংশোধনের অনুরোধ' }));
    const dialog = await screen.findByRole('dialog', { name: 'সংশোধনের অনুরোধ' });
    const send = within(dialog).getByRole('button', { name: 'পাঠান' });
    expect(send).toBeDisabled();
    await user.click(within(dialog).getByRole('checkbox', { name: 'পিতার নাম' }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'আগের শিক্ষাগত যোগ্যতা' }));
    await user.type(
      within(dialog).getByRole('textbox', { name: /কী ঠিক করতে হবে/ }),
      'পিতার নাম NID-এর মতো লিখুন',
    );
    await user.click(send);
    expect(await screen.findByText('সংশোধনের অনুরোধ পাঠানো হয়েছে')).toBeInTheDocument();
    expect(calls).toEqual([
      {
        method: 'POST',
        url: `/api/v1/registrations/${VOLUNTEER_USER}/correction-requests`,
        body: { fields: ['fatherName', 'education'], note: 'পিতার নাম NID-এর মতো লিখুন' },
      },
    ]);
    expect(await screen.findByText('সংশোধন চলছে')).toBeInTheDocument();
  }, 15_000);

  it('a rejection needs a reason', async () => {
    const user = userEvent.setup();
    renderPage(RPM, 'bn', REVIEW);
    await screen.findByRole('heading', { level: 1, name: 'নতুন স্বেচ্ছাসেবক (নমুনা)' });
    await user.click(screen.getByRole('button', { name: 'প্রত্যাখ্যান' }));
    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'প্রত্যাখ্যান করুন' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), 'তথ্য মেলে না');
    await user.click(confirm);
    expect(await screen.findByText('নিবন্ধন প্রত্যাখ্যান করা হয়েছে')).toBeInTheDocument();
    expect(calls[0]).toEqual({
      method: 'POST',
      url: `/api/v1/registrations/${VOLUNTEER_USER}/reject`,
      body: { reason: 'তথ্য মেলে না' },
    });
  });

  it('the blocklist action needs a reason; then approval waits for the lift', async () => {
    const user = userEvent.setup();
    renderPage(RPM, 'bn', REVIEW);
    await screen.findByRole('heading', { level: 1, name: 'নতুন স্বেচ্ছাসেবক (নমুনা)' });
    await user.click(screen.getByRole('button', { name: 'ব্লকলিস্টে দিন' }));
    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'ব্লক করুন' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), 'ভুয়া পরিচয়');
    await user.click(confirm);
    expect(await screen.findByText('স্বেচ্ছাসেবককে ব্লকলিস্টে দেওয়া হয়েছে')).toBeInTheDocument();
    expect(calls).toEqual([
      {
        method: 'POST',
        url: `/api/v1/volunteers/${VOLUNTEER_ID}/block`,
        body: { reason: 'ভুয়া পরিচয়' },
      },
    ]);
    expect(
      await screen.findByText('এই স্বেচ্ছাসেবক ব্লকলিস্টে আছেন। অনুমোদনের আগে ব্লক তুলুন।'),
    ).toBeInTheDocument();
    // the page is hidden from assistive technology until the dialog has faded out
    expect(await screen.findByRole('button', { name: 'অনুমোদন' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'ব্লক তুলুন' })).toBeInTheDocument();
  });

  it('a Project Executive has no blocklist action', async () => {
    profileBlock = false;
    renderPage({ ...RPM, roles: ['project_executive'] }, 'bn', REVIEW);
    await screen.findByRole('heading', { level: 1, name: 'নতুন স্বেচ্ছাসেবক (নমুনা)' });
    expect(screen.getByRole('button', { name: 'অনুমোদন' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ব্লকলিস্টে দিন' })).not.toBeInTheDocument();
  });

  it('keeps the profile when the registration cannot be read, with the error and a retry', async () => {
    let reads = 0;
    server.use(
      http.get('*/api/v1/registrations/:userId', () => {
        reads += 1;
        return HttpResponse.json(
          { error: { code: 'server.error', message: 'Failed.', requestId: 'req_x' } },
          { status: 500 },
        );
      }),
    );
    const user = userEvent.setup();
    renderPage(RPM, 'bn', REVIEW);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'নতুন স্বেচ্ছাসেবক (নমুনা)' }),
    ).toBeInTheDocument();
    // no decision without the registration, but the block stays
    expect(screen.queryByRole('button', { name: 'অনুমোদন' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ব্লকলিস্টে দিন' })).toBeInTheDocument();
    const before = reads;
    await user.click(screen.getByRole('button', { name: 'আবার চেষ্টা করুন' }));
    await waitFor(() => expect(reads).toBeGreaterThan(before));
  });

  it('a registration no longer pending shows the not-found message', async () => {
    server.use(
      http.get('*/api/v1/registrations/:userId', () =>
        HttpResponse.json(
          { error: { code: 'permission.not_found', message: 'Not found.', requestId: 'r' } },
          { status: 404 },
        ),
      ),
    );
    renderPage(RPM, 'bn', `/admin/registrations/${VOLUNTEER_USER}`);
    expect(
      await screen.findByText('এই নিবন্ধন আর অপেক্ষায় নেই, অথবা আপনার এলাকার বাইরে।'),
    ).toBeInTheDocument();
  });
});

describe('staff registration decision', () => {
  it('needs a role before approving', async () => {
    const user = userEvent.setup();
    renderPage(HEAD);
    await openRow(user, 'নতুন কর্মকর্তা (নমুনা)');
    expect(screen.getByText('Project Executive')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'সিদ্ধান্ত দিন' }));
    const dialog = await screen.findByRole('dialog');
    const save = within(dialog).getByRole('button', { name: 'সিদ্ধান্ত সংরক্ষণ করুন' });
    expect(save).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: /রোল/ }));
    const list = await screen.findByRole('listbox');
    // the Main Admin's role and volunteer roles are not offered
    expect(
      within(list).queryByRole('option', { name: 'ডিপার্টমেন্ট হেড' }),
    ).not.toBeInTheDocument();
    expect(
      within(list).queryByRole('option', { name: 'সাধারণ স্বেচ্ছাসেবক' }),
    ).not.toBeInTheDocument();
    await user.click(within(list).getByRole('option', { name: 'প্রজেক্ট এক্সিকিউটিভ' }));
    await user.click(save);
    expect(await screen.findByText('কর্মকর্তার নিবন্ধন অনুমোদিত হয়েছে')).toBeInTheDocument();
    expect(calls).toEqual([
      {
        method: 'POST',
        url: `/api/v1/staff-registrations/${STAFF_USER}/decision`,
        body: { decision: 'approve', roleKey: 'project_executive' },
      },
    ]);
  });
});

describe('edit requests', () => {
  it('shows who asked for which value; approving applies it', async () => {
    const user = userEvent.setup();
    renderPage(RPM);
    const table = await screen.findByRole('grid', { name: 'পরিবর্তনের অনুরোধ' });
    const row = within(table)
      .getByText('অনুমোদিত স্বেচ্ছাসেবক (নমুনা)')
      .closest<HTMLElement>('[role="row"]')!;
    expect(within(row).getByText('আগের শিক্ষাগত যোগ্যতা')).toBeInTheDocument();
    expect(within(row).getByText('স্নাতক')).toBeInTheDocument();
    expect(within(row).getByText('নতুন সনদ')).toBeInTheDocument();
    await user.click(
      within(row).getByRole('button', {
        name: 'অনুমোদিত স্বেচ্ছাসেবক (নমুনা)-এর আগের শিক্ষাগত যোগ্যতা অনুমোদন',
      }),
    );
    expect(await screen.findByText('নতুন মান প্রয়োগ হয়েছে')).toBeInTheDocument();
    expect(calls).toEqual([
      {
        method: 'POST',
        url: `/api/v1/edit-requests/${EDIT_ID}/decision`,
        body: { decision: 'approve' },
      },
    ]);
    expect(await screen.findByText('কোনো পরিবর্তনের অনুরোধ অপেক্ষায় নেই।')).toBeInTheDocument();
  });

  it('shows the profession, the skills, the education and the permanent address as labelled text, with "No" kept', async () => {
    const base = {
      volunteerId: VOLUNTEER_ID,
      kind: 'profile_edit',
      status: 'submitted',
      note: null,
    };
    edits = [
      {
        ...base,
        id: '01900000-0000-7000-8000-0000000000e1',
        field: 'profession',
        newValue: { profession: 'imam', details: { mosqueName: 'Central Mosque', role: 'khatib' } },
      },
      {
        ...base,
        id: '01900000-0000-7000-8000-0000000000e2',
        field: 'skills',
        newValue: {
          interestAreas: ['first_aid'],
          vehicle: 'bicycle',
          canSwim: false,
          emergencyFullTime: false,
        },
      },
      {
        ...base,
        id: '01900000-0000-7000-8000-0000000000e3',
        field: 'educationDetails',
        newValue: {
          highestQualification: 'masters',
          institutionName: 'Sample University',
          passingYear: 2016,
        },
      },
      {
        ...base,
        id: '01900000-0000-7000-8000-0000000000e4',
        field: 'permanentAddress',
        newValue: { addressLine: 'New village' },
      },
    ];
    renderPage(RPM);
    const table = await screen.findByRole('grid', { name: 'পরিবর্তনের অনুরোধ' });
    expect(within(table).getByText('ইমাম / মুয়াজ্জিন')).toBeInTheDocument();
    expect(within(table).getByText(/Central Mosque/)).toBeInTheDocument();
    expect(within(table).getByText(/খতিব/)).toBeInTheDocument();
    expect(within(table).getByText(/সাঁতার: না/)).toBeInTheDocument();
    expect(within(table).getByText(/বাহন: সাইকেল/)).toBeInTheDocument();
    expect(within(table).getByText(/জরুরি কাজে পূর্ণ সময়: না/)).toBeInTheDocument();
    expect(within(table).getByText(/Sample University/)).toBeInTheDocument();
    expect(within(table).getByText(/New village/)).toBeInTheDocument();
    expect(table.textContent).not.toContain('[object Object]');
  });

  it('a refusal needs a reason', async () => {
    const user = userEvent.setup();
    renderPage(RPM);
    const table = await screen.findByRole('grid', { name: 'পরিবর্তনের অনুরোধ' });
    await user.click(
      within(table).getByRole('button', {
        name: 'অনুমোদিত স্বেচ্ছাসেবক (নমুনা)-এর আগের শিক্ষাগত যোগ্যতা নাকচ',
      }),
    );
    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'নাকচ করুন' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), 'সনদ দেখান');
    await user.click(confirm);
    expect(await screen.findByText('অনুরোধ নাকচ করা হয়েছে')).toBeInTheDocument();
    expect(calls[0]!.body).toEqual({ decision: 'reject', reason: 'সনদ দেখান' });
  });
});
