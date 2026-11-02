import MuiTable from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import useMediaQuery from '@mui/material/useMediaQuery';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
} from 'react';
import { Button } from '../../components/Button/Button.js';
import { Checkbox } from '../../components/Field/Choice.js';
import { Icon } from '../../components/Icon/Icon.js';
import { Drawer } from '../../components/Modal/Modal.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import type { TablePagination, TableProps, TableToolbarProps } from '../../contract.js';
import { fill } from '../../provider/messages.js';
import { useUi } from '../../provider/UiProvider.js';
import { cx } from '../../utils/cx.js';

const priorityClass = (p?: number) => (p && p > 1 ? `p${p}` : undefined);

/** The header row's key in the grid's focus position; a row key is never empty. */
const HEADER = '';

/** Where the grid's single tab stop is: a body row (cell -1) or a cell of a row. */
interface GridPosition {
  row: string;
  cell: number;
}

/** A click on a control inside a row acts on that control, never on the row. */
const INNER_CONTROL = 'a, button, input, label, select, textarea, [role="button"]';

/** The rows of the grid in the order they are shown, the header first. */
const gridRows = (grid: HTMLElement) =>
  Array.from(grid.querySelectorAll<HTMLElement>('[data-grid-row]'));
const rowCells = (row: HTMLElement) =>
  Array.from(row.querySelectorAll<HTMLElement>(':scope > [data-grid-cell]'));

