import { act, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations, renderWithUi } from '../../testing/index.js';
import { StatusBadge } from '../Badge/Badge.js';
import { BulkList, BulkRow } from '../BulkRow/BulkRow.js';
import { Button } from '../Button/Button.js';
import { MenuButton } from '../Menu/MenuButton.js';
import { EmptyState } from '../States/States.js';
import { Table, TableToolbar, type TableColumn } from './Table.js';

interface App {
  id: string;
  name: string;
  number: string;
  village: string;
  score: number;
}

const rows: App[] = [
  { id: 'a1', name: 'রহিমা খাতুন', number: 'WNT-2026-00001', village: 'চর বাগডাঙ্গা', score: 82 },
  { id: 'a2', name: 'করিম মিয়া', number: 'WNT-2026-00002', village: 'পূর্ব পাড়া', score: 64 },
];

const columns: TableColumn<App>[] = [
  { id: 'name', header: 'নাম', cell: (r) => r.name, isRowHeader: true, sortable: true },
  { id: 'number', header: 'আবেদন নম্বর', cell: (r) => r.number, priority: 2 },
  { id: 'village', header: 'গ্রাম', cell: (r) => r.village, priority: 3 },
  {
    id: 'score',
    header: 'স্কোর',
    cell: (r) => r.score,
    numeric: true,
    sortable: true,
    priority: 4,
  },
];

const base = {
  label: 'আবেদনের তালিকা',
  columns,
  rows,
  rowKey: (r: App) => r.id,
  rowLabel: (r: App) => r.name,
  cardRenderer: (r: App) => (
    <>
      <p>{r.name}</p>
      <StatusBadge status="submitted" label="জমা" size="sm" />
    </>
  ),
};

