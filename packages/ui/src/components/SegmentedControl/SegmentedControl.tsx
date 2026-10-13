'use client';

import { Radio, RadioGroup } from 'react-aria-components';
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
 * One option is always selected; arrow keys move and select (React Aria radio group).
 */
export function SegmentedControl({
  label,
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps) {
  return (
    <RadioGroup
      aria-label={label}
      orientation="horizontal"
      value={value}
      onChange={onChange}
      className={cx('ui-segmented', className)}
    >
      {options.map((option) => (
        <Radio key={option.id} value={option.id} className="ui-segmented-option">
          <span lang={option.lang}>{option.label}</span>
        </Radio>
      ))}
    </RadioGroup>
  );
}
