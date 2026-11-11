import { expectNoAxeViolations } from '@/ui/testing';
import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiError, ME, pair, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../api/client';
import { LoginForm } from './LoginForm';

// The screen "Login and password reset" of docs/ui/SCREENS.md (docs/architecture/AUTH.md, "Login"
// and "Lockout after failed attempts").
beforeEach(() => {
  resetClientForTests();
  document.cookie = 'css_locale=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  window.localStorage.clear();
  window.sessionStorage.clear();
  refreshAs(null);
});

/** No value of either browser storage holds any of these texts. */
function expectNothingStored(...secrets: string[]) {
  for (const storage of [window.localStorage, window.sessionStorage])
    for (let i = 0; i < storage.length; i++) {
      const value = `${storage.key(i)}=${storage.getItem(storage.key(i) ?? '')}`;
      for (const secret of secrets) expect(value).not.toContain(secret);
    }
}

const mount = (ended?: string) => renderApp(<LoginForm ended={ended} />, 'bn', { path: '/login' });

async function fill(user: ReturnType<typeof userEvent.setup>, id: string, password: string) {
  await user.type(screen.getByRole('textbox', { name: /মোবাইল নম্বর বা ইমেইল/ }), id);
  await user.type(screen.getByLabelText(/^পাসওয়ার্ড/, { selector: 'input' }), password);
  await user.click(screen.getByRole('button', { name: 'লগইন' }));
}

describe('LoginForm', () => {
  it('has labelled fields, a reset link and no accessibility violations (bn)', async () => {
    const { container } = mount();
    expect(screen.getByRole('textbox', { name: /মোবাইল নম্বর বা ইমেইল/ })).toHaveAttribute(
      'autocomplete',
      'username',
    );
    expect(screen.getByRole('link', { name: 'পাসওয়ার্ড ভুলে গেছেন?' })).toHaveAttribute(
      'href',
      '/login/reset',
    );
    await expectNoAxeViolations(container);
  });

  it('signs in, follows the stored language and goes home', async () => {
    const user = userEvent.setup();
    let body: unknown;
    server.use(
      http.post('*/api/v1/auth/login', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: pair({ ...ME, language: 'en' }), meta: {} });
      }),
    );
    const { router } = mount();
    await fill(user, 'pm.hum@example.org', 'Nadi kul 2026');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(body).toMatchObject({
      loginId: 'pm.hum@example.org',
      password: 'Nadi kul 2026',
      device: { platform: expect.any(String), appVersion: expect.any(String) },
    });
    expect(window.localStorage.getItem('css_locale')).toBe('en');
  });

  it('shows the generic server message for wrong credentials', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/auth/login', () =>
        apiError(401, 'auth.invalid_credentials', 'মোবাইল/ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।'),
      ),
    );
    const { router } = mount();
    await fill(user, 'a@example.org', 'wrong 123');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'মোবাইল/ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।',
    );
    expect(router.state.location.pathname).toBe('/login');
  });

  it('tells the minutes left when the account is locked (English digits)', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/auth/login', () =>
        apiError(423, 'auth.account_locked', 'locked', { 'Retry-After': '840' }),
      ),
    );
    mount();
    await fill(user, 'a@example.org', 'wrong 123');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'অ্যাকাউন্টটি সাময়িকভাবে বন্ধ। 14 মিনিট পরে আবার চেষ্টা করুন।',
    );
  });

  it('shows one and the same message for a wrong password and an unknown account', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/auth/login', () =>
        apiError(401, 'auth.invalid_credentials', 'মোবাইল/ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।'),
      ),
    );
    mount();
    await fill(user, 'pm.hum@example.org', 'wrong 123');
    const wrongPassword = (await screen.findByRole('alert')).textContent;
    await user.clear(screen.getByRole('textbox', { name: /মোবাইল নম্বর বা ইমেইল/ }));
    await user.clear(screen.getByLabelText(/^পাসওয়ার্ড/, { selector: 'input' }));
    await fill(user, 'nobody@example.org', 'wrong 123');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(wrongPassword));
  });

  it('tells the seconds left after too many attempts, and that a lost connection is offline', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/auth/login', () =>
        apiError(429, 'rate_limit.exceeded', 'too many', { 'Retry-After': '30' }),
      ),
    );
    mount();
    await fill(user, 'a@example.org', 'wrong 123');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'অনেকবার চেষ্টা করা হয়েছে। 30 সেকেন্ড পরে আবার চেষ্টা করুন।',
    );
    server.use(http.post('*/api/v1/auth/login', () => HttpResponse.error()));
    await user.click(screen.getByRole('button', { name: 'লগইন' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'আপনি অফলাইনে আছেন। লগইন করতে ইন্টারনেট সংযোগ লাগবে।',
      ),
    );
  });

  it('labels the fields in English and keeps the password out of the browser storage', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/auth/login', () =>
        apiError(
          401,
          'auth.invalid_credentials',
          'The mobile number, email or password is incorrect.',
        ),
      ),
    );
    renderApp(<LoginForm />, 'en', { path: '/login' });
    const password = screen.getByLabelText(/^Password/, { selector: 'input' });
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    expect(password).toHaveAttribute('type', 'password');
    await user.type(
      screen.getByRole('textbox', { name: 'Job ID, mobile number or email' }),
      'a@example.org',
    );
    await user.type(password, 'Secret pass 9');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The mobile number, email or password is incorrect.',
    );
    expectNothingStored('Secret pass 9');
  });

  it('keeps the password and the token out of the browser storage after a sign-in', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/auth/login', () =>
        HttpResponse.json({ data: pair(ME, 'access-secret-1'), meta: {} }),
      ),
    );
    const { router } = mount();
    await fill(user, 'pm.hum@example.org', 'Nadi kul 2026');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expectNothingStored('Nadi kul 2026', 'access-secret-1');
  });

  it('asks to fill an empty field and sends nothing until both are filled', async () => {
    const user = userEvent.setup();
    let calls = 0;
    server.use(
      http.post('*/api/v1/auth/login', () => {
        calls += 1;
        return apiError(401, 'auth.invalid_credentials', 'মোবাইল/ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।');
      }),
    );
    mount();
    await user.click(screen.getByRole('button', { name: 'লগইন' }));
    const id = screen.getByRole('textbox', { name: /মোবাইল নম্বর বা ইমেইল/ });
    await waitFor(() => expect(id).toHaveAccessibleDescription('এই ঘরটি পূরণ করুন।'));
    expect(screen.getByLabelText(/^পাসওয়ার্ড/, { selector: 'input' })).toHaveAccessibleDescription(
      'এই ঘরটি পূরণ করুন।',
    );
    expect(calls).toBe(0);
    await fill(user, 'a@example.org', 'wrong 123');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'মোবাইল/ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।',
    );
    expect(calls).toBe(1);
  });

  it('explains why the previous session ended', () => {
    renderApp(<LoginForm ended="revoked" />, 'en', { path: '/login' });
    expect(
      screen.getByText('The session on this device has ended. Log in again.'),
    ).toBeInTheDocument();
  });
});
