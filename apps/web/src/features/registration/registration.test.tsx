import { expectNoAxeViolations } from '@/ui/testing';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../api/client';
import { RegisterPage } from './RegisterPage';

// The screen "Registration with two OTP steps" of docs/ui/SCREENS.md (AUTH.md 2). Test data only.
const DRAFT = '01900000-0000-7000-8000-0000000000aa';
const TOKEN = 'draft-token-0123456789abcdef0123456789abcdef';
const DHAKA = '01900000-0000-7000-8000-0000000000d1';
const DHAKA_DISTRICT = '01900000-0000-7000-8000-0000000000d2';
const RANGPUR = '01900000-0000-7000-8000-0000000000e1';
const RANGPUR_DISTRICT = '01900000-0000-7000-8000-0000000000e2';
const UPAZILA = '01900000-0000-7000-8000-0000000000e3';
const UNION = '01900000-0000-7000-8000-0000000000e4';

const location = (id: string, bn: string, en: string) => ({
  id,
  parentId: null,
  level: 'division',
  code: id.slice(-2),
  name: { bn, en },
  active: true,
});

const apiError = (status: number, code: string, message: string, details: object[] = []) =>
  HttpResponse.json(
    { error: { code, messageKey: `errors.${code}`, message, details, requestId: 'req_test' } },
    { status },
  );

/** Requests the page sent: path, headers and body. */
let seen: { path: string; url: string; headers: Headers; body: unknown }[] = [];
const paths = () => seen.map((s) => s.path);
const bodiesOf = (path: string) => seen.filter((s) => s.path === path).map((s) => s.body);

async function record(request: Request, body?: unknown) {
  seen.push({
    path: new URL(request.url).pathname.replace('/api/v1', ''),
    url: request.url,
    headers: request.headers,
    body: body ?? (await request.json().catch(() => null)),
  });
}

function api(
  over: {
    verify?: (body: { channel: string; code: string }) => Response | undefined;
    submit?: (body: unknown) => Response | undefined;
    kind?: 'volunteer' | 'staff';
  } = {},
) {
  server.use(
    http.post('*/api/v1/auth/register/start', async ({ request }) => {
      await record(request);
      return HttpResponse.json({ data: { registrationId: DRAFT } }, { status: 201 });
    }),
    http.post('*/api/v1/auth/register/otp/send', async ({ request }) => {
      await record(request);
      return new HttpResponse(null, { status: 204 });
    }),
    http.post('*/api/v1/auth/register/otp/verify', async ({ request }) => {
      const body = (await request.json()) as { channel: string; code: string };
      await record(request, body);
      const answer = over.verify?.(body);
      if (answer) return answer;
      return body.channel === 'sms'
        ? HttpResponse.json({ data: { verified: ['sms'] } })
        : HttpResponse.json({
            data: {
              verified: ['sms', 'email'],
              registrationToken: TOKEN,
              expiresAt: '2026-10-14T10:00:00Z',
              kind: over.kind ?? 'volunteer',
            },
          });
    }),
    http.get('*/api/v1/locations', ({ request }) => {
      const parent = new URL(request.url).searchParams.get('parentId');
      const data =
        parent === DHAKA
          ? [location(DHAKA_DISTRICT, 'ঢাকা জেলা', 'Dhaka district')]
          : parent === RANGPUR
            ? [location(RANGPUR_DISTRICT, 'রংপুর জেলা', 'Rangpur district')]
            : parent === RANGPUR_DISTRICT
              ? [location(UPAZILA, 'পীরগঞ্জ', 'Pirganj')]
              : parent === UPAZILA
                ? [location(UNION, 'চতরা', 'Chatra')]
                : [location(DHAKA, 'ঢাকা', 'Dhaka'), location(RANGPUR, 'রংপুর', 'Rangpur')];
      return HttpResponse.json({ data });
    }),
    http.post('*/api/v1/auth/register/photos/:slot', async ({ request, params }) => {
      await record(request, params.slot);
      return HttpResponse.json(
        { data: { fileId: `01900000-0000-7000-8000-0000000${String(params.slot).length}0b01` } },
        { status: 201 },
      );
    }),
    http.post('*/api/v1/auth/register/submit', async ({ request }) => {
      const body = await request.json();
      await record(request, body);
      return (
        over.submit?.(body) ??
        HttpResponse.json(
          {
            data: {
              id: '01900000-0000-7000-8000-0000000000c1',
              displayName: 'নতুন',
              kind: over.kind ?? 'volunteer',
              state: 'pending',
              roles: [],
              language: 'bn',
              permissionVersion: 1,
            },
          },
          { status: 201 },
        )
      );
    }),
  );
}

