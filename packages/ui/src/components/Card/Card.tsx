'use client';

import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link as AriaLink } from 'react-aria-components';
import { fill } from '../../provider/messages.js';
import { useUi } from '../../provider/UiProvider.js';
import { cx } from '../../utils/cx.js';
import { Icon, type IconComponent } from '../Icon/Icon.js';
import { ProgressBar } from '../ProgressBar/ProgressBar.js';
import { Skeleton } from '../Skeleton/Skeleton.js';

type HeadingLevel = 2 | 3 | 4;

function Heading({
  level,
  className,
  children,
}: {
  level: HeadingLevel;
  className: string;
  children: ReactNode;
}) {
  const Tag = `h${level}` as const;
  return <Tag className={className}>{children}</Tag>;
}

export interface CardProps {
  title?: string;
  subtitle?: string;
  headingLevel?: HeadingLevel;
  /** Up to two buttons or a menu in the header. Not allowed together with `href`. */
  actions?: ReactNode;
  /** Makes the whole card one link named by its title (DESIGN_SYSTEM 5.3). */
  href?: string;
  /** Decorative amber highlight for announcements; text stays ink. */
  accent?: boolean;
  loading?: boolean;
  className?: string;
  children?: ReactNode;
}

/** Surface card with elevation 1 (variants default and accent of DESIGN_SYSTEM 5.3). */
export function Card({
  title,
  subtitle,
  headingLevel = 3,
  actions,
  href,
  accent = false,
  loading = false,
  className,
  children,
}: CardProps) {
  const classes = cx('ui-card', accent && 'ui-card-accent', href && 'ui-card-link', className);
  const head =
    title || actions ? (
      <div className="ui-card-head">
        <div className="ui-card-heading">
          {title && (
            <Heading level={headingLevel} className="ui-card-title">
              {title}
            </Heading>
          )}
          {subtitle && <p className="ui-card-subtitle">{subtitle}</p>}
        </div>
        {!href && actions && <div className="ui-card-actions">{actions}</div>}
      </div>
    ) : null;
  const body = loading ? <Skeleton shape="text" count={3} /> : children;
  if (href) {
    return (
      <AriaLink href={href} className={classes}>
        {head}
        {body}
      </AriaLink>
    );
  }
  return (
    <section className={classes}>
      {head}
      {body}
    </section>
  );
}

export interface StatCardProps {
  /** Label such as "approved"; also the start of the accessible name. */
  label: string;
  value: number;
  /** Target: shows "1,240 of 2,000" and a progress bar (UX-10). */
  target?: number;
  /** Short unit text after the value, for example "জন". */
  unit?: string;
  /** Text before the value, for example the taka sign: "৳ 3,00,000" (DESIGN_SYSTEM 3 item 8). */
  prefix?: string;
  /** Change text prepared by the caller, for example "+12 this week". */
  delta?: string;
  href?: string;
  loading?: boolean;
  className?: string;
}

/** Stat card: label, big tabular value, optional target with progress; amber-green top line. */
export function StatCard({
  label,
  value,
  target,
  unit,
  prefix,
  delta,
  href,
  loading,
  className,
}: StatCardProps) {
  const { messages, formatNumber } = useUi();
  const classes = cx('ui-card', 'ui-stat', href && 'ui-card-link', className);
  const content = loading ? (
    <Skeleton shape="stat" />
  ) : (
    <>
      <p className="ui-stat-label">{label}</p>
      <p className="ui-stat-value">
        {prefix && <span className="ui-stat-unit">{prefix} </span>}
        {formatNumber(value)}
        {unit && <span className="ui-stat-unit"> {unit}</span>}
      </p>
      {target !== undefined && (
        <ProgressBar
          value={value}
          max={target}
          label={label}
          showValue={false}
          size="sm"
          className="ui-stat-progress"
        />
      )}
      {(target !== undefined || delta) && (
        <p className="ui-stat-target">
          {target !== undefined &&
            fill(messages.feedback.valueOfMax, {
              value: formatNumber(value),
              max: formatNumber(target),
            })}
          {target !== undefined && delta && ' · '}
          {delta}
        </p>
      )}
    </>
  );
  return href ? (
    <AriaLink href={href} className={classes}>
      {content}
    </AriaLink>
  ) : (
    <div className={classes}>{content}</div>
  );
}

export interface AttentionCardProps {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  icon: IconComponent;
  title: string;
  /** One-line reason. */
  reason?: string;
  /** Due or waiting time, prepared by the caller ("waiting 6 days"). */
  meta?: string;
  /** Either a link for the whole item or one action. */
  href?: string;
  action?: ReactNode;
  className?: string;
}

/** "Needs your attention" item of every My Work home (DESIGN_SYSTEM 5.3, UX-12). */
export function AttentionCard({
  tone = 'info',
  icon,
  title,
  reason,
  meta,
  href,
  action,
  className,
}: AttentionCardProps) {
  const classes = cx('ui-attention', `t-${tone}`, className);
  const content = (
    <>
      <Icon icon={icon} />
      <div className="ui-attention-text">
        <p className="ui-attention-title">{title}</p>
        {reason && <p className="ui-attention-reason">{reason}</p>}
        {meta && <p className="ui-attention-meta">{meta}</p>}
      </div>
      {href ? <Icon icon={ChevronRight} className="ui-attention-chevron" /> : action}
    </>
  );
  return href ? (
    <AriaLink href={href} className={classes}>
      {content}
    </AriaLink>
  ) : (
    <div className={classes}>{content}</div>
  );
}
