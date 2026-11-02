import { cx } from '../../utils/cx.js';
import { initials } from '../../utils/initials.js';
import { Icon, type IconComponent } from '../Icon/Icon.js';

export type IconTileTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

export interface IconTileProps {
  /** The icon on the square; without one the tile shows the first letter of `name`. */
  icon?: IconComponent;
  name?: string;
  /** A photo in place of the letter; never a sensitive photo such as an NID photo. */
  src?: string;
  /** brand by default; the status tones use their soft tint and icon colour. */
  tone?: IconTileTone;
  /** sm 32 px for a table row, md 36 px for a stat card and a count that filters, lg 44 px for a larger heading. */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * A soft square with an icon, a letter or a photo, beside a number or a name. Always decorative:
 * the number or the name next to it carries the meaning.
 */
export function IconTile({
  icon,
  name,
  src,
  tone = 'brand',
  size = 'md',
  className,
}: IconTileProps) {
  return (
    <span
      className={cx('ui-icon-tile', `t-${tone}`, `ui-icon-tile-${size}`, className)}
      aria-hidden="true"
    >
      {icon ? (
        <Icon icon={icon} size={size === 'sm' ? 'sm' : 'md'} />
      ) : src ? (
        <img src={src} alt="" />
      ) : (
        initials(name ?? '', 1)
      )}
    </span>
  );
}
