'use client';

import { Check } from 'lucide-react';
import { cx } from '../../utils/cx.js';
import { Icon } from '../Icon/Icon.js';

export interface StepperProps {
  /** Step names in order (i18n values). */
  steps: string[];
  /** Index of the current step, from 0. */
  current: number;
  /** Accessible name of the list, for example "registration steps". */
  label: string;
  className?: string;
}

/**
 * The steps of a form split into small parts (UX-16): numbered dots joined by a line, the done
 * steps with a check, the current one marked with aria-current="step"; the names show from 640 px
 * (on phones the form's section title names the step).
 */
export function Stepper({ steps, current, label, className }: StepperProps) {
  return (
    <ol className={cx('ui-stepper', className)} aria-label={label}>
      {steps.map((name, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'upcoming';
        return (
          <li
            key={name}
            className={`is-${state}`}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <span className="ui-stepper-dot" aria-hidden="true">
              {state === 'done' ? <Icon icon={Check} size="sm" /> : i + 1}
            </span>
            <span className="ui-stepper-name">{name}</span>
          </li>
        );
      })}
    </ol>
  );
}
