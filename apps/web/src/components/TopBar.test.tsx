import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { ME, refreshAs, renderApp } from '../../test/auth';
import { server } from '../../test/msw/server';
import { resetClientForTests } from '../lib/api';
import { TopBar } from './TopBar';

describe('TopBar (UX-19)', () => {
  beforeEach(() => {
    resetClientForTests();
    refreshAs(null);
  });

  it('shows the system name at the start and the language toggle at the end', async () => {
    const { container } = renderApp(<TopBar />, 'en');
    const bar = screen.getByRole('banner');
    expect(bar.firstElementChild).toHaveAttribute('href', '/');
    expect(within(bar).getByRole('group', { name: 'Language' })).toBe(
      bar.lastElementChild?.lastElementChild,
    );
    // signed out: no bell
    expect(within(bar).queryByRole('link', { name: /Notifications/ })).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('shows the bell with the unread count to a signed-in user, and hides the count at 0', async () => {
    refreshAs(ME);
    const count = 3;
    server.use(
      http.get('*/api/v1/notifications/unread-count', () =>
        HttpResponse.json({ data: { count }, meta: {} }),
      ),
    );
    const { container } = renderApp(<TopBar />, 'en');
    const bell = await screen.findByRole('link', { name: 'Notifications, 3 unread' });
    expect(bell).toHaveAttribute('href', '/notifications');
    expect(screen.getByText('3')).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('shows no number on the bell when nothing is unread', async () => {
    refreshAs(ME);
    renderApp(<TopBar />, 'en');
    expect(await screen.findByRole('link', { name: 'Notifications' })).toBeInTheDocument();
    expect(document.querySelector('.notification-count')).toBeNull();
  });

  it('can leave the name out when the page shows it itself', () => {
    renderApp(<TopBar showBrand={false} />, 'en');
    const bar = screen.getByRole('banner');
    expect(within(bar).queryByRole('link')).not.toBeInTheDocument();
    expect(within(bar).getByRole('group', { name: 'Language' })).toBeInTheDocument();
  });
});
