import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Hash, Type } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations, renderWithUi } from '../../testing/index.js';
import { ChoiceTiles } from './ChoiceTiles.js';

const groups = [
  {
    title: 'লেখা',
    tiles: [
      { id: 'short', title: 'ছোট উত্তর', description: 'যেমন নাম', icon: Type },
      { id: 'long', title: 'বড় উত্তর', description: 'যেমন মন্তব্য', icon: Type },
    ],
  },
  { title: 'সংখ্যা', tiles: [{ id: 'number', title: 'সংখ্যা', icon: Hash }] },
];

describe('ChoiceTiles', () => {
  it('is a radio group whose tiles are named by their title and description', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = renderWithUi(
      <ChoiceTiles label="প্রশ্নের ধরন" tiles={groups} onChange={onChange} />,
      { locale: 'bn' },
    );
    expect(screen.getByRole('radiogroup', { name: 'প্রশ্নের ধরন' })).toBeInTheDocument();
    expect(screen.getByText('লেখা')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'বড় উত্তর যেমন মন্তব্য' }));
    expect(onChange).toHaveBeenLastCalledWith('long');
    expect(screen.getByRole('radio', { name: 'বড় উত্তর যেমন মন্তব্য' })).toBeChecked();
    await expectNoAxeViolations(container);
  });

  it('moves and selects with the arrow keys across the groups', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithUi(
      <ChoiceTiles label="Type" tiles={groups} defaultValue="short" onChange={onChange} />,
    );
    screen.getByRole('radio', { name: /^ছোট উত্তর/ }).focus();
    await user.keyboard('{ArrowDown}');
    expect(onChange).toHaveBeenLastCalledWith('long');
    await user.keyboard('{ArrowDown}');
    expect(onChange).toHaveBeenLastCalledWith('number');
    expect(screen.getByRole('radio', { name: /^সংখ্যা/ })).toBeChecked();
  });

  it('shows its helper and its error, and names them for the group', () => {
    renderWithUi(
      <ChoiceTiles
        label="Type"
        helper="Pick one"
        error="Pick a type first"
        required
        tiles={[{ id: 'a', title: 'A' }]}
      />,
    );
    const group = screen.getByRole('radiogroup', { name: /^Type/ });
    expect(group).toHaveAttribute('aria-invalid', 'true');
    expect(group).toHaveAccessibleDescription('Pick one Pick a type first');
    expect(screen.getByText('Pick a type first')).toBeVisible();
  });

  it('takes flat tiles and keeps a controlled value', async () => {
    const user = userEvent.setup();
    renderWithUi(
      <ChoiceTiles
        label="Kind"
        tiles={[
          { id: 'a', title: 'A' },
          { id: 'b', title: 'B', disabled: true },
        ]}
        value="a"
      />,
    );
    expect(screen.getByRole('radio', { name: 'A' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'B' })).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: 'B' }));
    expect(screen.getByRole('radio', { name: 'A' })).toBeChecked();
  });
});
