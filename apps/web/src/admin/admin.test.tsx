import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderInShell } from '../../test/auth';
import { resetClientForTests } from '../api/client';
import { AdminLayout, type AdminRouteHandle } from './AdminLayout';
import { stubScreen } from '../../test/match-media';

const HEAD: Me = { ...ME, displayName: 'ডিপার্টমেন্ট হেড (নমুনা)', roles: ['department_head'] };
const VOLUNTEER: Me = {
  ...ME,
  kind: 'volunteer',
  displayName: 'স্বেচ্ছাসেবক',
  roles: ['volunteer_general'],
};

const renderAdmin = (locale: 'bn' | 'en' = 'bn', path = '/admin/page') =>
  renderInShell(
    [
      {
        path: 'admin',
        element: <AdminLayout />,
        children: [
          { path: 'page', element: <h1>অ্যাডমিন পাতা</h1> },
          {
            path: 'everywhere',
            handle: { phoneReady: true } satisfies AdminRouteHandle,
            element: <h1>ফোনেও কাজের পাতা</h1>,
          },
        ],
      },
    ],
    path,
    locale,
  );

// the shell's sidebar, which these tests read, shows on a desktop screen
beforeEach(() => stubScreen());

beforeEach(() => {
  resetClientForTests();
});

// The admin area inside the app shell: management roles only; the API enforces every admin
// permission, the frame only decides what to show.
describe('admin area', () => {
  it('shows a Department Head an admin page inside the shell, without accessibility violations', async () => {
    refreshAs(HEAD);
    const { container } = renderAdmin();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'অ্যাডমিন পাতা' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'প্রধান মেনু' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'প্রোফাইল মেনু' })).toHaveTextContent(
      'ডিপার্টমেন্ট হেড (নমুনা)',
    );
    await expectNoAxeViolations(container);
  });

  it('renders in English', async () => {
    refreshAs({ ...ME, roles: ['monitoring_team'] });
    const { container } = renderAdmin('en');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'অ্যাডমিন পাতা' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main menu' })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('lets a Program Manager in (management audience)', async () => {
    refreshAs(ME);
    renderAdmin();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'অ্যাডমিন পাতা' }),
    ).toBeInTheDocument();
  });

  it('shows the tabs to an Official দায়ী and only the beneficiary tab to the Media Team', async () => {
    refreshAs({ ...ME, roles: ['official_daee'] });
    renderAdmin();
    const nav = await screen.findByRole('navigation', { name: 'প্রধান মেনু' });
    expect(within(nav).getByRole('link', { name: 'স্বেচ্ছাসেবক' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'উপকারভোগী' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'নিবন্ধন' })).not.toBeInTheDocument();
  });

  it('shows the Media Team the beneficiary tab and no volunteer tab', async () => {
    refreshAs({ ...ME, roles: ['media_team'] });
    renderAdmin();
    const nav = await screen.findByRole('navigation', { name: 'প্রধান মেনু' });
    expect(within(nav).getByRole('link', { name: 'উপকারভোগী' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'স্বেচ্ছাসেবক' })).not.toBeInTheDocument();
  });

  it('shows the forbidden content to a volunteer, whose menu holds no admin destination', async () => {
    refreshAs(VOLUNTEER);
    renderAdmin();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'প্রবেশাধিকার নেই' }),
    ).toBeInTheDocument();
    expect(screen.getByText('এই পাতায় আপনার প্রবেশাধিকার নেই।')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'প্রধান মেনু' });
    expect(
      within(nav)
        .getAllByRole('link')
        .filter((link) => link.getAttribute('href')?.startsWith('/admin')),
    ).toEqual([]);
    expect(screen.getByRole('link', { name: 'হোমে ফিরে যান' })).toHaveAttribute('href', '/');
  });

  it('sends a signed-out visitor to the login screen', async () => {
    refreshAs(null);
    const { router } = renderAdmin();
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });

  it('says on a phone that a setup page is best on a larger screen, and not on a page used on a phone as much', async () => {
    stubScreen(360);
    refreshAs(HEAD);
    const first = renderAdmin('bn', '/admin/page');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'অ্যাডমিন পাতা' }),
    ).toBeInTheDocument();
    expect(screen.getByText('এই পর্দা বড় স্ক্রিনে ভালো চলে।')).toBeInTheDocument();
    first.unmount();
    renderAdmin('bn', '/admin/everywhere');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'ফোনেও কাজের পাতা' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('এই পর্দা বড় স্ক্রিনে ভালো চলে।')).not.toBeInTheDocument();
  });
});
