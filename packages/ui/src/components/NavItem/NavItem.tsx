'use client';

import { Link as UiLink } from '../../template.js';
import { fill } from '../../provider/messages.js';
import { useUi } from '../../provider/UiProvider.js';
import { cx } from '../../utils/cx.js';
import { Icon, type IconComponent } from '../Icon/Icon.js';

export interface NavItemProps {
  /** Icon plus text everywhere; never icon only (DESIGN_SYSTEM 4.1, 5.5). */
  icon: IconComponent;
  label: string;
  href: string;
  /** Sets aria-current="page". */
  active?: boolean;
  /** Unread or pending count; "99+" above 99; part of the accessible name. */
  badge?: number;
  variant?: 'sidebar' | 'rail' | 'tab-bar' | 'sheet';
  /** dark for the desktop sidebar on the brand ink (DESIGN_SYSTEM 4.1). */
  surface?: 'light' | 'dark';
  className?: string;
}

/** Navigation link for the sidebar, the tablet rail, the phone tab bar and the "more" sheet. */
export function NavItem({
  icon,
  label,
  href,
  active = false,
  badge,
  variant = 'sidebar',
  surface = 'light',
  className,
}: NavItemProps) {
  const { messages, formatNumber } = useUi();
  const count =
    badge !== undefined && badge > 0
      ? badge > 99
        ? `${formatNumber(99)}+`
        : formatNumber(badge)
      : null;
  return (
    <UiLink
      href={href}
      className={cx(
        'ui-nav-item',
        `ui-nav-${variant}`,
        surface === 'dark' && 'ui-nav-dark',
        className,
      )}
      aria-current={active ? 'page' : undefined}
      aria-label={count ? fill(messages.common.countName, { label, count }) : undefined}
    >
      <Icon icon={icon} />
      <span className="ui-nav-label">{label}</span>
      {count && (
        <span className="ui-nav-badge ui-tnum" aria-hidden="true">
          {count}
        </span>
      )}
    </UiLink>
  );
}
