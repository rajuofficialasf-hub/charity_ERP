import { expectNoAxeViolations } from '@/ui/testing';
import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { apiError, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../api/client';
import { InvitePage } from './InvitePage';

// The set-password page of an official created by the admin (docs/architecture/AUTH.md, "Officials
// created by the admin"). Test data only.
const TOKEN = 'B'.repeat(42) + '_';
const VIEW = {
  displayName: 'নতুন কর্মকর্তা',
  jobId: 'CSS-310',
  minPasswordLength: 8,
  expiresAt: '2026-10-20T06:00:00Z',
};

let bodies: { path: string; body: unknown }[];
function serve(check: () => Response = () => HttpResponse.json({ data: VIEW, meta: {} })) {
  bodies = [];
  server.use(
    http.post('*/api/v1/auth/invitations/check', async ({ request }) => {
      bodies.push({ path: 'check', body: await request.json() });
      return check();
    }),
    http.post('*/api/v1/auth/invitations/accept', async ({ request }) => {
      const body = (await request.json()) as { password: string };
      bodies.push({ path: 'accept', body });
      if (body.password === 'short')
        return HttpResponse.json(
          {
            error: {
              code: 'validation.failed',
              messageKey: 'errors.validation.failed',
              message: 'কিছু তথ্য সঠিক নয়।',
              requestId: 'req_test',
              details: [
                {
                  path: 'password',
                  code: 'validation.password_too_short',
                  message: 'পাসওয়ার্ড অন্তত 8 অক্ষরের হতে হবে।',
                },
              ],
            },
          },
          { status: 422 },
        );
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

const open = (hash = `#${TOKEN}`) => {
  window.history.replaceState(null, '', `/invite${hash}`);
  return renderApp(<InvitePage />, 'bn', { path: '/invite' });
};

beforeEach(() => {
  resetClientForTests();
  refreshAs(null);
});
afterEach(() => window.history.replaceState(null, '', '/'));

describe('the set-password page', () => {
  it('shows the name and the job ID, takes the token from the fragment and clears it', async () => {
    serve();
    const { container } = open();
    expect(await screen.findByText(/নতুন কর্মকর্তা/)).toBeInTheDocument();
    expect(screen.getByText(/CSS-310/)).toBeInTheDocument();
    expect(bodies).toEqual([{ path: 'check', body: { token: TOKEN } }]);
    // the token leaves the address bar at once
    expect(window.location.hash).toBe('');
    await expectNoAxeViolations(container);
  });

  it('sets the password and sends the person to log in with the job ID', async () => {
    serve();
    const user = userEvent.setup();
    open();
    await screen.findByText(/CSS-310/);
    await user.type(
      screen.getByLabelText(/^নতুন পাসওয়ার্ড(?! আবার)/, { selector: 'input' }),
      'Nadi 2026',
    );
    await user.type(
      screen.getByLabelText(/^নতুন পাসওয়ার্ড আবার লিখুন/, { selector: 'input' }),
      'Nadi 2026',
    );
    await user.click(screen.getByRole('button', { name: 'পাসওয়ার্ড সংরক্ষণ করুন' }));
    expect(
      await screen.findByText(/Job ID CSS-310 আর নতুন পাসওয়ার্ড দিয়ে লগইন করুন/),
    ).toBeInTheDocument();
    expect(bodies.at(-1)).toEqual({
      path: 'accept',
      body: { token: TOKEN, password: 'Nadi 2026' },
    });
    expect(screen.getByRole('link', { name: 'লগইনে যান' })).toHaveAttribute('href', '/login');
  });

  it('in English: the same fields with their autocomplete, and nothing typed kept in storage', async () => {
    serve();
    const user = userEvent.setup();
    window.history.replaceState(null, '', `/invite#${TOKEN}`);
    renderApp(<InvitePage />, 'en', { path: '/invite' });
    await screen.findByText(/CSS-310/);
    const first = screen.getByLabelText(/^New password(?! again)/, { selector: 'input' });
    const second = screen.getByLabelText(/^Confirm the new password/, { selector: 'input' });
    for (const field of [first, second])
      expect(field).toHaveAttribute('autocomplete', 'new-password');
    await user.type(first, 'Nadi 2026');
    await user.type(second, 'Nadi 2027');
    await user.click(screen.getByRole('button', { name: 'Save the password' }));
    expect(await screen.findByText('The two new passwords do not match.')).toBeInTheDocument();
    await user.clear(second);
    await user.type(second, 'Nadi 2026');
    await user.click(screen.getByRole('button', { name: 'Save the password' }));
    expect(await screen.findByText(/Log in with your job ID CSS-310/)).toBeInTheDocument();
    expect(bodies.at(-1)).toEqual({
      path: 'accept',
      body: { token: TOKEN, password: 'Nadi 2026' },
    });
    for (const storage of [window.localStorage, window.sessionStorage])
      for (let i = 0; i < storage.length; i++)
        for (const secret of ['Nadi 2026', TOKEN])
          expect(storage.getItem(storage.key(i) ?? '')).not.toContain(secret);
  });

  it('keeps a weak or mistyped password on the form', async () => {
    serve();
    const user = userEvent.setup();
    open();
    await screen.findByText(/CSS-310/);
    const first = screen.getByLabelText(/^নতুন পাসওয়ার্ড(?! আবার)/, { selector: 'input' });
    const second = screen.getByLabelText(/^নতুন পাসওয়ার্ড আবার লিখুন/, { selector: 'input' });
    await user.type(first, 'Nadi 2026');
    await user.type(second, 'Nadi 2027');
    await user.click(screen.getByRole('button', { name: 'পাসওয়ার্ড সংরক্ষণ করুন' }));
    expect(await screen.findByText('দুটি নতুন পাসওয়ার্ড মেলেনি।')).toBeInTheDocument();
    expect(bodies.filter((b) => b.path === 'accept')).toHaveLength(0);
    await user.clear(first);
    await user.clear(second);
    await user.type(first, 'short');
    await user.type(second, 'short');
    await user.click(screen.getByRole('button', { name: 'পাসওয়ার্ড সংরক্ষণ করুন' }));
    expect(await screen.findByText('পাসওয়ার্ড অন্তত 8 অক্ষরের হতে হবে।')).toBeInTheDocument();
  });

  it('says to ask for a new link when this one is used or expired', async () => {
    serve(() =>
      apiError(410, 'auth.invitation_expired', 'লিঙ্কটির মেয়াদ শেষ বা আগেই ব্যবহার হয়েছে।'),
    );
    open();
    expect(
      await screen.findByText('লিঙ্কটির মেয়াদ শেষ বা আগেই ব্যবহার হয়েছে।'),
    ).toBeInTheDocument();
    expect(screen.getByText(/নতুন লিঙ্কের জন্য/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'পাসওয়ার্ড সংরক্ষণ করুন' })).toBeNull();
  });

  it('keeps a valid link when the server is busy: the person tries again', async () => {
    serve(() =>
      HttpResponse.json(
        {
          error: { code: 'rate_limit.exceeded', message: 'অনেকবার চেষ্টা হয়েছে।', requestId: 'r' },
        },
        { status: 429 },
      ),
    );
    const user = userEvent.setup();
    open();
    expect(await screen.findByText('অনেকবার চেষ্টা হয়েছে।')).toBeInTheDocument();
    expect(screen.queryByText(/নতুন লিঙ্কের জন্য/)).toBeNull();
    serve();
    await user.click(screen.getByRole('button', { name: 'আবার চেষ্টা করুন' }));
    expect(await screen.findByText(/CSS-310/)).toBeInTheDocument();
  });

  it('says the link is incomplete without a token and asks nothing of the server', async () => {
    serve();
    open('');
    expect(await screen.findByText(/লিঙ্কটি অসম্পূর্ণ/)).toBeInTheDocument();
    await waitFor(() => expect(bodies).toHaveLength(0));
  });
});
