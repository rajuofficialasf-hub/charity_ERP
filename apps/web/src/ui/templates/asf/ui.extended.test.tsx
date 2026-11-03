// @vitest-environment jsdom
// A template against the extended set of the UI contract (UiTemplateExtended): the shell's nested
// navigation and search, page breadcrumbs, tabs, pagination, display pieces, overlays, public-page
// pieces and translated labels. It checks behaviour and accessible names only, so the same file
// runs unchanged in every template that implements the extended set (asf, bare). Keep the copies
// identical.
import '@testing-library/jest-dom/vitest';

import type { ReactNode } from 'react';

import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { it, expect, describe, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';

import {
  Card,
  Chip,
  Hero,
  Page,
  Tabs,
  Avatar,
  Drawer,
  Section,
  AppShell,
  Carousel,
  LinkTile,
  StatCard,
  DataTable,
  DateField,
  FilterBar,
  MediaCard,
  UiProvider,
  ColorModeButton,
  AccountMenu,
  CalloutBand,
  FeatureList,
  PublicShell,
  ProgressStat,
  SummaryBanner,
  LanguageSwitch,
  DescriptionList,
} from './index';

// ----------------------------------------------------------------------

beforeAll(() => {
  window.matchMedia ??= (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) satisfies MediaQueryList;
  window.scrollTo = () => {};
  Element.prototype.scrollBy ??= () => {};
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

/** Renders `ui` at `path` inside the provider, with a second route to land on after a navigation. */
function renderInApp(ui: ReactNode, { path = '/', labels }: { path?: string; labels?: Parameters<typeof UiProvider>[0]['labels'] } = {}) {
  const router = createMemoryRouter(
    [
      { path: '/leave/apply', element: <h1>Apply for leave</h1> },
      { path: '*', element: ui },
    ],
    { initialEntries: [path] }
  );
  return render(
    <UiProvider labels={labels}>
      <RouterProvider router={router} />
    </UiProvider>
  );
}

const navigation = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', to: '/', icon: 'dashboard' as const },
      {
        label: 'Leave',
        icon: 'leave' as const,
        children: [
          { label: 'My leave', to: '/leave' },
          { label: 'Apply for leave', to: '/leave/apply' },
        ],
      },
    ],
  },
];

// ----------------------------------------------------------------------

describe('shell and page', () => {
  it('shows the brand, and a parent opens its children', async () => {
    const user = userEvent.setup();
    renderInApp(
      <AppShell navigation={navigation} brand={{ name: 'ASF HRIS', tagline: 'Human resources' }}>
        <Page title="Dashboard">Hello</Page>
      </AppShell>
    );

    await user.click(await screen.findByRole('button', { name: 'Open navigation' }));
    expect((await screen.findAllByText('ASF HRIS')).length).toBeGreaterThan(0);
    const parent = await screen.findByRole('button', { name: /Leave/ });
    if (parent.getAttribute('aria-expanded') !== 'true') await user.click(parent);
    expect(parent).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByRole('link', { name: 'Apply for leave' })).toHaveAttribute('href', '/leave/apply');
  });

  it('finds a page with Ctrl+K and goes there', async () => {
    const user = userEvent.setup();
    renderInApp(
      <AppShell navigation={navigation}>
        <Page title="Dashboard">Hello</Page>
      </AppShell>
    );

    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    await user.keyboard('{Control>}k{/Control}');
    const dialog = await screen.findByRole('dialog');
    await user.keyboard('apply');
    expect(within(dialog).getByText('Apply for leave')).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { level: 1, name: 'Apply for leave' })).toBeInTheDocument();
  });

  it('marks the current page in the breadcrumbs and links back', async () => {
    renderInApp(
      <Page
        title="Apply for leave"
        back={{ label: 'Back', to: '/leave' }}
        breadcrumbs={[{ label: 'Leave', to: '/leave' }, { label: 'Apply' }]}
      />
    );

    const trail = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    expect(within(trail).getByRole('link', { name: 'Leave' })).toHaveAttribute('href', '/leave');
    expect(within(trail).getByText('Apply').closest('[aria-current="page"]')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/leave');
  });

  it('shows the labels the app passes in place of the English ones', async () => {
    renderInApp(
      <AppShell navigation={navigation}>
        <Page title="Dashboard" />
      </AppShell>,
      { labels: { openNavigation: 'মেনু খুলুন' } }
    );

    expect(await screen.findByRole('button', { name: 'মেনু খুলুন' })).toBeInTheDocument();
  });
});

