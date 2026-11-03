// @vitest-environment jsdom
// What this app added to the asf shell (listed in local.json): the phone's tabs and the tablet's
// rail in place of the drawer, counts and the app's own "current" on the links, and the header's
// left side, the banner and the sidebar's foot.
import '@testing-library/jest-dom/vitest';

import type { ReactNode } from 'react';
import type { CompactNavProps, ExtendedNavGroup } from '@/ui/contract';

import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi, it, expect, describe, afterEach } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';

import { AppShell, BottomNav, UiProvider } from './index';
import { resetPage, stubMatchMedia, expectNoAxeViolations } from './local-test-support';

afterEach(() => {
  cleanup();
  resetPage();
});

/** A screen of the given width in pixels, light. */
function stubScreen(width: number) {
  stubMatchMedia((query) => {
    if (query.includes('dark')) return false;
    const min = /min-width:\s*([\d.]+)px/.exec(query);
    const max = /max-width:\s*([\d.]+)px/.exec(query);
    return (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]));
  });
}

const navigation: ExtendedNavGroup[] = [
  {
    title: 'Work',
    items: [
      { label: 'My work', to: '/', icon: 'home' },
      { label: 'Registrations', to: '/admin/registrations', icon: 'user-check', count: 3 },
      { label: 'Projects', to: '/admin/projects', icon: 'project', current: true, count: 140 },
    ],
  },
];

const onMore = vi.fn();
const compact: CompactNavProps = {
  label: 'Main',
  items: [
    { key: 'home', label: 'Home', to: '/', icon: 'home' },
    { key: 'projects', label: 'My projects', to: '/my-projects', icon: 'project', current: true, count: 2 },
  ],
  more: { label: 'More', onClick: onMore },
};

function renderShell(width: number, props: Partial<Parameters<typeof AppShell>[0]> = {}, children: ReactNode = <h1>Page</h1>) {
  stubScreen(width);
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <AppShell navigation={navigation} compactNav={compact} search={false} {...props}>
            {children}
          </AppShell>
        ),
      },
    ],
    { initialEntries: ['/admin/projects/7'] }
  );
  return render(
    <UiProvider>
      <RouterProvider router={router} />
    </UiProvider>
  );
}

describe('the shell on a wide screen', () => {
  it('shows the sidebar with counts in the link names and the current page marked', () => {
    renderShell(1280, { sidebarFooter: <p>Need help?</p> });
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Registrations, 3 pending' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Projects, 140 pending' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByText('99+')).toBeInTheDocument();
    expect(screen.getByText('Need help?')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open navigation' })).not.toBeInTheDocument();
  });

  it('keeps the counts and the current page in the folded sidebar', () => {
    window.localStorage.setItem('asf-nav-collapsed', '1');
    renderShell(1280);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Registrations, 3 pending' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Projects, 140 pending' })).toHaveAttribute('aria-current', 'page');
  });

  it('puts the header start, the banner and the page in place', () => {
    renderShell(1280, { headerStart: <nav aria-label="Breadcrumb">Work / Projects</nav>, banner: <p role="status">Offline</p> });
    expect(screen.getByRole('banner')).toContainElement(screen.getByRole('navigation', { name: 'Breadcrumb' }));
    expect(screen.getByRole('status')).toHaveTextContent('Offline');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
    expect(within(screen.getByRole('main')).getByRole('heading', { name: 'Page' })).toBeInTheDocument();
  });

  it('gives a person without a sidebar the rail', () => {
    renderShell(1280, { navigation: [] });
    const rail = screen.getByRole('navigation', { name: 'Main' });
    expect(rail).toHaveAttribute('data-variant', 'rail');
    expect(within(rail).getByRole('link', { name: 'My projects, 2 pending' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('the shell on smaller screens', () => {
  it('shows the rail on a tablet', () => {
    renderShell(800);
    expect(screen.getByRole('navigation', { name: 'Main' })).toHaveAttribute('data-variant', 'rail');
    expect(screen.queryByRole('link', { name: /Registrations/ })).not.toBeInTheDocument();
  });

  it('shows the tabs and "more" on a phone, with no drawer', async () => {
    const user = userEvent.setup();
    renderShell(360);
    const tabs = screen.getByRole('navigation', { name: 'Main' });
    expect(tabs).toHaveAttribute('data-variant', 'tabs');
    expect(within(tabs).getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open navigation' })).not.toBeInTheDocument();
    await user.click(within(tabs).getByRole('button', { name: 'More' }));
    expect(onMore).toHaveBeenCalledTimes(1);
  });

  it('keeps the drawer for an app without tabs', () => {
    renderShell(360, { compactNav: undefined });
    expect(screen.getByRole('button', { name: 'Open navigation' })).toBeInTheDocument();
  });
});

describe('the bottom navigation alone', () => {
  it('marks "more" current while one of its pages is open', () => {
    stubScreen(360);
    const router = createMemoryRouter([{ path: '*', element: <BottomNav variant="tabs" label="Main" items={compact.items} more={{ label: 'More', current: true, onClick: () => {} }} /> }]);
    render(
      <UiProvider>
        <RouterProvider router={router} />
      </UiProvider>
    );
    expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-current', 'page');
  });

  it.each([
    [1280, 'light'],
    [360, 'dark'],
  ] as const)('passes axe at %i px, %s', async (width, mode) => {
    window.localStorage.setItem('asf-mode', mode);
    const { container } = renderShell(width, { headerStart: <span>Trail</span>, banner: <p>Banner</p> });
    await expectNoAxeViolations(container);
  });
});
