import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations, renderWithUi } from '../../testing/index.js';
import { SegmentedControl } from './SegmentedControl.js';

const options = [
  { id: 'bn', label: 'বাংলা' },
  { id: 'en', label: 'English' },
];

describe('SegmentedControl (UX-19)', () => {
  it('shows every option, marks the selected one and moves the choice with a press', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = renderWithUi(
      <SegmentedControl label="ভাষা" options={options} value="bn" onChange={onChange} />,
      { locale: 'bn' },
    );
    const group = screen.getByRole('radiogroup', { name: 'ভাষা' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'বাংলা' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'English' })).not.toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'English' }));
    expect(onChange).toHaveBeenCalledWith('en');
    await expectNoAxeViolations(container);
  });

  it('keeps the selection when the selected option is pressed again, and works with the keyboard', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithUi(
      <SegmentedControl label="Language" options={options} value="en" onChange={onChange} />,
    );
    await user.click(screen.getByRole('radio', { name: 'English' }));
    expect(onChange).not.toHaveBeenCalled();
    screen.getByRole('radio', { name: 'English' }).focus();
    await user.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenCalledWith('bn');
  });
});
