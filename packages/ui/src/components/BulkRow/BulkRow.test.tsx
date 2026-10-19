import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations, renderWithUi } from '../../testing/index.js';
import { BulkList, BulkRow } from './BulkRow.js';

function Harness({ onAbsent = vi.fn(), onDone = vi.fn() }) {
  const [selected, setSelected] = useState(false);
  const [expanded, setExpanded] = useState(false);
  return (
    <BulkList
      label="Today's distribution"
      selectAllLabel="Select all remaining"
      allSelected={selected}
      onSelectAll={setSelected}
      selectedCount={selected ? 1 : 0}
    >
      <BulkRow
        title="Rahima Khatun"
        meta="APP-0042 · Char Kukri"
        state={{ status: 'draft', label: 'Not distributed' }}
        selected={selected}
        onSelect={setSelected}
        quickAction={{ label: 'Distributed', onPress: onDone }}
        menuActions={[
          { id: 'absent', label: 'Absent', onAction: onAbsent },
          { id: 'later', label: 'Later', onAction: () => {} },
        ]}
        expanded={expanded}
        onExpandedChange={setExpanded}
      >
        <p>Quantity and note</p>
      </BulkRow>
    </BulkList>
  );
}

describe('BulkRow and BulkList', () => {
  it('selects a row and counts it in the header', async () => {
    const user = userEvent.setup();
    const { container } = renderWithUi(<Harness />);
    expect(screen.getByRole('list', { name: "Today's distribution" })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /Rahima Khatun/ }));
    expect(screen.getByRole('checkbox', { name: /Rahima Khatun/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select all remaining' })).toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent(/^1 selected$/);
    await expectNoAxeViolations(container);
  });

  it('runs the quick action and an edge state from the row menu', async () => {
    const onAbsent = vi.fn();
    const onDone = vi.fn();
    const user = userEvent.setup();
    renderWithUi(<Harness onAbsent={onAbsent} onDone={onDone} />);
    await user.click(screen.getByRole('button', { name: 'Distributed' }));
    expect(onDone).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: /Rahima Khatun/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Absent' }));
    expect(onAbsent).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('shows and hides the inline detail', async () => {
    const user = userEvent.setup();
    renderWithUi(<Harness />);
    expect(screen.getByText('Quantity and note')).not.toBeVisible();
    const toggle = screen.getByRole('button', { name: 'Show details' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(screen.getByText('Quantity and note')).toBeVisible();
    const hide = screen.getByRole('button', { name: 'Hide details' });
    expect(hide).toHaveAttribute('aria-expanded', 'true');
    await user.click(hide);
    expect(screen.getByText('Quantity and note')).not.toBeVisible();
    expect(screen.getByRole('button', { name: 'Show details' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});
