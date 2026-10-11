'use client';

import type { ReactNode } from 'react';
import { CircleAlert, Inbox, RotateCw } from 'lucide-react';
import { fill } from '../../provider/messages.js';
import { useUi } from '../../provider/UiProvider.js';
import { cx } from '../../utils/cx.js';
import { Button } from '../Button/Button.js';
import { Icon, type IconComponent } from '../Icon/Icon.js';

type HeadingLevel = 2 | 3 | 4;

export interface EmptyStateProps {
  icon?: IconComponent;
  title: string;
  /** One sentence explaining why it is empty. */
  message?: string;
  /** One next action, for example "create the first application" or "clear filters". */
  action?: ReactNode;
  headingLevel?: HeadingLevel;
  className?: string;
}

/** Empty state with the simple halo illustration (DESIGN_SYSTEM 5.15, UX-14). */
export function EmptyState({
  icon = Inbox,
  title,
  message,
  action,
  headingLevel = 3,
  className,
}: EmptyStateProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div className={cx('ui-empty', className)}>
      <span className="ui-empty-art" aria-hidden="true">
        <Icon icon={icon} size="lg" />
      </span>
      <Heading className="ui-empty-title">{title}</Heading>
      {message && <p className="ui-empty-message">{message}</p>}
      {action && <div className="ui-empty-action">{action}</div>}
    </div>
  );
}

export interface ErrorStateProps {
  title: string;
  /** Plain message from the error key; no codes in the message (DESIGN_SYSTEM 9). */
  message?: string;
  /** Request id of the API error envelope, shown in Caption so support can trace it. */
  requestId?: string;
  onRetry?: () => void;
  headingLevel?: HeadingLevel;
  className?: string;
}

/** Error state with retry and the request id (DESIGN_SYSTEM 5.15). */
export function ErrorState({
  title,
  message,
  requestId,
  onRetry,
  headingLevel = 3,
  className,
}: ErrorStateProps) {
  const { messages } = useUi();
  const Heading = `h${headingLevel}` as const;
  return (
    <div className={cx('ui-empty', 'ui-error-state', className)}>
      <span className="ui-empty-art" aria-hidden="true">
        <Icon icon={CircleAlert} size="lg" />
      </span>
      <Heading className="ui-empty-title">{title}</Heading>
      {message && <p className="ui-empty-message">{message}</p>}
      {onRetry && (
        <div className="ui-empty-action">
          <Button variant="secondary" icon={RotateCw} onPress={onRetry}>
            {messages.common.retry}
          </Button>
        </div>
      )}
      {requestId && (
        <p className="ui-error-request ui-tnum">
          {fill(messages.feedback.requestId, { id: requestId })}
        </p>
      )}
    </div>
  );
}
