import type { DeviceSession } from '@css/shared/auth';
import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../lib/api';
import { SessionsView } from './SessionsView';

// SCR-006 my devices (AUTH.md 8).
const session = (over: Partial<DeviceSession>): DeviceSession => ({
  id: '0190a1b2-0000-7000-8000-000000000001',
  deviceName: 'Chrome · Android',
  platform: 'android',
  appVersion: '1.0.0',
  createdAt: '2026-10-11T04:00:00.000Z',
  lastSeenAt: '2026-10-11T10:40:00.000Z',
  current: false,
  revokedAt: null,
  pendingCount: null,
  pendingReportedAt: null,
  ...over,
});

beforeEach(() => {
  resetClientForTests();
});

describe('SessionsView', () => {
  it('lists devices with the current one marked and logs out another after confirming', async () => {
    refreshAs(ME);
    const user = userEvent.setup();
    let list = [
      session({ id: 'a', deviceName: 'Edge · Windows', platform: 'desktop', current: true }),
      session({ id: 'b' }),
    ];
    const revoked: string[] = [];
    server.use(
      http.get('*/api/v1/sessions', () => HttpResponse.json({ data: list, meta: {} })),
      http.post('*/api/v1/sessions/:id/revoke', ({ params }) => {
        revoked.push(String(params.id));
        list = list.filter((s) => s.id !== params.id);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { container } = renderApp(<SessionsView />, 'en');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'My devices' }),
    ).toBeInTheDocument();
    expect(screen.getByText('My account')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: "If you see a device you don't know" }),
    ).toBeInTheDocument();
    const current = (await screen.findByRole('heading', { name: 'Edge · Windows' })).closest(
      'section, article, div',
    )!;
    expect(
      within(current as HTMLElement).queryByRole('button', { name: 'Log out this device' }),
    ).toBeNull();
    expect(screen.getByText('This device')).toBeInTheDocument();
    expect(screen.getAllByText(/Last active: 11-10-2026 4:40 PM/).length).toBeGreaterThan(0);
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole('button', { name: 'Log out this device' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Log out this device?' });
    await user.click(within(dialog).getByRole('button', { name: 'Log out the device' }));
    expect(await screen.findByText('The device has been logged out.')).toBeInTheDocument();
    expect(revoked).toEqual(['b']);
    await waitFor(() => expect(screen.queryByText('Chrome · Android')).toBeNull());
  });

  it('shows what a device still holds, in the list and before logging it out', async () => {
    refreshAs(ME);
    const user = userEvent.setup();
    server.use(
      http.get('*/api/v1/sessions', () =>
        HttpResponse.json({
          data: [
            session({ id: 'a', deviceName: 'Edge · Windows', platform: 'desktop', current: true }),
            session({
              id: 'b',
              pendingCount: 3,
              pendingReportedAt: '2026-10-11T09:30:00.000Z',
            }),
          ],
          meta: {},
        }),
      ),
    );
    renderApp(<SessionsView />, 'en');
    expect(
      await screen.findByText('3 records not yet sent (as of 11-10-2026 3:30 PM)'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Log out this device' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Log out this device?' });
    expect(dialog).toHaveTextContent('The 3 records not yet sent from this device will be lost.');
  });

  it('sends a signed-out visitor to the login screen', async () => {
    refreshAs(null);
    const { router } = renderApp(<SessionsView />, 'bn', { path: '/account/sessions' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });
});
