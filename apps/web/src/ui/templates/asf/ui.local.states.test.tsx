// @vitest-environment jsdom
// The state, count and list pieces this app added to the asf template (listed in local.json): the
// status chip, the counts that filter a list, the offline banner, the disclosure, the choice tiles,
// the bulk rows, the attention card, the figure card as a link, the summary banner's figures, the
// alert that can be put away, the tabs with their counts, the icon button and the small button.
import '@testing-library/jest-dom/vitest';

import type { ReactNode } from 'react';

import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi, it, expect, describe, afterEach, beforeEach } from 'vitest';
import { act, render, screen, within, cleanup, fireEvent } from '@testing-library/react';

import { resetPage, stubWidth, expectNoAxeViolations } from './local-test-support';
import { Button, BulkRow, BulkList, Disclosure, IconButton, UiProvider, StatusChip, ChoiceTiles, AttentionCard, OfflineBanner, StatFilterBar, StatCard, SummaryBanner, Alert, Tabs } from './index';

beforeEach(() => stubWidth(false));

afterEach(() => {
  cleanup();
  resetPage();
});

function renderInApp(ui: ReactNode) {
  const router = createMemoryRouter(
    [
      { path: '/applications', element: <h1>Applications to review</h1> },
      { path: '*', element: ui },
    ],
    { initialEntries: ['/'] }
  );
  return render(
    <UiProvider>
      <RouterProvider router={router} />
    </UiProvider>
  );
}

describe('the status chip', () => {
  it('shows its words with an icon, never the colour alone', () => {
    const { container } = render(
      <UiProvider>
        <StatusChip status="approved" label="Approved" />
      </UiProvider>
    );
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(container.firstElementChild).toHaveAttribute('data-status', 'approved');
  });
});

describe('the counts that filter a list', () => {
  const items = [
    { id: 'all', label: 'All', value: 1240, icon: 'users' as const },
    { id: 'pending', label: 'Pending', value: 12, icon: 'hourglass' as const, tone: 'warning' as const },
    { id: 'total_year', label: 'This year', value: 300, icon: 'calendar' as const, selectable: false },
    { id: 'blocked', label: 'Blocked', value: 4, icon: 'shield' as const, tone: 'error' as const },
  ];

  it('holds the places of the cards while the first counts load', () => {
    render(
      <UiProvider>
        <StatFilterBar label="Beneficiary counts" items={[]} loading moreLabel="More" moreValue={(hidden) => `${hidden} more`} />
      </UiProvider>
    );
    const group = screen.getByRole('group', { name: 'Beneficiary counts' });
    expect(group).toHaveAttribute('aria-busy', 'true');
    expect(group.children).toHaveLength(4);
    expect(within(group).queryByRole('button')).not.toBeInTheDocument();
  });

  it("writes the counts in the grouping of the app's number locale", () => {
    render(
      <UiProvider labels={{ numberLocale: 'en-IN-u-nu-latn' }}>
        <StatFilterBar label="Beneficiary counts" items={[{ id: 'all', label: 'All', value: 2000000, icon: 'users' }]} moreLabel="More" moreValue={(hidden) => `${hidden} more`} />
      </UiProvider>
    );
    expect(screen.getByText('20,00,000')).toBeInTheDocument();
  });

  it('presses the chosen count and reports a new choice', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <UiProvider>
        <StatFilterBar label="Volunteer counts" items={items} selectedId="all" onSelect={onSelect} moreLabel="More" moreValue={(hidden) => `${hidden} more`} />
      </UiProvider>
    );
    const group = screen.getByRole('group', { name: 'Volunteer counts' });
    expect(within(group).getByRole('button', { name: 'All 1,240' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(group).getByRole('button', { name: 'Pending 12' }));
    expect(onSelect).toHaveBeenCalledWith('pending');
    expect(within(group).queryByRole('button', { name: /This year/ })).not.toBeInTheDocument();
    expect(within(group).getByText('This year')).toBeInTheDocument();
  });

  it('puts the counts past the visible ones behind a last card', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <UiProvider>
        <StatFilterBar label="Counts" items={items} visible={2} selectedId="all" onSelect={onSelect} moreLabel="More states" moreValue={(hidden) => `${hidden} more`} />
      </UiProvider>
    );
    await user.click(screen.getByRole('button', { name: 'More states' }));
    await user.click(screen.getByRole('menuitem', { name: 'Blocked 4' }));
    expect(onSelect).toHaveBeenCalledWith('blocked');
  });
});

