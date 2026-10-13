import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../lib/api';
import { RegisterPage } from './RegisterPage';

// SCR-002 registration on one page (UX-16, UX-18; AUTH.md 2, DECISION_LOG D-090; plan
// docs/plans/2026-10-13-0922-feat-registration-redesign-plan.md, U4). Test data only.
const DRAFT = '01900000-0000-7000-8000-0000000000aa';
const TOKEN = 'draft-token-0123456789abcdef0123456789abcdef';
const DHAKA = '01900000-0000-7000-8000-0000000000d1';
const DHAKA_DISTRICT = '01900000-0000-7000-8000-0000000000d2';
const RANGPUR = '01900000-0000-7000-8000-0000000000e1';
const RANGPUR_DISTRICT = '01900000-0000-7000-8000-0000000000e2';
const UPAZILA = '01900000-0000-7000-8000-0000000000e3';
const UNION = '01900000-0000-7000-8000-0000000000e4';
const PROGRAM = '01900000-0000-7000-8000-0000000000f1';

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
              ...(over.kind === 'staff'
                ? { programs: [{ id: PROGRAM, name: { bn: 'স্বাবলম্বী', en: 'Self-reliance' } }] }
                : {}),
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
    http.post('*/api/v1/auth/register/reference-lookup', async ({ request }) => {
      await record(request);
      return HttpResponse.json({ data: { name: 'মূল স্বেচ্ছাসেবক নমুনা' } });
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
  screen.getByRole('textbox', { name }).closest<HTMLElement>('.register-contact')!;

/** Name, father's name and both contacts verified inside their fields. */
async function verifyContacts(user: User, kind: 'volunteer' | 'staff' = 'volunteer') {
  if (kind === 'staff') await user.click(screen.getByRole('button', { name: 'Official' }));
  await user.type(screen.getByRole('textbox', { name: /^Name/ }), 'New Person');
  if (kind === 'volunteer')
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
    await user.click(screen.getByRole('button', { name: label }));
    await user.click(await screen.findByRole('option', { name: option }));
  }
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

describe('the contact step (UX-16)', () => {
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
  it('a volunteer goes through five steps, back keeps the answers, the photos come last', async () => {
    const user = userEvent.setup();
    api();
    const { container } = renderApp(<RegisterPage />, 'en', { path: '/register' });
    await verifyContacts(user);
    await next(user);
    expect(stepName()).toBe('2Identity and address');
    // a step is checked before the next one opens
    await next(user);
    expect(screen.getByRole('textbox', { name: /NID number/ })).toHaveAccessibleDescription(
      /10, 13 or 17 digits/,
    );
    await user.type(screen.getByRole('textbox', { name: /Mother's name/ }), 'Mother');
    await user.type(screen.getByRole('textbox', { name: /NID number/ }), '1000000000555');
    await chooseAddress(user);
    await next(user);
    expect(stepName()).toBe('3Work');
    await user.click(screen.getByRole('button', { name: 'Previous step' }));
    expect(screen.getByRole('textbox', { name: /Mother's name/ })).toHaveValue('Mother');
    await next(user);
    await user.type(screen.getByRole('textbox', { name: /Education/ }), 'SSC');
    await next(user);
    expect(stepName()).toBe('4Account');
    await user.type(screen.getByLabelText(/^Password/), 'Nadi kul 2026');
    await user.type(screen.getByLabelText(/^Repeat the password/), 'Nadi kul 2026');
    await next(user);
    expect(stepName()).toBe('5Photos');
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
      type: 'general',
      divisionId: RANGPUR,
      unionId: UNION,
      education: 'SSC',
    });
    expect(submit.headers.get('X-Registration-Token')).toBe(TOKEN);
    expect(
      seen.filter((s) => s.path.startsWith('/auth/register/photos/')).map((s) => s.body),
    ).toEqual(['photo', 'nid_photo', 'nid_photo_back']);
    for (const request of seen) expect(request.url).not.toContain(TOKEN);
  }, 30_000);

  it('an official has four steps with the workplace and the own photo only', async () => {
    const user = userEvent.setup();
    api({ kind: 'staff' });
    const { container } = renderApp(<RegisterPage />, 'en', { path: '/register' });
    await verifyContacts(user, 'staff');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Official registration' }),
    ).toBeInTheDocument();
    expect(bodiesOf('/auth/register/start')).toEqual([{ kind: 'staff' }]);
    await next(user);
    expect(stepName()).toBe('2Workplace');
    await user.type(screen.getByRole('textbox', { name: /Designation/ }), 'Project Officer');
    await user.click(screen.getByRole('button', { name: /Program/ }));
    await user.click(await screen.findByRole('option', { name: 'Self-reliance' }));
    await user.click(screen.getByRole('button', { name: /Division of the workplace/ }));
    await user.click(await screen.findByRole('option', { name: 'Dhaka' }));
    await next(user);
    await user.type(screen.getByLabelText(/^Password/), 'Nadi kul 2026');
    await user.type(screen.getByLabelText(/^Repeat the password/), 'Nadi kul 2026');
    await next(user);
    expect(stepName()).toBe('4Photos');
    expect(screen.queryByRole('group', { name: /NID card/ })).not.toBeInTheDocument();
    await uploadAll(user, container, 1);
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await screen.findByRole('heading', { level: 1, name: 'Registration submitted' });
    expect(seen.find((s) => s.path === '/auth/register/submit')!.body).toEqual({
      kind: 'staff',
      registrationId: DRAFT,
      password: 'Nadi kul 2026',
      name: 'New Person',
      designation: 'Project Officer',
      homeProgramId: PROGRAM,
      homeDivisionId: DHAKA,
    });
  }, 30_000);

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
    await next(user);
    await user.type(screen.getByRole('textbox', { name: /Mother's name/ }), 'Mother');
    await user.type(screen.getByRole('textbox', { name: /NID number/ }), '1000000000555');
    await chooseAddress(user);
    await next(user);
    await next(user);
    await user.type(screen.getByLabelText(/^Password/), 'Nadi kul 2026');
    await user.type(screen.getByLabelText(/^Repeat the password/), 'Nadi kul 2026');
    await next(user);
    await uploadAll(user, container, 3);
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('textbox', { name: /NID number/ })).toHaveAccessibleDescription(
      /The NID is not valid/,
    );
    expect(stepName()).toBe('2Identity and address');
  }, 30_000);

  it("the team member's reference shows the main volunteer's name", async () => {
    const user = userEvent.setup();
    api();
    renderApp(<RegisterPage />, 'en', { path: '/register' });
    await verifyContacts(user);
    await next(user);
    await user.type(screen.getByRole('textbox', { name: /Mother's name/ }), 'Mother');
    await user.type(screen.getByRole('textbox', { name: /NID number/ }), '1000000000555');
    await chooseAddress(user);
    await next(user);
    await user.click(screen.getByRole('button', { name: /Volunteer type/ }));
    await user.click(screen.getByRole('option', { name: 'Team member' }));
    await user.type(screen.getByRole('textbox', { name: /Main volunteer's NID/ }), '1000000000123');
    await user.click(screen.getByRole('button', { name: 'Show the name' }));
    expect(await screen.findByText('Main volunteer: মূল স্বেচ্ছাসেবক নমুনা')).toBeInTheDocument();
    const lookup = seen.find((s) => s.path === '/auth/register/reference-lookup')!;
    expect(lookup.headers.get('X-Registration-Token')).toBe(TOKEN);
  }, 20_000);
});
