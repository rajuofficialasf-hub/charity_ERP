'use client';

import { fill } from '../../provider/messages.js';
import { useUi } from '../../provider/UiProvider.js';
import { cx } from '../../utils/cx.js';

export interface ProgressSegment {
  /** Legend label of the bucket (for example "spent"). */
  label: string;
  value: number;
}

export interface ProgressBarProps {
  value: number;
  max: number;
  /** Visible label; also the accessible name. */
  label: string;
  /** Shows "1,240 / 2,000 (62%)" beside the bar; the numbers are always text (DESIGN_SYSTEM 5.19). */
  showValue?: boolean;
  /** brand by default; warning or danger for a budget overrun or a quota exceeded. */
  tone?: 'brand' | 'success' | 'warning' | 'danger';
  size?: 'md' | 'sm';
  /** Stacked buckets (up to four, chart colours of DESIGN_SYSTEM 6.6) with a text legend. */
  segments?: ProgressSegment[];
  className?: string;
}

/** Progress bar with role progressbar and a text value (DESIGN_SYSTEM 5.19). */
export function ProgressBar({
  value,
  max,
  label,
  showValue = true,
  tone = 'brand',
  size = 'md',
  segments,
  className,
}: ProgressBarProps) {
  const { messages, formatNumber } = useUi();
  const safeMax = max > 0 ? max : 1;
  const percent = Math.round((Math.min(value, safeMax) / safeMax) * 100);
  const text = fill(messages.feedback.progressText, {
    value: formatNumber(value),
    max: formatNumber(max),
    percent: formatNumber(percent),
  });
  const parts = segments?.slice(0, 4) ?? [{ label, value }];
  return (
    <div
      role="progressbar"
      className={cx('ui-progress-block', className)}
      aria-valuenow={Math.min(value, safeMax)}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuetext={text}
      aria-label={label}
    >
      <div className="ui-progress-label">
        <span>{label}</span>
        {showValue && <span className="ui-tnum">{text}</span>}
      </div>
      <div className={cx('ui-progress', size === 'sm' && 'ui-progress-sm', `t-${tone}`)}>
        {parts.map((part, i) => (
          <span
            key={part.label}
            className={`s${i + 1}`}
            style={{ width: `${(Math.max(part.value, 0) / Math.max(safeMax, value)) * 100}%` }}
          />
        ))}
      </div>
      {segments && (
        <ul className="ui-progress-legend">
          {parts.map((part, i) => (
            <li key={part.label}>
              <i className={`s${i + 1}`} aria-hidden="true" />
              {part.label} <span className="ui-tnum">{formatNumber(part.value)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
