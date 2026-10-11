'use client';

import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { useUi } from '../../provider/UiProvider.js';
import { cx } from '../../utils/cx.js';
import { Button } from '../Button/Button.js';
import { Icon } from '../Icon/Icon.js';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

const ICONS = { info: Info, success: CircleCheck, warning: TriangleAlert, danger: CircleAlert };

export interface AlertProps {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  /** Optional button or link. */
  action?: ReactNode;
  /** Never for blocking or legal messages (DESIGN_SYSTEM 5.11). */
  onDismiss?: () => void;
  /** inline (default) or banner: full width under the app bar. */
  variant?: 'inline' | 'banner';
  /**
   * Live announcement: "status" for news that just happened, "alert" only for an error that just
   * happened. Omit for alerts that are part of the page from the start.
   */
  live?: 'status' | 'alert';
  className?: string;
}

/** Tinted message with a status-colour left border, icon and ink text (DESIGN_SYSTEM 5.11). */
export function Alert({
  tone = 'info',
  title,
  children,
  action,
  onDismiss,
  variant = 'inline',
  live,
  className,
}: AlertProps) {
  const { messages } = useUi();
  return (
    <div
      className={cx('ui-alert', `t-${tone}`, variant === 'banner' && 'ui-alert-banner', className)}
      role={live}
    >
      {/* eslint-disable-next-line security/detect-object-injection -- typed union key into a constant table */}
      <Icon icon={ICONS[tone]} />
      <div className="ui-alert-body">
        {title && <p className="ui-alert-title">{title}</p>}
        {children && <div className="ui-alert-message">{children}</div>}
        {action && <div className="ui-alert-action">{action}</div>}
      </div>
      {onDismiss && (
        <Button variant="ghost" size="sm" icon={X} iconOnly onPress={onDismiss}>
          {messages.common.dismiss}
        </Button>
      )}
    </div>
  );
}
