'use client';

import { toEnglishDigits } from '@css/shared';
import { Eye, EyeOff } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { useUi } from '../../provider/UiProvider.js';
import { useTextValue } from '../../utils/useTextValue.js';
import { Icon } from '../Icon/Icon.js';
import {
  controlProps,
  fieldClass,
  NativeFieldFooter,
  NativeFieldLabel,
  useFieldIds,
  type FieldBaseProps,
} from './FieldParts.js';

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
  const ids = useFieldIds(field.id);
  return (
    <div className={fieldClass(field)}>
      <NativeFieldLabel {...field} htmlFor={ids.inputId} />
      <WithAction action={endAction}>
        <input
          {...controlProps(ids, field)}
          className="ui-input"
          name={field.name}
          value={current}
          onChange={(event) => set(event.target.value)}
          onBlur={onBlur}
          type={type === 'email' ? 'email' : 'text'}
          inputMode={inputMode ?? (numeric ? 'numeric' : type === 'email' ? 'email' : undefined)}
          maxLength={maxLength ?? (numeric ? 17 : undefined)}
          autoComplete={autoComplete ?? (numeric ? 'off' : undefined)}
          placeholder={placeholder}
          lang={lang}
        />
      </WithAction>
      <NativeFieldFooter {...field} ids={ids} />
    </div>
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
  const ids = useFieldIds(field.id);
  return (
    <div className={fieldClass(field)}>
      <NativeFieldLabel {...field} htmlFor={ids.inputId} />
      <textarea
        {...controlProps(ids, field)}
        ref={ref}
        className="ui-input ui-textarea"
        name={field.name}
        value={value}
        defaultValue={defaultValue}
        onChange={(event) => {
          onChange?.(event.target.value);
          grow();
        }}
        onBlur={onBlur}
        maxLength={maxLength}
        placeholder={placeholder}
        rows={rows}
        lang={lang}
      />
      <NativeFieldFooter {...field} ids={ids} />
    </div>
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
  const ids = useFieldIds(field.id);
  return (
    <div className={fieldClass(field)}>
      <NativeFieldLabel {...field} htmlFor={ids.inputId} />
      <div className={kind === 'money' ? 'ui-input-prefix' : undefined}>
        {kind === 'money' && <span {...prefix}>৳</span>}
        <input
          {...controlProps(ids, field)}
          className="ui-input ui-tnum"
          name={field.name}
          value={current}
          onChange={(event) => set(event.target.value)}
          onBlur={onBlur}
          inputMode={kind === 'integer' ? 'numeric' : 'decimal'}
          autoComplete="off"
          placeholder={placeholder}
        />
      </div>
      <NativeFieldFooter {...field} ids={ids} />
    </div>
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
  const ids = useFieldIds(field.id);
  return (
    <div className={fieldClass(field)}>
      <NativeFieldLabel {...field} htmlFor={ids.inputId} />
      <WithAction action={endAction}>
        <input
          {...controlProps(ids, field)}
          className="ui-input ui-tnum"
          name={field.name}
          value={current}
          onChange={(event) => set(event.target.value)}
          onBlur={onBlur}
          type="tel"
          inputMode="tel"
          maxLength={14}
          autoComplete={autoComplete}
          placeholder={placeholder}
        />
      </WithAction>
      <NativeFieldFooter {...field} ids={ids} />
    </div>
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
  const ids = useFieldIds(field.id);
  return (
    <div className={fieldClass(field)}>
      <NativeFieldLabel {...field} htmlFor={ids.inputId} />
      <div className="ui-input-wrap">
        <input
          {...controlProps(ids, { ...field, readOnly: false, locked: false })}
          className="ui-input"
          name={field.name}
          value={current}
          onChange={(event) => set(event.target.value)}
          onBlur={onBlur}
          type={visible ? 'text' : 'password'}
          maxLength={maxLength}
          autoComplete={autoComplete}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
        />
        <button
          type="button"
          className="ui-input-button"
          aria-label={visible ? messages.field.hidePassword : messages.field.showPassword}
          aria-pressed={visible}
          disabled={field.disabled}
          onClick={() => setVisible((v) => !v)}
        >
          <Icon icon={visible ? EyeOff : Eye} />
        </button>
      </div>
      <NativeFieldFooter {...field} ids={ids} />
    </div>
  );
}
