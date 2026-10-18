import type { Me } from '@css/shared/auth';
import { Drawer, NavItem } from '@css/ui';
import { useLocation } from 'react-router';
import { useTranslations } from 'use-intl';
import { isCurrent, moreFor } from '../../admin/navigation';

/** The "more" sheet: the destinations the tabs do not hold, and the account pages. */
export function MoreSheet({
  me,
  isOpen,
  onClose,
}: {
  me: Me;
  isOpen: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('nav');
  const { pathname } = useLocation();
  return (
    <Drawer title={t('more_title')} side="bottom" isOpen={isOpen} onClose={onClose}>
      <nav className="app-more-list" aria-label={t('more_title')}>
        {moreFor(me).map((item) => (
          <NavItem
            key={item.key}
            variant="sheet"
            icon={item.icon}
            label={t(item.key)}
            href={item.href}
            active={isCurrent(item, pathname)}
          />
        ))}
      </nav>
    </Drawer>
  );
}