describe('Table (DESIGN_SYSTEM 5.7)', () => {
  it('renders a real table with row headers, priority classes and a card list for phones', async () => {
    const { container } = renderWithUi(<Table {...base} />, { locale: 'bn' });
    const table = screen.getByRole('grid', { name: 'আবেদনের তালিকা' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual(['নাম', 'আবেদন নম্বর', 'গ্রাম', 'স্কোর']);
    expect(within(table).getByRole('rowheader', { name: 'রহিমা খাতুন' })).toBeInTheDocument();
    expect(container.querySelector('td.p3, [role="gridcell"].p3')).not.toBeNull();
    expect(container.querySelector('[role="gridcell"].num')).toHaveTextContent('82');
    const cards = screen.getByRole('list', { name: 'আবেদনের তালিকা' });
    expect(within(cards).getAllByRole('listitem')).toHaveLength(2);
    await expectNoAxeViolations(container);
  });

  it('sortable headers expose aria-sort and report the new sort', async () => {
    const onSortChange = vi.fn();
    const user = userEvent.setup();
    renderWithUi(
      <Table
        {...base}
        sort={{ column: 'name', direction: 'ascending' }}
        onSortChange={onSortChange}
      />,
    );
    const table = screen.getByRole('grid');
    const header = within(table).getByRole('columnheader', { name: /নাম/ });
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    await user.click(within(table).getByRole('columnheader', { name: /স্কোর/ }));
    expect(onSortChange).toHaveBeenCalledWith({ column: 'score', direction: 'ascending' });
  });

  it('multiple selection with checkboxes in the table and on the cards', async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    const { container } = renderWithUi(
      <Table {...base} selectionMode="multiple" onSelectionChange={onSelectionChange} />,
    );
    const table = screen.getByRole('grid');
    await user.click(within(table).getByRole('checkbox', { name: 'Select করিম মিয়া' }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(['a2']));
    expect(within(table).getAllByRole('row')[2]).toHaveAttribute('aria-selected', 'true');
    await user.click(within(table).getByRole('checkbox', { name: 'Select all' }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(['a1', 'a2']));
    const cards = screen.getByRole('list');
    expect(within(cards).getByRole('checkbox', { name: 'Select রহিমা খাতুন' })).toBeChecked();
    await expectNoAxeViolations(container);
  });

  it('opens a row with Enter (split view) and from its card', async () => {
    const onRowAction = vi.fn();
    const user = userEvent.setup();
    renderWithUi(<Table {...base} onRowAction={onRowAction} />);
    const table = screen.getByRole('grid');
    await user.click(within(table).getAllByRole('row')[1]!);
    expect(onRowAction).toHaveBeenLastCalledWith('a1');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onRowAction).toHaveBeenLastCalledWith('a2');
    await user.click(within(screen.getByRole('list')).getByRole('button', { name: 'করিম মিয়া' }));
    expect(onRowAction).toHaveBeenCalledTimes(3);
  });

  it('moves between rows and cells with the arrow keys and selects a row with Space', async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    renderWithUi(
      <Table {...base} selectionMode="multiple" onSelectionChange={onSelectionChange} />,
    );
    const [, first, second] = within(screen.getByRole('grid')).getAllByRole('row');
    act(() => first!.focus());
    await user.keyboard('{ArrowDown}');
    expect(second).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(second).not.toHaveFocus();
    expect(second).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard('{ArrowLeft}');
    expect(second).toHaveFocus();
    await user.keyboard(' ');
    expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(['a2']));
    expect(second).toHaveAttribute('aria-selected', 'true');
  });

  it('is one tab stop: its checkboxes are reached through their rows', async () => {
    const user = userEvent.setup();
    renderWithUi(
      <>
        <button type="button">before</button>
        <Table {...base} selectionMode="multiple" />
        <button type="button">after</button>
      </>,
    );
    const grid = screen.getByRole('grid');
    const [, first] = within(grid).getAllByRole('row');
    screen.getByRole('button', { name: 'before' }).focus();
    await user.tab();
    expect(first).toHaveFocus();
    // the next stop is past the grid (the phone card list, which CSS hides on a desktop)
    await user.tab();
    expect(grid).not.toContainElement(document.activeElement as HTMLElement);
  });

  it('names the column of the row actions in its header', () => {
    renderWithUi(
      <Table
        {...base}
        rowActions={(row) => <Button variant="ghost">{`Edit ${row.name}`}</Button>}
      />,
    );
    const headers = within(screen.getByRole('grid')).getAllByRole('columnheader');
    // the last header names the buttons under it, as plain text everyone sees
    expect(headers.at(-1)).toHaveTextContent('Actions');
    expect(within(headers.at(-1)!).getByText('Actions')).not.toHaveClass('ui-sr-only');
  });

  it('a click in a menu opened from a row never opens the row', async () => {
    const onRowAction = vi.fn();
    const onArchive = vi.fn();
    const user = userEvent.setup();
    renderWithUi(
      <Table
        {...base}
        onRowAction={onRowAction}
        rowActions={(row) => (
          <MenuButton
            label={`More: ${row.name}`}
            items={[{ id: 'archive', label: 'Archive', onAction: onArchive }]}
          />
        )}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'More: করিম মিয়া' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    expect(onArchive).toHaveBeenCalledOnce();
    expect(onRowAction).not.toHaveBeenCalled();
  });

  it('moves up to the previous row and to the first and last cell with Home and End', async () => {
    const user = userEvent.setup();
    renderWithUi(<Table {...base} />);
    const [, first, second] = within(screen.getByRole('grid')).getAllByRole('row');
    act(() => second!.focus());
    await user.keyboard('{ArrowUp}');
    expect(first).toHaveFocus();
    await user.keyboard('{ArrowRight}{End}');
    expect(document.activeElement).toHaveTextContent('82');
    await user.keyboard('{Home}');
    expect(document.activeElement).toHaveTextContent('রহিমা খাতুন');
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toHaveAttribute('role', 'columnheader');
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toHaveAttribute('role', 'columnheader');
  });

  it('a click on a row checkbox selects without opening the row', async () => {
    const onRowAction = vi.fn();
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    renderWithUi(
      <Table
        {...base}
        selectionMode="multiple"
        onRowAction={onRowAction}
        onSelectionChange={onSelectionChange}
      />,
    );
    const table = screen.getByRole('grid');
    await user.click(within(table).getByRole('checkbox', { name: 'Select করিম মিয়া' }));
    expect(onSelectionChange).toHaveBeenCalledOnce();
    expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(['a2']));
    expect(onRowAction).not.toHaveBeenCalled();
  });

  it('a row click selects inside a dialog too', async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    renderWithUi(
      <div role="dialog" aria-label="Choose volunteers">
        <Table {...base} selectionMode="multiple" onSelectionChange={onSelectionChange} />
      </div>,
    );
    const [, , second] = within(screen.getByRole('grid')).getAllByRole('row');
    await user.click(within(second!).getAllByRole('gridcell')[1]!);
    expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(['a2']));
  });

  it('sorts from a focused header with Enter', async () => {
    const onSortChange = vi.fn();
    const user = userEvent.setup();
    renderWithUi(
      <Table
        {...base}
        sort={{ column: 'score', direction: 'ascending' }}
        onSortChange={onSortChange}
      />,
    );
    const header = within(screen.getByRole('grid')).getByRole('columnheader', { name: /স্কোর/ });
    act(() => header.focus());
    await user.keyboard('{Enter}');
    expect(onSortChange).toHaveBeenLastCalledWith({ column: 'score', direction: 'descending' });
  });

  it('marks the columns a split view hides', () => {
    const { container } = renderWithUi(<Table {...base} inSplitView />);
    expect(container.querySelector('.ui-table-split')).not.toBeNull();
    expect(container.querySelectorAll('.p4')).toHaveLength(3);
  });

  it('shows the empty state, announces the result count and pages with previous, next and load more', async () => {
    const onNext = vi.fn();
    const onLoadMore = vi.fn();
    const user = userEvent.setup();
    const { rerender } = renderWithUi(
      <Table {...base} rows={[]} emptyState={<EmptyState title="No applications" />} />,
    );
    expect(screen.getByRole('heading', { name: 'No applications' })).toBeInTheDocument();
    rerender(
      <Table
        {...base}
        pagination={{ shown: 25, total: '10000+', hasNext: true, onNext, onLoadMore }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('25 of 10000+');
    const pager = screen.getByRole('navigation', { name: 'Pagination' });
    expect(within(pager).getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await user.click(within(pager).getByRole('button', { name: 'Next page' }));
    await user.click(within(pager).getByRole('button', { name: 'Load more' }));
    expect(onNext).toHaveBeenCalledOnce();
    expect(onLoadMore).toHaveBeenCalledOnce();
  });
});

describe('Table toolbar (DESIGN_SYSTEM 5.7)', () => {
  it('debounces search by 300 ms with at least 2 characters', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onSearch = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithUi(<TableToolbar onSearch={onSearch} />);
    act(() => vi.advanceTimersByTime(300));
    onSearch.mockClear();
    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'র');
    act(() => vi.advanceTimersByTime(300));
    expect(onSearch).toHaveBeenLastCalledWith('');
    await user.type(screen.getByRole('searchbox'), 'হি');
    expect(onSearch).not.toHaveBeenLastCalledWith('রহি');
    act(() => vi.advanceTimersByTime(300));
    expect(onSearch).toHaveBeenLastCalledWith('রহি');
    vi.useRealTimers();
  });

  it('Escape and the clear button empty the search', async () => {
    const onSearch = vi.fn();
    const user = userEvent.setup();
    renderWithUi(<TableToolbar onSearch={onSearch} />);
    const box = screen.getByRole('searchbox', { name: 'Search' });
    await user.type(box, 'রহি');
    await user.keyboard('{Escape}');
    expect(box).toHaveValue('');
    await user.type(box, 'কর');
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(box).toHaveValue('');
    expect(box).toHaveFocus();
    await vi.waitFor(() => expect(onSearch).toHaveBeenLastCalledWith(''));
  });

  it('status chips are toggle buttons and filters open in a sheet with the active count', async () => {
    const onChipChange = vi.fn();
    const user = userEvent.setup();
    const { container } = renderWithUi(
      <TableToolbar
        chips={[
          { id: 'all', label: 'All', count: 120 },
          { id: 'remaining', label: 'Remaining', count: 30 },
        ]}
        activeChip="all"
        onChipChange={onChipChange}
        filters={<p>district select</p>}
        activeFilterCount={2}
        onClearFilters={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /All/ })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: /Remaining/ }));
    expect(onChipChange).toHaveBeenCalledWith('remaining');
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole('button', { name: 'Filters (2 active)' }));
    expect(await screen.findByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
  });
});

