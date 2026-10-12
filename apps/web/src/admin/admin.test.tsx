import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../test/auth';
import { HomeView } from '../features/account/HomeView';
import { resetClientForTests } from '../lib/api';
import { AdminLayout } from './AdminLayout';
import { DashboardPage } from './DashboardPage';

const HEAD: Me = { ...ME, displayName: 'ডিপার্টমেন্ট হেড (নমুনা)', roles: ['department_head'] };
const VOLUNTEER: Me = {
  ...ME,
  kind: 'volunteer',
  displayName: 'স্বেচ্ছাসেবক',
  roles: ['volunteer_general'],
};

const renderAdmin = (locale: 'bn' | 'en' = 'bn') =>
  renderApp(<AdminLayout />, locale, {
    path: '/admin',
    children: [{ index: true, element: <DashboardPage /> }],
  });

beforeEach(() => {
  resetClientForTests();
});

// Admin area shell on packages/ui (UX-15, plan U11): management roles only; the API enforces
// every admin permission, the shell only decides what to show (RE-SEC-05).
describe('admin area', () => {
  it('shows a Department Head the shell with the dashboard, without accessibility violations', async () => {
    refreshAs(HEAD);
    const { container } = renderAdmin();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'ড্যাশবোর্ড' }),
    ).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'অ্যাডমিন মেনু' });
    expect(within(nav).getByRole('link', { name: 'ড্যাশবোর্ড' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByText('লগইন করা: ডিপার্টমেন্ট হেড (নমুনা)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'লগআউট' })).toBeInTheDocument();
    // dates in English digits through the shared formatter (UX-05)
    expect(screen.getByText(/^আজ: \d{2}-\d{2}-\d{4}$/)).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('renders the shell in English', async () => {
    refreshAs({ ...ME, roles: ['monitoring_team'] });
    const { container } = renderAdmin('en');
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Admin menu' })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('lets a Program Manager in (management audience)', async () => {
    refreshAs(ME);
    renderAdmin();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'ড্যাশবোর্ড' }),
    ).toBeInTheDocument();
  });

  it('shows the forbidden screen to a volunteer, without the admin menu', async () => {
    refreshAs(VOLUNTEER);
    renderAdmin();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'প্রবেশাধিকার নেই' }),
    ).toBeInTheDocument();
    expect(screen.getByText('এই পাতায় আপনার প্রবেশাধিকার নেই।')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'অ্যাডমিন মেনু' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'হোমে ফিরে যান' })).toHaveAttribute('href', '/');
  });

  it('sends a signed-out visitor to the login screen', async () => {
    refreshAs(null);
    const { router } = renderAdmin();
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });
});

describe('admin link on the home page', () => {
  it('is offered to the management roles', async () => {
    refreshAs(HEAD);
    renderApp(<HomeView />);
    expect(await screen.findByRole('link', { name: 'অ্যাডমিন' })).toHaveAttribute('href', '/admin');
  });

  it('is not offered to a volunteer', async () => {
    refreshAs(VOLUNTEER);
    renderApp(<HomeView />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('link', { name: 'অ্যাডমিন' })).not.toBeInTheDocument();
  });
});
