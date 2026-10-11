'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Filter, Search, X } from 'lucide-react';
import {
  Button as AriaButton,
  Cell,
  Column,
  Input,
  Row,
  SearchField,
  Table as AriaTable,
  TableBody,
  TableHeader,
  ToggleButton,
  type Key,
  type Selection,
  type SortDescriptor,
} from 'react-aria-components';
import { fill } from '../../provider/messages.js';
import { useUi } from '../../provider/UiProvider.js';
import { cx } from '../../utils/cx.js';
import { Button } from '../Button/Button.js';
import { Checkbox } from '../Field/Choice.js';
import { Icon } from '../Icon/Icon.js';
import { Drawer } from '../Modal/Modal.js';
import { Skeleton } from '../Skeleton/Skeleton.js';

export interface TableColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /**
   * 1 always shown, 2 from 640 px, 3 desktop only, 4 desktop but hidden in the split view between
   * 1024 and 1439 px (DESIGN_SYSTEM 5.7, O-41).
   */
  priority?: 1 | 2 | 3 | 4;
  /** Numbers are right-aligned with tabular digits. */
  numeric?: boolean;
  sortable?: boolean;
  /** The column that names the row for screen readers (usually the name). */
  isRowHeader?: boolean;
}

export interface TableSort {
  column: string;
  direction: 'ascending' | 'descending';
}

export interface TablePagination {
  /** Rows shown so far and the capped total text such as "10000+" (cursor paging, API_STANDARDS). */
  shown: number;
  total: number | string;
  hasPrevious?: boolean;
  hasNext?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  /** Phones use "load more" instead of previous and next. */
  onLoadMore?: () => void;
}

export interface TableProps<T> {
  /** Accessible name of the table and the card list. */
  label: string;
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Name of a row for its checkbox and its card ("Select {name}"). */
  rowLabel: (row: T) => string;
  /** How a row renders as a card on phones (DESIGN_SYSTEM 5.7). */
  cardRenderer: (row: T) => ReactNode;
  selectionMode?: 'none' | 'single' | 'multiple';
  selectedKeys?: Set<string>;
  onSelectionChange?: (keys: Set<string>) => void;
  sort?: TableSort;
  onSortChange?: (sort: TableSort) => void;
  /** Opens a row (split-view detail); Enter on the focused row also opens it. */
  onRowAction?: (key: string) => void;
  /** Ghost buttons or a menu at the row end; visible on hover or focus on desktop. */
  rowActions?: (row: T) => ReactNode;
  density?: 'comfortable' | 'compact';
  /** Hides priority 4 columns between 1024 and 1439 px. */
  inSplitView?: boolean;
  loading?: boolean;
  /** ErrorState element shown instead of rows. */
  error?: ReactNode;
  /** EmptyState element shown when there are no rows. */
  emptyState?: ReactNode;
  pagination?: TablePagination;
  /** TableToolbar element (search, chips, filters). */
  toolbar?: ReactNode;
  className?: string;
}

const priorityClass = (p?: number) => (p && p > 1 ? `p${p}` : undefined);

/**
 * Table with filters, search and pagination: a real table from 640 px, a card list on phones
 * (DESIGN_SYSTEM 5.7). Only the visible layout is in the accessibility tree.
 */
