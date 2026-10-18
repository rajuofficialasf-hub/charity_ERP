import type { Me } from '@css/shared/auth';
import { Icon, NavItem } from '@css/ui';
import { Menu } from 'lucide-react';
import { useLocation } from 'react-router';
import { useTranslations } from 'use-intl';
import { isCurrent, moreFor, tabsFor } from '../../admin/navigation';

/**
 * The phone's bottom tabs, or the same destinations in the side rail of a larger screen: home and
 * the person's main destinations, then "more" for the rest.
 */
export function BottomTabs({
  me,
  variant,
  onMore,
}: {
  me: Me;
  variant: 'tab-bar' | 'rail';
  onMore: () => void;
}) {
  const t = useTranslations('nav');
  const { pathname } = useLocation();
  const tabs = tabsFor(me);
  // "more" is the current tab while a page of the sheet is open
  const inMore = moreFor(me).some((item) => isCurrent(item, pathname));
  return (
    <nav className={variant === 'rail' ? 'app-rail' : 'app-tabs'} aria-label={t('label')}>
      {tabs.map((item) => (
        <NavItem
          key={item.key}
          variant={variant}
          icon={item.icon}
          label={t(item.key)}
          href={item.href}
          active={isCurrent(item, pathname)}
        />
      ))}
      <button
        type="button"
        className={`ui-nav-item ui-nav-${variant} app-more`}
        aria-haspopup="dialog"
        aria-current={inMore ? 'page' : undefined}
        onClick={onMore}
      >
        <Icon icon={Menu} />
        <span className="ui-nav-label">{t('more')}</span>
      </button>
    </nav>
  );
}
