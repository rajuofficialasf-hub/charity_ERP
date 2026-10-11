import { useUi } from '../../provider/UiProvider.js';
import { cx } from '../../utils/cx.js';

export interface SkeletonProps {
  /** Matches the final layout: a text line, a list row, a card or a stat card (DESIGN_SYSTEM 5.15). */
  shape?: 'text' | 'row' | 'card' | 'stat';
  /** Lists show 3 to 5 skeleton rows. */
  count?: number;
  className?: string;
}

const LINES = {
  text: ['w-100'],
  row: ['w-60', 'w-40'],
  card: ['w-40', 'w-100', 'w-60'],
  stat: ['w-40', 'h-28', 'w-60'],
} as const;

/** Loading placeholder; announced once as "loading", the blocks are hidden from readers. */
export function Skeleton({ shape = 'text', count = 1, className }: SkeletonProps) {
  const { messages } = useUi();
  // eslint-disable-next-line security/detect-object-injection -- typed union key into a constant table
  const lines = LINES[shape];
  return (
    <div className={cx('ui-skeleton-group', className)} role="status">
      <span className="ui-sr-only">{messages.common.loading}</span>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={cx('ui-skeleton-item', shape !== 'text' && 'is-boxed')}
          aria-hidden="true"
        >
          {lines.map((width, j) => (
            <div key={j} className={cx('ui-skeleton', width)} />
          ))}
        </div>
      ))}
    </div>
  );
}
