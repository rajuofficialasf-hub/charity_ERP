import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations, renderWithUi } from '../../testing/index.js';
import { NumberField, PasswordField, PhoneField, TextArea, TextField } from './TextField.js';

describe('Field: text, textarea, number, phone (DESIGN_SYSTEM 5.4)', () => {
  it('has a visible label, required in text, and helper and error linked to the input', async () => {
    const { container } = renderWithUi(
      <TextField
        label="উপকারভোগীর নাম"
        required
        helper="জাতীয় পরিচয়পত্র অনুযায়ী"
        error="নাম লিখুন"
      />,
      { locale: 'bn' },
    );
    const input = screen.getByRole('textbox', { name: /উপকারভোগীর নাম/ });
    expect(screen.getByText('(আবশ্যক)')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(/জাতীয় পরিচয়পত্র অনুযায়ী/);
    expect(input).toHaveAccessibleDescription(/নাম লিখুন/);
    await expectNoAxeViolations(container);
  });

  it('a locked field is read-only, says so, and offers a correction request (BD-02)', async () => {
    const onRequestCorrection = vi.fn();
    const user = userEvent.setup();
    const { container } = renderWithUi(
      <TextField
        label="Father's name"
        defaultValue="Abdul Karim"
        locked
        onRequestCorrection={onRequestCorrection}
        changed
        previousValue="Abdul Karim Mia"
      />,
    );
    const input = screen.getByRole('textbox', { name: /Father's name/ });
    expect(input).toHaveAttribute('readonly');
    expect(input).toHaveAccessibleName(/Locked/);
    expect(screen.getByText(/Previous value: Abdul Karim Mia/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Request correction' }));
    expect(onRequestCorrection).toHaveBeenCalledOnce();
    await expectNoAxeViolations(container);
  });

  it('an NID field uses the numeric keypad and turns Bengali digits into English digits', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithUi(<TextField label="NID" type="nid" onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'NID' });
    expect(input).toHaveAttribute('inputmode', 'numeric');
    await user.type(input, '১২৩ ৪৫a');
    expect(input).toHaveValue('12345');
    expect(onChange).toHaveBeenLastCalledWith('12345');
  });

  it('a money field keeps two decimals, English digits and the ৳ prefix', async () => {
    const user = userEvent.setup();
    const { container } = renderWithUi(<NumberField label="Amount (৳)" kind="money" />);
    const input = screen.getByRole('textbox', { name: 'Amount (৳)' });
    expect(input).toHaveAttribute('inputmode', 'decimal');
    await user.type(input, '১,২৫০.৫০৯');
    expect(input).toHaveValue('1250.50');
    expect(container.querySelector('.ui-input-prefix span')).toHaveAttribute('aria-hidden', 'true');
  });

  it('an integer field drops everything but digits', async () => {
    const user = userEvent.setup();
    renderWithUi(<NumberField label="Family members" />);
    const input = screen.getByRole('textbox', { name: 'Family members' });
    await user.type(input, '1২-x');
    expect(input).toHaveValue('12');
    expect(input).toHaveAttribute('inputmode', 'numeric');
  });

  it('a phone field uses the telephone keypad, English digits and no autofill', async () => {
    const user = userEvent.setup();
    const { container } = renderWithUi(<PhoneField label="মোবাইল" />, { locale: 'bn' });
    const input = screen.getByRole('textbox', { name: 'মোবাইল' });
    expect(input).toHaveAttribute('inputmode', 'tel');
    expect(input).toHaveAttribute('autocomplete', 'off');
    await user.type(input, '০১৭১২ ৩৪৫৬৭৮');
    expect(input).toHaveValue('01712345678');
    await expectNoAxeViolations(container);
  });

  it('a textarea is labelled and keeps its text', async () => {
    const user = userEvent.setup();
    const { container } = renderWithUi(<TextArea label="Comment" />);
    const area = screen.getByRole('textbox', { name: 'Comment' });
    expect(area.tagName).toBe('TEXTAREA');
    await user.type(area, 'line one{Enter}line two');
    expect(area).toHaveValue('line one\nline two');
    await expectNoAxeViolations(container);
  });

  it('a phone field may allow autofill of the own number', () => {
    renderWithUi(<PhoneField label="Mobile" autoComplete="tel" />);
    expect(screen.getByRole('textbox', { name: 'Mobile' })).toHaveAttribute('autocomplete', 'tel');
  });

  it('a one-time code field takes the numeric keypad and the OTP autofill hint', () => {
    renderWithUi(<TextField label="Code" inputMode="numeric" autoComplete="one-time-code" />);
    const input = screen.getByRole('textbox', { name: 'Code' });
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input).toHaveAttribute('autocomplete', 'one-time-code');
  });

  it('a password field hides the value until the reveal button is pressed (SCR-001)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = renderWithUi(
      <PasswordField
        label="পাসওয়ার্ড"
        autoComplete="current-password"
        required
        onChange={onChange}
      />,
      { locale: 'bn' },
    );
    const input = container.querySelector('input')!;
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('autocomplete', 'current-password');
    expect(input).toHaveAccessibleName(/পাসওয়ার্ড/);
    await user.type(input, 'Nadi 2026');
    expect(onChange).toHaveBeenLastCalledWith('Nadi 2026');
    const reveal = screen.getByRole('button', { name: 'পাসওয়ার্ড দেখান' });
    expect(reveal).toHaveAttribute('aria-pressed', 'false');
    await user.click(reveal);
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'পাসওয়ার্ড লুকান' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expectNoAxeViolations(container);
  });
});