describe('Bulk-update list row (DESIGN_SYSTEM 5.17)', () => {
  it('has a labelled checkbox, state badges, one quick action, edge states in a menu and an expandable detail', async () => {
    const onSelect = vi.fn();
    const onQuick = vi.fn();
    const onAbsent = vi.fn();
    const onExpanded = vi.fn();
    const user = userEvent.setup();
    const { container } = renderWithUi(
      <BulkList label="আজকের বিতরণ" onSelectAll={() => {}} someSelected selectedCount={12}>
        <BulkRow
          title="রহিমা খাতুন"
          meta="WNT-2026-00001 · চর বাগডাঙ্গা"
          onSelect={onSelect}
          state={{ status: 'approved', label: 'অনুমোদিত' }}
          photoState={{ status: 'photo_pending', label: 'ছবি বাকি' }}
          syncState={{ status: 'sync_pending', label: 'সিঙ্ক বাকি' }}
          quickAction={{ label: 'বিতরণ হয়েছে', onPress: onQuick }}
          menuActions={[{ id: 'absent', label: 'অনুপস্থিত', onAction: onAbsent }]}
          onExpandedChange={onExpanded}
        >
          <p>পরিমাণ ও মন্তব্য</p>
        </BulkRow>
      </BulkList>,
      { locale: 'bn' },
    );
    expect(screen.getByRole('status')).toHaveTextContent('12টি বেছে নেওয়া');
    expect(screen.getByRole('checkbox', { name: 'সব বেছে নিন' })).toBePartiallyChecked();
    await user.click(screen.getByRole('checkbox', { name: 'রহিমা খাতুন বেছে নিন' }));
    expect(onSelect).toHaveBeenCalledWith(true);
    await user.click(screen.getByRole('button', { name: 'বিতরণ হয়েছে' }));
    expect(onQuick).toHaveBeenCalledOnce();
    const expand = screen.getByRole('button', { name: 'বিস্তারিত দেখুন' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('পরিমাণ ও মন্তব্য').parentElement).not.toBeVisible();
    await user.click(expand);
    expect(onExpanded).toHaveBeenCalledWith(true);
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole('button', { name: 'আরও কাজ: রহিমা খাতুন' }));
    await user.click(await screen.findByRole('menuitem', { name: 'অনুপস্থিত' }));
    expect(onAbsent).toHaveBeenCalledOnce();
  });
});
