import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
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

function api(over: { verify?: () => Response } = {}) {
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
            : [location(DHAKA, 'ঢাকা', 'Dhaka'), location(RANGPUR, 'রংপুর', 'Rangpur')];
      return HttpResponse.json({ data });
    }),
    http.post('*/api/v1/auth/register/reference-lookup', async ({ request }) => {
      seen.push({ url: request.url, headers: request.headers, body: await request.json() });
      return HttpResponse.json({ data: { name: 'মূল স্বেচ্ছাসেবক নমুনা' } });
    }),
  );
}

beforeEach(() => {
  resetClientForTests();
  refreshAs(null);
  seen = [];
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