describe('the offline banner', () => {
  it('is a named landmark whose state is read out, with the records waiting', async () => {
    const user = userEvent.setup();
    const onOpenOutbox = vi.fn();
    render(
      <UiProvider>
        <OfflineBanner state="offline" pendingCount={3} onOpenOutbox={onOpenOutbox} />
      </UiProvider>
    );
    const banner = screen.getByRole('region', { name: 'Connection and sync' });
    expect(within(banner).getByRole('status')).toHaveTextContent('You are offline; your work is saved on this phone');
    expect(banner).toHaveTextContent('3 waiting to sync');
    await user.click(within(banner).getByRole('button', { name: 'See details' }));
    expect(onOpenOutbox).toHaveBeenCalledTimes(1);
  });

  it('hides "back online" by itself after 4 seconds', () => {
    vi.useFakeTimers();
    try {
      const onHidden = vi.fn();
      render(
        <UiProvider>
          <OfflineBanner state="back_online" onHidden={onHidden} />
        </UiProvider>
      );
      expect(screen.getByRole('status')).toHaveTextContent('Back online');
      act(() => vi.advanceTimersByTime(4000));
      expect(onHidden).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('region')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the disclosure', () => {
  it('opens by its title, with its hint beside it', async () => {
    const user = userEvent.setup();
    render(
      <UiProvider>
        <Disclosure title="Scoring" hint="optional" headingLevel={3}>
          <p>Points per answer</p>
        </Disclosure>
      </UiProvider>
    );
    const toggle = screen.getByRole('button', { name: /Scoring/ });
    expect(screen.getByRole('heading', { level: 3 })).toContainElement(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('optional')).toBeInTheDocument();
    await user.click(toggle);
    expect(screen.getByText('Points per answer')).toBeVisible();
  });

  it('follows the page when opened from outside', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <UiProvider>
        <Disclosure title="Logic" open onToggle={onToggle}>
          <p>Show when</p>
        </Disclosure>
      </UiProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Logic' }));
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(screen.getByText('Show when')).toBeVisible();
  });
});

describe('the choice tiles', () => {
  it('chooses one tile under its group title', async () => {
    const user = userEvent.setup();
    function Start() {
      const [value, setValue] = useState<string | null>(null);
      return (
        <UiProvider>
          <ChoiceTiles
            label="How to start"
            value={value}
            onChange={setValue}
            tiles={[
              { title: 'New', tiles: [{ id: 'blank', title: 'Blank', description: 'Start from nothing', icon: 'add' }] },
              { title: 'Copy', tiles: [{ id: 'template', title: 'From a template' }, { id: 'project', title: 'From a project', disabled: true }] },
            ]}
          />
          <output>{value}</output>
        </UiProvider>
      );
    }
    render(<Start />);
    const group = screen.getByRole('radiogroup', { name: 'How to start' });
    expect(within(group).getByText('Copy')).toBeInTheDocument();
    await user.click(within(group).getByRole('radio', { name: /Blank/ }));
    expect(screen.getByRole('status')).toHaveTextContent('blank');
    expect(within(group).getByRole('radio', { name: /From a project/ })).toBeDisabled();
  });
});

describe('the bulk rows', () => {
  it('chooses rows, acts on one at once, and opens its details', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onSelectAll = vi.fn();
    const distributed = vi.fn();
    const absent = vi.fn();
    const onExpandedChange = vi.fn();
    render(
      <UiProvider>
        <BulkList label="Today's distribution" selectAllLabel="Select all remaining" onSelectAll={onSelectAll} selectedCount={1} someSelected>
          <BulkRow
            title="Amina Khatun"
            meta="APP-0012 · Uttarpara"
            selected
            onSelect={onSelect}
            state={{ status: 'approved', label: 'Approved' }}
            syncState={{ status: 'sync_pending', label: 'Waiting to sync' }}
            quickAction={{ label: 'Distributed', icon: 'check', onClick: distributed }}
            menuActions={[{ id: 'absent', label: 'Absent', onSelect: absent }]}
            onExpandedChange={onExpandedChange}
          >
            <p>Blankets: 2</p>
          </BulkRow>
        </BulkList>
      </UiProvider>
    );
    const list = screen.getByRole('list', { name: "Today's distribution" });
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Select all remaining' }));
    expect(onSelectAll).toHaveBeenCalledWith(true);
    const row = within(list).getByRole('listitem');
    expect(within(row).getByText('Approved')).toBeInTheDocument();
    expect(within(row).getByText('Waiting to sync')).toBeInTheDocument();
    await user.click(within(row).getByRole('checkbox', { name: 'Amina Khatun' }));
    expect(onSelect).toHaveBeenCalledWith(false);
    await user.click(within(row).getByRole('button', { name: 'Distributed' }));
    expect(distributed).toHaveBeenCalledTimes(1);
    await user.click(within(row).getByRole('button', { name: 'More actions: Amina Khatun' }));
    await user.click(screen.getByRole('menuitem', { name: 'Absent' }));
    expect(absent).toHaveBeenCalledTimes(1);
    await user.click(within(row).getByRole('button', { name: 'Show details' }));
    expect(onExpandedChange).toHaveBeenCalledWith(true);
  });
});

describe('the attention card', () => {
  it('is one link to its list, with why and how long', async () => {
    const user = userEvent.setup();
    renderInApp(<AttentionCard tone="warning" icon="hourglass" title="12 applications to review" reason="Older than 3 days" meta="oldest 6 days" to="/applications" />);
    const link = screen.getByRole('link', { name: /12 applications to review/ });
    expect(link).toHaveTextContent('Older than 3 days');
    expect(link).toHaveTextContent('oldest 6 days');
    await user.click(link);
    expect(await screen.findByRole('heading', { name: 'Applications to review' })).toBeInTheDocument();
  });

  it('carries one action instead of a link', () => {
    renderInApp(<AttentionCard icon="warning" title="Sync failed" action={<button type="button">Try again</button>} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('the figure card as a link', () => {
  it('opens the list the figure counts', async () => {
    const user = userEvent.setup();
    renderInApp(<StatCard label="Applications" value={12} icon="file" to="/applications" />);
    const link = screen.getByRole('link', { name: /12\s*Applications/ });
    await user.click(link);
    expect(await screen.findByRole('heading', { name: 'Applications to review' })).toBeInTheDocument();
  });

  it('stays a plain card for an address outside the app', () => {
    renderInApp(<StatCard label="Applications" value={12} to="https://example.org/applications" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Applications')).toBeInTheDocument();
  });
});

describe("the summary banner's figures", () => {
  it('pairs each figure with its name in a valid list, with an icon or a dot beside it', async () => {
    const { container } = render(
      <UiProvider>
        <SummaryBanner
          title="Today"
          subtitle="4 November 2026"
          items={[
            { label: 'Tasks waiting', value: '6', icon: 'checklist' },
            { label: 'Unread', value: '2', tone: 'info' },
            { label: 'Plain', value: '0' },
          ]}
        />
      </UiProvider>
    );
    const banner = screen.getByRole('region', { name: 'Today' });
    for (const [label, value] of [['Tasks waiting', '6'], ['Unread', '2'], ['Plain', '0']] as const) {
      const term = within(banner).getByText(label);
      expect(term.tagName).toBe('DT');
      expect(term.nextElementSibling).toHaveTextContent(value);
    }
    await expectNoAxeViolations(container);
  });
});

describe('the alert that can be put away', () => {
  it('has a named close button that calls back, beside its action', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const { container } = render(
      <UiProvider>
        <Alert tone="info" title="Install the app" onDismiss={onDismiss} action={<button type="button">Install</button>}>
          It keeps your work safe offline.
        </Alert>
      </UiProvider>
    );
    const alert = screen.getByRole('status');
    expect(within(alert).getByRole('button', { name: 'Install' })).toBeInTheDocument();
    await user.click(within(alert).getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    await expectNoAxeViolations(container);
  });

  it('has no close button without the callback', () => {
    render(
      <UiProvider>
        <Alert tone="warning">Records wait on this phone.</Alert>
      </UiProvider>
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('the tabs with their counts', () => {
  it('names each tab with its count after the label', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <UiProvider>
        <Tabs
          label="My applications"
          items={[
            { value: 'draft', label: 'Drafts', count: '2', content: <p>Two drafts</p> },
            { value: 'pending', label: 'Pending', count: '12', content: <p>Twelve waiting</p> },
            { value: 'rejected', label: 'Rejected', content: <p>None</p> },
          ]}
        />
      </UiProvider>
    );
    expect(screen.getByRole('tab', { name: 'Drafts 2', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Rejected' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Pending 12' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Twelve waiting');
    await expectNoAxeViolations(container);
  });
});

describe('the icon button and the small button', () => {
  it('names a short button by the longer words it is given, which hold its own words', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <UiProvider>
        <Button variant="secondary" size="small" ariaLabel="Personal details: edit" onClick={onClick}>
          Edit
        </Button>
      </UiProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Personal details: edit' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('becomes a named link to an app path', async () => {
    const user = userEvent.setup();
    renderInApp(
      <header>
        <IconButton label="Notifications, 3 unread" icon="bell" to="/applications" />
      </header>
    );
    const link = screen.getByRole('link', { name: 'Notifications, 3 unread' });
    await user.hover(link);
    // its tip opens inside the bar, not at the end of the page outside every landmark
    expect(await within(screen.getByRole('banner')).findByRole('tooltip')).toHaveTextContent('Notifications, 3 unread');
    await user.click(link);
    expect(await screen.findByRole('heading', { name: 'Applications to review' })).toBeInTheDocument();
  });

  it('names an icon-only button by its label', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <UiProvider>
        <IconButton label="Remove member" icon="delete" tone="danger" onClick={onClick} />
        <Button variant="text" size="small" onClick={() => {}}>
          Edit
        </Button>
      </UiProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Remove member' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveClass('MuiButton-sizeSmall');
  });
});

describe('the state pieces together', () => {
  it.each(['light', 'dark'] as const)('pass axe, %s', async (mode) => {
    window.localStorage.setItem('asf-mode', mode);
    const { container } = renderInApp(
      <>
        <OfflineBanner state="sync_failed" pendingCount={2} onOpenOutbox={() => {}} />
        <StatFilterBar label="Counts" items={[{ id: 'a', label: 'All', value: 3, icon: 'users' }]} selectedId="a" onSelect={() => {}} moreLabel="More" moreValue={() => ''} />
        <StatusChip status="rejected" label="Rejected" />
        <Disclosure title="More">
          <p>x</p>
        </Disclosure>
        <ChoiceTiles label="Start" value="a" onChange={() => {}} tiles={[{ id: 'a', title: 'Blank' }]} />
        <BulkList label="Rows">
          <BulkRow title="Amina" selected={false} onSelect={() => {}} quickAction={{ label: 'Done', onClick: () => {} }} />
        </BulkList>
        <AttentionCard icon="bell" title="New notices" to="/applications" />
        <IconButton label="Close" icon="close" />
      </>
    );
    await expectNoAxeViolations(container);
  });
});

describe('the state pieces under a page that renders again', () => {
  it('hides "back online" once, though the page hands a new callback on each render', () => {
    vi.useFakeTimers();
    try {
      const hidden = vi.fn();
      const view = (tick: number) => (
        <UiProvider>
          <OfflineBanner state="back_online" pendingCount={tick} onHidden={() => hidden()} />
        </UiProvider>
      );
      const { rerender } = render(view(0));
      for (let tick = 1; tick <= 3; tick += 1) {
        act(() => vi.advanceTimersByTime(1000));
        rerender(view(tick));
      }
      act(() => vi.advanceTimersByTime(1000));
      expect(hidden).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('region')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('names the last card by the hidden count chosen, and keeps a count that does not filter from being chosen', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <UiProvider>
        <StatFilterBar
          label="Counts"
          items={[
            { id: 'all', label: 'All', value: 10, icon: 'users' },
            { id: 'year', label: 'This year', value: 4, icon: 'calendar', selectable: false },
            { id: 'blocked', label: 'Blocked', value: 2, icon: 'block' },
          ]}
          visible={1}
          selectedId="blocked"
          onSelect={onSelect}
          moreLabel="More states"
          moreValue={(hidden) => `${hidden} more`}
        />
      </UiProvider>
    );
    await user.click(screen.getByRole('button', { name: 'More states: Blocked 2' }));
    expect(screen.getByRole('menuitem', { name: 'This year 4' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('makes no link of an address outside the app', () => {
    renderInApp(<AttentionCard icon="bell" title="Open this" to="javascript:alert(1)" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('the loading button', () => {
  function Saving() {
    const [loading, setLoading] = useState(false);
    return (
      <UiProvider>
        <Button loading={loading} onClick={() => setLoading(true)}>
          Preview
        </Button>
        <button type="button" onClick={() => setLoading(false)}>
          Done
        </button>
      </UiProvider>
    );
  }

  /** Starts the work; the browser then drops the focus off the disabled button (jsdom does not). */
  async function start() {
    render(<Saving />);
    const preview = screen.getByRole('button', { name: 'Preview' });
    await userEvent.setup().click(preview);
    fireEvent.blur(preview);
    return { preview, focus: vi.spyOn(preview, 'focus'), done: screen.getByRole('button', { name: 'Done' }) };
  }

  it('takes the focus back when its work is done and the focus fell to the page', async () => {
    const { focus, done } = await start();
    const active = vi.spyOn(document, 'activeElement', 'get').mockReturnValue(document.body);
    act(() => done.click());
    active.mockRestore();
    expect(focus).toHaveBeenCalled();
  });

  it('leaves the focus where the person moved it meanwhile', async () => {
    const { focus, done } = await start();
    const active = vi.spyOn(document, 'activeElement', 'get').mockReturnValue(done);
    act(() => done.click());
    active.mockRestore();
    expect(focus).not.toHaveBeenCalled();
  });
});
