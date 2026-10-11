'use client';

import type { Me } from '@css/shared/auth';
import { Button } from '@css/ui';
import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import './auth-shell.css';
import { logout } from '../_lib/api';
import { RequireAuth } from '../_lib/auth';
import { LanguageSwitch } from './LanguageSwitch';

/** Logs out and wipes the device's local data (AUTH.md 8, SCR-006). */
export function LogoutButton() {
  const t = useTranslations('auth.account');
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="secondary"
      icon={LogOut}
      loading={pending}
      onPress={async () => {
        setPending(true);
        try {
          await logout();
        } finally {
          router.replace('/login?ended=logout');
        }
      }}
    >
      {t('logout')}
    </Button>
  );
}

/**
 * Frame of the signed-in pages until the app shell of T1.15: heading, the page, the account
 * links, language and logout. Only for signed-in users.
 */
export function AccountPage({
  title,
  children,
}: {
  title: (me: Me) => string;
  children: (me: Me) => ReactNode;
}) {
  const t = useTranslations('auth.account');
  return (
    <RequireAuth>
      {(me) => (
        <main id="main" className="account-page">
          <h1>{title(me)}</h1>
          {children(me)}
          <nav className="account-links" aria-label={t('title')}>
            <Button variant="ghost" href="/">
              {t('title')}
            </Button>
            <Button variant="ghost" href="/account/sessions">
              {t('devices')}
            </Button>
            <Button variant="ghost" href="/account/password">
              {t('change_password')}
            </Button>
            <LogoutButton />
          </nav>
          <LanguageSwitch />
        </main>
      )}
    </RequireAuth>
  );
}
