'use client';

import type { ReactNode } from 'react';
import { Check, Minus, X } from 'lucide-react';
import { useUi } from '../../provider/UiProvider.js';
import { cx } from '../../utils/cx.js';
import { Icon } from '../Icon/Icon.js';

export type StepStatus = 'done' | 'current' | 'upcoming' | 'skipped' | 'rejected';

export interface TimelineStep {
  id: string;
  /** State or stage name in the user's language. */
  title: string;
  /** Actor name; shown only to officials (the caller passes `showActor`). */
  actor?: string;
  /** Time text from the formatter (English digits). */
  time?: string;
  comment?: ReactNode;
  status: StepStatus;
}

export interface TimelineProps {
  steps: TimelineStep[];
  /** vertical (default) or a compact horizontal stage strip for desktop. */
  orientation?: 'vertical' | 'horizontal';
  showActor?: boolean;
  /** Accessible name of the list, for example "application history". */
  label: string;
  className?: string;
}

/** Step / timeline as an ordered list; the current step carries aria-current="step" (DESIGN_SYSTEM 5.18). */
export function Timeline({
  steps,
  orientation = 'vertical',
  showActor = false,
  label,
  className,
}: TimelineProps) {
  const { messages } = useUi();
  const statusText: Record<StepStatus, string> = {
    done: messages.timeline.done,
    current: messages.timeline.current,
    upcoming: messages.timeline.upcoming,
    skipped: messages.timeline.skipped,
    rejected: messages.timeline.rejected,
  };
  if (orientation === 'horizontal') {
    return (
      <ol className={cx('ui-steps-h', className)} aria-label={label}>
        {steps.map((step) => (
          <li
            key={step.id}
            className={`is-${step.status}`}
            aria-current={step.status === 'current' ? 'step' : undefined}
          >
            {step.title}
            <span className="ui-sr-only">, {statusText[step.status]}</span>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ol className={cx('ui-timeline', className)} aria-label={label}>
      {steps.map((step) => (
        <li
          key={step.id}
          className={`is-${step.status}`}
          aria-current={step.status === 'current' ? 'step' : undefined}
        >
          <span className="ui-timeline-dot" aria-hidden="true">
            {step.status === 'done' && <Icon icon={Check} size="sm" />}
            {step.status === 'rejected' && <Icon icon={X} size="sm" />}
            {step.status === 'skipped' && <Icon icon={Minus} size="sm" />}
          </span>
          <p className="ui-step-title">
            {step.title}
            <span className="ui-sr-only">, {statusText[step.status]}</span>
          </p>
          {(step.time || (showActor && step.actor)) && (
            <p className="ui-step-meta">
              {showActor && step.actor}
              {showActor && step.actor && step.time && ' · '}
              {step.time && <span className="ui-tnum">{step.time}</span>}
            </p>
          )}
          {step.comment && <div className="ui-step-comment">{step.comment}</div>}
        </li>
      ))}
    </ol>
  );
}
