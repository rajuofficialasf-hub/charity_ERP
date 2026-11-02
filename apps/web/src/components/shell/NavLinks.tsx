import { NavItem, type NavItemProps } from '@css/ui';
import { useLocation } from 'react-router';
import { useTranslations } from 'use-intl';
import { isCurrent, type NavDestination } from '../../admin/navigation';

/** The links of a list of destinations, the current page marked. */
export function NavLinks({
  items,
  variant,
  surface,
  counts,
}: {
  items: readonly NavDestination[];
  variant?: NavItemProps['variant'];
  surface?: NavItemProps['surface'];
  /** What waits beside each destination. */
  counts?: Partial<Record<NavDestination['key'], number>>;
}) {
  const t = useTranslations('nav');
  const { pathname } = useLocation();
  return items.map((item) => (
    <NavItem
      key={item.key}
      variant={variant}
      surface={surface}
      icon={item.icon}
      label={t(item.key)}
      href={item.href}
      active={isCurrent(item, pathname)}
      badge={counts?.[item.key]}
    />
  ));
}
