import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError, ME, pair, refreshAs, renderApp } from '../../test/auth';
import { server } from '../../test/msw/server';
import { resetClientForTests } from '../_lib/api';
import { LoginForm } from './LoginForm';

const replace = vi.fn();
const refresh = vi.fn();
const setLocaleAction = vi.fn(async (_locale: string) => {});
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh }) }));
vi.mock('../_components/locale-action', () => ({
  setLocaleAction: (locale: string) => setLocaleAction(locale),
}));

// SCR-001 login (AUTH.md 4, 6; O-59).
beforeEach(() => {
  resetClientForTests();
  replace.mockClear();
  setLocaleAction.mockClear();
  refreshAs(null);
});

async function fill(user: ReturnType<typeof userEvent.setup>, id: string, password: string) {
  await user.type(screen.getByRole('textbox', { name: /মোবাইল নম্বর বা ইমেইল/ }), id);
  await user.type(screen.getByLabelText(/^পাসওয়ার্ড/, { selector: 'input' }), password);
  await user.click(screen.getByRole('button', { name: 'লগইন' }));
}

describe('LoginForm', () => {
  it('has labelled fields, a reset link and no accessibility violations (bn)', async () => {
    const { container } = renderApp(<LoginForm />);
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
    renderApp(<LoginForm />);
    await fill(user, 'pm.hum@example.org', 'Nadi kul 2026');
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    expect(body).toMatchObject({
      loginId: 'pm.hum@example.org',
      password: 'Nadi kul 2026',
      device: { platform: expect.any(String), appVersion: expect.any(String) },
    });
    expect(setLocaleAction).toHaveBeenCalledWith('en');
  });

  it('shows the generic server message for wrong credentials', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/auth/login', () =>
        apiError(401, 'auth.invalid_credentials', 'মোবাইল/ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।'),
      ),
    );
    renderApp(<LoginForm />);
    await fill(user, 'a@example.org', 'wrong 123');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'মোবাইল/ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।',
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it('tells the minutes left when the account is locked (English digits)', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/auth/login', () =>
        apiError(423, 'auth.account_locked', 'locked', { 'Retry-After': '840' }),
      ),
    );
    renderApp(<LoginForm />);
    await fill(user, 'a@example.org', 'wrong 123');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'অ্যাকাউন্টটি সাময়িকভাবে বন্ধ। 14 মিনিট পরে আবার চেষ্টা করুন।',
    );
  });

  it('explains why the previous session ended', () => {
    renderApp(<LoginForm ended="revoked" />, 'en');
    expect(
      screen.getByText('The session on this device has ended. Log in again.'),
    ).toBeInTheDocument();
  });
});
