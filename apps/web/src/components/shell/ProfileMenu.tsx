import type { Me } from '@css/shared/auth';
import { type MenuAction, MenuButton } from '@css/ui';
import { PersonTile } from '../PersonPhoto';
import {
  Download,
  FileDown,
  KeyRound,
  Languages,
  LogOut,
  MonitorSmartphone,
  UserRound,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslations } from 'use-intl';
import { loadStore } from '../../features/applications/use-local-records';
import { promptInstall, showHintAgain, useInstall } from '../../features/sync/install';
import { LogoutWarning } from '../../features/sync/LogoutWarning';
import { logout } from '../../lib/api';
import { canExport } from '../../admin/roles';
import { useChooseLanguage } from '../LanguageSwitch';

/**
 * The profile menu of the app bar: my profile, my devices, change password and log out; on a
 * phone also the language, which has no room in the bar there. A volunteer's logout with
 * records still on the phone is warned about first, and the count goes to the server.
 */
export function ProfileMenu({ me, withLanguage }: { me: Me; withLanguage: boolean }) {
  const t = useTranslations('nav');
  const ta = useTranslations('auth.account');
  const tl = useTranslations('common.language');
  const ti = useTranslations('sync.install');
  const navigate = useNavigate();
  const { way: installWay } = useInstall();
  const { locale, choose } = useChooseLanguage();
  const other = locale === 'bn' ? 'en' : 'bn';
  const [warning, setWarning] = useState<number | null>(null);
  /** Ends the session; when the server could not be told, the records lost are noted for the next login to report. */
  const finish = async (count?: number) => {
    // the device is wiped even when the server cannot be told (logout rethrows then)
    await logout(count).catch(async () => {
      if (count)
        await import('../../offline/keys')
          .then((keys) => keys.noteLostPending({ count, reason: 'logout' }))
          .catch(() => undefined);
    });
    await navigate('/login?ended=logout', { replace: true });
  };
  const items: MenuAction[] = [
    { id: 'profile', label: t('profile'), icon: UserRound, href: '/account/profile' },
    { id: 'devices', label: ta('devices'), icon: MonitorSmartphone, href: '/account/sessions' },
    { id: 'password', label: ta('change_password'), icon: KeyRound, href: '/account/password' },
    // an official's own exports; a volunteer never exports
    ...(canExport(me)
      ? [{ id: 'exports', label: t('exports'), icon: FileDown, href: '/account/exports' }]
      : []),
    ...(withLanguage
      ? [{ id: 'language', label: tl(other), icon: Languages, onAction: () => choose(other) }]
      : []),
    // where the app can be installed from the page: the browser's prompt, or the hint on the home
    ...(installWay !== 'none'
      ? [
          {
            id: 'install',
            label: ti('menu'),
            icon: Download,
            onAction: () => {
              showHintAgain();
              if (installWay === 'prompt') void promptInstall();
              else void navigate('/');
            },
          },
        ]
      : []),
    {
      id: 'logout',
      label: ta('logout'),
      icon: LogOut,
      onAction: () => {
        void (async () => {
          const waiting =
            me.kind === 'volunteer'
              ? await loadStore()
                  .then((store) => store.waitingCount())
                  .catch(() => 0)
              : 0;
          if (waiting > 0) setWarning(waiting);
          else await finish();
        })();
      },
    },
  ];
  return (
    <>
      <MenuButton label={t('profile_menu')} items={items} className="app-profile-chip">
        <PersonTile name={me.displayName} fileId={me.photoFileId} size="sm" />
        <span className="app-user-name" data-testid="profile-name">
          {me.displayName}
        </span>
      </MenuButton>
      {warning !== null && (
        <LogoutWarning
          count={warning}
          onConfirm={(count) => {
            setWarning(null);
            void finish(count > 0 ? count : undefined);
          }}
          onCancel={() => setWarning(null)}
        />
      )}
    </>
  );
}
