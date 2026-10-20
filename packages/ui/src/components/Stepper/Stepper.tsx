'use client';

import { Check, TriangleAlert } from 'lucide-react';
import { cx } from '../../utils/cx.js';
import { Icon } from '../Icon/Icon.js';

/** What a step carries apart from its place: all it needs (complete) or something still missing. */
export type StepMark = 'complete' | 'missing' | undefined;

export interface StepperProps {
  /** Step names in order (i18n values). */
  steps: string[];
  /** Index of the current step, from 0. */
  current: number;
  /** Accessible name of the list, for example "registration steps". */
  label: string;
  /**
   * A mark per step (a wizard that knows what each step still needs). Without marks the steps
   * before the current one count as done.
   */
  marks?: StepMark[];
  /** Read after the name of a step marked missing, e.g. "বাকি আছে"; needed with `marks`. */
  missingLabel?: string;
  /** Makes the steps buttons that open their step. */
  onSelect?: (index: number) => void;
  className?: string;
}

/**
 * The steps of a form split into small parts (UX-16): numbered dots joined by a line, the done
 * steps with a check, the current one marked with aria-current="step"; the names show from 640 px
 * (on phones the form's section title names the step). A wizard (UX-20) adds a mark per step,
 * complete or missing (a warning sign and its words, never colour alone), and may open a step
 * when it is pressed.
 */
export function Stepper({
  steps,
  current,
  label,
  marks,
  missingLabel,
  onSelect,
  className,
}: StepperProps) {
  return (
    <ol
      className={cx('ui-stepper', onSelect && 'ui-stepper-interactive', className)}
      aria-label={label}
    >
      {steps.map((name, i) => {
        const mark = marks?.at(i);
        const state =
          i === current
            ? 'current'
            : mark === 'missing'
              ? 'missing'
              : mark === 'complete' || (!marks && i < current)
                ? 'done'
                : 'upcoming';
        const icon =
          mark === 'missing' ? (
            <Icon icon={TriangleAlert} size="sm" />
          ) : state === 'done' || (state === 'current' && mark === 'complete') ? (
            <Icon icon={Check} size="sm" />
          ) : (
            i + 1
          );
        const content = (
          <>
            <span className="ui-stepper-dot" aria-hidden="true">
              {icon}
            </span>
            <span className="ui-stepper-name">{name}</span>
            {mark === 'missing' && missingLabel && (
              <span className="ui-sr-only">{`, ${missingLabel}`}</span>
            )}
          </>
        );
        return (
          <li
            key={name}
            className={cx(`is-${state}`, mark === 'missing' && 'has-missing')}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            {onSelect ? (
              <button type="button" className="ui-stepper-button" onClick={() => onSelect(i)}>
                {content}
              </button>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ol>
  );
}
