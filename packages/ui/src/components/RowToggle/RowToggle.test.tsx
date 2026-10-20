import { fireEvent, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations, renderWithUi } from '../../testing/index.js';
import { Form, FormActions, FormSection } from '../Form/Form.js';
import { TextField } from '../Field/TextField.js';
import { RowToggle, Switch } from './RowToggle.js';

describe('Switch and RowToggle', () => {
  it('is a switch named by its row, toggled by a press and by Space', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = renderWithUi(
      <RowToggle
        control="switch"
        title="Dawah"
        description="Classes and exams"
        onChange={onChange}
      />,
    );
    const toggle = screen.getByRole('switch', { name: /Dawah/ });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    expect(onChange).toHaveBeenLastCalledWith(true);
    expect(toggle).toBeChecked();
    toggle.focus();
    await user.keyboard(' ');
    expect(onChange).toHaveBeenLastCalledWith(false);
    await expectNoAxeViolations(container);
  });

  it('cannot be changed when locked, and says why', () => {
    renderWithUi(
      <RowToggle
        control="switch"
        title="Distribution"
        checked
        lockedReason="Active projects keep it"
      />,
    );
    const toggle = screen.getByRole('switch', { name: /Distribution/ });
    expect(toggle).toBeDisabled();
    expect(toggle).toBeChecked();
    expect(toggle).toHaveAccessibleDescription('Active projects keep it');
  });

  it('a stand-alone switch follows its controlled value', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithUi(
      <Switch isSelected onChange={onChange}>
        Email me
      </Switch>,
    );
    const toggle = screen.getByRole('switch', { name: 'Email me' });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('a chevron row is a link to its page', () => {
    renderWithUi(<RowToggle control="chevron" title="Settings" href="/admin/settings" />);
    expect(screen.getByRole('link', { name: /Settings/ })).toHaveAttribute(
      'href',
      '/admin/settings',
    );
  });
});

describe('Form', () => {
  it('posts nothing by itself and hands the submit to the page, without browser bubbles', () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    renderWithUi(
      <Form onSubmit={onSubmit} aria-label="Contact">
        <FormSection title="You">
          <TextField label="Name" required />
        </FormSection>
        <FormActions>
          <button type="submit">Send</button>
        </FormActions>
      </Form>,
    );
    const form = screen.getByRole('form', { name: 'Contact' });
    expect(form).toHaveAttribute('method', 'post');
    expect(form).toHaveAttribute('novalidate');
    expect(screen.getByRole('group', { name: 'You' })).toBeInTheDocument();
    fireEvent.submit(form);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('ties a field error to its input', () => {
    renderWithUi(<TextField label="NID" error="Enter 10, 13 or 17 digits" />);
    const input = screen.getByRole('textbox', { name: 'NID' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter 10, 13 or 17 digits');
  });
});
