import { useId } from 'react';

export interface ChoiceButtonsProps {
  label: string;
  /** The id of the group, for the error summary's links. */
  id: string;
  /** The question's name; the buttons carry no form value of their own. */
  name?: string;
  required: boolean;
  error?: string;
  hint?: string;
  options: readonly { value: string; label: string }[];
  /** The chosen codes: one at most when `multiple` is not set. */
  value: readonly string[];
  multiple?: boolean;
  disabled?: boolean;
  onChange: (codes: string[]) => void;
}

/** A short list fits buttons; a longer one, or a long option text, keeps the list of the set. */
export const fitsButtons = (options: readonly { label: string }[]) =>
  options.length > 0 && options.length <= 8 && options.every((o) => o.label.length <= 24);

/**
 * A short choice on a phone (DECISION_LOG D-166): up to three options as large buttons side by
 * side, more as chips that wrap; one tap chooses, a second tap on a chosen one clears it. A single
 * choice is a radio group, a multiple one a group of toggle buttons.
 */
export function ChoiceButtons({
  label,
  id,
  required,
  error,
  hint,
  options,
  value,
  multiple = false,
  disabled = false,
  onChange,
}: ChoiceButtonsProps) {
  const labelId = useId();
  const helpId = useId();
  const help = error ?? hint;
  const wide = !multiple && options.length <= 3;
  const toggle = (code: string) => {
    if (disabled) return;
    if (multiple)
      onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);
    else onChange(value.includes(code) ? [] : [code]);
  };
  return (
    <div className="choice-field">
      <span className="choice-label" id={labelId}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </span>
      <div
        id={id}
        className={wide ? 'choice-buttons is-wide' : 'choice-buttons'}
        role={multiple ? 'group' : 'radiogroup'}
        aria-labelledby={labelId}
        aria-describedby={help ? helpId : undefined}
        aria-required={!multiple && required ? true : undefined}
        aria-invalid={error ? true : undefined}
      >
        {options.map((option) => {
          const on = value.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              className="choice-button"
              disabled={disabled}
              {...(multiple ? { 'aria-pressed': on } : { role: 'radio', 'aria-checked': on })}
              onClick={() => toggle(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {help ? (
        <span id={helpId} className={error ? 'choice-help is-error' : 'choice-help'}>
          {help}
        </span>
      ) : null}
    </div>
  );
}