type User = ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  resetClientForTests();
  refreshAs(null);
  seen = [];
  // jsdom cannot make object URLs of test files; the preview is not under test here
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
  vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
});

const contactField = (name: RegExp) =>
  screen
    .getAllByTestId('register-contact')
    .find((el) => within(el).queryByRole('textbox', { name }))!;

/** Name, father's name and both contacts verified inside their fields. */
async function verifyContacts(user: User) {
  await user.type(screen.getByRole('textbox', { name: /^Name/ }), 'New Person');
  await user.type(screen.getByRole('textbox', { name: /Father's name/ }), 'Father');
  await user.type(screen.getByRole('textbox', { name: /Mobile number/ }), '01712345678');
  await user.click(within(contactField(/Mobile number/)).getByRole('button', { name: 'Verify' }));
  await user.type(
    await screen.findByRole('textbox', { name: /Code sent to your mobile/ }),
    '123456',
  );
  await within(contactField(/Mobile number/)).findByText('Verified');
  await user.type(screen.getByRole('textbox', { name: /^Email/ }), 'new.person@example.org');
  await user.click(within(contactField(/^Email/)).getByRole('button', { name: 'Verify' }));
  await user.type(
    await screen.findByRole('textbox', { name: /Code sent to your email/ }),
    '654321',
  );
  await within(contactField(/^Email/)).findByText('Verified');
}

const next = (user: User) => user.click(screen.getByRole('button', { name: 'Next step' }));
const stepName = () =>
  within(screen.getByRole('list', { name: 'Registration steps' }))
    .getAllByRole('listitem')
    .find((li) => li.getAttribute('aria-current') === 'step')!.textContent;

async function chooseAddress(user: User) {
  for (const [label, option] of [
    [/Division/, 'Rangpur'],
    [/(^|\s)District/, 'Rangpur district'],
    [/Upazila/, 'Pirganj'],
    [/Union/, 'Chatra'],
  ] as const) {
    await user.click(screen.getByRole('combobox', { name: label }));
    await user.click(await screen.findByRole('option', { name: option }));
  }
}

/** Picks the profession in its list (the first step of the profession fields). */
async function chooseProfession(user: User, name: string) {
  await user.click(screen.getByRole('combobox', { name: /current profession/ }));
  await user.click(await screen.findByRole('option', { name }));
}

/** The minimum of the steps after the contacts, up to the skills step. */
async function minimumToSkills(user: User) {
  await next(user);
  await user.type(screen.getByRole('textbox', { name: /Mother's name/ }), 'Mother');
  await user.type(screen.getByRole('textbox', { name: /NID number/ }), '1000000000555');
  await next(user);
  await chooseAddress(user);
  await next(user);
  // the education is optional
  await next(user);
  await chooseProfession(user, 'Student');
  await next(user);
}

const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'photo.png', { type: 'image/png' });

async function uploadAll(user: User, container: HTMLElement, count: number) {
  const inputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]');
  // each photo has a camera and a gallery input; the gallery one of each slot is used
  for (let i = 0; i < count; i += 1) await user.upload(inputs[i * 2 + 1]!, png());
  await vi.waitFor(() =>
    expect(seen.filter((s) => s.path.startsWith('/auth/register/photos/'))).toHaveLength(count),
  );
}

describe('the contact step', () => {
  it('verifies each contact inside its field; the next step opens only after both', async () => {
    const user = userEvent.setup();
    api();
    const { container } = renderApp(<RegisterPage />, 'en', { path: '/register' });
    expect(
      screen.getByRole('heading', { level: 1, name: 'Volunteer registration' }),
    ).toBeInTheDocument();
    expect(stepName()).toBe('1Contact');
    expect(screen.getByText('Verify your identity')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next step' })).toBeDisabled();
    // the button waits for a valid number
    const mobileVerify = within(contactField(/Mobile number/)).getByRole('button', {
      name: 'Verify',
    });
    expect(mobileVerify).toBeDisabled();
    await verifyContacts(user);
    expect(paths()).toEqual([
      '/auth/register/start',
      '/auth/register/otp/send',
      '/auth/register/otp/verify',
      '/auth/register/otp/send',
      '/auth/register/otp/verify',
    ]);
    expect(bodiesOf('/auth/register/start')).toEqual([{ kind: 'volunteer' }]);
    expect(bodiesOf('/auth/register/otp/send')).toEqual([
      { registrationId: DRAFT, channel: 'sms', address: '01712345678' },
      { registrationId: DRAFT, channel: 'email', address: 'new.person@example.org' },
    ]);
    expect(bodiesOf('/auth/register/otp/verify')).toEqual([
      { registrationId: DRAFT, channel: 'sms', code: '123456' },
      { registrationId: DRAFT, channel: 'email', code: '654321' },
    ]);
    // verified fields are locked and the notice is gone
    expect(screen.getByRole('textbox', { name: /Mobile number/ })).toHaveAttribute('readonly');
    expect(screen.queryByText('Verify your identity')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next step' })).toBeEnabled();
    await expectNoAxeViolations(container);
  }, 20_000);

  it('"Change" opens a verified field again; a refused code shows under its field', async () => {
    const user = userEvent.setup();
    api({
      verify: (b) =>
        b.code === '000000'
          ? apiError(422, 'otp.invalid', 'The code is not correct.', [
              { path: 'code', code: 'otp.invalid', message: 'The code is not correct.' },
            ])
          : undefined,
    });
    renderApp(<RegisterPage />, 'en', { path: '/register' });
    await user.type(screen.getByRole('textbox', { name: /Mobile number/ }), '01712345678');
    await user.click(within(contactField(/Mobile number/)).getByRole('button', { name: 'Verify' }));
    const code = await screen.findByRole('textbox', { name: /Code sent to your mobile/ });
    await user.type(code, '000000');
    expect(
      await screen.findByRole('textbox', { name: /Code sent to your mobile/ }),
    ).toHaveAccessibleDescription(/The code is not correct/);
    await user.clear(screen.getByRole('textbox', { name: /Code sent to your mobile/ }));
    await user.type(screen.getByRole('textbox', { name: /Code sent to your mobile/ }), '123456');
    await within(contactField(/Mobile number/)).findByText('Verified');
    await user.click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.getByRole('textbox', { name: /Mobile number/ })).not.toHaveAttribute('readonly');
    expect(
      within(contactField(/Mobile number/)).getByRole('button', { name: 'Verify' }),
    ).toBeInTheDocument();
  }, 15_000);

  it('once both are verified the contacts are fixed; a number typed again after its code needs a new one', async () => {
    const user = userEvent.setup();
    api();
    renderApp(<RegisterPage />, 'en', { path: '/register' });
    await user.type(screen.getByRole('textbox', { name: /Mobile number/ }), '01712345678');
    await user.click(within(contactField(/Mobile number/)).getByRole('button', { name: 'Verify' }));
    await screen.findByRole('textbox', { name: /Code sent to your mobile/ });
    // a corrected number: the code of the first one no longer counts
    await user.type(screen.getByRole('textbox', { name: /Mobile number/ }), '{Backspace}9');
    expect(
      screen.queryByRole('textbox', { name: /Code sent to your mobile/ }),
    ).not.toBeInTheDocument();
    expect(
      within(contactField(/Mobile number/)).getByRole('button', { name: 'Verify' }),
    ).toBeInTheDocument();
    await user.clear(screen.getByRole('textbox', { name: /Mobile number/ }));
    await verifyContacts(user);
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
  }, 20_000);

  it('reports an existing account only after both codes, with a way to log in', async () => {
    const user = userEvent.setup();
    api({
      verify: (b) =>
        b.channel === 'email'
          ? apiError(409, 'registration.account_exists', 'An account exists.')
          : undefined,
    });
    renderApp(<RegisterPage />, 'en', { path: '/register' });
    await user.type(screen.getByRole('textbox', { name: /Mobile number/ }), '01712345678');
    await user.click(within(contactField(/Mobile number/)).getByRole('button', { name: 'Verify' }));
    await user.type(
      await screen.findByRole('textbox', { name: /Code sent to your mobile/ }),
      '123456',
    );
    await within(contactField(/Mobile number/)).findByText('Verified');
    await user.type(screen.getByRole('textbox', { name: /^Email/ }), 'taken@example.org');
    await user.click(within(contactField(/^Email/)).getByRole('button', { name: 'Verify' }));
    await user.type(
      await screen.findByRole('textbox', { name: /Code sent to your email/ }),
      '123456',
    );
    expect(
      await screen.findByText('An account with this mobile number or email already exists.'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Log in' }).length).toBeGreaterThan(0);
    expect(screen.queryByText('Verified')).not.toBeInTheDocument();
  }, 15_000);

  it('has no accessibility violations in Bangla', async () => {
    api();
    const { container } = renderApp(<RegisterPage />, 'bn', { path: '/register' });
    expect(
      screen.getByRole('heading', { level: 1, name: 'স্বেচ্ছাসেবক নিবন্ধন' }),
    ).toBeInTheDocument();
    expect(screen.getByText('পরিচয় যাচাই করুন')).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});

describe('the steps after the contacts', () => {
  it('a volunteer goes through seven steps, back keeps the answers, the photos come last', async () => {
    const user = userEvent.setup();
    api();
    const { container } = renderApp(<RegisterPage />, 'en', { path: '/register' });
    await verifyContacts(user);
    await next(user);
    expect(stepName()).toBe('2Identity');
    // a step is checked before the next one opens
    await next(user);
    expect(screen.getByRole('textbox', { name: /NID number/ })).toHaveAccessibleDescription(
      /10, 13 or 17 digits/,
    );
    await user.type(screen.getByRole('textbox', { name: /Mother's name/ }), 'Mother');
    await user.type(screen.getByRole('textbox', { name: /NID number/ }), '1000000000555');
    // the Facebook account is a link
    await user.type(screen.getByRole('textbox', { name: /Facebook account link/ }), 'nomuna.name');
    await next(user);
    expect(
      screen.getByRole('textbox', { name: /Facebook account link/ }),
    ).toHaveAccessibleDescription(/https link to your Facebook account/);
    await user.clear(screen.getByRole('textbox', { name: /Facebook account link/ }));
    await user.type(
      screen.getByRole('textbox', { name: /Facebook account link/ }),
      'https://www.facebook.com/nomuna.name',
    );
    await next(user);
    expect(stepName()).toBe('3Address');
    await chooseAddress(user);
    // the present address is the permanent one until the box is cleared
    expect(
      screen.queryByRole('combobox', { name: /Division \(permanent\)/ }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('checkbox', { name: 'My present address is my permanent address' }),
    );
    for (const [label, option] of [
      [/Division \(permanent\)/, 'Rangpur'],
      [/District \(permanent\)/, 'Rangpur district'],
      [/Upazila \(permanent\)/, 'Pirganj'],
      [/Union \(permanent\)/, 'Chatra'],
    ] as const) {
      await user.click(screen.getByRole('combobox', { name: label }));
      await user.click(await screen.findByRole('option', { name: option }));
    }
    await user.type(
      screen.getByRole('textbox', { name: /Village, road or house \(permanent\)/ }),
      'Old village',
    );
    await user.click(screen.getByRole('combobox', { name: /Where you want to serve/ }));
    await user.click(await screen.findByRole('option', { name: 'My own upazila' }));
    await next(user);
    expect(stepName()).toBe('4Education');
    await user.click(screen.getByRole('combobox', { name: /Highest qualification/ }));
    await user.click(await screen.findByRole('option', { name: 'Masters' }));
    await user.type(screen.getByRole('textbox', { name: /Institution name/ }), 'Sample University');
    await user.type(screen.getByRole('textbox', { name: /Passing year/ }), '2016');
    await user.click(screen.getByRole('radio', { name: 'Completed' }));
    await next(user);
    expect(stepName()).toBe('5Profession');
    await user.click(screen.getByRole('button', { name: 'Previous step' }));
    expect(screen.getByRole('textbox', { name: /Institution name/ })).toHaveValue(
      'Sample University',
    );
    await next(user);
    // the profession step holds only the profession and its own fields
    expect(
      screen.queryByRole('textbox', { name: /Education|earlier projects|Facebook/ }),
    ).not.toBeInTheDocument();
    // the profession is mandatory
    await next(user);
    expect(
      screen.getByRole('combobox', { name: /current profession/ }),
    ).toHaveAccessibleDescription(/Fill in this field/);
    await chooseProfession(user, 'Teacher');
    await user.type(screen.getByRole('textbox', { name: /^Designation/ }), 'Lecturer');
    await next(user);
    expect(stepName()).toBe('6Skills and time');
    await user.click(screen.getByRole('checkbox', { name: 'First aid and rescue' }));
    await user.click(screen.getByRole('radio', { name: 'Motorcycle' }));
    await user.click(
      within(screen.getByRole('radiogroup', { name: /swim/ })).getByRole('radio', { name: 'Yes' }),
    );
    await user.click(
      within(screen.getByRole('radiogroup', { name: /full time/ })).getByRole('radio', {
        name: 'Yes',
      }),
    );
    // there is no emergency contact
    expect(screen.queryByRole('textbox', { name: /Guardian/ })).not.toBeInTheDocument();
    await next(user);
    expect(stepName()).toBe('7Account');
    await user.type(screen.getByLabelText(/^Password/), 'Nadi kul 2026');
    await user.type(screen.getByLabelText(/^Repeat the password/), 'Nadi kul 2026');
    await next(user);
    expect(stepName()).toBe('8Photos');
    for (const label of ['Own photo', 'NID card, first page', 'NID card, second page'])
      expect(screen.getByRole('group', { name: new RegExp(label) })).toBeInTheDocument();
    // no submit without the three photos
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(paths()).not.toContain('/auth/register/submit');
    await uploadAll(user, container, 3);
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Registration submitted' }),
    ).toBeInTheDocument();
    const submit = seen.find((s) => s.path === '/auth/register/submit')!;
    expect(submit.body).toMatchObject({
      kind: 'volunteer',
      registrationId: DRAFT,
      name: 'New Person',
      fatherName: 'Father',
      motherName: 'Mother',
      nid: '1000000000555',
      divisionId: RANGPUR,
      unionId: UNION,
      volunteeringArea: 'own_upazila',
      facebookId: 'https://www.facebook.com/nomuna.name',
      permanentAddress: {
        divisionId: RANGPUR,
        unionId: UNION,
        addressLine: 'Old village',
      },
      educationDetails: {
        highestQualification: 'masters',
        institutionName: 'Sample University',
        passingYear: 2016,
        status: 'completed',
      },
      profession: 'teacher',
      professionDetails: { designation: 'Lecturer' },
      interestAreas: ['first_aid'],
      vehicle: 'motorcycle',
      canSwim: true,
      emergencyFullTime: true,
    });
    // nothing the owner removed is sent: no type, no bank, no reference, no old work texts
    for (const removed of [
      'type',
      'bank',
      'referenceNid',
      'homeProgramId',
      'experience',
      'workDescription',
      'education',
      'previousProjects',
      'emergencyContact',
    ])
      expect(submit.body).not.toHaveProperty(removed);
    expect(submit.headers.get('X-Registration-Token')).toBe(TOKEN);
    expect(
      seen.filter((s) => s.path.startsWith('/auth/register/photos/')).map((s) => s.body),
    ).toEqual(['photo', 'nid_photo', 'nid_photo_back']);
    for (const request of seen) expect(request.url).not.toContain(TOKEN);
  }, 60_000);

  it('the profession shows its own fields; a new choice drops the old ones and sends only the new ones', async () => {
    const user = userEvent.setup();
    api();
    const { container } = renderApp(<RegisterPage />, 'en', { path: '/register' });
    await verifyContacts(user);
    await next(user);
    await user.type(screen.getByRole('textbox', { name: /Mother's name/ }), 'Mother');
    await user.type(screen.getByRole('textbox', { name: /NID number/ }), '1000000000555');
    await next(user);
    await chooseAddress(user);
    await next(user);
    await next(user);
    await chooseProfession(user, 'Teacher');
    const fields = () =>
      within(screen.getByTestId('profession-fields'))
        .getAllByRole('textbox')
        .map((el) => el.getAttribute('name'));
    expect(fields()).toEqual([
      'professionDetails.institutionNameAddress',
      'professionDetails.designation',
      'professionDetails.teachingSubject',
    ]);
    await user.type(screen.getByRole('textbox', { name: /^Designation/ }), 'Lecturer');
    await expectNoAxeViolations(container);
    // another profession: the teacher's fields are gone, the imam's are there and empty
    await chooseProfession(user, 'Imam or muazzin');
    expect(fields()).toEqual(['professionDetails.mosqueName', 'professionDetails.mosqueAddress']);
    expect(screen.queryByRole('textbox', { name: /^Designation/ })).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: /Mosque name/ }), 'Central Mosque');
    // and back: nothing of the first choice returns
    await chooseProfession(user, 'Teacher');
    expect(screen.getByRole('textbox', { name: /^Designation/ })).toHaveValue('');
    await chooseProfession(user, 'Imam or muazzin');
    await user.type(screen.getByRole('textbox', { name: /Mosque name/ }), 'Central Mosque');
    await next(user);
    await next(user);
    await user.type(screen.getByLabelText(/^Password/), 'Nadi kul 2026');
    await user.type(screen.getByLabelText(/^Repeat the password/), 'Nadi kul 2026');
    await next(user);
    await uploadAll(user, container, 3);
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await screen.findByRole('heading', { level: 1, name: 'Registration submitted' });
    const body = seen.find((s) => s.path === '/auth/register/submit')!.body;
    expect(body).toMatchObject({
      profession: 'imam',
      professionDetails: { mosqueName: 'Central Mosque' },
    });
    expect((body as { professionDetails: object }).professionDetails).toEqual({
      mosqueName: 'Central Mosque',
    });
  }, 60_000);

  it('a refused detail of the profession at submit goes back to the profession step', async () => {
    const user = userEvent.setup();
    api({
      submit: () =>
        apiError(422, 'validation.failed', 'Some information is not valid.', [
          {
            path: 'professionDetails',
            code: 'validation.option_unknown',
            message: 'Not in the list.',
          },
        ]),
    });
    const { container } = renderApp(<RegisterPage />, 'en', { path: '/register' });
    await verifyContacts(user);
    await minimumToSkills(user);
    await next(user);
    await user.type(screen.getByLabelText(/^Password/), 'Nadi kul 2026');
    await user.type(screen.getByLabelText(/^Repeat the password/), 'Nadi kul 2026');
    await next(user);
    await uploadAll(user, container, 3);
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await vi.waitFor(() => expect(stepName()).toBe('5Profession'));
  }, 60_000);

  it('offers no official registration: the admin creates officials', async () => {
    api();
    renderApp(<RegisterPage />, 'en', { path: '/register' });
    expect(
      await screen.findByText(/Officials do not register here: the admin creates the account/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Official' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Designation/ })).not.toBeInTheDocument();
  });

  it('a refused NID at submit goes back to its step and shows there', async () => {
    const user = userEvent.setup();
    api({
      submit: () =>
        apiError(422, 'validation.failed', 'Some information is not valid.', [
          { path: 'nid', code: 'validation.nid_format', message: 'The NID is not valid.' },
        ]),
    });
    const { container } = renderApp(<RegisterPage />, 'en', { path: '/register' });
    await verifyContacts(user);
    await minimumToSkills(user);
    await next(user);
    await user.type(screen.getByLabelText(/^Password/), 'Nadi kul 2026');
    await user.type(screen.getByLabelText(/^Repeat the password/), 'Nadi kul 2026');
    await next(user);
    await uploadAll(user, container, 3);
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('textbox', { name: /NID number/ })).toHaveAccessibleDescription(
      /The NID is not valid/,
    );
    expect(stepName()).toBe('2Identity');
  }, 30_000);

  it('an expired draft at submit goes back to the contacts with the message', async () => {
    const user = userEvent.setup();
    api({
      submit: () => apiError(410, 'registration.draft_expired', 'The registration has expired.'),
    });
    const { container } = renderApp(<RegisterPage />, 'en', { path: '/register' });
    await verifyContacts(user);
    await minimumToSkills(user);
    await next(user);
    await user.type(screen.getByLabelText(/^Password/), 'Nadi kul 2026');
    await user.type(screen.getByLabelText(/^Repeat the password/), 'Nadi kul 2026');
    await next(user);
    await uploadAll(user, container, 3);
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('The registration has expired.')).toBeInTheDocument();
    expect(stepName()).toBe('1Contact');
    expect(screen.getByText('Verify your identity')).toBeInTheDocument();
  }, 30_000);

  it('asks no volunteer type, reference, bank or program anywhere in the volunteer steps', async () => {
    const user = userEvent.setup();
    api();
    renderApp(<RegisterPage />, 'en', { path: '/register' });
    await verifyContacts(user);
    await minimumToSkills(user);
    expect(stepName()).toBe('6Skills and time');
    for (const gone of [/Volunteer type/, /Main volunteer/, /Bank/, /Account number/, /Branch/])
      expect(screen.queryByText(gone)).not.toBeInTheDocument();
    await next(user);
    expect(stepName()).toBe('7Account');
    expect(screen.queryByText(/Bank/)).not.toBeInTheDocument();
  }, 30_000);
});

describe('the password checklist', () => {
  /** The checklist items by their text, with whether each one is met. */
  const checklist = () =>
    Object.fromEntries(
      within(screen.getByText('The password needs').parentElement!)
        .getAllByRole('listitem')
        .map((li) => [li.textContent, li.getAttribute('data-met')]),
    );

  async function toAccount(user: User) {
    api();
    const view = renderApp(<RegisterPage />, 'en', { path: '/register' });
    await verifyContacts(user);
    await minimumToSkills(user);
    await next(user);
    return view;
  }

  it('ticks the three conditions while typing and keeps the next step closed until all hold', async () => {
    const user = userEvent.setup();
    const { container } = await toAccount(user);
    expect(checklist()).toEqual({
      'At least 8 characters': 'false',
      'One upper-case letter (A-Z)': 'false',
      'One digit (0-9)': 'false',
    });
    const field = screen.getByLabelText(/^Password/);
    await user.type(field, 'abcdefgh');
    expect(checklist()).toEqual({
      'At least 8 characters': 'true',
      'One upper-case letter (A-Z)': 'false',
      'One digit (0-9)': 'false',
    });
    await user.type(field, 'A');
    expect(checklist()['One upper-case letter (A-Z)']).toBe('true');
    await user.type(screen.getByLabelText(/^Repeat the password/), 'abcdefghA');
    await next(user);
    // one condition is still missing: the step stays and the field says so
    expect(stepName()).toBe('7Account');
    expect(screen.getByLabelText(/^Password/)).toHaveAccessibleDescription(
      /upper-case letter and one digit/,
    );
    await user.type(field, '7');
    expect(checklist()).toEqual({
      'At least 8 characters': 'true',
      'One upper-case letter (A-Z)': 'true',
      'One digit (0-9)': 'true',
    });
    await expectNoAxeViolations(container);
  }, 30_000);

  it('accepts a password with the mobile number in it', async () => {
    const user = userEvent.setup();
    await toAccount(user);
    await user.type(screen.getByLabelText(/^Password/), 'A01712345678');
    await user.type(screen.getByLabelText(/^Repeat the password/), 'A01712345678');
    await next(user);
    expect(stepName()).toBe('8Photos');
  }, 30_000);
});