/**
 * Table with filters, search and pagination: a grid on MUI's table from 640 px and a card list on
 * phones (DESIGN_SYSTEM 5.7). The grid has one tab stop; the arrow keys move between rows and into
 * and out of cells, Enter opens a row or sorts by a header, Space selects a row.
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
  layout = 'default',
  className,
}: TableProps<T>): ReactElement {
  const { messages, formatNumber } = useUi();
  const grid = useRef<HTMLTableElement>(null);
  const [innerSelection, setInnerSelection] = useState<Set<string>>(new Set());
  const selection = selectedKeys ?? innerSelection;
  const keys = rows.map(rowKey);
  const [focused, setFocused] = useState<GridPosition | null>(null);
  // the tab stop falls back to the first row when its row has gone
  const position: GridPosition =
    focused && (focused.row === HEADER || keys.includes(focused.row))
      ? focused
      : keys[0] !== undefined
        ? { row: keys[0], cell: -1 }
        : { row: HEADER, cell: 0 };
  const tabStop = (row: string, cell: number) =>
    position.row === row && position.cell === cell ? 0 : -1;

  const allSelected = keys.length > 0 && keys.every((k) => selection.has(k));
  const someSelected = keys.some((k) => selection.has(k));
  const select = (next: Set<string>) => {
    setInnerSelection(next);
    onSelectionChange?.(next);
  };
  const toggle = (key: string, on: boolean) => {
    const next = new Set(selectionMode === 'single' ? [] : selection);
    if (on) next.add(key);
    else next.delete(key);
    select(next);
  };
  const sortBy = (columnId: string) => {
    if (!onSortChange) return;
    const descending = sort?.column === columnId && sort.direction === 'ascending';
    onSortChange({ column: columnId, direction: descending ? 'descending' : 'ascending' });
  };
  const sortable = (index: number) => {
    const column = columns[index - (selectionMode === 'multiple' ? 1 : 0)];
    return column?.sortable ? column : undefined;
  };

  const onFocus = (event: FocusEvent<HTMLTableElement>) => {
    const target = event.target as HTMLElement;
    const row = target.closest<HTMLElement>('[data-grid-row]');
    if (!row) return;
    const cell = target.closest<HTMLElement>('[data-grid-cell]');
    const key = row.dataset.gridRow!;
    setFocused({ row: key, cell: cell ? rowCells(row).indexOf(cell) : -1 });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    const target = event.target as HTMLElement;
    const row = target.closest<HTMLElement>('[data-grid-row]');
    if (!row || !grid.current) return;
    const cell = target.closest<HTMLElement>('[data-grid-cell]');
    // keys typed into a control inside a cell stay with that control
    if (target !== row && target !== cell) return;
    const key = row.dataset.gridRow!;
    const cells = rowCells(row);
    const index = cell ? cells.indexOf(cell) : -1;
    const all = gridRows(grid.current);
    const body = all.filter((r) => r.dataset.gridRow !== HEADER);
    const move = (next: HTMLElement | undefined) => {
      if (!next) return;
      event.preventDefault();
      next.focus();
    };
    // rows move between the body rows; cells move through the header too, keeping their column
    const lines = index < 0 ? body : all;
    const at = lines.indexOf(row);
    const inRow = (r: HTMLElement | undefined) => (r && index >= 0 ? rowCells(r)[index] : r);
    // Left from a body row's first cell goes back to the row itself; the header has no row stop
    const leftOf = () =>
      index > 0 ? cells[index - 1] : index === 0 && key !== HEADER ? row : undefined;
    switch (event.key) {
      case 'ArrowDown':
        return move(inRow(lines[at + 1]));
      case 'ArrowUp':
        return move(inRow(lines[at - 1]));
      case 'ArrowRight':
        return move(cells[index + 1]);
      case 'ArrowLeft':
        return move(leftOf());
      case 'Home':
        return move(index < 0 ? body[0] : cells[0]);
      case 'End':
        return move(index < 0 ? body.at(-1) : cells.at(-1));
      case 'Enter':
      case ' ': {
        event.preventDefault();
        if (key === HEADER) {
          if (selectionMode === 'multiple' && index === 0)
            return select(allSelected ? new Set() : new Set(keys));
          const column = sortable(index);
          if (column) sortBy(column.id);
          return;
        }
        if (event.key === 'Enter' && onRowAction) return onRowAction(key);
        if (selectionMode !== 'none') toggle(key, !selection.has(key));
        return;
      }
    }
  };

  const onRowClick = (event: MouseEvent<HTMLElement>, key: string) => {
    const target = event.target as HTMLElement;
    const row = event.currentTarget;
    // clicks bubble through portals: a menu or dialog opened from the row is not the row
    if (!row.contains(target)) return;
    // only a control inside the row counts; the table itself may sit in a dialog or a label
    const control = target.closest(INNER_CONTROL);
    if (control && row.contains(control)) return;
    if (onRowAction) onRowAction(key);
    else if (selectionMode !== 'none') toggle(key, !selection.has(key));
  };

  const body = error ? (
    error
  ) : loading ? (
    <Skeleton shape="row" count={5} />
  ) : rows.length === 0 ? (
    emptyState
  ) : null;

  const countText = pagination
    ? (pagination.summary ??
      fill(messages.table.resultCount, {
        shown: formatNumber(pagination.shown),
        total:
          typeof pagination.total === 'number' ? formatNumber(pagination.total) : pagination.total,
      }))
    : null;
  // a cell's place in its row: the selection column first, the actions column last
  const first = selectionMode === 'multiple' ? 1 : 0;
  const actionsCell = first + columns.length;

  return (
    <div
      className={cx(
        'ui-table-block',
        layout === 'panel' && 'ui-table-panel',
        inSplitView && 'ui-table-split',
        className,
      )}
    >
      {toolbar}
      {countText && (
        <p className="ui-sr-only" role="status">
          {countText}
        </p>
      )}
      {body ?? (
        <>
          <div className="ui-table-wrap">
            <MuiTable
              ref={grid}
              role="grid"
              aria-label={label}
              aria-multiselectable={selectionMode === 'multiple' || undefined}
              className={cx('ui-table', density === 'compact' && 'ui-table-compact')}
              onFocus={onFocus}
              onKeyDown={onKeyDown}
            >
              <TableHead>
                <TableRow role="row" data-grid-row={HEADER}>
                  {selectionMode === 'multiple' && (
                    <TableCell
                      role="columnheader"
                      data-grid-cell=""
                      tabIndex={tabStop(HEADER, 0)}
                      className="ui-th ui-th-select"
                    >
                      <Checkbox
                        isSelected={allSelected}
                        isIndeterminate={!allSelected && someSelected}
                        onChange={(on) => select(on ? new Set(keys) : new Set())}
                        aria-label={messages.table.selectAll}
                        excludeFromTabOrder
                      />
                    </TableCell>
                  )}
                  {columns.map((column, i) => {
                    const sorted = sort?.column === column.id ? sort.direction : undefined;
                    return (
                      <TableCell
                        key={column.id}
                        role="columnheader"
                        data-grid-cell=""
                        tabIndex={tabStop(HEADER, first + i)}
                        aria-sort={sorted}
                        data-sortable={column.sortable || undefined}
                        className={cx(
                          'ui-th',
                          column.numeric && 'num',
                          priorityClass(column.priority),
                        )}
                        onClick={column.sortable ? () => sortBy(column.id) : undefined}
                      >
                        <span className="ui-th-inner">
                          {column.header}
                          {sorted && (
                            <Icon icon={sorted === 'ascending' ? ArrowUp : ArrowDown} size="sm" />
                          )}
                        </span>
                      </TableCell>
                    );
                  })}
                  {rowActions && (
                    <TableCell
                      role="columnheader"
                      data-grid-cell=""
                      tabIndex={tabStop(HEADER, actionsCell)}
                      className="ui-th ui-th-actions"
                    >
                      {messages.table.rowActions}
                    </TableCell>
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => {
                  const key = rowKey(row);
                  const selected = selection.has(key);
                  return (
                    <TableRow
                      key={key}
                      role="row"
                      data-grid-row={key}
                      tabIndex={tabStop(key, -1)}
                      aria-selected={selectionMode === 'none' ? undefined : selected}
                      data-selected={selected || undefined}
                      className={cx('ui-tr', onRowAction && 'is-clickable')}
                      onClick={(event) => onRowClick(event, key)}
                    >
                      {selectionMode === 'multiple' && (
                        <TableCell
                          role="gridcell"
                          data-grid-cell=""
                          tabIndex={tabStop(key, 0)}
                          className="ui-td ui-td-select"
                        >
                          <Checkbox
                            isSelected={selected}
                            onChange={(on) => toggle(key, on)}
                            excludeFromTabOrder
                            aria-label={fill(messages.table.selectRow, { name: rowLabel(row) })}
                          />
                        </TableCell>
                      )}
                      {columns.map((column, i) => (
                        <TableCell
                          key={column.id}
                          {...(column.isRowHeader
                            ? { component: 'th', scope: 'row', role: 'rowheader' }
                            : { role: 'gridcell' })}
                          data-grid-cell=""
                          tabIndex={tabStop(key, first + i)}
                          className={cx(
                            'ui-td',
                            column.numeric && 'num',
                            column.isRowHeader && 'cell-title',
                            priorityClass(column.priority),
                          )}
                        >
                          {column.cell(row)}
                        </TableCell>
                      ))}
                      {rowActions && (
                        <TableCell
                          role="gridcell"
                          data-grid-cell=""
                          tabIndex={tabStop(key, actionsCell)}
                          className="ui-td ui-td-actions"
                        >
                          <div className="ui-row-actions">{rowActions(row)}</div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </MuiTable>
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
                    <button
                      type="button"
                      className="ui-row-card-open"
                      aria-label={rowLabel(row)}
                      aria-pressed={selectionMode === 'single' ? selected : undefined}
                      onClick={() => (onRowAction ? onRowAction(key) : toggle(key, !selected))}
                    >
                      <Icon icon={ChevronRight} />
                    </button>
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

/** The page numbers to show: the first, the last and the ones around the current page. */
export function pageWindow(page: number, count: number): (number | 'gap')[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const near = [1, page - 1, page, page + 1, count].filter((p) => p >= 1 && p <= count);
  const pages = [...new Set(near)].sort((a, b) => a - b);
  return pages.flatMap((p, i) => (i > 0 && p - pages[i - 1]! > 1 ? ['gap' as const, p] : [p]));
}