export function Table<T>({
  label,
  columns,
  rows,
  rowKey,
  rowLabel,
  cardRenderer,
  selectionMode = 'none',
  selectedKeys,
  onSelectionChange,
  sort,
  onSortChange,
  onRowAction,
  rowActions,
  density = 'comfortable',
  inSplitView = false,
  loading = false,
  error,
  emptyState,
  pagination,
  toolbar,
  className,
}: TableProps<T>) {
  const { messages, formatNumber } = useUi();
  const [innerSelection, setInnerSelection] = useState<Set<string>>(new Set());
  const selection = selectedKeys ?? innerSelection;
  const select = (keys: Set<string>) => {
    setInnerSelection(keys);
    onSelectionChange?.(keys);
  };
  const toggle = (key: string, on: boolean) => {
    const next = new Set(selectionMode === 'single' ? [] : selection);
    if (on) next.add(key);
    else next.delete(key);
    select(next);
  };

  const body = error ? (
    error
  ) : loading ? (
    <Skeleton shape="row" count={5} />
  ) : rows.length === 0 ? (
    emptyState
  ) : null;

  const countText = pagination
    ? fill(messages.table.resultCount, {
        shown: formatNumber(pagination.shown),
        total:
          typeof pagination.total === 'number' ? formatNumber(pagination.total) : pagination.total,
      })
    : null;

  return (
    <div className={cx('ui-table-block', inSplitView && 'ui-table-split', className)}>
      {toolbar}
      {countText && (
        <p className="ui-sr-only" role="status">
          {countText}
        </p>
      )}
      {body ?? (
        <>
          <div className="ui-table-wrap">
            <AriaTable
              aria-label={label}
              className={cx('ui-table', density === 'compact' && 'ui-table-compact')}
              selectionMode={selectionMode}
              selectionBehavior={selectionMode === 'multiple' ? 'toggle' : 'replace'}
              selectedKeys={selection}
              onSelectionChange={(keys: Selection) =>
                select(keys === 'all' ? new Set(rows.map(rowKey)) : new Set([...keys].map(String)))
              }
              sortDescriptor={sort ? { column: sort.column, direction: sort.direction } : undefined}
              onSortChange={(d: SortDescriptor) =>
                onSortChange?.({ column: String(d.column), direction: d.direction })
              }
              onRowAction={onRowAction ? (key: Key) => onRowAction(String(key)) : undefined}
            >
              <TableHeader>
                {selectionMode === 'multiple' && (
                  <Column className="ui-th ui-th-select">
                    <Checkbox slot="selection" aria-label={messages.table.selectAll} />
                  </Column>
                )}
                {columns.map((column) => (
                  <Column
                    key={column.id}
                    id={column.id}
                    isRowHeader={column.isRowHeader}
                    allowsSorting={column.sortable}
                    className={cx('ui-th', column.numeric && 'num', priorityClass(column.priority))}
                  >
                    {({ sortDirection }) => (
                      <span className="ui-th-inner">
                        {column.header}
                        {sortDirection && (
                          <Icon
                            icon={sortDirection === 'ascending' ? ArrowUp : ArrowDown}
                            size="sm"
                          />
                        )}
                      </span>
                    )}
                  </Column>
                ))}
                {rowActions && (
                  <Column className="ui-th ui-th-actions">
                    <span className="ui-sr-only">{messages.table.rowActions}</span>
                  </Column>
                )}
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const key = rowKey(row);
                  return (
                    <Row key={key} id={key} className={cx('ui-tr', onRowAction && 'is-clickable')}>
                      {selectionMode === 'multiple' && (
                        <Cell className="ui-td ui-td-select">
                          <Checkbox slot="selection" aria-label={messages.table.select} />
                        </Cell>
                      )}
                      {columns.map((column) => (
                        <Cell
                          key={column.id}
                          className={cx(
                            'ui-td',
                            column.numeric && 'num',
                            column.isRowHeader && 'cell-title',
                            priorityClass(column.priority),
                          )}
                        >
                          {column.cell(row)}
                        </Cell>
                      ))}
                      {rowActions && (
                        <Cell className="ui-td ui-td-actions">
                          <div className="ui-row-actions">{rowActions(row)}</div>
                        </Cell>
                      )}
                    </Row>
                  );
                })}
              </TableBody>
            </AriaTable>
          </div>
          <ul className="ui-card-list" aria-label={label}>
            {rows.map((row) => {
              const key = rowKey(row);
              const selected = selection.has(key);
              return (
                <li key={key} className={cx('ui-row-card', selected && 'is-selected')}>
                  {selectionMode === 'multiple' && (
                    <Checkbox
                      hitArea
                      isSelected={selected}
                      onChange={(on) => toggle(key, on)}
                      aria-label={fill(messages.table.selectRow, { name: rowLabel(row) })}
                    />
                  )}
                  <div className="ui-row-card-body">{cardRenderer(row)}</div>
                  {(onRowAction || selectionMode === 'single') && (
                    <AriaButton
                      className="ui-row-card-open"
                      aria-label={rowLabel(row)}
                      aria-pressed={selectionMode === 'single' ? selected : undefined}
                      onPress={() => (onRowAction ? onRowAction(key) : toggle(key, !selected))}
                    >
                      <Icon icon={ChevronRight} />
                    </AriaButton>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {pagination && !body && <Pagination {...pagination} countText={countText ?? ''} />}
    </div>
  );
}

function Pagination({
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  onLoadMore,
  countText,
}: TablePagination & { countText: string }) {
  const { messages } = useUi();
  return (
    <nav className="ui-pager" aria-label={messages.table.pagination}>
      <span className="ui-pager-count ui-tnum" aria-hidden="true">
        {countText}
      </span>
      <div className="ui-pager-desktop">
        <Button
          variant="secondary"
          size="sm"
          icon={ChevronLeft}
          onPress={onPrevious}
          disabled={!hasPrevious}
        >
          {messages.table.previous}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={ChevronRight}
          iconPosition="end"
          onPress={onNext}
          disabled={!hasNext}
        >
          {messages.table.next}
        </Button>
      </div>
      {onLoadMore && hasNext && (
        <div className="ui-pager-phone">
          <Button variant="secondary" fullWidth onPress={onLoadMore}>
            {messages.table.loadMore}
          </Button>
        </div>
      )}
    </nav>
  );
}

export interface FilterChip {
  id: string;
  label: string;
  count?: number;
}

export interface TableToolbarProps {
  /** Called 300 ms after typing stops, with '' when fewer than 2 characters (DESIGN_SYSTEM 5.7). */
  onSearch?: (term: string) => void;
  searchPlaceholder?: string;
  chips?: FilterChip[];
  activeChip?: string;
  onChipChange?: (id: string) => void;
  /** Filter controls: inline from 640 px, in a bottom sheet behind a "filter" button on phones. */
  filters?: ReactNode;
  activeFilterCount?: number;
  onClearFilters?: () => void;
  className?: string;
}

/** Search box, status chips and filters above a table. */
export function TableToolbar({
  onSearch,
  searchPlaceholder,
  chips,
  activeChip,
  onChipChange,
  filters,
  activeFilterCount = 0,
  onClearFilters,
  className,
}: TableToolbarProps) {
  const { messages, formatNumber } = useUi();
  const [term, setTerm] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!onSearch) return;
    const timer = setTimeout(() => onSearch(term.trim().length >= 2 ? term.trim() : ''), 300);
    return () => clearTimeout(timer);
  }, [term, onSearch]);

  const filterButtonLabel =
    activeFilterCount > 0
      ? `${messages.table.filters} (${fill(messages.table.filtersActive, { count: formatNumber(activeFilterCount) })})`
      : messages.table.filters;

  return (
    <div className={cx('ui-toolbar', className)}>
      <div className="ui-toolbar-row">
        {onSearch && (
          <SearchField
            className="ui-search"
            value={term}
            onChange={setTerm}
            aria-label={messages.table.search}
          >
            <Icon icon={Search} size="sm" />
            <Input className="ui-input" placeholder={searchPlaceholder ?? messages.table.search} />
            <AriaButton className="ui-search-clear" aria-label={messages.common.dismiss}>
              <Icon icon={X} size="sm" />
            </AriaButton>
          </SearchField>
        )}
        {filters && (
          <Button
            variant="secondary"
            icon={Filter}
            className="ui-toolbar-filter-button"
            onPress={() => setSheetOpen(true)}
          >
            {filterButtonLabel}
          </Button>
        )}
      </div>
      {chips && chips.length > 0 && (
        <div className="ui-chips" role="group" aria-label={messages.table.filters}>
          {chips.map((chip) => (
            <ToggleButton
              key={chip.id}
              className="ui-chip"
              isSelected={chip.id === activeChip}
              onChange={() => onChipChange?.(chip.id)}
            >
              {chip.label}
              {chip.count !== undefined && (
                <span className="ui-chip-count ui-tnum">{formatNumber(chip.count)}</span>
              )}
            </ToggleButton>
          ))}
        </div>
      )}
      {filters && (
        <div className="ui-toolbar-filters">
          {filters}
          {activeFilterCount > 0 && onClearFilters && (
            <Button variant="ghost" size="sm" onPress={onClearFilters}>
              {messages.table.clearFilters}
            </Button>
          )}
        </div>
      )}
      {filters && (
        <Drawer
          title={messages.table.filters}
          side="bottom"
          isOpen={sheetOpen}
          onClose={() => setSheetOpen(false)}
          footer={
            <>
              {onClearFilters && (
                <Button variant="secondary" onPress={onClearFilters}>
                  {messages.table.clearFilters}
                </Button>
              )}
              <Button onPress={() => setSheetOpen(false)}>{messages.table.applyFilters}</Button>
            </>
          }
        >
          {filters}
        </Drawer>
      )}
    </div>
  );
}
