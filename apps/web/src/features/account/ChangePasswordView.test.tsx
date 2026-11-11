import { expectNoAxeViolations } from '@/ui/testing';
import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, pair, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../api/client';
import { ChangePasswordView } from './ChangePasswordView';
import { MyWorkPage } from '../home/MyWorkPage';

// The screen "My profile, edit request, device sessions, language" of docs/ui/SCREENS.md
// (docs/architecture/AUTH.md, "Password rules").
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
    expect(screen.getByText('আমার অ্যাকাউন্ট')).toBeInTheDocument();
    // the tip beside the form leads to the devices the change logs out
    expect(
      screen.getByRole('heading', { level: 2, name: 'নিরাপত্তার পরামর্শ' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'আমার ডিভাইস দেখুন' })).toHaveAttribute(
      'href',
      '/account/sessions',
    );
    await user.type(
      screen.getByLabelText(/^বর্তমান পাসওয়ার্ড/, { selector: 'input' }),
      'Nadi kul 2026',
    );
    await user.type(fresh, 'Shapla phul 77');
    for (const rule of ['অন্তত 8টি অক্ষর', 'একটি বড় হাতের অক্ষর (A-Z)', 'একটি সংখ্যা (0-9)'])
      expect(screen.getByText(rule).closest('li')).toHaveAttribute('data-met', 'true');
    await user.type(
      screen.getByLabelText(/^নতুন পাসওয়ার্ড আবার লিখুন/, { selector: 'input' }),
      'Shapla phul 77',
    );
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole('button', { name: 'পাসওয়ার্ড পরিবর্তন করুন' }));
    expect(await screen.findByText(/পাসওয়ার্ড বদলানো হয়েছে/)).toBeInTheDocument();
    expect(body).toEqual({ currentPassword: 'Nadi kul 2026', newPassword: 'Shapla phul 77' });
  }, 15_000);

  it('asks a Department Head for 12 characters and does not tick the length at 10', async () => {
    const user = userEvent.setup();
    refreshAs({ ...ME, roles: ['department_head'] });
    renderApp(<ChangePasswordView />, 'en');
    const fresh = await screen.findByLabelText(/^New password(?! again)/, { selector: 'input' });
    await user.type(fresh, 'Shapla phul');
    const length = screen.getByText('At least 12 characters').closest('li');
    expect(length).toHaveAttribute('data-met', 'false');
    await user.type(fresh, '7');
    expect(length).toHaveAttribute('data-met', 'true');
  }, 15_000);

  it('keeps the autocomplete hints, asks for a match before sending, and stores nothing typed', async () => {
    const user = userEvent.setup();
    const bodies: unknown[] = [];
    server.use(
      http.post('*/api/v1/auth/password/change', async ({ request }) => {
        bodies.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp(<ChangePasswordView />, 'en');
    const current = await screen.findByLabelText(/^Current password/, { selector: 'input' });
    const fresh = screen.getByLabelText(/^New password/, { selector: 'input' });
    const again = screen.getByLabelText(/^Confirm the new password/, { selector: 'input' });
    expect(current).toHaveAttribute('autocomplete', 'current-password');
    expect(fresh).toHaveAttribute('autocomplete', 'new-password');
    expect(again).toHaveAttribute('autocomplete', 'new-password');
    await user.type(current, 'Nadi kul 2026');
    await user.type(fresh, 'Shapla phul 77');
    await user.type(again, 'Shapla phul 78');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('The two new passwords do not match.')).toBeInTheDocument();
    expect(bodies).toEqual([]);
    await user.clear(again);
    await user.type(again, 'Shapla phul 77');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText(/password has been changed/i)).toBeInTheDocument();
    expect(bodies).toEqual([{ currentPassword: 'Nadi kul 2026', newPassword: 'Shapla phul 77' }]);
    // the fields are emptied and nothing typed is kept in the browser's storage
    expect(fresh).toHaveValue('');
    for (const storage of [window.localStorage, window.sessionStorage])
      for (let i = 0; i < storage.length; i++)
        for (const secret of ['Nadi kul 2026', 'Shapla phul 77'])
          expect(storage.getItem(storage.key(i) ?? '')).not.toContain(secret);
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

  describe('when a new password is due (a global role was approved)', () => {
    const DUE = { ...ME, roles: ['monitoring_team'], passwordChangeRequired: true };

    it('sends a signed-in user from another page to the password screen', async () => {
      refreshAs(DUE);
      renderApp(<MyWorkPage />, 'en');
      expect(await screen.findByTestId('location')).toHaveTextContent('/account/password');
    });

    it('says why, asks 12 characters, and after the change shows the home page', async () => {
      const user = userEvent.setup();
      refreshAs(DUE);
      let changed = false;
      server.use(
        http.post('*/api/v1/auth/password/change', () => {
          changed = true;
          return new HttpResponse(null, { status: 204 });
        }),
        // the session read after the change no longer has the flag
        http.post('*/api/v1/auth/refresh', () =>
          HttpResponse.json({
            data: pair(changed ? { ...DUE, passwordChangeRequired: false } : DUE),
            meta: {},
          }),
        ),
      );
      renderApp(<ChangePasswordView />, 'en', { path: '/account/password' });
      expect(
        await screen.findByText(/Your role needs a new password of at least 12 characters/),
      ).toBeInTheDocument();
      expect(screen.getByText('At least 12 characters')).toBeInTheDocument();
      await user.type(
        screen.getByLabelText(/^Current password/, { selector: 'input' }),
        'Nadi kul 2026',
      );
      await user.type(
        screen.getByLabelText(/^New password/, { selector: 'input' }),
        'Shapla phul 2026',
      );
      await user.type(
        screen.getByLabelText(/^Confirm the new password/, { selector: 'input' }),
        'Shapla phul 2026',
      );
      await user.click(screen.getByRole('button', { name: 'Change password' }));
      expect(await screen.findByTestId('location')).toHaveTextContent(/^\/$/);
    }, 30_000);
  });
});
