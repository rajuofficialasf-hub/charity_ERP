'use client';

import { toEnglishDigits } from '@css/shared';
import { Eye, EyeOff } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import {
  Button as AriaButton,
  Input,
  TextArea as AriaTextArea,
  TextField as AriaTextField,
} from 'react-aria-components';
import { useUi } from '../../provider/UiProvider.js';
import { useTextValue } from '../../utils/useTextValue.js';
import { Icon } from '../Icon/Icon.js';
import { FieldFooter, FieldLabel, fieldClass, type FieldBaseProps } from './FieldParts.js';

export interface TextFieldProps extends FieldBaseProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  /** text (default), email, or an identity number shown with the numeric keypad (NID 10/13/17). */
  type?: 'text' | 'email' | 'nid';
  placeholder?: string;
  maxLength?: number;
  autoComplete?: string;
  /** Keyboard hint, e.g. `numeric` for a one-time code (with `autoComplete="one-time-code"`). */
  inputMode?: 'text' | 'numeric' | 'email' | 'tel';
  /** `lang` of the value when it is in the other language. */
  lang?: string;
  /** A small action or state inside the field at its end, e.g. "যাচাই করুন" or a verified mark (UX-16). */
  endAction?: ReactNode;
}

/** The input, with an action inside its end when one is given. */
function WithAction({ action, children }: { action?: ReactNode; children: ReactNode }) {
  if (!action) return <>{children}</>;
  return (
    <div className="ui-input-wrap has-action">
      {children}
      <span className="ui-input-action">{action}</span>
    </div>
  );
}

/** Single-line text field: label, control, helper, error, lock and change marker (DESIGN_SYSTEM 5.4). */
export function TextField({
  type = 'text',
  onChange,
  value,
  defaultValue,
  placeholder,
  maxLength,
  autoComplete,
  inputMode,
  lang,
  onBlur,
  endAction,
  ...field
}: TextFieldProps) {
  const numeric = type === 'nid';
  const [current, set] = useTextValue(value, defaultValue, onChange, (v) =>
    numeric ? toEnglishDigits(v).replace(/\D/g, '') : v,
  );
  return (
    <AriaTextField
      className={fieldClass(field)}
      id={field.id}
      name={field.name}
      value={current}
      onChange={set}
      onBlur={onBlur}
      type={type === 'email' ? 'email' : 'text'}
      inputMode={inputMode ?? (numeric ? 'numeric' : type === 'email' ? 'email' : undefined)}
      isRequired={field.required}
      isInvalid={!!field.error}
      isReadOnly={field.readOnly || field.locked}
      isDisabled={field.disabled}
      maxLength={maxLength ?? (numeric ? 17 : undefined)}
      autoComplete={autoComplete ?? (numeric ? 'off' : undefined)}
      validationBehavior="aria"
    >
      <FieldLabel {...field} />
      <WithAction action={endAction}>
        <Input className="ui-input" placeholder={placeholder} lang={lang} />
      </WithAction>
      <FieldFooter {...field} />
    </AriaTextField>
  );
}

export interface TextAreaProps extends FieldBaseProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
  lang?: string;
}

/** Multi-line text that grows with its content (DESIGN_SYSTEM 5.4, long_text). */
export function TextArea({
  value,
  defaultValue,
  onChange,
  onBlur,
  placeholder,
  maxLength,
  rows = 3,
  lang,
  ...field
}: TextAreaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const grow = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  };
  useLayoutEffect(grow, [value]);
  return (
    <AriaTextField
      className={fieldClass(field)}
      id={field.id}
      name={field.name}
      value={value}
      defaultValue={defaultValue}
      onChange={(v) => {
        onChange?.(v);
        grow();
      }}
      onBlur={onBlur}
      isRequired={field.required}
      isInvalid={!!field.error}
      isReadOnly={field.readOnly || field.locked}
      isDisabled={field.disabled}
      maxLength={maxLength}
      validationBehavior="aria"
    >
      <FieldLabel {...field} />
      <AriaTextArea
        ref={ref}
        className="ui-input ui-textarea"
        placeholder={placeholder}
        rows={rows}
        lang={lang}
      />
      <FieldFooter {...field} />
    </AriaTextField>
  );
}

export interface NumberFieldProps extends FieldBaseProps {
  /** The value as typed, with English digits; the caller parses it. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  /** integer (numeric keypad), decimal, or money with the ৳ prefix (decimal keypad). */
  kind?: 'integer' | 'decimal' | 'money';
  placeholder?: string;
}

/**
 * Number input as text with the right keypad; Bengali digits typed by the user become English
 * digits and other characters are dropped (DESIGN_SYSTEM 5.4, I18N 6.4). No spin buttons.
 */