// ----------------------------------------------------------------------

describe('tabs', () => {
  const items = [
    { value: 'overview', label: 'Overview', content: <p>Personal information</p> },
    { value: 'bank', label: 'Bank', content: <p>Bank details</p> },
  ];

  it('shows one panel at a time and switches on click', async () => {
    const user = userEvent.setup();
    renderInApp(<Tabs label="Profile sections" items={items} />);

    const list = await screen.findByRole('tablist', { name: 'Profile sections' });
    expect(within(list).getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Personal information');

    await user.click(within(list).getByRole('tab', { name: 'Bank' }));
    expect(within(list).getByRole('tab', { name: 'Bank' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Bank details');
  });

  it('follows `value` and reports changes when controlled', async () => {
    const user = userEvent.setup();
    const changes: string[] = [];
    renderInApp(<Tabs label="Views" variant="segmented" items={items} value="bank" onChange={(v) => changes.push(v)} />);

    expect(await screen.findByRole('tab', { name: 'Bank' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Overview' }));
    expect(changes).toEqual(['overview']);
    expect(screen.getByRole('tab', { name: 'Bank' })).toHaveAttribute('aria-selected', 'true');
  });
});

// ----------------------------------------------------------------------

type Day = { id: string; date: string };

describe('data', () => {
  it('pages through a framed table with a title, filters and actions', async () => {
    const user = userEvent.setup();
    const pages: number[] = [];
    renderInApp(
      <DataTable<Day>
        label="Attendance history"
        title="Attendance history"
        actions={<button type="button">Export</button>}
        toolbar={
          <FilterBar>
            <input aria-label="From date" />
          </FilterBar>
        }
        rows={[{ id: 'd1', date: '25 Oct 2026' }]}
        columns={[{ id: 'date', header: 'Date', cell: (row) => row.date }]}
        getRowId={(row) => row.id}
        pagination={{ page: 1, pageSize: 10, total: 42, onPageChange: (p) => pages.push(p) }}
      />
    );

    expect(await screen.findByRole('table', { name: 'Attendance history' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Attendance history' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Filters' })).getByRole('textbox', { name: 'From date' })).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(pages).toEqual([2]);
  });

  it('lists label and value pairs and fills empty values', async () => {
    renderInApp(
      <DescriptionList
        items={[
          { label: 'Department', value: 'Software Development' },
          { label: 'Blood group', value: '' },
        ]}
      />
    );

    expect(await screen.findByText('Software Development')).toBeInTheDocument();
    expect(screen.getByText('Blood group')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders cards, chips, avatars and figures', async () => {
    renderInApp(
      <>
        <Card title="Leave balance" headingLevel={3} action={<a href="/leave">View all</a>}>
          <Chip tone="success">Approved</Chip>
        </Card>
        <Avatar name="Abdullah Rahman" />
        <Avatar name="Hidden Name" decorative />
        <StatCard label="Present days" value={18} icon="check" tone="success" variant="tinted" />
        <ProgressStat label="On time" value="92%" percent={92.4} />
        <SummaryBanner
          title="Abdullah Rahman"
          subtitle="Developer"
          avatar={{ name: 'Abdullah Rahman' }}
          items={[{ label: "Today's status", value: 'Present', tone: 'success' }]}
        />
      </>
    );

    expect(await screen.findByRole('heading', { level: 3, name: 'Leave balance' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View all' })).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Abdullah Rahman' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Hidden Name' })).not.toBeInTheDocument();
    expect(screen.getByText('Present days')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'On time' })).toHaveAttribute('aria-valuenow', '92');
    expect(screen.getByRole('heading', { name: 'Abdullah Rahman' })).toBeInTheDocument();
    expect(screen.getByText('Present')).toBeInTheDocument();
  });

  it('shows a date field with its label and error', async () => {
    renderInApp(<DateField label="Start date" value="" onChange={() => {}} error="Choose a start date" />);

    expect((await screen.findAllByText('Start date')).length).toBeGreaterThan(0);
    expect(screen.getByText('Choose a start date')).toBeInTheDocument();
  });
});

// ----------------------------------------------------------------------

describe('overlays', () => {
  it('opens a drawer named by its title and closes it', async () => {
    const user = userEvent.setup();
    let closed = 0;
    renderInApp(
      <Drawer open onClose={() => (closed += 1)} title="Leave details">
        <p>Casual leave</p>
      </Drawer>
    );

    const drawer = await screen.findByRole('dialog', { name: 'Leave details' });
    expect(within(drawer).getByText('Casual leave')).toBeInTheDocument();
    await user.click(within(drawer).getByRole('button', { name: 'Close' }));
    expect(closed).toBe(1);
  });

  it("opens the account panel and signs out", async () => {
    const user = userEvent.setup();
    let signedOut = 0;
    renderInApp(
      <AccountMenu
        user={{ name: 'Abdullah Rahman', email: 'abdullah@example.org' }}
        links={[{ label: 'Profile', to: '/profile', icon: 'user' }]}
        onSignOut={() => (signedOut += 1)}
      />
    );

    await user.click(await screen.findByRole('button', { name: 'Abdullah Rahman' }));
    expect(await screen.findByText('abdullah@example.org')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/profile');
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signedOut).toBe(1);
  });
});

// ----------------------------------------------------------------------

describe('public pages', () => {
  it('frames a public page with navigation, hero, sections and footer', async () => {
    const user = userEvent.setup();
    const languages: string[] = [];
    renderInApp(
      <PublicShell
        brand={{ name: 'As-Sunnah Foundation' }}
        navigation={[
          { label: 'Home', to: '/' },
          { label: 'About', to: '/about' },
        ]}
        actions={
          <LanguageSwitch
            label="Language"
            value="bn"
            options={[
              { value: 'bn', label: 'বাং' },
              { value: 'en', label: 'EN' },
            ]}
            onChange={(v) => languages.push(v)}
          />
        }
        footer={{ columns: [{ title: 'Menu', links: [{ label: 'Blog', to: '/blog' }] }], copyright: '© 2026 As-Sunnah Foundation' }}
      >
        <Hero title="As-Sunnah Foundation" description="Education, service and dawah." />
        <Section title="Ongoing activities">
          <FeatureList items={[{ icon: 'education', title: 'Education', description: 'Schools and madrasas.' }]} />
        </Section>
      </PublicShell>
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'As-Sunnah Foundation' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Ongoing activities' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Education' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Blog' })).toHaveAttribute('href', '/blog');
    expect(screen.getByText('© 2026 As-Sunnah Foundation')).toBeInTheDocument();

    const switcher = screen.getByRole('group', { name: 'Language' });
    expect(within(switcher).getByRole('button', { name: 'বাং' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(switcher).getByRole('button', { name: 'EN' }));
    expect(languages).toEqual(['en']);
  });

  it('renders cards in a carousel, link tiles and a callout band', async () => {
    renderInApp(
      <>
        <Carousel label="Funds">
          <MediaCard image={{ src: '/a.jpg', alt: '' }} title="Flood relief" category="Relief" to="/funds/flood" />
          <MediaCard image={{ src: '/b.jpg', alt: '' }} title="Mosque complex" headingLevel={4} />
        </Carousel>
        <LinkTile to="/volunteer" label="Volunteer" icon="hand-heart" tone="warning" />
        <CalloutBand title="Get the newsletter">
          <input aria-label="Email" />
        </CalloutBand>
      </>
    );

    const carousel = await screen.findByRole('region', { name: 'Funds' });
    expect(within(carousel).getByRole('link', { name: 'Flood relief' })).toHaveAttribute('href', '/funds/flood');
    expect(within(carousel).getByRole('heading', { level: 4, name: 'Mosque complex' })).toBeInTheDocument();
    expect(within(carousel).getByRole('button', { name: 'Next' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volunteer' })).toHaveAttribute('href', '/volunteer');
    expect(screen.getByRole('heading', { name: 'Get the newsletter' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Email' })).toBeInTheDocument());
  });
});

// Pieces this app added to the extended set (see local.json).
describe('colour mode', () => {
  it('follows the device until the person picks dark, and keeps that choice', async () => {
    const user = userEvent.setup();
    renderInApp(<ColorModeButton />);
    const toDark = screen.getByRole('button', { name: 'Switch to dark mode' });
    await user.click(toDark);
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-color-scheme', 'dark'));
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument();
    expect(window.localStorage.getItem('asf-mode')).toBe('dark');
  });
});
