import type { Me } from '@css/shared/auth';
import { Breadcrumb, type BreadcrumbItem } from '@css/ui';
import { ColorModeButton } from '@/ui';
import { useTranslations } from 'use-intl';
import { NotificationBell } from '../../features/notifications/NotificationBell';
import { SyncChip } from '../../features/sync/SyncChip';
import { LanguageSwitch } from '../LanguageSwitch';
import { ProfileMenu } from './ProfileMenu';

/**
 * The app bar of every signed-in page (docs/ui/DESIGN_SYSTEM.md, section "App shell"): the
 * Foundation's logo and the system name where no sidebar carries them, or else the page's trail;
 * then a volunteer's sync chip, the bell, the light and dark switch, the language switch (inside
 * the profile menu on a phone) and the profile menu.
 */
export function AppBar({
  me,
  phone,
  withBrand,
  trail,
}: {
  me: Me;
  phone: boolean;
  withBrand: boolean;
  trail: BreadcrumbItem[] | null;
}) {
  const t = useTranslations('common.app');
  return (
    <header className="app-bar">
      {withBrand ? (
        <a href="/" className="app-brand">
          <img src="/brand/logo.svg" alt={t('organization')} width={36} height={23} />
          <span>{t('name')}</span>
        </a>
      ) : trail ? (
        <Breadcrumb items={trail} className="app-bar-crumbs" />
      ) : (
        <span />
      )}
      <div className="app-bar-actions">
        <SyncChip />
        <NotificationBell />
        <ColorModeButton />
        {!phone && <LanguageSwitch />}
        <ProfileMenu me={me} withLanguage={phone} />
      </div>
    </header>
  );
}