function Pagination({
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  onLoadMore,
  page,
  pageCount,
  onPage,
  countText,
}: TablePagination & { countText: string }) {
  const { messages, formatNumber } = useUi();
  const numbered = page !== undefined && pageCount !== undefined && onPage !== undefined;
  return (
    <nav className="ui-pager" aria-label={messages.table.pagination}>
      <span className="ui-pager-count ui-tnum" aria-hidden="true">
        {countText}
      </span>
      {numbered ? (
        <div className="ui-pager-numbers">
          <button
            type="button"
            className="ui-pager-step"
            aria-label={messages.table.previous}
            disabled={!hasPrevious}
            onClick={onPrevious}
          >
            <Icon icon={ChevronLeft} size="sm" />
          </button>
          {pageWindow(page, pageCount).map((p, i) =>
            p === 'gap' ? (
              <span key={`gap-${i}`} className="ui-pager-gap" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                className="ui-pager-page ui-tnum"
                aria-current={p === page ? 'page' : undefined}
                aria-label={fill(messages.table.page, { page: formatNumber(p) })}
                onClick={() => onPage(p)}
              >
                {formatNumber(p)}
              </button>
            ),
          )}
          <button
            type="button"
            className="ui-pager-step"
            aria-label={messages.table.next}
            disabled={!hasNext}
            onClick={onNext}
          >
            <Icon icon={ChevronRight} size="sm" />
          </button>
        </div>
      ) : (
        <PagerButtons
          hasPrevious={hasPrevious}
          hasNext={hasNext}
          onPrevious={onPrevious}
          onNext={onNext}
          onLoadMore={onLoadMore}
        />
      )}
    </nav>
  );
}

