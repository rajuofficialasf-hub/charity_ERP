import { expectNoAxeViolations } from '@/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../lib/api';
import type { ChangeRequest, OwnProfile } from './profile-api';
import { ProfileView } from './ProfileView';

// The own profile, correction answers and edit requests (docs/BUSINESS_RULES.md, the corrections
// of a registration and the edit requests of an approved volunteer).
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
  bloodGroup: null,
  dateOfBirth: null,
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
    expect(screen.getByText('আমার অ্যাকাউন্ট')).toBeInTheDocument();
    // the page title stays the one level-1 heading; the person heads the banner below it
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(await screen.findByRole('heading', { name: 'সংশোধনের অনুরোধ' })).toBeInTheDocument();
    // the own NID and bank details in full
    expect(screen.getByText('1000000000301')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'ব্যাংকের তথ্য' }));
    expect(screen.getByText(/0000111122223333, Savar Branch/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'ব্যক্তিগত তথ্য' }));
    // only the two requested fields can be answered
    expect(screen.getAllByRole('form')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'আবার জমা দিন' })).not.toBeInTheDocument();
    // before approval nothing else can be changed
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
    // the banner names the person under the page title, with the state and the type
    expect(
      await screen.findByRole('heading', { level: 2, name: 'নমুনা স্বেচ্ছাসেবক' }),
    ).toBeInTheDocument();
    expect(screen.getByText('General volunteer')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Profile sections' });
    expect(
      within(nav)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([
      'Personal details',
      'Contact',
      'Address',
      'Education',
      'Work details',
      'Skills and time',
      'Bank details',
      'Photos',
    ]);
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
    await openSection(user, 'Education');
    expect(await screen.findByText('Waiting for approval')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit Education' }));
    const form = screen.getByRole('form', { name: 'Request to change Education' });
    expect(within(form).getByRole('checkbox', { name: 'Change Education' })).toBeInTheDocument();
    expect(
      within(form).queryByRole('checkbox', { name: 'Change Education (earlier)' }),
    ).not.toBeInTheDocument();
    expect(within(form).getByText('Waiting for approval')).toBeInTheDocument();
    expect(within(form).getByRole('button', { name: 'Send request' })).toBeDisabled();
    await user.click(within(form).getByRole('button', { name: 'Cancel' }));
    // the type decides the role: no tick for it
    const work = await startEdit(user, 'Work details');
    expect(
      within(work).queryByRole('checkbox', { name: /Volunteer type/ }),
    ).not.toBeInTheDocument();
    expect(within(work).getByRole('checkbox', { name: 'Change Profession' })).toBeInTheDocument();
  }, 30_000);

  it('a request that reaches no server says so and keeps the ticks', async () => {
    const user = userEvent.setup();
    serve(profile({ state: 'active', inAnyProject: true }), () => []);
    server.use(http.post('*/api/v1/me/change-requests', () => HttpResponse.error()));
    renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    await screen.findByRole('navigation', { name: 'Profile sections' });
    await openSection(user, 'Education');
    await user.click(await screen.findByRole('button', { name: 'Edit Education' }));
    const form = screen.getByRole('form', { name: 'Request to change Education' });
    await user.click(within(form).getByRole('checkbox', { name: 'Change Education (earlier)' }));
    await user.type(within(form).getByRole('textbox', { name: /^Education \(earlier\)/ }), 'BA');
    await user.click(within(form).getByRole('button', { name: 'Send request' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent(/\S/);
    expect(
      within(form).getByRole('checkbox', { name: 'Change Education (earlier)' }),
    ).toBeChecked();
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

describe('the personal, profession, education and skills data in the profile', () => {
  const FULL = {
    state: 'active' as const,
    inAnyProject: true,
    dateOfBirth: '1990-05-17',
    bloodGroup: 'O+',
    tshirtSize: 'L',
    volunteeringArea: 'own_upazila',
    profession: 'teacher',
    professionDetails: { institutionType: 'madrasa', designation: 'Mudarris' },
    interestAreas: ['field_relief', 'first_aid'],
    vehicle: 'motorcycle',
    canSwim: true,
    availability: 'on_call',
    emergencyFullTime: true,
    educationDetails: {
      highestQualification: 'hsc',
      institutionName: 'Old College',
      passingYear: 2012,
      status: 'completed',
    },
    permanentAddress: {
      divisionId: DIVISION,
      districtId: DISTRICT,
      upazilaId: UPAZILA,
      unionId: UNION,
      addressLine: 'Old village',
    },
    facebookId: 'https://www.facebook.com/nomuna.name',
    experience: null,
    workDescription: null,
  };
  beforeEach(() =>
    refreshAs({ ...ME, kind: 'volunteer', state: 'active', roles: ['volunteer_general'] }),
  );

  it('shows each new value in its section, the date in English digits', async () => {
    const user = userEvent.setup();
    serve(profile(FULL), () => []);
    renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    await screen.findByRole('navigation', { name: 'Profile sections' });
    for (const text of ['17-05-1990', 'O+', 'L'])
      expect(screen.getByText(text)).toBeInTheDocument();
    // the Facebook account is a link only when it passes the shared check
    const link = screen.getByRole('link', { name: 'https://www.facebook.com/nomuna.name' });
    expect(link).toHaveAttribute('href', 'https://www.facebook.com/nomuna.name');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    expect(link).toHaveAttribute('target', '_blank');
    await openSection(user, 'Address');
    expect(screen.getByText('My own upazila')).toBeInTheDocument();
    expect(await screen.findByText(/Old village, .*Place/)).toBeInTheDocument();
    await openSection(user, 'Education');
    const education = screen.getByRole('region', { name: 'Education' });
    expect(within(education).getByText('Highest qualification: HSC')).toBeInTheDocument();
    expect(within(education).getByText('Institution name: Old College')).toBeInTheDocument();
    expect(within(education).getByText('Passing year: 2012')).toBeInTheDocument();
    expect(within(education).getByText('Status: Completed')).toBeInTheDocument();
    await openSection(user, 'Work details');
    const work = screen.getByRole('region', { name: 'Work details' });
    expect(within(work).getByText('Teacher')).toBeInTheDocument();
    expect(within(work).getByText('Institution type: Madrasa')).toBeInTheDocument();
    expect(within(work).getByText('Designation: Mudarris')).toBeInTheDocument();
    await openSection(user, 'Skills and time');
    const skills = screen.getByRole('region', { name: 'Skills and time' });
    expect(
      within(skills).getByText(
        'Areas of interest: Field relief and aid distribution, First aid and rescue',
      ),
    ).toBeInTheDocument();
    expect(within(skills).getByText('Vehicle: Motorcycle')).toBeInTheDocument();
    expect(within(skills).getByText('Swimming: Yes')).toBeInTheDocument();
    expect(within(skills).getByText('Full time in an emergency: Yes')).toBeInTheDocument();
    expect(within(skills).getByText('Availability: On an emergency call')).toBeInTheDocument();
  }, 20_000);

  it('an older plain Facebook id is text, never a link', async () => {
    serve(profile({ ...FULL, facebookId: 'nomuna.name' }), () => []);
    renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    expect(await screen.findByText('nomuna.name')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'nomuna.name' })).not.toBeInTheDocument();
  }, 15_000);

  it('an unsafe Facebook value is shown as text, never as a link', async () => {
    serve(profile({ ...FULL, facebookId: 'javascript:alert(1)' }), () => []);
    renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    expect(await screen.findByText('javascript:alert(1)')).toBeInTheDocument();
    expect(document.querySelector('a[href^="javascript"]')).toBeNull();
  }, 15_000);

  it('shows the earlier experience and work description only for a volunteer who has them', async () => {
    const user = userEvent.setup();
    serve(profile({ ...FULL, experience: 'Ten years in a bank' }), () => []);
    renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    await screen.findByRole('navigation', { name: 'Profile sections' });
    await openSection(user, 'Work details');
    expect(screen.getByText('Ten years in a bank')).toBeInTheDocument();
    expect(screen.queryByText('What work you do')).not.toBeInTheDocument();
  }, 15_000);

  it('asks the profession as one request with the new details, starting from the current ones', async () => {
    const user = userEvent.setup();
    serve(profile(FULL), () => []);
    renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    const form = await startEdit(user, 'Work details');
    await user.click(within(form).getByRole('checkbox', { name: 'Change Profession' }));
    // it starts with what the volunteer has
    expect(within(form).getByRole('textbox', { name: /^Designation/ })).toHaveValue('Mudarris');
    await user.click(within(form).getByRole('combobox', { name: /current profession/ }));
    await user.click(await screen.findByRole('option', { name: 'Imam or muazzin' }));
    // the old profession's details are gone
    expect(within(form).queryByRole('textbox', { name: /^Designation/ })).not.toBeInTheDocument();
    await user.type(within(form).getByRole('textbox', { name: /Mosque name/ }), 'Central Mosque');
    await user.click(within(form).getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText('The request was sent.')).toBeInTheDocument();
    expect(calls).toEqual([
      {
        method: 'POST',
        url: '/api/v1/me/change-requests',
        body: {
          field: 'profession',
          newValue: { profession: 'imam', details: { mosqueName: 'Central Mosque' } },
        },
      },
    ]);
  }, 30_000);

  it('asks the skills, the education and the permanent address as groups, and a choice as a single value', async () => {
    const user = userEvent.setup();
    serve(profile(FULL), () => []);
    renderApp(<ProfileView />, 'en', { path: '/account/profile' });

    const skills = await startEdit(user, 'Skills and time');
    await user.click(within(skills).getByRole('checkbox', { name: 'Change Skills and time' }));
    // the current answers are there; one is changed
    expect(within(skills).getByRole('checkbox', { name: 'First aid and rescue' })).toBeChecked();
    await user.click(within(skills).getByRole('checkbox', { name: 'First aid and rescue' }));
    await user.click(within(skills).getByRole('radio', { name: 'Bicycle' }));
    await user.click(within(skills).getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText('The request was sent.')).toBeInTheDocument();

    const education = await startEdit(user, 'Education');
    await user.click(within(education).getByRole('checkbox', { name: 'Change Education' }));
    // it starts with the current education
    const institution = within(education).getByRole('textbox', { name: /Institution name/ });
    expect(institution).toHaveValue('Old College');
    await user.clear(institution);
    await user.type(institution, 'New College');
    await user.click(within(education).getByRole('button', { name: 'Send request' }));
    await vi.waitFor(() => expect(calls).toHaveLength(2));

    const address = await startEdit(user, 'Address');
    await user.click(within(address).getByRole('checkbox', { name: 'Change Permanent address' }));
    const line = within(address).getByRole('textbox', {
      name: /Village, road or house \(permanent\)/,
    });
    expect(line).toHaveValue('Old village');
    await user.clear(line);
    await user.type(line, 'New village');
    await user.click(within(address).getByRole('button', { name: 'Send request' }));
    await vi.waitFor(() => expect(calls).toHaveLength(3));

    const personal = await startEdit(user, 'Personal details');
    await user.click(within(personal).getByRole('checkbox', { name: 'Change Blood group' }));
    await user.click(within(personal).getByRole('combobox', { name: /Blood group/ }));
    await user.click(await screen.findByRole('option', { name: 'AB-' }));
    await user.click(within(personal).getByRole('button', { name: 'Send request' }));
    await vi.waitFor(() => expect(calls).toHaveLength(4));

    expect(calls.map((c) => c.body)).toEqual([
      {
        field: 'skills',
        newValue: {
          interestAreas: ['field_relief'],
          vehicle: 'bicycle',
          canSwim: true,
          availability: 'on_call',
          emergencyFullTime: true,
        },
      },
      {
        field: 'educationDetails',
        newValue: {
          highestQualification: 'hsc',
          institutionName: 'New College',
          passingYear: 2012,
          status: 'completed',
        },
      },
      {
        field: 'permanentAddress',
        newValue: {
          divisionId: DIVISION,
          districtId: DISTRICT,
          upazilaId: UPAZILA,
          unionId: UNION,
          addressLine: 'New village',
        },
      },
      { field: 'bloodGroup', newValue: 'AB-' },
    ]);
  }, 90_000);

  it('asks before another section opens while a detail is ticked, and not for an untouched edit mode', async () => {
    const user = userEvent.setup();
    serve(profile(FULL), () => []);
    renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    // nothing ticked: the section changes without a question
    await startEdit(user, 'Address');
    await openSection(user, 'Skills and time');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Skills and time' })).toBeInTheDocument();

    // a ticked detail: the question, "Cancel" stays with the tick, the other button leaves
    const address = await startEdit(user, 'Address');
    await user.click(within(address).getByRole('checkbox', { name: 'Change Address' }));
    // the open section itself: nothing asked, nothing dropped
    await openSection(user, 'Address');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(within(address).getByRole('checkbox', { name: 'Change Address' })).toBeChecked();
    await openSection(user, 'Education');
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Leave without sending?')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { level: 2, name: 'Address' })).toBeInTheDocument();
    expect(within(address).getByRole('checkbox', { name: 'Change Address' })).toBeChecked();

    await openSection(user, 'Education');
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Leave this section',
      }),
    );
    expect(await screen.findByRole('heading', { level: 2, name: 'Education' })).toBeInTheDocument();
    expect(
      screen.queryByRole('form', { name: 'Request to change Address' }),
    ).not.toBeInTheDocument();
  }, 30_000);

  it('a permanent address without its four levels is not sent', async () => {
    const user = userEvent.setup();
    serve(profile({ ...FULL, permanentAddress: null }), () => []);
    renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    const address = await startEdit(user, 'Address');
    await user.click(within(address).getByRole('checkbox', { name: 'Change Permanent address' }));
    await user.type(
      within(address).getByRole('textbox', { name: /Village, road or house \(permanent\)/ }),
      'Somewhere',
    );
    await user.click(within(address).getByRole('button', { name: 'Send request' }));
    expect(await within(address).findByText('Fill in this field.')).toBeInTheDocument();
    expect(calls).toEqual([]);
  }, 30_000);
});

describe('the single new values of the profile edit', () => {
  beforeEach(() =>
    refreshAs({ ...ME, kind: 'volunteer', state: 'active', roles: ['volunteer_general'] }),
  );

  it('sends the volunteering area and the T-shirt size as single values', async () => {
    const user = userEvent.setup();
    serve(profile({ state: 'active', inAnyProject: true }), () => []);
    renderApp(<ProfileView />, 'en', { path: '/account/profile' });

    const address = await startEdit(user, 'Address');
    await user.click(
      within(address).getByRole('checkbox', { name: 'Change Where you want to serve' }),
    );
    await user.click(within(address).getByRole('combobox', { name: /Where you want to serve/ }));
    await user.click(await screen.findByRole('option', { name: 'Anywhere in the country' }));
    await user.click(within(address).getByRole('button', { name: 'Send request' }));
    await vi.waitFor(() => expect(calls).toHaveLength(1));

    const personal = await startEdit(user, 'Personal details');
    await user.click(within(personal).getByRole('checkbox', { name: 'Change T-shirt size' }));
    await user.click(within(personal).getByRole('combobox', { name: /T-shirt size/ }));
    await user.click(await screen.findByRole('option', { name: 'XL' }));
    await user.click(within(personal).getByRole('button', { name: 'Send request' }));
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls.map((c) => c.body)).toEqual([
      { field: 'volunteeringArea', newValue: 'anywhere' },
      { field: 'tshirtSize', newValue: 'XL' },
    ]);
  }, 60_000);

  it('offers the date of birth with a date field that starts empty', async () => {
    const user = userEvent.setup();
    serve(profile({ state: 'active', inAnyProject: true }), () => []);
    renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    const personal = await startEdit(user, 'Personal details');
    await user.click(within(personal).getByRole('checkbox', { name: 'Change Date of birth' }));
    expect(within(personal).getByRole('group', { name: /Date of birth/ })).toBeInTheDocument();
    // nothing is sent until a date is given and the request is sent
    expect(calls).toEqual([]);
  }, 30_000);
});

describe('ProfileView states', () => {
  it("an official gets the official's profile and never asks for a volunteer's", async () => {
    refreshAs({ ...ME, kind: 'staff', state: 'active' });
    const volunteerRead = vi.fn();
    server.use(
      http.get('*/api/v1/volunteers/me', () => {
        volunteerRead();
        return HttpResponse.json({ data: profile() });
      }),
      http.get('*/api/v1/me/profile', () =>
        HttpResponse.json(
          { error: { code: 'permission.not_found', message: 'Not found.', requestId: 'r' } },
          { status: 404 },
        ),
      ),
    );
    renderApp(<ProfileView />, 'en', { path: '/account/profile' });
    expect(await screen.findByText('This page is for an official’s profile.')).toBeInTheDocument();
    expect(volunteerRead).not.toHaveBeenCalled();
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
