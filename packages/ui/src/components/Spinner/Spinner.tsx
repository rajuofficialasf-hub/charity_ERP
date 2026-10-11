import { cx } from '../../utils/cx.js';

export interface SpinnerProps {
  /** md 20 px (default) or sm 16 px. */
  size?: 'sm' | 'md';
  className?: string;
}

/** Decorative busy indicator; the owning control announces the busy state (aria-busy, text). */
export function Spinner({ size = 'md', className }: SpinnerProps) {
  const px = size === 'sm' ? 16 : 20;
  return (
    <svg
      className={cx('ui-spinner', className)}
      width={px}
      height={px}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