/** Previous and next, and "load more" on phones, for lists without page numbers. */
function PagerButtons({
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  onLoadMore,
}: Pick<TablePagination, 'hasPrevious' | 'hasNext' | 'onPrevious' | 'onNext' | 'onLoadMore'>) {
  const { messages } = useUi();
  return (
    <>
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
    </>
  );
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
  filterMode = 'inline',
  activeFilters,
  className,
}: TableToolbarProps) {
  const { messages, formatNumber } = useUi();
  const [term, setTerm] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const phone = useMediaQuery('(max-width: 639.95px)');
  const panelId = useId();
  const search = useRef<HTMLInputElement>(null);
  const inPanel = filterMode === 'panel' && !phone;

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
          <div className="ui-search" data-empty={term === '' || undefined}>
            <Icon icon={Search} size="sm" />
            <input
              ref={search}
              type="search"
              className="ui-input"
              aria-label={messages.table.search}
              placeholder={searchPlaceholder ?? messages.table.search}
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Escape' || term === '') return;
                event.preventDefault();
                setTerm('');
              }}
            />
            <button
              type="button"
              className="ui-search-clear"
              aria-label={messages.common.dismiss}
              onClick={() => {
                setTerm('');
                search.current?.focus();
              }}
            >
              <Icon icon={X} size="sm" />
            </button>
          </div>
        )}
        {filters && filterMode === 'panel' && (
          <button
            type="button"
            className={cx(
              'ui-btn',
              'ui-btn-secondary',
              'ui-filter-toggle',
              (panelOpen || activeFilterCount > 0) && 'is-active',
            )}
            aria-label={filterButtonLabel}
            aria-expanded={inPanel ? panelOpen : undefined}
            aria-controls={inPanel && panelOpen ? panelId : undefined}
            onClick={() => (inPanel ? setPanelOpen((open) => !open) : setSheetOpen(true))}
          >
            <Icon icon={SlidersHorizontal} size="sm" />
            <span>{messages.table.filters}</span>
            {activeFilterCount > 0 && (
              <span className="ui-filter-count ui-tnum" aria-hidden="true">
                {formatNumber(activeFilterCount)}
              </span>
            )}
          </button>
        )}
        {filters && filterMode === 'inline' && (
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
      {activeFilters && activeFilters.length > 0 && (
        <div className="ui-active-filters">
          <ul className="ui-active-filter-list" aria-label={messages.table.filters}>
            {activeFilters.map((filter) => (
              <li key={filter.id} className="ui-active-filter">
                <span>{filter.label}</span>
                <button
                  type="button"
                  className="ui-active-filter-remove"
                  aria-label={fill(messages.table.removeFilter, { label: filter.label })}
                  onClick={filter.onRemove}
                >
                  <Icon icon={X} size="sm" />
                </button>
              </li>
            ))}
          </ul>
          {onClearFilters && (
            <button type="button" className="ui-clear-all" onClick={onClearFilters}>
              {messages.table.clearAll}
            </button>
          )}
        </div>
      )}
      {filters && inPanel && panelOpen && (
        <div id={panelId} className="ui-filter-panel">
          {filters}
        </div>
      )}
      {chips && chips.length > 0 && (
        <div className="ui-chips" role="group" aria-label={messages.table.filters}>
          {chips.map((chip) => {
            const selected = chip.id === activeChip;
            return (
              <button
                key={chip.id}
                type="button"
                className="ui-chip"
                aria-pressed={selected}
                data-selected={selected || undefined}
                onClick={() => onChipChange?.(chip.id)}
              >
                {chip.label}
                {chip.count !== undefined && (
                  <span className="ui-chip-count ui-tnum">{formatNumber(chip.count)}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {filters && filterMode === 'inline' && (
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
