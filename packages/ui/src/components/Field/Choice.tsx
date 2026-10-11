'use client';

import { useState, type ReactNode } from 'react';
import {
  Checkbox as AriaCheckbox,
  CheckboxGroup as AriaCheckboxGroup,
  Radio,
  RadioGroup as AriaRadioGroup,
} from 'react-aria-components';
import { cx } from '../../utils/cx.js';
import { FieldFooter, FieldLabel, fieldClass, type FieldBaseProps } from './FieldParts.js';
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
  /** 44 px hit area (bulk rows and table selection on phones). */
  hitArea?: boolean;
  className?: string;
}

/** Restyled checkbox: keyboard and screen-reader native, dark-green fill with a white check (UX-14). */
export function Checkbox({ children, hitArea, className, ...props }: CheckboxProps) {
  return (
    <AriaCheckbox {...props} className={cx('ui-choice', hitArea && 'ui-choice-hit', className)}>
      <span className="ui-check-box" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="ui-check-mark">
          <path d="M5 12l5 5 9-10" />
        </svg>
        <span className="ui-check-dash" />
      </span>
      {children && <span className="ui-choice-label">{children}</span>}
    </AriaCheckbox>
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

/** Group of checkboxes in a labelled group (fieldset semantics through React Aria). */
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
  return (
    <AriaCheckboxGroup
      className={fieldClass(field)}
      id={field.id}
      name={field.name}
      value={current}
      onChange={(ids) => {
        setInner(ids);
        onChange?.(ids);
      }}
      isRequired={field.required}
      isInvalid={!!field.error}
      isReadOnly={field.readOnly || field.locked}
      isDisabled={field.disabled}
      validationBehavior="aria"
    >
      <FieldLabel {...field} elementType="span" />
      <div className={cx('ui-choices', columns === 2 && 'ui-choices-2')}>
        {options.map((option) => (
          <Checkbox key={option.id} value={option.id} isDisabled={option.disabled}>
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
      <FieldFooter {...field} />
    </AriaCheckboxGroup>
  );
}

export interface RadioGroupProps extends FieldBaseProps, OtherOptionProps {
  options: SelectOption[];
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (id: string) => void;
  orientation?: 'vertical' | 'horizontal';
}

/** Radio group on the APG pattern (arrow keys move and select). */
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
  return (
    <AriaRadioGroup
      className={fieldClass(field)}
      id={field.id}
      name={field.name}
      value={current}
      onChange={(id) => {
        setInner(id);
        onChange?.(id);
      }}
      orientation={orientation}
      isRequired={field.required}
      isInvalid={!!field.error}
      isReadOnly={field.readOnly || field.locked}
      isDisabled={field.disabled}
      validationBehavior="aria"
    >
      <FieldLabel {...field} elementType="span" />
      <div className={cx('ui-choices', orientation === 'horizontal' && 'ui-choices-row')}>
        {options.map((option) => (
          <Radio
            key={option.id}
            value={option.id}
            isDisabled={option.disabled}
            className="ui-choice"
          >
            <span className="ui-radio-dot" aria-hidden="true" />
            <span className="ui-choice-label">{option.label}</span>
          </Radio>
        ))}
      </div>
      <OtherText
        show={!!otherOptionId && current === otherOptionId}
        value={otherValue}
        onChange={onOtherChange}
        disabled={field.disabled}
      />
      <FieldFooter {...field} />
    </AriaRadioGroup>
  );
}
