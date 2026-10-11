import { expectNoAxeViolations } from '@css/ui/testing';
import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../lib/api';
import { ChangePasswordView } from './ChangePasswordView';

// SCR-006 change password (AUTH.md 3).
beforeEach(() => {
  resetClientForTests();
  refreshAs(ME);
});

describe('ChangePasswordView', () => {
  it('shows the rules while typing, sends the change and confirms', async () => {
    const user = userEvent.setup();
    let body: unknown;
    server.use(
      http.post('*/api/v1/auth/password/change', async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { container } = renderApp(<ChangePasswordView />);
    const fresh = await screen.findByLabelText(/^নতুন পাসওয়ার্ড(?! আবার)/, { selector: 'input' });
    await user.type(
      screen.getByLabelText(/^বর্তমান পাসওয়ার্ড/, { selector: 'input' }),
      'Nadi kul 2026',
    );
    await user.type(fresh, 'Shapla phul 77');
    expect(screen.getByText('অন্তত 8টি অক্ষর')).toHaveAttribute('data-met', 'true');
    expect(screen.getByText('অন্তত একটি বর্ণ ও একটি অঙ্ক')).toHaveAttribute('data-met', 'true');
    await user.type(
      screen.getByLabelText(/^নতুন পাসওয়ার্ড আবার লিখুন/, { selector: 'input' }),
      'Shapla phul 77',
    );
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole('button', { name: 'পাসওয়ার্ড পরিবর্তন করুন' }));
    expect(await screen.findByText(/পাসওয়ার্ড বদলানো হয়েছে/)).toBeInTheDocument();
    expect(body).toEqual({ currentPassword: 'Nadi kul 2026', newPassword: 'Shapla phul 77' });
  });

  it('shows server rule failures on their field', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/auth/password/change', () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation.failed',
              messageKey: 'errors.validation.failed',
              message: 'Some information is not valid.',
              details: [
                {
                  path: 'currentPassword',
                  code: 'auth.current_password_invalid',
                  messageKey: 'errors.auth.current_password_invalid',
                  message: 'The current password is incorrect.',
                },
              ],
              requestId: 'req_test',
            },
          },
          { status: 422 },
        ),
      ),
    );
    renderApp(<ChangePasswordView />, 'en');
    await user.type(
      await screen.findByLabelText(/^Current password/, { selector: 'input' }),
      'wrong 123',
    );
    await user.type(
      screen.getByLabelText(/^New password/, { selector: 'input' }),
      'Shapla phul 77',
    );
    await user.type(
      screen.getByLabelText(/^Confirm the new password/, { selector: 'input' }),
      'Shapla phul 77',
    );
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('The current password is incorrect.')).toBeInTheDocument();
  });
});
