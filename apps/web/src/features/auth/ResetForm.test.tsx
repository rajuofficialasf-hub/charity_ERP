import { expectNoAxeViolations } from '@/ui/testing';
import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../api/client';
import { ResetForm } from './ResetForm';

// SCR-001 password reset with the OTP step (AUTH.md 3).
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
    await user.click(screen.getByRole('button', { name: 'Set new password' }));
    expect(await screen.findByText(/The password has been changed/)).toBeInTheDocument();
    expect(bodies).toEqual([
      { loginId: '01700000101' },
      { loginId: '01700000101', code: '246810', newPassword: 'Shapla phul 77' },
    ]);
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
    await user.type(await screen.findByRole('textbox', { name: /Code/ }), '111111');
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
