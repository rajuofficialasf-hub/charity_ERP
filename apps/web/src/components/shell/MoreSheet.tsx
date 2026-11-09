import type { Me } from '@css/shared/auth';
import { Drawer, Icon } from '@/ui';
import { Link, useLocation } from 'react-router';
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
    <Drawer title={t('more_title')} side="bottom" open={isOpen} onClose={onClose}>
      <nav aria-label={t('more_title')}>
        <ul className="app-more-list">
          {moreFor(me).map((item) => (
            <li key={item.key}>
              {/* a link chosen closes the sheet, also the link of the page already shown */}
              <Link
                to={item.href}
                className="app-more-link"
                aria-current={isCurrent(item, pathname) ? 'page' : undefined}
                onClick={onClose}
              >
                <Icon name={item.icon} size={22} />
                <span>{t(item.key)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </Drawer>
  );
}
