import { cx } from '../../utils/cx.js';
import { initials } from '../../utils/initials.js';

export interface AvatarProps {
  /** The person's name: initials are derived from it and it names the image. */
  name: string;
  /** Profile photo; never a sensitive photo such as an NID photo (DESIGN_SYSTEM 5). */
  src?: string;
  size?: 'sm' | 'md' | 'lg';
  /** How many initials: two (default), or one for a calm list. */
  letters?: 1 | 2;
  /** Decorative when the name is written next to the avatar (default). */
  decorative?: boolean;
  className?: string;
}

/** Photo or initials on brand-soft (DESIGN_SYSTEM 5, supporting pieces). */
export function Avatar({
  name,
  src,
  size = 'md',
  letters = 2,
  decorative = true,
  className,
}: AvatarProps) {
  const a11y = decorative ? { 'aria-hidden': true as const } : { role: 'img', 'aria-label': name };
  return (
    <span className={cx('ui-avatar', `ui-avatar-${size}`, className)} {...a11y}>
      {src ? <img src={src} alt="" /> : initials(name, letters)}
    </span>
  );
}