export function NumberField({
  kind = 'integer',
  value,
  defaultValue,
  onChange,
  onBlur,
  placeholder,
  ...field
}: NumberFieldProps) {
  const clean = (raw: string) => {
    const digits = toEnglishDigits(raw);
    if (kind === 'integer') return digits.replace(/\D/g, '');
    const [whole = '', ...rest] = digits.replace(/[^\d.]/g, '').split('.');
    return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
  };
  const prefix: HTMLAttributes<HTMLSpanElement> = { 'aria-hidden': true };
  const [current, set] = useTextValue(value, defaultValue, onChange, clean);
  return (
    <AriaTextField
      className={fieldClass(field)}
      id={field.id}
      name={field.name}
      value={current}
      onChange={set}
      onBlur={onBlur}
      inputMode={kind === 'integer' ? 'numeric' : 'decimal'}
      isRequired={field.required}
      isInvalid={!!field.error}
      isReadOnly={field.readOnly || field.locked}
      isDisabled={field.disabled}
      autoComplete="off"
      validationBehavior="aria"
    >
      <FieldLabel {...field} />
      <div className={kind === 'money' ? 'ui-input-prefix' : undefined}>
        {kind === 'money' && <span {...prefix}>৳</span>}
        <Input className="ui-input ui-tnum" placeholder={placeholder} />
      </div>
      <FieldFooter {...field} />
    </AriaTextField>
  );
}

export interface PhoneFieldProps extends FieldBaseProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  /** Off by default (a beneficiary's number must never be autofilled, BD-03); `tel` for own number. */
  autoComplete?: string;
  /** A small action or state inside the field at its end (UX-16). */
  endAction?: ReactNode;
}

/** Bangladesh mobile number: telephone keypad, English digits, 11 digits, no autofill (BD-03). */
export function PhoneField({
  value,
  defaultValue,
  onChange,
  onBlur,
  placeholder,
  autoComplete = 'off',
  endAction,
  ...field
}: PhoneFieldProps) {
  const [current, set] = useTextValue(value, defaultValue, onChange, (v) =>
    toEnglishDigits(v).replace(/[^\d+]/g, ''),
  );
  return (
    <AriaTextField
      className={fieldClass(field)}
      id={field.id}
      name={field.name}
      value={current}
      onChange={set}
      onBlur={onBlur}
      type="tel"
      inputMode="tel"
      maxLength={14}
      isRequired={field.required}
      isInvalid={!!field.error}
      isReadOnly={field.readOnly || field.locked}
      isDisabled={field.disabled}
      autoComplete={autoComplete}
      validationBehavior="aria"
    >
      <FieldLabel {...field} />
      <WithAction action={endAction}>
        <Input className="ui-input ui-tnum" placeholder={placeholder} />
      </WithAction>
      <FieldFooter {...field} />
    </AriaTextField>
  );
}

export interface PasswordFieldProps extends FieldBaseProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  /** `current-password` (login) or `new-password` (change, reset). */
  autoComplete: 'current-password' | 'new-password';
  maxLength?: number;
}

/**
 * Password with a show/hide button (SCR-001): the value is never transformed; the button has an
 * accessible name that says what it does and `aria-pressed` while the password is shown.
 */
export function PasswordField({
  value,
  defaultValue,
  onChange,
  onBlur,
  autoComplete,
  maxLength = 128,
  ...field
}: PasswordFieldProps) {
  const { messages } = useUi();
  const [visible, setVisible] = useState(false);
  const [current, set] = useTextValue(value, defaultValue, onChange, (v) => v);
  return (
    <AriaTextField
      className={fieldClass(field)}
      id={field.id}
      name={field.name}
      value={current}
      onChange={set}
      onBlur={onBlur}
      type={visible ? 'text' : 'password'}
      isRequired={field.required}
      isInvalid={!!field.error}
      isDisabled={field.disabled}
      maxLength={maxLength}
      autoComplete={autoComplete}
      validationBehavior="aria"
    >
      <FieldLabel {...field} />
      <div className="ui-input-wrap">
        <Input className="ui-input" spellCheck={false} autoCapitalize="none" autoCorrect="off" />
        <AriaButton
          className="ui-input-button"
          aria-label={visible ? messages.field.hidePassword : messages.field.showPassword}
          aria-pressed={visible}
          isDisabled={field.disabled}
          onPress={() => setVisible((v) => !v)}
        >
          <Icon icon={visible ? EyeOff : Eye} />
        </AriaButton>
      </div>
      <FieldFooter {...field} />
    </AriaTextField>
  );
}
