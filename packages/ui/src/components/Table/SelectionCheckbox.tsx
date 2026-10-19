'use client';

import { Checkbox as AriaCheckbox } from 'react-aria-components';

/**
 * The selection checkbox of a desktop table row or header, in React Aria's selection slot; it
 * leaves with the table's own move off React Aria.
 */
export function SelectionCheckbox({ 'aria-label': label }: { 'aria-label': string }) {
  return (
    <AriaCheckbox slot="selection" aria-label={label} className="ui-choice">
      <span className="ui-check-box" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="ui-check-mark">
          <path d="M5 12l5 5 9-10" />
        </svg>
        <span className="ui-check-dash" />
      </span>
    </AriaCheckbox>
  );
}
