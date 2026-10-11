import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations, renderWithUi } from '../../testing/index.js';
import { RowToggle, Switch } from '../RowToggle/RowToggle.js';
import { CheckboxGroup, RadioGroup } from './Choice.js';

const options = [
  { id: 'rice', label: 'চাল' },
  { id: 'blanket', label: 'কম্বল' },
  { id: 'other', label: 'অন্যান্য' },
];

describe('Checkbox and radio groups (DESIGN_SYSTEM 5.4)', () => {
  it('a checkbox group is a labelled group of native checkboxes', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = renderWithUi(
      <CheckboxGroup
        label="প্রাপ্ত সামগ্রী"
        options={options}
        onChange={onChange}
        otherOptionId="other"
      />,
      { locale: 'bn' },
    );
    expect(screen.getByRole('group', { name: 'প্রাপ্ত সামগ্রী' })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'কম্বল' }));
    expect(onChange).toHaveBeenLastCalledWith(['blanket']);
    await user.click(screen.getByRole('checkbox', { name: 'অন্যান্য' }));
    expect(screen.getByRole('textbox', { name: 'অন্যান্য হলে লিখুন' })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('a radio group moves and selects with arrow keys', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = renderWithUi(
      <RadioGroup
        label="Gender"
        required
        options={[
          { id: 'f', label: 'Female' },
          { id: 'm', label: 'Male' },
        ]}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('radiogroup', { name: /Gender/ })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    await user.keyboard('{ArrowDown}');
    expect(onChange).toHaveBeenLastCalledWith('m');
    expect(screen.getByRole('radio', { name: 'Male' })).toBeChecked();
    await expectNoAxeViolations(container);
  });
});

describe('Row / Toggle and Switch (DESIGN_SYSTEM 5.6)', () => {
  it('a switch row has role switch, the row is its label, Space toggles it', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = renderWithUi(
      <>
        <RowToggle
          control="switch"
          title="Distribution"
          description="Dispatch and photos"
          onChange={onChange}
        />
        <RowToggle
          control="switch"
          title="Application form"
          checked
          lockedReason="Cannot be turned off after activation"
        />
        <RowToggle control="value" title="Photo rule" value="One per beneficiary" />
        <RowToggle control="chevron" title="Notification settings" href="/settings/notifications" />
        <Switch aria-label="Dark mode" />
      </>,
    );
    const toggle = screen.getByRole('switch', { name: /Distribution/ });
    toggle.focus();
    await user.keyboard(' ');
    expect(onChange).toHaveBeenLastCalledWith(true);
    expect(toggle).toBeChecked();
    const locked = screen.getByRole('switch', { name: /Application form/ });
    expect(locked).toBeDisabled();
    expect(locked).toHaveAccessibleDescription('Cannot be turned off after activation');
    expect(screen.getByRole('link', { name: /Notification settings/ })).toHaveAttribute(
      'href',
      '/settings/notifications',
    );
    expect(screen.getByRole('switch', { name: 'Dark mode' })).not.toBeChecked();
    await expectNoAxeViolations(container);
  });
});
