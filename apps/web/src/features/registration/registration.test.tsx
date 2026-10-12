import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../lib/api';
import { RegisterPage } from './RegisterPage';

// SCR-002 registration (AUTH.md 2; plan
// docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md, unit U11).
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

/** Requests the screens sent, with their headers and URLs. */
let seen: { url: string; headers: Headers; body: unknown }[] = [];

const PROGRAM = '01900000-0000-7000-8000-0000000000f1';

function api(
  over: {
    verify?: () => Response;
    lookup?: () => Response;
    submit?: (body: unknown) => Response;
  } = {},
) {
  server.use(
    http.post('*/api/v1/auth/register/start', async ({ request }) => {
      seen.push({ url: request.url, headers: request.headers, body: await request.json() });
      return HttpResponse.json(
        { data: { registrationId: DRAFT, otpSentTo: ['sms', 'email'] } },
        { status: 201 },
      );
    }),
    http.post('*/api/v1/auth/register/otp/verify', async ({ request }) => {
      seen.push({ url: request.url, headers: request.headers, body: await request.json() });
      return (
        over.verify?.() ??
        HttpResponse.json({
          data: { registrationToken: TOKEN, expiresAt: '2026-10-13T10:00:00Z', kind: 'volunteer' },
        })
      );
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
      seen.push({ url: request.url, headers: request.headers, body: await request.json() });
      return over.lookup?.() ?? HttpResponse.json({ data: { name: 'মূল স্বেচ্ছাসেবক নমুনা' } });
    }),
    http.post('*/api/v1/auth/register/photos/:slot', ({ request, params }) => {
      seen.push({ url: request.url, headers: request.headers, body: params.slot });
      return HttpResponse.json(
        {
          data: {
            fileId: `01900000-0000-7000-8000-00000000${params.slot === 'photo' ? '0b01' : '0b02'}`,
          },
        },
        { status: 201 },
      );
    }),
    http.post('*/api/v1/auth/register/submit', async ({ request }) => {
      const body = await request.json();
      seen.push({ url: request.url, headers: request.headers, body });
      return (
        over.submit?.(body) ??
        HttpResponse.json(
          {
            data: {
              id: '01900000-0000-7000-8000-0000000000c1',
              displayName: 'নতুন',
              kind: 'volunteer',
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

/** Fills the volunteer form up to the password, with both photos uploaded. */
async function fillVolunteer(user: ReturnType<typeof userEvent.setup>, container: HTMLElement) {
  await screen.findByRole('heading', { name: 'Registration form' });
  await user.type(screen.getByRole('textbox', { name: /^Name/ }), 'New Person');
  await user.type(screen.getByRole('textbox', { name: /Father's name/ }), 'Father');
  await user.type(screen.getByRole('textbox', { name: /Mother's name/ }), 'Mother');
  await user.type(screen.getByRole('textbox', { name: /NID number/ }), '1000000000555');
  for (const [label, option] of [
    [/Division/, 'Rangpur'],
    [/(^|\s)District/, 'Rangpur district'],
    [/Upazila/, 'Pirganj'],
    [/Union/, 'Chatra'],
  ] as const) {
    await user.click(screen.getByRole('button', { name: label }));
    await user.click(await screen.findByRole('option', { name: option }));
  }
  const inputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]');
  return inputs;
}

const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'photo.png', { type: 'image/png' });

beforeEach(() => {
  resetClientForTests();
  refreshAs(null);
  seen = [];
  // jsdom cannot make object URLs of test files; the preview is not under test here
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
  vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
});

async function throughCodes(user: ReturnType<typeof userEvent.setup>, locale: 'bn' | 'en' = 'en') {
  const view = renderApp(<RegisterPage />, locale, { path: '/register' });
  await user.type(screen.getByRole('textbox', { name: /Mobile number/ }), '01712345678');
  await user.type(screen.getByRole('textbox', { name: /Email/ }), 'new.person@example.org');
  await user.click(screen.getByRole('button', { name: 'Send codes' }));
  await user.type(
    await screen.findByRole('textbox', { name: /Code sent to your mobile/ }),
    '123456',
  );
  // the form is not there before both codes
  expect(screen.queryByRole('heading', { name: 'Registration form' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.type(
    await screen.findByRole('textbox', { name: /Code sent to your email/ }),
    '654321',
  );
  await user.click(screen.getByRole('button', { name: 'Verify' }));
  return view;
}

describe('RegisterPage', () => {
  it('opens the form only after both codes and keeps the draft token out of every URL', async () => {
    const user = userEvent.setup();
    api();
    const { container } = await throughCodes(user);
    expect(await screen.findByRole('heading', { name: 'Registration form' })).toBeInTheDocument();
    expect(seen[1]!.body).toEqual({
      registrationId: DRAFT,
      mobileCode: '123456',
      emailCode: '654321',
    });
    await user.click(screen.getByRole('button', { name: /Volunteer type/ }));
    await user.click(screen.getByRole('option', { name: 'Team member' }));
    await user.type(screen.getByRole('textbox', { name: /Main volunteer's NID/ }), '1000000000123');
    await user.click(screen.getByRole('button', { name: 'Show the name' }));
    expect(await screen.findByText('Main volunteer: মূল স্বেচ্ছাসেবক নমুনা')).toBeInTheDocument();
    const lookup = seen[2]!;
    expect(lookup.headers.get('X-Registration-Token')).toBe(TOKEN);
    for (const request of seen) expect(request.url).not.toContain(TOKEN);
    await expectNoAxeViolations(container);
  }, 15_000);

  it('the district list follows the division', async () => {
    const user = userEvent.setup();
    api();
    await throughCodes(user);
    await screen.findByRole('heading', { name: 'Registration form' });
    expect(screen.getByRole('button', { name: /District/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Division/ }));
    await user.click(await screen.findByRole('option', { name: 'Rangpur' }));
    await user.click(screen.getByRole('button', { name: /District/ }));
    const list = await screen.findByRole('listbox');
    expect(within(list).getByRole('option', { name: 'Rangpur district' })).toBeInTheDocument();
    expect(within(list).queryByRole('option', { name: 'Dhaka district' })).not.toBeInTheDocument();
  });

  it('reports an existing account only after the codes, with a way to log in', async () => {
    const user = userEvent.setup();
    api({
      verify: () =>
        apiError(
          409,
          'registration.account_exists',
          'An account with this mobile number or email already exists. Log in instead.',
        ),
    });
    await throughCodes(user);
    expect(await screen.findByText(/already exists/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
  });

  it('shows a refused mobile code on the mobile screen', async () => {
    const user = userEvent.setup();
    api({
      verify: () =>
        apiError(422, 'validation.failed', 'Some information is not valid.', [
          {
            path: 'mobileCode',
            code: 'otp.invalid',
            messageKey: 'errors.otp.invalid',
            message: 'The code is incorrect.',
          },
        ]),
    });
    await throughCodes(user);
    const code = await screen.findByRole('textbox', { name: /Code sent to your mobile/ });
    expect(code).toHaveAccessibleDescription(/The code is incorrect/);
  });

  it('has no accessibility violations in Bangla', async () => {
    const user = userEvent.setup();
    api();
    const { container } = renderApp(<RegisterPage />, 'bn', { path: '/register' });
    expect(screen.getByRole('radio', { name: 'স্বেচ্ছাসেবক' })).toBeChecked();
    await expectNoAxeViolations(container);
    await user.type(screen.getByRole('textbox', { name: /মোবাইল নম্বর/ }), '01712345678');
    await user.type(screen.getByRole('textbox', { name: /ইমেইল/ }), 'new.person@example.org');
    await user.click(screen.getByRole('button', { name: 'কোড পাঠান' }));
    expect(await screen.findByRole('textbox', { name: /মোবাইলে পাওয়া কোড/ })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});

describe('the form after the codes', () => {
  it('submits the volunteer form with the token and shows the pending confirmation', async () => {
    const user = userEvent.setup();
    api();
    const { container } = await throughCodes(user);
    const inputs = await fillVolunteer(user, container);
    // gallery inputs of the photo and the NID photo
    await user.upload(inputs[1]!, png());
    await user.upload(inputs[3]!, png());
    await screen.findAllByText(/photo.png/);
    await user.type(screen.getByLabelText(/^Password/, { selector: 'input' }), 'Nadi kul 2026');
    await user.type(
      screen.getByLabelText(/^Repeat the password/, { selector: 'input' }),
      'Nadi kul 2026',
    );
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(
      await screen.findByRole('heading', { name: 'Registration submitted' }),
    ).toBeInTheDocument();
    const submit = seen.find((r) => r.url.endsWith('/auth/register/submit'))!;
    expect(submit.headers.get('X-Registration-Token')).toBe(TOKEN);
    expect(submit.body).toMatchObject({
      kind: 'volunteer',
      registrationId: DRAFT,
      name: 'New Person',
      nid: '1000000000555',
      type: 'general',
      divisionId: RANGPUR,
      districtId: RANGPUR_DISTRICT,
    });
    expect(seen.filter((r) => r.url.includes('/photos/')).map((r) => r.body)).toEqual([
      'photo',
      'nid_photo',
    ]);
  }, 20_000);

  it('sends nothing with a mismatched password or a missing photo, and shows a refused NID', async () => {
    const user = userEvent.setup();
    api({
      submit: () =>
        apiError(422, 'validation.failed', 'Some information is not valid.', [
          {
            path: 'nid',
            code: 'validation.nid_format',
            message: 'The NID must have 10, 13 or 17 digits.',
          },
        ]),
    });
    const { container } = await throughCodes(user);
    const inputs = await fillVolunteer(user, container);
    await user.type(screen.getByLabelText(/^Password/, { selector: 'input' }), 'Nadi kul 2026');
    await user.type(
      screen.getByLabelText(/^Repeat the password/, { selector: 'input' }),
      'other 2026',
    );
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findAllByText('Add the photo.')).toHaveLength(2);
    expect(seen.some((r) => r.url.endsWith('/submit'))).toBe(false);
    await user.upload(inputs[1]!, png());
    await user.upload(inputs[3]!, png());
    await screen.findAllByText(/photo.png/);
    await user.clear(screen.getByLabelText(/^Repeat the password/, { selector: 'input' }));
    await user.type(
      screen.getByLabelText(/^Repeat the password/, { selector: 'input' }),
      'Nadi kul 2026',
    );
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('textbox', { name: /NID number/ })).toHaveAccessibleDescription(
      /10, 13 or 17 digits/,
    );
  }, 20_000);

  it('says when no active volunteer has the reference NID, and forgets a name when the NID changes', async () => {
    const user = userEvent.setup();
    let found = true;
    api({
      lookup: () =>
        found
          ? HttpResponse.json({ data: { name: 'মূল স্বেচ্ছাসেবক নমুনা' } })
          : apiError(404, 'permission.not_found', 'Not found.'),
    });
    await throughCodes(user);
    await screen.findByRole('heading', { name: 'Registration form' });
    await user.click(screen.getByRole('button', { name: /Volunteer type/ }));
    await user.click(screen.getByRole('option', { name: 'Team member' }));
    const nid = screen.getByRole('textbox', { name: /Main volunteer's NID/ });
    await user.type(nid, '1000000000123');
    await user.click(screen.getByRole('button', { name: 'Show the name' }));
    expect(await screen.findByText(/Main volunteer: /)).toBeInTheDocument();
    await user.type(nid, '4');
    expect(screen.queryByText(/Main volunteer: /)).not.toBeInTheDocument();
    found = false;
    await user.click(screen.getByRole('button', { name: 'Show the name' }));
    expect(await screen.findByText('No active volunteer has this NID.')).toBeInTheDocument();
  });

  it("an official's draft gets the staff form with the programs and no NID", async () => {
    const user = userEvent.setup();
    api({
      verify: () =>
        HttpResponse.json({
          data: {
            registrationToken: TOKEN,
            expiresAt: '2026-10-13T10:00:00Z',
            kind: 'staff',
            programs: [{ id: PROGRAM, name: { bn: 'স্বাবলম্বী', en: 'Self-reliance' } }],
          },
        }),
    });
    await throughCodes(user);
    await screen.findByRole('heading', { name: 'Registration form' });
    expect(screen.getByRole('textbox', { name: /Designation/ })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /NID number/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Program/ }));
    expect(await screen.findByRole('option', { name: 'Self-reliance' })).toBeInTheDocument();
  });

  it('changing the division clears the district below it', async () => {
    const user = userEvent.setup();
    api();
    await throughCodes(user);
    await screen.findByRole('heading', { name: 'Registration form' });
    await user.click(screen.getByRole('button', { name: /Division/ }));
    await user.click(await screen.findByRole('option', { name: 'Rangpur' }));
    await user.click(screen.getByRole('button', { name: /(^|\s)District/ }));
    await user.click(await screen.findByRole('option', { name: 'Rangpur district' }));
    expect(screen.getByRole('button', { name: /(^|\s)District/ })).toHaveAccessibleName(
      /Rangpur district/,
    );
    await user.click(screen.getByRole('button', { name: /Division/ }));
    await user.click(await screen.findByRole('option', { name: 'Dhaka' }));
    expect(screen.getByRole('button', { name: /(^|\s)District/ })).not.toHaveAccessibleName(
      /Rangpur district/,
    );
    expect(screen.getByRole('button', { name: /Upazila/ })).toBeDisabled();
  });
});
