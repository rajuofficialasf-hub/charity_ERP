import type { Me } from '@css/shared/auth';
import { Drawer } from '@css/ui';
import { useTranslations } from 'use-intl';
import { moreFor } from '../../admin/navigation';
import { NavLinks } from './NavLinks';

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
  return (
    <Drawer title={t('more_title')} side="bottom" isOpen={isOpen} onClose={onClose}>
      {/* a link chosen closes the sheet, also the link of the page already shown (the links stop
          their own click, so the sheet listens before them) */}
      <nav
        className="app-more-list"
        aria-label={t('more_title')}
        onClickCapture={(e) => {
          if ((e.target as Element).closest('a')) onClose();
        }}
      >
        <NavLinks items={moreFor(me)} variant="sheet" />
      </nav>
    </Drawer>
  );
}
