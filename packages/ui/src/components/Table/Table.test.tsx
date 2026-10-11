import { act, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations, renderWithUi } from '../../testing/index.js';
import { StatusBadge } from '../Badge/Badge.js';
import { BulkList, BulkRow } from '../BulkRow/BulkRow.js';
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
