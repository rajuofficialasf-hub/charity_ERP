import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Ban, CircleCheck, Clock, ClipboardList, Users, CircleX, UserX } from 'lucide-react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations, renderWithUi } from '../../testing/index.js';
import { StatFilterBar, type StatFilterItem } from './StatFilter.js';

const items: StatFilterItem[] = [
  { id: 'all', label: 'All', value: 23, icon: Users },
  { id: 'active', label: 'Active', value: 21, icon: CircleCheck, tone: 'success' },
  { id: 'pending', label: 'Pending', value: 2, icon: Clock, tone: 'warning' },
  { id: 'blocked', label: 'Blocked', value: 0, icon: Ban },
  { id: 'deactivated', label: 'Deactivated', value: 0, icon: CircleX },
  { id: 'inactive', label: 'Inactive', value: 3, icon: UserX },
  { id: 'applications', label: 'Applications', value: 40, icon: ClipboardList, selectable: false },
];

function Harness({ onSelect = vi.fn() }: { onSelect?: (id: string) => void }) {
  const [selected, setSelected] = useState('all');
  return (
    <StatFilterBar
      label="Volunteer counts"
      items={items}
      selectedId={selected}
      onSelect={(id) => {
        setSelected(id);
        onSelect(id);
      }}
      moreLabel="More states"
      moreValue={(n) => `${n} more`}
    />
  );
}

describe('StatFilterBar', () => {
  it('shows five cards that filter, the chosen one pressed, and the rest behind a last card', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    const { container } = renderWithUi(<Harness onSelect={onSelect} />);
    const group = screen.getByRole('group', { name: 'Volunteer counts' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /All 23/ })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: /Active 21/ }));
    expect(onSelect).toHaveBeenLastCalledWith('active');
    expect(screen.getByRole('button', { name: /Active 21/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'More states' })).toHaveTextContent('2 more');
    await expectNoAxeViolations(container);
  });

  it('chooses a count from the last card and shows it there; a count that is no filter does nothing', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderWithUi(<Harness onSelect={onSelect} />);
    await user.click(screen.getByRole('button', { name: 'More states' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Inactive · 3' }));
    expect(onSelect).toHaveBeenLastCalledWith('inactive');
    const more = screen.getByRole('button', { name: 'More states: Inactive' });
    expect(more).toHaveTextContent('3');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await user.click(more);
    await user.click(await screen.findByRole('menuitem', { name: 'Applications · 40' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('shows placeholders while the counts load', () => {
    renderWithUi(
      <StatFilterBar
        label="Counts"
        items={[]}
        loading
        moreLabel="More"
        moreValue={(n) => String(n)}
      />,
    );
    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });
});
