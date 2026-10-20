'use client';

import { useId } from 'react';
import { cx } from '../../utils/cx.js';

export interface SegmentedOption {
  id: string;
  label: string;
  /** `lang` of the label when it is written in another language than the page. */
  lang?: string;
}

export interface SegmentedControlProps {
  /** Accessible name of the group. */
  label: string;
  options: SegmentedOption[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

/**
 * A compact choice of one among a few options as a pill (UX-19): the language toggle of the bars.
 * One option is always selected; arrow keys move and select (native radios sharing one name).
 */
export function SegmentedControl({
  label,
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cx('ui-segmented', className)}>
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <label
            key={option.id}
            className="ui-segmented-option"
            data-selected={selected || undefined}
          >
            <input
              type="radio"
              className="ui-sr-only"
              name={name}
              value={option.id}
              checked={selected}
              onChange={() => onChange(option.id)}
            />
            <span lang={option.lang}>{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}
