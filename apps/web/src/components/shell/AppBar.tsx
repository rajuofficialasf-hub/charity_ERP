import type { Me } from '@css/shared/auth';
import { NotificationBell } from '../../features/notifications/NotificationBell';
import { SyncChip } from '../../features/sync/SyncChip';
import { LanguageSwitch } from '../LanguageSwitch';
import { ProfileMenu } from './ProfileMenu';

/**
 * The header's actions on every signed-in page, after the shell's own light and dark switch: a
 * volunteer's sync chip, the bell, the language switch (inside the profile menu on a phone) and
 * the profile menu.
 */
export function HeaderActions({ me, phone }: { me: Me; phone: boolean }) {
  return (
    <div className="app-bar-actions">
      <SyncChip />
      <NotificationBell />
      {!phone && <LanguageSwitch />}
      <ProfileMenu me={me} withLanguage={phone} />
    </div>
  );
}
