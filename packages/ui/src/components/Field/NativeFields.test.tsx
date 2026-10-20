import { fireEvent, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithUi } from '../../testing/index.js';
import { FileUpload } from '../FileUpload/FileUpload.js';
import { CheckboxGroup, RadioGroup } from './Choice.js';
import { Combobox, type SelectOption } from './Select.js';
import { PasswordField } from './TextField.js';

const types: SelectOption[] = [
  { id: 'elderly', label: 'Elderly' },
  { id: 'widow', label: 'Widow' },
  { id: 'other', label: 'Other' },
];

describe('the native fields of the set', () => {
  it('a checkbox group reports the remaining choices when one is unchecked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithUi(
      <CheckboxGroup
        label="Needs"
        options={types}
        defaultValue={['elderly', 'widow']}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('checkbox', { name: 'Elderly' }));
    expect(onChange).toHaveBeenLastCalledWith(['widow']);
    expect(screen.getByRole('checkbox', { name: 'Elderly' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Widow' })).toBeChecked();
  });

  it('a radio group with an error is invalid and described by the error', () => {
    renderWithUi(<RadioGroup label="Gender" options={types} error="Choose one" required />);
    const group = screen.getByRole('radiogroup', { name: /Gender/ });
    expect(group).toHaveAttribute('aria-invalid', 'true');
    expect(group).toHaveAccessibleDescription('Choose one');
  });

  it('keeps the "other" text box of a locked group closed to changes', () => {
    renderWithUi(
      <RadioGroup label="Type" options={types} value="other" otherOptionId="other" locked />,
    );
    expect(screen.getByRole('textbox', { name: 'If other, please specify' })).toBeDisabled();
  });

  it('a disabled password field cannot reveal the password', async () => {
    const user = userEvent.setup();
    renderWithUi(<PasswordField label="Password" autoComplete="current-password" disabled />);
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle).toBeDisabled();
    await user.click(toggle);
    expect(screen.getByLabelText(/^Password/, { selector: 'input' })).toHaveAttribute(
      'type',
      'password',
    );
  });

  it('opens the combobox list with its button and closes it with a second press', async () => {
    const user = userEvent.setup();
    renderWithUi(<Combobox label="Type" options={types} />);
    const button = screen.getByRole('button', { name: 'Show options' });
    await user.click(button);
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(3);
    await user.click(button);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('a full upload refuses a dropped file without letting the browser open it', () => {
    const { container } = renderWithUi(
      <FileUpload
        label="Photo"
        source="gallery"
        value={[{ id: 'a', name: 'a.jpg', state: 'ready' }]}
        onAdd={() => {}}
      />,
    );
    const zone = container.querySelector('.ui-upload-zone')!;
    const dataTransfer = { types: ['Files'], dropEffect: 'copy', files: [] };
    const over = fireEvent.dragOver(zone, { dataTransfer });
    // a cancelled dragover is what keeps the browser from opening the file in place of the page
    expect(over).toBe(false);
    expect(dataTransfer.dropEffect).toBe('none');
    expect(zone).not.toHaveAttribute('data-drop-target');
  });
});
