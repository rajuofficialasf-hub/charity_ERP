// @vitest-environment jsdom
// The pieces this app added to the asf template (listed in local.json), apart from the kit's shared
// contract tests, so those stay identical to the kit's copies.
import '@testing-library/jest-dom/vitest';

import type { ReactNode } from 'react';
import type { UiLabels, DataTableExtendedProps, DataTableExtendedColumn } from '@/ui/contract';

import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { vi, it, expect, describe, afterEach } from 'vitest';
import { act, render, screen, within, cleanup, waitFor, fireEvent } from '@testing-library/react';

import { FilterBar, DataTable, UiProvider, ColorModeButton } from './index';
import { resetPage, stubWidth, stubMatchMedia, expectNoAxeViolations } from './local-test-support';

afterEach(() => {
  cleanup();
  resetPage();
});

describe('colour mode', () => {
  it('takes the device dark mode while the person has not picked one', async () => {
    stubMatchMedia((query) => query.includes('dark'));
    render(
      <UiProvider>
        <ColorModeButton />
      </UiProvider>
    );
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-color-scheme', 'dark'));
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument();
  });

  it('switches to dark on a tap and keeps the choice on the device', async () => {
    stubMatchMedia(() => false);
    const user = userEvent.setup();
    render(
      <UiProvider>
        <ColorModeButton />
      </UiProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Switch to dark mode' }));
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-color-scheme', 'dark'));
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument();
    expect(window.localStorage.getItem('asf-mode')).toBe('dark');
  });
});

// ----------------------------------------------------------------------

type Person = { id: string; name: string; district: string; applications: number };

const people: Person[] = [
  { id: 'p1', name: 'Amina Khatun', district: 'Dhaka', applications: 12 },
  { id: 'p2', name: 'Rahim Uddin', district: 'Rangpur', applications: 3 },
];

const columns: DataTableExtendedColumn<Person>[] = [
  { id: 'name', header: 'Name', cell: (row) => row.name, isRowHeader: true, sortable: true },
  { id: 'district', header: 'District', cell: (row) => row.district, priority: 2 },
  { id: 'applications', header: 'Applications', cell: (row) => row.applications, numeric: true, priority: 3 },
];

function Volunteers(props: Partial<DataTableExtendedProps<Person>>) {
  return (
    <DataTable<Person>
      label="Volunteers"
      rows={people}
      columns={columns}
      getRowId={(row) => row.id}
      rowLabel={(row) => row.name}
      cardRenderer={(row) => <p>{`${row.name}, ${row.district}`}</p>}
      rowActions={(row) => <button type="button">{`Open ${row.name}`}</button>}
      {...props}
    />
  );
}

function renderTable(props: Partial<DataTableExtendedProps<Person>> = {}, labels?: Partial<UiLabels>) {
  const view = render(
    <UiProvider labels={labels}>
      <Volunteers {...props} />
    </UiProvider>
  );
  const rerender = (next: Partial<DataTableExtendedProps<Person>>) =>
    view.rerender(
      <UiProvider labels={labels}>
        <Volunteers {...next} />
      </UiProvider>
    );
  return { ...view, rerender };
}

describe('the table', () => {
  it('shows the rows as cards with their actions on a phone', () => {
    stubWidth(true);
    renderTable();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const cards = within(screen.getByRole('list', { name: 'Volunteers' })).getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]!).getByText('Amina Khatun, Dhaka')).toBeInTheDocument();
    expect(within(cards[0]!).getByRole('button', { name: 'Open Amina Khatun' })).toBeInTheDocument();
  });

  it('names the actions column and the row header on a wide screen', () => {
    stubWidth(false);
    renderTable();
    const table = screen.getByRole('table', { name: 'Volunteers' });
    expect(within(table).getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: 'Amina Khatun' })).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: 'Open Rahim Uddin' })).toBeInTheDocument();
  });

  it('lets the keyboard reach a table wider than its box, and only then', () => {
    stubWidth(false);
    const wide = { value: false };
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      }
    );
    const scrollWidth = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(() => (wide.value ? 900 : 300));
    const clientWidth = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 300);
    try {
      renderTable();
      expect(screen.queryByRole('region', { name: 'Volunteers' })).not.toBeInTheDocument();
      cleanup();
      wide.value = true;
      renderTable();
      const box = screen.getByRole('region', { name: 'Volunteers' });
      expect(box).toHaveAttribute('tabindex', '0');
      expect(within(box).getByRole('table', { name: 'Volunteers' })).toBeInTheDocument();
    } finally {
      scrollWidth.mockRestore();
      clientWidth.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('reports the selected ids, and keeps the bulk bar in its place before the first tick', async () => {
    stubWidth(false);
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    renderTable({ selectionMode: 'multiple', onSelectionChange, bulkActions: <button type="button">Approve</button> });
    // the bar is there with a hint, so the first tick moves no row
    expect(screen.getByText('Tick rows to act on them together')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Select Rahim Uddin' }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(['p2']));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(['p1', 'p2']));
  });

  it('shows no bulk bar without bulk actions until a row is ticked', async () => {
    stubWidth(false);
    const user = userEvent.setup();
    renderTable({ selectionMode: 'multiple', onSelectionChange: vi.fn() });
    expect(screen.queryByText('Tick rows to act on them together')).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Select Rahim Uddin' }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('selects on the cards too', async () => {
    stubWidth(true);
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    renderTable({ selectionMode: 'multiple', onSelectionChange });
    await user.click(screen.getByRole('checkbox', { name: 'Select Amina Khatun' }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(['p1']));
  });

  it('asks for a sort by a header, ascending first, then the other way', async () => {
    stubWidth(false);
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    const { rerender } = renderTable({ onSortChange });
    await user.click(screen.getByRole('button', { name: 'Name' }));
    expect(onSortChange).toHaveBeenLastCalledWith({ columnId: 'name', direction: 'asc' });
    rerender({ onSortChange, sort: { columnId: 'name', direction: 'asc' } });
    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute('aria-sort', 'ascending');
    await user.click(screen.getByRole('button', { name: 'Name' }));
    expect(onSortChange).toHaveBeenLastCalledWith({ columnId: 'name', direction: 'desc' });
    expect(screen.queryByRole('button', { name: 'District' })).not.toBeInTheDocument();
  });

  it('opens a row by a click or by Enter, but not through its own buttons', async () => {
    stubWidth(false);
    const user = userEvent.setup();
    const onRowOpen = vi.fn();
    renderTable({ onRowOpen });
    await user.click(screen.getByRole('rowheader', { name: 'Amina Khatun' }));
    expect(onRowOpen).toHaveBeenLastCalledWith(people[0]);
    await user.click(screen.getByRole('button', { name: 'Open Rahim Uddin' }));
    expect(onRowOpen).toHaveBeenCalledTimes(1);
    screen.getByRole('rowheader', { name: 'Rahim Uddin' }).closest('tr')!.focus();
    await user.keyboard('{Enter}');
    expect(onRowOpen).toHaveBeenLastCalledWith(people[1]);
  });

  it('opens a card by its button named after the row', async () => {
    stubWidth(true);
    const user = userEvent.setup();
    const onRowOpen = vi.fn();
    renderTable({ onRowOpen });
    await user.click(screen.getByRole('button', { name: 'Rahim Uddin' }));
    expect(onRowOpen).toHaveBeenLastCalledWith(people[1]);
  });

  it('shows the loading, empty and error states instead of the rows', () => {
    stubWidth(false);
    const { rerender } = renderTable({ loading: true });
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    rerender({ rows: [], emptyTitle: 'No volunteers yet', emptyAction: <button type="button">Add a volunteer</button> });
    expect(screen.getByText('No volunteers yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a volunteer' })).toBeInTheDocument();
    rerender({ error: <p role="alert">The list did not load</p> });
    expect(screen.getByRole('alert')).toHaveTextContent('The list did not load');
    expect(screen.queryByText('Amina Khatun')).not.toBeInTheDocument();
  });

  it('pages by cursor with previous and next, and loads more on a phone', async () => {
    stubWidth(false);
    const user = userEvent.setup();
    const onNext = vi.fn();
    const onLoadMore = vi.fn();
    const cursor = { summary: '1–2 of 10000+', hasPrevious: false, hasNext: true, onNext, onLoadMore };
    const { unmount } = renderTable({ cursorPagination: cursor });
    expect(screen.getByText('1–2 of 10000+')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onNext).toHaveBeenCalledTimes(1);
    unmount();
    stubWidth(true);
    renderTable({ cursorPagination: cursor });
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('shows the counted pages beside previous and next of a cursor, which go past them', async () => {
    stubWidth(false);
    const user = userEvent.setup();
    const onPage = vi.fn();
    const onNext = vi.fn();
    renderTable({ cursorPagination: { summary: '11–20 of 10000+', hasPrevious: true, hasNext: true, onNext, page: 2, pageCount: 4, onPage } });
    const pages = screen.getByRole('navigation', { name: 'Volunteers: Pages' });
    expect(within(pages).getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
    // the arrows are the pager's own previous and next, never MUI's second pair
    expect(within(pages).queryByRole('button', { name: /previous|next/i })).not.toBeInTheDocument();
    await user.click(within(pages).getByRole('button', { name: 'Page 4' }));
    expect(onPage).toHaveBeenCalledWith(4);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('shows page numbers when asked, the current one marked', async () => {
    stubWidth(false);
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    renderTable({ pagination: { page: 2, pageSize: 2, total: 9, onPageChange, showPageNumbers: true } });
    const pages = screen.getByRole('navigation', { name: 'Volunteers: Pages' });
    expect(within(pages).getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
    await user.click(within(pages).getByRole('button', { name: 'Page 5' }));
    expect(onPageChange).toHaveBeenLastCalledWith(5);
  });

  it.each([
    ['en', 'light', undefined],
    ['bn', 'dark', { selectAll: 'সব বেছে নিন', selectRow: '{name} বেছে নিন', rowActions: 'অ্যাকশন' }],
  ] as const)('passes axe in %s, %s', async (_, mode, labels) => {
    stubWidth(false);
    window.localStorage.setItem('asf-mode', mode);
    const { container } = renderTable({ selectionMode: 'multiple', onSortChange: () => {} }, labels);
    await expectNoAxeViolations(container);
  });
});

describe('the filter bar', () => {
  function Bar({ onSearch = () => {}, children }: { onSearch?: (term: string) => void; children?: ReactNode }) {
    const [chip, setChip] = useState('all');
    const [district, setDistrict] = useState<string | null>('Dhaka');
    return (
      <UiProvider>
        <FilterBar
          label="Volunteer filters"
          onSearch={onSearch}
          searchPlaceholder="Name or mobile"
          chips={[
            { id: 'all', label: 'All', count: 20 },
            { id: 'pending', label: 'Pending', count: 3 },
          ]}
          activeChip={chip}
          onChipChange={setChip}
          activeFilters={district ? [{ id: 'district', label: `District: ${district}`, onRemove: () => setDistrict(null) }] : []}
          onClearFilters={() => setDistrict(null)}
        >
          {children ?? (
            <label>
              District
              <input />
            </label>
          )}
        </FilterBar>
      </UiProvider>
    );
  }

  it('searches 300 ms after typing stops, not on load and not for one letter', () => {
    stubWidth(false);
    vi.useFakeTimers();
    try {
      const onSearch = vi.fn();
      render(<Bar onSearch={onSearch} />);
      const box = screen.getByRole('searchbox', { name: 'Name or mobile' });
      act(() => vi.advanceTimersByTime(300));
      expect(onSearch).not.toHaveBeenCalled();
      fireEvent.change(box, { target: { value: 'a' } });
      act(() => vi.advanceTimersByTime(300));
      expect(onSearch).not.toHaveBeenCalled();
      fireEvent.change(box, { target: { value: 'am' } });
      act(() => vi.advanceTimersByTime(299));
      expect(onSearch).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1));
      expect(onSearch).toHaveBeenLastCalledWith('am');
      fireEvent.change(box, { target: { value: 'a' } });
      act(() => vi.advanceTimersByTime(300));
      expect(onSearch).toHaveBeenLastCalledWith('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('presses one chip at a time and removes the filters in force', async () => {
    stubWidth(false);
    const user = userEvent.setup();
    render(<Bar />);
    expect(screen.getByRole('button', { name: 'All 20' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Pending 3' }));
    expect(screen.getByRole('button', { name: 'Pending 3' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All 20' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('textbox', { name: 'District' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Remove District: Dhaka' }));
    expect(screen.queryByText('District: Dhaka')).not.toBeInTheDocument();
  });

  it('puts the fields behind a filters button on a phone', async () => {
    stubWidth(true);
    const user = userEvent.setup();
    render(<Bar />);
    expect(screen.queryByRole('textbox', { name: 'District' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Filters (1 active)' }));
    const panel = await screen.findByRole('dialog', { name: 'Filters' });
    expect(within(panel).getByRole('textbox', { name: 'District' })).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('passes axe', async () => {
    stubWidth(false);
    const { container } = render(<Bar />);
    await expectNoAxeViolations(container);
  });
});

describe('the table across pages', () => {
  it('keeps and counts rows chosen on another page, and selects all only on the page shown', async () => {
    stubWidth(false);
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    const later: Person[] = [
      { id: 'p3', name: 'Salma Begum', district: 'Sylhet', applications: 7 },
      { id: 'p4', name: 'Karim Mia', district: 'Khulna', applications: 1 },
    ];
    const { rerender } = renderTable({ selectionMode: 'multiple', onSelectionChange });
    await user.click(screen.getByRole('checkbox', { name: 'Select Amina Khatun' }));
    rerender({ selectionMode: 'multiple', onSelectionChange, rows: later });
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Select Salma Begum' }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(['p1', 'p3']));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(['p1', 'p3', 'p4']));
    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(['p1']));
  });

  it('shows the last page when a filter leaves the page past it', () => {
    stubWidth(false);
    renderTable({ pagination: { page: 5, pageSize: 2, total: 3, onPageChange: () => {}, showPageNumbers: true } });
    expect(screen.getByText('3–3 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('the filter bar with a search to start from', () => {
  it('shows it and does not send it again', () => {
    stubWidth(false);
    vi.useFakeTimers();
    try {
      const onSearch = vi.fn();
      render(
        <UiProvider>
          <FilterBar onSearch={onSearch} searchPlaceholder="Name or mobile" initialSearch="amina" />
        </UiProvider>
      );
      expect(screen.getByRole('searchbox', { name: 'Name or mobile' })).toHaveValue('amina');
      act(() => vi.advanceTimersByTime(600));
      expect(onSearch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
