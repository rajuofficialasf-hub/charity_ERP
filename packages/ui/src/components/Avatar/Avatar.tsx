import { cx } from '../../utils/cx.js';

export interface AvatarProps {
  /** The person's name: initials are derived from it and it names the image. */
  name: string;
  /** Profile photo; never a sensitive photo such as an NID photo (DESIGN_SYSTEM 5). */
  src?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Decorative when the name is written next to the avatar (default). */
  decorative?: boolean;
  className?: string;
}

/** Up to two initials; Bengali names keep their first grapheme of the first two words. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return words
    .slice(0, 2)
    .map((w) => segmenter.segment(w)[Symbol.iterator]().next().value?.segment ?? '')
    .join('');
}

/** Photo or initials on brand-soft (DESIGN_SYSTEM 5, supporting pieces). */
export function Avatar({ name, src, size = 'md', decorative = true, className }: AvatarProps) {
  const a11y = decorative ? { 'aria-hidden': true as const } : { role: 'img', 'aria-label': name };
  return (
    <span className={cx('ui-avatar', `ui-avatar-${size}`, className)} {...a11y}>
      {src ? <img src={src} alt="" /> : initials(name)}
    </span>
  );
}
