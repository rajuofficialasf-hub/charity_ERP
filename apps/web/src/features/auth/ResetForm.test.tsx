import { expectNoAxeViolations } from '@/ui/testing';
import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../api/client';
import { ResetForm } from './ResetForm';

// The screen "Login and password reset" of docs/ui/SCREENS.md (docs/architecture/AUTH.md, "Password
// rules").
beforeEach(() => {
  resetClientForTests();
  refreshAs(null);
});

describe('ResetForm', () => {
  it('sends the code, takes the code and a new password, and confirms', async () => {
    const user = userEvent.setup();
    const bodies: unknown[] = [];
    server.use(
      http.post('*/api/v1/auth/password/reset/start', async ({ request }) => {
        bodies.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
      http.post('*/api/v1/auth/password/reset/complete', async ({ request }) => {
        bodies.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { container } = renderApp(<ResetForm />, 'en');
    await user.type(
      screen.getByRole('textbox', { name: /mobile number or email/i }),
      '01700000101',
    );
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByText(/a 6-digit code has been sent/)).toBeInTheDocument();
    const code = screen.getByRole('textbox', { name: /Code/ });
    expect(code).toHaveAttribute('autocomplete', 'one-time-code');
    expect(code).toHaveAttribute('inputmode', 'numeric');
    await expectNoAxeViolations(container);
    await user.type(code, '24a6810');
    await user.type(
      screen.getByLabelText(/^New password/, { selector: 'input' }),
      'Shapla phul 77',
    );
    await user.type(
      screen.getByLabelText(/^Confirm the new password/, { selector: 'input' }),
      'Shapla phul 77',
    );
    for (const label of [/^New password/, /^Confirm the new password/])
      expect(screen.getByLabelText(label, { selector: 'input' })).toHaveAttribute(
        'autocomplete',
        'new-password',
      );
    await user.click(screen.getByRole('button', { name: 'Set new password' }));
    expect(await screen.findByText(/The password has been changed/)).toBeInTheDocument();
    expect(bodies).toEqual([
      { loginId: '01700000101' },
      { loginId: '01700000101', code: '246810', newPassword: 'Shapla phul 77' },
    ]);
    // nothing typed is kept in the browser's storage
    for (const storage of [window.localStorage, window.sessionStorage])
      for (let i = 0; i < storage.length; i++)
        for (const secret of ['Shapla phul 77', '246810'])
          expect(storage.getItem(storage.key(i) ?? '')).not.toContain(secret);
  });

  it('in Bangla: says when it is offline and sends the code again to the same login id', async () => {
    const user = userEvent.setup();
    const bodies: unknown[] = [];
    let fail = true;
    server.use(
      http.post('*/api/v1/auth/password/reset/start', async ({ request }) => {
        if (fail) return HttpResponse.error();
        bodies.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp(<ResetForm />, 'bn');
    await user.type(
      screen.getByRole('textbox', { name: /মোবাইল নম্বর বা ইমেইল/ }),
      'a@example.org',
    );
    await user.click(screen.getByRole('button', { name: 'কোড পাঠান' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'আপনি অফলাইনে আছেন। লগইন করতে ইন্টারনেট সংযোগ লাগবে।',
    );
    fail = false;
    await user.click(screen.getByRole('button', { name: 'কোড পাঠান' }));
    expect(await screen.findByRole('textbox', { name: /কোড/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'নতুন কোড পাঠান' }));
    await waitFor(() =>
      expect(bodies).toEqual([{ loginId: 'a@example.org' }, { loginId: 'a@example.org' }]),
    );
  });

  it('shows a wrong code on the code field and a mismatch before sending', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(
        '*/api/v1/auth/password/reset/start',
        () => new HttpResponse(null, { status: 204 }),
      ),
      http.post('*/api/v1/auth/password/reset/complete', () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation.failed',
              messageKey: 'errors.validation.failed',
              message: 'Some information is not valid.',
              details: [
                {
                  path: 'code',
                  code: 'otp.invalid',
                  messageKey: 'errors.otp.invalid',
                  message: 'The code is incorrect.',
                },
              ],
              requestId: 'req_test',
            },
          },
          { status: 422 },
        ),
      ),
    );
    renderApp(<ResetForm />, 'en');
    await user.type(
      screen.getByRole('textbox', { name: /mobile number or email/i }),
      'a@example.org',
    );
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    // an empty field is asked for before anything is sent
    await user.click(await screen.findByRole('button', { name: 'Set new password' }));
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /Code/ })).toHaveAccessibleDescription(
        'Fill in this field.',
      ),
    );
    await user.type(screen.getByRole('textbox', { name: /Code/ }), '111111');
    await user.type(
      screen.getByLabelText(/^New password/, { selector: 'input' }),
      'Shapla phul 77',
    );
    await user.type(
      screen.getByLabelText(/^Confirm the new password/, { selector: 'input' }),
      'Shapla phul 78',
    );
    await user.click(screen.getByRole('button', { name: 'Set new password' }));
    expect(await screen.findByText('The two new passwords do not match.')).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/^Confirm the new password/, { selector: 'input' }));
    await user.type(
      screen.getByLabelText(/^Confirm the new password/, { selector: 'input' }),
      'Shapla phul 77',
    );
    await user.click(screen.getByRole('button', { name: 'Set new password' }));
    expect(await screen.findByText('The code is incorrect.')).toBeInTheDocument();
  });
});
