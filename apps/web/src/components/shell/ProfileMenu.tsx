import type { Me } from '@css/shared/auth';
import { type MenuAction, MenuButton } from '@css/ui';
import {
  CircleUser,
  KeyRound,
  Languages,
  LogOut,
  MonitorSmartphone,
  UserRound,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { useTranslations } from 'use-intl';
import { logout } from '../../lib/api';
import { useChooseLanguage } from '../LanguageSwitch';

/**
 * The profile menu of the app bar: my profile, my devices, change password and log out; on a
 * phone also the language, which has no room in the bar there.
 */
export function ProfileMenu({ me, withLanguage }: { me: Me; withLanguage: boolean }) {
  const t = useTranslations('nav');
  const ta = useTranslations('auth.account');
  const tl = useTranslations('common.language');
  const navigate = useNavigate();
  const { locale, choose } = useChooseLanguage();
  const other = locale === 'bn' ? 'en' : 'bn';
  const items: MenuAction[] = [
    { id: 'profile', label: t('profile'), icon: UserRound, href: '/account/profile' },
    { id: 'devices', label: ta('devices'), icon: MonitorSmartphone, href: '/account/sessions' },
    { id: 'password', label: ta('change_password'), icon: KeyRound, href: '/account/password' },
    ...(withLanguage
      ? [{ id: 'language', label: tl(other), icon: Languages, onAction: () => choose(other) }]
      : []),
    {
      id: 'logout',
      label: ta('logout'),
      icon: LogOut,
      onAction: () => {
        // the device is wiped even when the server cannot be told (logout rethrows then)
        void logout()
          .catch(() => undefined)
          .then(() => navigate('/login?ended=logout', { replace: true }));
      },
    },
  ];
  return (
    <MenuButton label={t('profile_menu')} icon={CircleUser} items={items}>
      <span className="app-user-name">{me.displayName}</span>
    </MenuButton>
  );
}
