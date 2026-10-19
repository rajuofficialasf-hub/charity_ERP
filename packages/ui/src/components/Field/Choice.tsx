'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cx } from '../../utils/cx.js';
import {
  NativeFieldFooter,
  NativeFieldLabel,
  fieldClass,
  useFieldIds,
  type FieldBaseProps,
} from './FieldParts.js';
import type { OtherOptionProps, SelectOption } from './Select.js';
import { TextField } from './TextField.js';
import { useUi } from '../../provider/UiProvider.js';

export interface CheckboxProps {
  /** Visible label; for a row checkbox without visible text use `aria-label`. */
  children?: ReactNode;
  'aria-label'?: string;
  isSelected?: boolean;
  defaultSelected?: boolean;
  isIndeterminate?: boolean;
  onChange?: (selected: boolean) => void;
  isDisabled?: boolean;
  value?: string;
  /** Group name of a checkbox inside a group. */
  name?: string;
  /** 44 px hit area (bulk rows and table selection on phones). */
  hitArea?: boolean;
  className?: string;
}

/**
 * Restyled checkbox on a native input: keyboard and screen reader as the browser gives them, a
 * dark-green fill with a white check (UX-14). The states the CSS reads are set as data attributes.
 */
export function Checkbox({
  children,
  hitArea,
  className,
  isSelected,
  defaultSelected,
  isIndeterminate = false,
  onChange,
  isDisabled = false,
  value,
  name,
  'aria-label': label,
}: CheckboxProps) {
  const [inner, setInner] = useState(defaultSelected ?? false);
  const checked = isSelected ?? inner;
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (input.current) input.current.indeterminate = isIndeterminate;
  }, [isIndeterminate]);
  return (
    <label
      className={cx('ui-choice', hitArea && 'ui-choice-hit', className)}
      data-selected={(checked && !isIndeterminate) || undefined}
      data-indeterminate={isIndeterminate || undefined}
      data-disabled={isDisabled || undefined}
    >
      <input
        ref={input}
        type="checkbox"
        className="ui-sr-only"
        checked={checked}
        disabled={isDisabled}
        value={value}
        name={name}
        aria-label={label}
        onChange={(event) => {
          setInner(event.target.checked);
          onChange?.(event.target.checked);
        }}
      />
      <span className="ui-check-box" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="ui-check-mark">
          <path d="M5 12l5 5 9-10" />
        </svg>
        <span className="ui-check-dash" />
      </span>
      {children && <span className="ui-choice-label">{children}</span>}
    </label>
  );
}

function OtherText({
  show,
  value,
  onChange,
  disabled,
}: {
  show: boolean;
  value?: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
}) {
  const { messages } = useUi();
  if (!show) return null;
  return (
    <TextField
      label={messages.field.otherSpecify}
      value={value}
      onChange={onChange}
      disabled={disabled}
      className="ui-field-other"
    />
  );
}

export interface CheckboxGroupProps extends FieldBaseProps, OtherOptionProps {
  options: SelectOption[];
  value?: string[];
  defaultValue?: string[];
  onChange?: (ids: string[]) => void;
  /** Lay options out in two columns from 640 px. */
  columns?: 1 | 2;
}

/** Group of checkboxes in a labelled group (a fieldset-like group named by its label). */
export function CheckboxGroup({
  options,
  value,
  defaultValue,
  onChange,
  columns = 1,
  otherOptionId,
  otherValue,
  onOtherChange,
  ...field
}: CheckboxGroupProps) {
  const [inner, setInner] = useState<string[]>(defaultValue ?? []);
  const current = value ?? inner;
  const ids = useFieldIds(field.id);
  const labelId = `${ids.inputId}-label`;
  const describedBy = [field.helper && ids.helperId, field.error && ids.errorId]
    .filter(Boolean)
    .join(' ');
  const set = (id: string, on: boolean) => {
    const next = on ? [...current.filter((v) => v !== id), id] : current.filter((v) => v !== id);
    setInner(next);
    onChange?.(next);
  };
  const disabled = field.disabled || field.readOnly || field.locked;
  return (
    <div
      className={fieldClass(field)}
      id={ids.inputId}
      role="group"
      aria-labelledby={labelId}
      aria-describedby={describedBy || undefined}
      aria-invalid={field.error ? true : undefined}
    >
      <NativeFieldLabel {...field} labelId={labelId} />
      <div className={cx('ui-choices', columns === 2 && 'ui-choices-2')}>
        {options.map((option) => (
          <Checkbox
            key={option.id}
            value={option.id}
            name={field.name}
            isSelected={current.includes(option.id)}
            isDisabled={disabled || option.disabled}
            onChange={(on) => set(option.id, on)}
          >
            {option.label}
          </Checkbox>
        ))}
      </div>
      <OtherText
        show={!!otherOptionId && current.includes(otherOptionId)}
        value={otherValue}
        onChange={onOtherChange}
        disabled={field.disabled}
      />
      <NativeFieldFooter {...field} ids={ids} />
    </div>
  );
}

export interface RadioGroupProps extends FieldBaseProps, OtherOptionProps {
  options: SelectOption[];
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (id: string) => void;
  orientation?: 'vertical' | 'horizontal';
}

/** Radio group of native radios sharing one name: arrow keys move and select as the browser does. */
export function RadioGroup({
  options,
  value,
  defaultValue,
  onChange,
  orientation = 'vertical',
  otherOptionId,
  otherValue,
  onOtherChange,
  ...field
}: RadioGroupProps) {
  const [inner, setInner] = useState<string | null>(defaultValue ?? null);
  const current = value === undefined ? inner : value;
  const ids = useFieldIds(field.id);
  const labelId = `${ids.inputId}-label`;
  const group = useId();
  const describedBy = [field.helper && ids.helperId, field.error && ids.errorId]
    .filter(Boolean)
    .join(' ');
  const disabled = field.disabled || field.readOnly || field.locked;
  return (
    <div
      className={fieldClass(field)}
      id={ids.inputId}
      role="radiogroup"
      aria-labelledby={labelId}
      aria-describedby={describedBy || undefined}
      aria-invalid={field.error ? true : undefined}
      aria-required={field.required || undefined}
      aria-orientation={orientation}
    >
      <NativeFieldLabel {...field} labelId={labelId} />
      <div className={cx('ui-choices', orientation === 'horizontal' && 'ui-choices-row')}>
        {options.map((option) => {
          const selected = current === option.id;
          const off = disabled || option.disabled;
          return (
            <label
              key={option.id}
              className="ui-choice"
              data-selected={selected || undefined}
              data-disabled={off || undefined}
              data-invalid={field.error ? true : undefined}
            >
              <input
                type="radio"
                className="ui-sr-only"
                name={field.name ?? group}
                value={option.id}
                checked={selected}
                disabled={off}
                onChange={() => {
                  setInner(option.id);
                  onChange?.(option.id);
                }}
              />
              <span className="ui-radio-dot" aria-hidden="true" />
              <span className="ui-choice-label">{option.label}</span>
            </label>
          );
        })}
      </div>
      <OtherText
        show={!!otherOptionId && current === otherOptionId}
        value={otherValue}
        onChange={onOtherChange}
        disabled={field.disabled}
      />
      <NativeFieldFooter {...field} ids={ids} />
    </div>
  );
}
