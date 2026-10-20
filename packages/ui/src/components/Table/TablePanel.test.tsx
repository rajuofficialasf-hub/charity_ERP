import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { pageWindow } from '../../templates/mui/Table.js';
import { expectNoAxeViolations, renderWithUi } from '../../testing/index.js';
import { Avatar } from '../Avatar/Avatar.js';
import { Badge } from '../Badge/Badge.js';
import { TextField } from '../Field/TextField.js';
import { FilterGroup } from '../Layout/Layout.js';
import { Table, TableToolbar, type TableColumn } from './Table.js';

interface Row {
  id: string;
  name: string;
}
const rows: Row[] = [
  { id: 'a', name: 'Rahima Khatun' },
  { id: 'b', name: 'Karim Mia' },
];
const columns: TableColumn<Row>[] = [
  { id: 'name', header: 'Name', cell: (r) => r.name, isRowHeader: true },
];
const base = {
  label: 'Volunteers',
  columns,
  rows,
  rowKey: (r: Row) => r.id,
  rowLabel: (r: Row) => r.name,
  cardRenderer: (r: Row) => <p>{r.name}</p>,
};

describe('the numbered pager', () => {
  it('lists the first, the last and the pages around the current one', () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(5, 10)).toEqual([1, 'gap', 4, 5, 6, 'gap', 10]);
    expect(pageWindow(1, 10)).toEqual([1, 2, 'gap', 10]);
    expect(pageWindow(10, 10)).toEqual([1, 'gap', 9, 10]);
  });

  it('opens a page by its number and marks the current one, with the caller summary', async () => {
    const onPage = vi.fn();
    const onNext = vi.fn();
    const user = userEvent.setup();
    const { container } = renderWithUi(
      <Table
        {...base}
        layout="panel"
        pagination={{
          shown: 2,
          total: 23,
          page: 1,
          pageCount: 3,
          onPage,
          hasNext: true,
          onNext,
          summary: '1–10 shown · 23 people',
        }}
      />,
    );
    const pager = screen.getByRole('navigation', { name: 'Pagination' });
    expect(pager).toHaveTextContent('1–10 shown · 23 people');
    expect(within(pager).getByRole('button', { name: 'Page 1' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(pager).getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await user.click(within(pager).getByRole('button', { name: 'Page 3' }));
    expect(onPage).toHaveBeenCalledWith(3);
    await user.click(within(pager).getByRole('button', { name: 'Next page' }));
    expect(onNext).toHaveBeenCalledOnce();
    expect(container.querySelector('.ui-table-panel')).not.toBeNull();
    await expectNoAxeViolations(container);
  });
});

describe('the filters opened in place', () => {
  it('open and close with the filter button, and the active ones are removable chips', async () => {
    const onRemove = vi.fn();
    const onClear = vi.fn();
    const user = userEvent.setup();
    const { container } = renderWithUi(
      <TableToolbar
        onSearch={() => {}}
        filterMode="panel"
        activeFilterCount={1}
        activeFilters={[{ id: 'division', label: 'Division: Dhaka', onRemove }]}
        onClearFilters={onClear}
        filters={
          <FilterGroup title="Area">
            <TextField label="District" />
          </FilterGroup>
        }
      />,
    );
    const toggle = screen.getByRole('button', { name: 'Filters (1 active)' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('group', { name: 'Area' })).toBeNull();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('group', { name: 'Area' })).toBeInTheDocument();
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole('button', { name: 'Remove Division: Dhaka' }));
    expect(onRemove).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(onClear).toHaveBeenCalledOnce();
    await user.click(toggle);
    expect(screen.queryByRole('group', { name: 'Area' })).toBeNull();
  });
});

describe('small pieces of the list', () => {
  it('a dot badge shows its word after a dot; an avatar can show one letter', async () => {
    const { container } = renderWithUi(
      <>
        <Badge variant="dot" tone="success" label="Active" />
        <Avatar name="Karim Mia" letters={1} />
        <Avatar name="Karim Mia" />
      </>,
    );
    expect(screen.getByText('Active')).toHaveClass('ui-status-dot', 't-success');
    const [one, two] = container.querySelectorAll('.ui-avatar');
    expect(one).toHaveTextContent(/^K$/);
    expect(two).toHaveTextContent(/^KM$/);
    await expectNoAxeViolations(container);
  });
});
