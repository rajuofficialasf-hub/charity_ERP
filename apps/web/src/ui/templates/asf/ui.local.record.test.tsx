// @vitest-environment jsdom
// The record header and the link tabs this app added to the asf template (listed in local.json):
// the head of a record's page with its picture, state, facts, description and actions, and a row
// of tabs that are links to the record's pages.
import '@testing-library/jest-dom/vitest';

import type { ReactNode } from 'react';

import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { it, expect, describe, afterEach, beforeEach } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';

import { resetPage, stubWidth, expectNoAxeViolations } from './local-test-support';
import { Chip, Button, LinkTabs, UiProvider, RecordHeader } from './index';

beforeEach(() => stubWidth(false));

afterEach(() => {
  cleanup();
  resetPage();
});

function renderInApp(ui: ReactNode, at = '/projects/7') {
  const router = createMemoryRouter(
    [
      { path: '/projects/7/applications', element: <h2>Applications page</h2> },
      { path: '*', element: ui },
    ],
    { initialEntries: [at] }
  );
  return render(
    <UiProvider>
      <RouterProvider router={router} />
    </UiProvider>
  );
}

const FACTS = [
  { id: 'session', label: 'সেশন', value: '2025', icon: 'calendar' as const },
  { id: 'code', label: 'কোড', value: 'WNT', icon: 'hash' as const },
  { id: 'program', label: 'প্রোগ্রাম', value: 'হিউম্যানিটেরিয়ান প্রোগ্রাম' },
];

function Header({ compact = false }: { compact?: boolean }) {
  return (
    <RecordHeader
      title="শীতবস্ত্র বিতরণ 2025"
      media={<svg data-testid="cover" />}
      status={<Chip tone="warning">বন্ধ হচ্ছে</Chip>}
      facts={FACTS}
      description="শীতকালে অসহায় মানুষের মাঝে শীতবস্ত্র বিতরণ।"
      actions={<Button variant="secondary">সম্পাদনা</Button>}
      actionsLabel="প্রকল্পের কাজ"
      compact={compact}
      footer={<p>tabs here</p>}
    />
  );
}

describe('the record header', () => {
  it('names the record as the page heading, beside its state, facts, description and actions', async () => {
    const { container } = render(
      <UiProvider>
        <Header />
      </UiProvider>
    );
    expect(screen.getByRole('heading', { level: 1, name: 'শীতবস্ত্র বিতরণ 2025' })).toBeInTheDocument();
    expect(screen.getByText('বন্ধ হচ্ছে')).toBeInTheDocument();
    // each fact is read with its label, though only the value shows
    const facts = screen.getByRole('list');
    expect(within(facts).getAllByRole('listitem')).toHaveLength(3);
    expect(facts).toHaveTextContent('সেশন: 2025');
    expect(facts).toHaveTextContent('কোড: WNT');
    expect(screen.getByText('শীতকালে অসহায় মানুষের মাঝে শীতবস্ত্র বিতরণ।')).toBeInTheDocument();
    const actions = screen.getByRole('region', { name: 'প্রকল্পের কাজ' });
    expect(within(actions).getByRole('button', { name: 'সম্পাদনা' })).toBeInTheDocument();
    // the picture stands beside the name, so it is hidden from screen readers
    expect(screen.getByTestId('cover').closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByText('tabs here')).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('keeps the name, the state and the actions in its compact form, without the description', () => {
    render(
      <UiProvider>
        <Header compact />
      </UiProvider>
    );
    expect(screen.getByRole('heading', { level: 1, name: 'শীতবস্ত্র বিতরণ 2025' })).toBeInTheDocument();
    expect(screen.getByText('বন্ধ হচ্ছে')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'সম্পাদনা' })).toBeInTheDocument();
    expect(screen.queryByText('শীতকালে অসহায় মানুষের মাঝে শীতবস্ত্র বিতরণ।')).not.toBeInTheDocument();
  });

  it('draws no empty picture box and no fact list when it has neither', () => {
    const { container } = render(
      <UiProvider>
        <RecordHeader title="নতুন প্রকল্প" headingLevel={2} />
      </UiProvider>
    );
    expect(screen.getByRole('heading', { level: 2, name: 'নতুন প্রকল্প' })).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});

const TABS = [
  { to: '/projects/7', label: 'সারসংক্ষেপ', icon: 'home' as const, current: true },
  { to: '/projects/7/applications', label: 'আবেদন', icon: 'clipboard' as const },
  { to: '/projects/7/reports', label: 'রিপোর্ট' },
];

describe('the link tabs', () => {
  it('lists the record’s pages as links in a named navigation, the current one marked', async () => {
    const { container } = renderInApp(<LinkTabs label="প্রকল্পের অংশ" items={TABS} />);
    const nav = screen.getByRole('navigation', { name: 'প্রকল্পের অংশ' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['সারসংক্ষেপ', 'আবেদন', 'রিপোর্ট']);
    expect(within(nav).getByRole('link', { name: 'সারসংক্ষেপ' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'আবেদন' })).not.toHaveAttribute('aria-current');
    expect(within(nav).getByRole('link', { name: 'আবেদন' })).toHaveAttribute('href', '/projects/7/applications');
    await expectNoAxeViolations(container);
  });

  it('opens a tab’s page by the keyboard', async () => {
    const user = userEvent.setup();
    renderInApp(<LinkTabs label="প্রকল্পের অংশ" items={TABS} />);
    await user.tab();
    expect(screen.getByRole('link', { name: 'সারসংক্ষেপ' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'আবেদন' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: 'Applications page' })).toBeInTheDocument();
  });
});
