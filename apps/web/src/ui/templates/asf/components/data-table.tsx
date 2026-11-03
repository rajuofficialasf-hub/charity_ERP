import type { ReactNode } from 'react';
import type { FilterBarProps, DataTableExtendedProps } from '@/ui/contract';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Table from '@mui/material/Table';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';

import { fill, useLabels } from './labels';
import { EmptyState, LoadingState } from './states';

// ----------------------------------------------------------------------

/** Filter fields in one row on wide screens, stacked on phones. */
export function FilterBar({ children, label }: FilterBarProps) {
  const labels = useLabels();
  return (
    <Box
      role="group"
      aria-label={label ?? labels.filters}
      sx={{
        display: 'grid',
        gap: 2,
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(auto-fit, minmax(180px, 1fr))' },
        alignItems: 'start',
      }}
    >
      {children}
    </Box>
  );
}

function Frame({ framed, children }: { framed: boolean; children: ReactNode }) {
  return framed ? <Card>{children}</Card> : <>{children}</>;
}

/**
 * Rows under column headers, with loading and empty states inside the table. With a title,
 * toolbar or pagination it sits in its own card, as in the reference list screens.
 */
export function DataTable<Row>({
  label,
  rows,
  columns,
  getRowId,
  loading,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  title,
  description,
  actions,
  toolbar,
  pagination,
}: DataTableExtendedProps<Row>) {
  const labels = useLabels();
  const framed = Boolean(title || toolbar || pagination);
  const span = columns.length;
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
      <Box sx={{ overflowX: 'auto' }}>
        <Table aria-label={label} aria-busy={loading ? true : undefined} sx={{ minWidth: span > 4 ? 640 : undefined }}>
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell key={column.id} align={column.align ?? 'left'} scope="col">
                  {column.header}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={span} sx={{ border: 0 }}>
                  <LoadingState />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={span} sx={{ border: 0, p: 2 }}>
                  <EmptyState title={emptyTitle} description={emptyDescription} />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={getRowId(row)} hover>
                  {columns.map((column) => (
                    <TableCell key={column.id} align={column.align ?? 'left'}>
                      {column.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Box>
      {pagination && (
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
      )}
    </Frame>
  );
}
