import type { Theme, SxProps } from '@mui/material/styles';
import type { ReactNode, MouseEvent, KeyboardEvent, RefObject } from 'react';
import type { Pagination as PaginationProps, CursorPagination, DataTableExtendedProps, DataTableExtendedColumn } from '@/ui/contract';

import { useEffect, useRef, useState } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import TableRow from '@mui/material/TableRow';
import Checkbox from '@mui/material/Checkbox';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import IconButton from '@mui/material/IconButton';
import Pagination from '@mui/material/Pagination';
import useMediaQuery from '@mui/material/useMediaQuery';
import TableSortLabel from '@mui/material/TableSortLabel';
import TablePagination from '@mui/material/TablePagination';

import { Icon } from './icon';
import { fill, useLabels } from './labels';
import { EmptyState, LoadingState } from './states';

/** Whether the box is narrower than what it holds, kept current as either changes size; `shown` re-reads it when the box comes back. */
function useScrollsSideways(ref: RefObject<HTMLElement | null>, shown: boolean): boolean {
  const [scrolls, setScrolls] = useState(false);
  useEffect(() => {
    const box = ref.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const measure = () => setScrolls(box.scrollWidth > box.clientWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    if (box.firstElementChild) observer.observe(box.firstElementChild);
    measure();
    return () => observer.disconnect();
  }, [ref, shown]);
  return scrolls;
}

// ----------------------------------------------------------------------


/** A click on a control inside a row acts on that control, never on the row. */
const INNER_CONTROL = 'a, button, input, label, select, textarea, [role="button"], [role="checkbox"]';

/** Lower-priority columns give way first as the screen narrows. */
function priorityDisplay(priority: DataTableExtendedColumn<unknown>['priority']) {
  if (priority === 2) return { xs: 'none', sm: 'table-cell' };
  if (priority === 3) return { xs: 'none', lg: 'table-cell' };
  return undefined;
}

/** A column's cell style; in the body the row header reads a little bolder. */
function cellSx(column: DataTableExtendedColumn<never>, body = false) {
  return {
    display: priorityDisplay(column.priority),
    ...(column.numeric && { fontVariantNumeric: 'tabular-nums' }),
    ...(body && column.isRowHeader && { fontWeight: 600 }),
  };
}

function Frame({ framed, children }: { framed: boolean; children: ReactNode }) {
  return framed ? <Card>{children}</Card> : <>{children}</>;
}

/** The selection the caller keeps, or the table's own. */
function useSelection(selectedIds: ReadonlySet<string> | undefined, onSelectionChange: ((ids: Set<string>) => void) | undefined) {
  const [own, setOwn] = useState<ReadonlySet<string>>(new Set());
  const selection = selectedIds ?? own;
  const select = (next: Set<string>) => {
    setOwn(next);
    onSelectionChange?.(next);
  };
  return [selection, select] as const;
}

/**
 * Rows under column headers, with loading, empty and error states inside the table. With a title,
 * toolbar or pagination it sits in its own card, as in the reference list screens. Given a
 * `cardRenderer`, phones get the rows as cards instead.
 */
export function DataTable<Row>({
  label,
  rows,
  columns,
  getRowId,
  loading,
  emptyTitle,
  emptyDescription,
  emptyAction,
  title,
  description,
  actions,
  toolbar,
  pagination,
  cursorPagination,
  rowLabel,
  cardRenderer,
  selectionMode = 'none',
  selectedIds,
  onSelectionChange,
  bulkActions,
  sort,
  onSortChange,
  onRowOpen,
  rowActions,
  dense,
  error,
}: DataTableExtendedProps<Row>) {
  const labels = useLabels();
  const phone = useMediaQuery((theme: Theme) => theme.breakpoints.down('md'), { noSsr: true });
  const asCards = Boolean(cardRenderer) && phone;
  const scrollBox = useRef<HTMLDivElement>(null);
  const scrolls = useScrollsSideways(scrollBox, !asCards);
  const [selection, select] = useSelection(selectedIds, onSelectionChange);
  const ids = rows.map(getRowId);
  const multiple = selectionMode === 'multiple';
  const allSelected = ids.length > 0 && ids.every((id) => selection.has(id));
  const someSelected = ids.some((id) => selection.has(id));
  const nameOf = (row: Row) => rowLabel?.(row) ?? getRowId(row);

  const toggle = (id: string) => {
    const next = new Set(selectionMode === 'single' ? [] : selection);
    if (selection.has(id)) next.delete(id);
    else next.add(id);
    select(next);
  };
  const sortBy = (columnId: string) => {
    const descending = sort?.columnId === columnId && sort.direction === 'asc';
    onSortChange?.({ columnId, direction: descending ? 'desc' : 'asc' });
  };
  const onRowClick = (event: MouseEvent<HTMLElement>, row: Row) => {
    const target = event.target as HTMLElement;
    // clicks bubble through portals: a menu or dialog opened from the row is not the row
    if (!event.currentTarget.contains(target)) return;
    const control = target.closest(INNER_CONTROL);
    if (control && event.currentTarget.contains(control)) return;
    if (onRowOpen) onRowOpen(row);
    else if (selectionMode !== 'none') toggle(getRowId(row));
  };
  const onRowKeyDown = (event: KeyboardEvent<HTMLElement>, row: Row) => {
    if (event.target !== event.currentTarget || event.key !== 'Enter' || !onRowOpen) return;
    event.preventDefault();
    onRowOpen(row);
  };

  const span = columns.length + (multiple ? 1 : 0) + (rowActions ? 1 : 0);
  const state = error ?? (loading ? <LoadingState /> : rows.length === 0 ? <EmptyState title={emptyTitle ?? labels.tableEmpty} description={emptyDescription} action={emptyAction} /> : null);
  const framed = Boolean(title || toolbar || pagination || cursorPagination);
  // the selection may hold rows of other pages: the count and the bulk actions cover all of it
  const selectedCount = selection.size;

  // a table wider than its box scrolls sideways: the box then takes the keyboard's focus and a
  // name, so the columns out of view can be reached without a pointer
  const table = (
    <Box ref={scrollBox} sx={{ overflowX: 'auto' }} {...(scrolls ? { tabIndex: 0, role: 'region', 'aria-label': label } : {})}>
      <Table aria-label={label} aria-busy={loading ? true : undefined} size={dense ? 'small' : 'medium'} sx={{ minWidth: span > 4 ? 640 : undefined }}>
        <TableHead>
          <TableRow>
            {multiple && (
              <TableCell padding="checkbox" scope="col">
                <Checkbox
                  checked={allSelected}
                  indeterminate={!allSelected && someSelected}
                  disabled={rows.length === 0}
                  onChange={() => {
                    // only the rows shown join or leave; rows chosen on other pages stay chosen
                    const next = new Set(selection);
                    for (const id of ids) {
                      if (allSelected) next.delete(id);
                      else next.add(id);
                    }
                    select(next);
                  }}
                  slotProps={{ input: { 'aria-label': labels.selectAll } }}
                />
              </TableCell>
            )}
            {columns.map((column) => {
              const sorted = sort?.columnId === column.id ? sort.direction : undefined;
              return (
                <TableCell
                  key={column.id}
                  align={column.numeric ? 'right' : (column.align ?? 'left')}
                  scope="col"
                  sortDirection={sorted ?? false}
                  sx={cellSx(column)}
                >
                  {column.sortable && onSortChange ? (
                    <TableSortLabel active={Boolean(sorted)} direction={sorted ?? 'asc'} onClick={() => sortBy(column.id)}>
                      {column.header}
                    </TableSortLabel>
                  ) : (
                    column.header
                  )}
                </TableCell>
              );
            })}
            {rowActions && (
              <TableCell align="right" scope="col">
                {labels.rowActions}
              </TableCell>
            )}
          </TableRow>
        </TableHead>
        <TableBody>
          {state ? (
            <TableRow>
              <TableCell colSpan={span} sx={{ border: 0, p: error ? 2 : undefined }}>
                {state}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => {
              const id = getRowId(row);
              const selected = selection.has(id);
              return (
                <TableRow
                  key={id}
                  hover
                  selected={selected}
                  aria-selected={selectionMode === 'none' ? undefined : selected}
                  tabIndex={onRowOpen ? 0 : undefined}
                  onClick={(event) => onRowClick(event, row)}
                  onKeyDown={(event) => onRowKeyDown(event, row)}
                  sx={{ cursor: onRowOpen ? 'pointer' : undefined }}
                >
                  {multiple && (
                    <TableCell padding="checkbox">
                      <Checkbox checked={selected} onChange={() => toggle(id)} slotProps={{ input: { 'aria-label': fill(labels.selectRow, { name: nameOf(row) }) } }} />
                    </TableCell>
                  )}
                  {columns.map((column) => (
                    <TableCell
                      key={column.id}
                      align={column.numeric ? 'right' : (column.align ?? 'left')}
                      {...(column.isRowHeader ? { component: 'th', scope: 'row' } : {})}
                      sx={cellSx(column, true)}
                    >
                      {column.cell(row)}
                    </TableCell>
                  ))}
                  {rowActions && (
                    <TableCell align="right">
                      <Box sx={{ display: 'inline-flex', gap: 0.5, alignItems: 'center' }}>{rowActions(row)}</Box>
                    </TableCell>
                  )}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </Box>
  );

  const cards = state ? (
    <Box sx={{ p: 2 }}>{state}</Box>
  ) : (
    // one column that never grows past the screen; a long word in a card (a code, an address) breaks
    <Box component="ul" aria-label={label} sx={{ listStyle: 'none', m: 0, p: 2, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5, overflowWrap: 'anywhere' }}>
      {rows.map((row) => {
        const id = getRowId(row);
        const selected = selection.has(id);
        return (
          <Box
            component="li"
            key={id}
            sx={(theme) => ({
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1,
              p: 1.5,
              borderRadius: 1.5,
              border: 1,
              borderColor: selected ? 'primary.main' : 'divider',
              bgcolor: selected ? 'rgba(var(--asf-palette-primary-mainChannel) / 0.08)' : 'background.paper',
              ...theme.applyStyles('dark', { borderColor: selected ? 'primary.main' : 'divider' }),
            })}
          >
            {multiple && (
              <Checkbox checked={selected} onChange={() => toggle(id)} sx={{ mt: -0.5, ml: -0.5 }} slotProps={{ input: { 'aria-label': fill(labels.selectRow, { name: nameOf(row) }) } }} />
            )}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {cardRenderer?.(row)}
              {rowActions && <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>{rowActions(row)}</Box>}
            </Box>
            {(onRowOpen || selectionMode === 'single') && (
              <IconButton
                aria-label={nameOf(row)}
                aria-pressed={selectionMode === 'single' ? selected : undefined}
                onClick={() => (onRowOpen ? onRowOpen(row) : toggle(id))}
                sx={{ alignSelf: 'center' }}
              >
                <Icon name="chevron-right" size={20} />
              </IconButton>
            )}
          </Box>
        );
      })}
    </Box>
  );

  return (
    <Frame framed={framed}>
      {(title || actions) && (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, px: 3, pt: 3, pb: toolbar ? 2 : 3 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {title && (
              <Box component="h2" sx={{ m: 0, typography: 'h6' }}>
                {title}
              </Box>
            )}
            {description && (
              <Box component="p" sx={{ m: 0, mt: 0.5, typography: 'body2', color: 'text.secondary' }}>
                {description}
              </Box>
            )}
          </Box>
          {actions && <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>{actions}</Box>}
        </Box>
      )}
      {toolbar && <Box sx={{ px: 2, pb: 2.5, pt: title ? 0 : 2.5 }}>{toolbar}</Box>}
      {multiple && selectedCount > 0 && (
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 1.5,
            px: 2,
            py: 1,
            bgcolor: 'rgba(var(--asf-palette-primary-mainChannel) / 0.08)',
            borderTop: 1,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Box component="span" role="status" sx={{ typography: 'subtitle2', fontVariantNumeric: 'tabular-nums' }}>
            {fill(labels.selectedCount, { count: selectedCount })}
          </Box>
          {bulkActions && <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>{bulkActions}</Box>}
        </Box>
      )}
      {asCards ? cards : table}
      {pagination && !error && (pagination.showPageNumbers ? <NumberedPager {...pagination} phone={phone} table={label} /> : <RangePager {...pagination} />)}
      {cursorPagination && !error && <CursorPager {...cursorPagination} phone={phone} table={label} />}
    </Frame>
  );
}

const pagerSx: SxProps<Theme> = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 1.5,
  px: 2,
  py: 1.5,
  borderTop: 1,
  borderColor: 'divider',
};

function RangePager(pagination: PaginationProps) {
  const labels = useLabels();
  return (
    <TablePagination
      component="div"
      count={pagination.total}
      page={Math.max(0, pagination.page - 1)}
      rowsPerPage={pagination.pageSize}
      rowsPerPageOptions={pagination.onPageSizeChange ? [...(pagination.pageSizeOptions ?? [10, 25, 50])] : []}
      onPageChange={(_, page) => pagination.onPageChange(page + 1)}
      onRowsPerPageChange={(event) => pagination.onPageSizeChange?.(Number(event.target.value))}
      labelRowsPerPage={labels.rowsPerPage}
      labelDisplayedRows={({ from, to, count }) => fill(labels.rowsRange, { from, to, total: count })}
      getItemAriaLabel={(type) => (type === 'previous' ? labels.previous : type === 'next' ? labels.next : type)}
      sx={{ borderTop: 1, borderColor: 'divider' }}
    />
  );
}

/** The range and the page numbers: the first, the last and the ones around the current page (only the current one on a phone). */
function NumberedPager({ page, pageSize, total, onPageChange, phone, table }: PaginationProps & { phone: boolean; table: string }) {
  const labels = useLabels();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const shown = Math.min(Math.max(1, page), pageCount);
  const from = total === 0 ? 0 : (shown - 1) * pageSize + 1;
  const to = Math.min(total, shown * pageSize);
  return (
    <Box sx={pagerSx}>
      <Box component="span" sx={{ typography: 'body2', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
        {fill(labels.rowsRange, { from, to, total })}
      </Box>
      <Pagination
        aria-label={`${table}: ${labels.pages}`}
        count={pageCount}
        page={shown}
        shape="rounded"
        siblingCount={phone ? 0 : 1}
        onChange={(_, next) => onPageChange(next)}
        getItemAriaLabel={(type, number) =>
          type === 'previous' ? labels.previous : type === 'next' ? labels.next : type === 'page' ? fill(labels.page, { page: number ?? '' }) : type
        }
      />
    </Box>
  );
}

/** Previous and next for a list read by cursor; "load more" on a phone when the caller offers it. */
function CursorPager({ summary, hasPrevious, hasNext, onPrevious, onNext, onLoadMore, page, pageCount, onPage, phone, table }: CursorPagination & { phone: boolean; table: string }) {
  const labels = useLabels();
  const loadMore = phone && onLoadMore;
  // the numbers step only through the counted pages; previous and next also go past them by cursor
  const numbers = page !== undefined && pageCount !== undefined && onPage && (
    <Pagination
      aria-label={`${table}: ${labels.pages}`}
      count={pageCount}
      page={page}
      shape="rounded"
      siblingCount={phone ? 0 : 1}
      hidePrevButton
      hideNextButton
      onChange={(_, next) => onPage(next)}
      getItemAriaLabel={(type, number) => (type === 'page' ? fill(labels.page, { page: number ?? '' }) : type)}
    />
  );
  return (
    <Box sx={pagerSx}>
      {summary && (
        <Box component="span" sx={{ typography: 'body2', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
          {summary}
        </Box>
      )}
      {loadMore ? (
        hasNext && (
          <Button variant="outlined" color="inherit" fullWidth onClick={onLoadMore}>
            {labels.loadMore}
          </Button>
        )
      ) : (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, ml: 'auto' }}>
          <Button variant="outlined" color="inherit" size="small" disabled={!hasPrevious} onClick={onPrevious} startIcon={<Icon name="chevron-left" size={18} />}>
            {labels.previous}
          </Button>
          {numbers}
          <Button variant="outlined" color="inherit" size="small" disabled={!hasNext} onClick={onNext} endIcon={<Icon name="chevron-right" size={18} />}>
            {labels.next}
          </Button>
        </Box>
      )}
    </Box>
  );
}
