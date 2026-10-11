import type { LucideIcon } from 'lucide-react';

export type IconComponent = LucideIcon;

export interface IconProps {
  /** A Lucide icon component, imported one by one so unused icons never reach the bundle. */
  icon: IconComponent;
  /** md 20 px (default), sm 16 px for dense tables and badges, lg 48 px for empty states (O-40). */
  size?: 'sm' | 'md' | 'lg';
  /** Accessible name when the icon is the only content; otherwise the icon is hidden from readers. */
  label?: string;
  className?: string;
}

const SIZE = { sm: 16, md: 20, lg: 48 } as const;

/** Lucide icon at the design-system sizes, stroke 2 (DESIGN_SYSTEM 5, O-40 item 5). */
export function Icon({ icon: Glyph, size = 'md', label, className }: IconProps) {
  // eslint-disable-next-line security/detect-object-injection -- typed union key into a constant table
  const px = SIZE[size];
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true as const };
  return (
    <Glyph
      width={px}
      height={px}
      strokeWidth={2}
      focusable="false"
      className={['ui-icon', className].filter(Boolean).join(' ')}
      {...a11y}
    />
  );
}
