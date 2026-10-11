'use client';

import type { Me } from '@css/shared/auth';
import { Spinner, VisuallyHidden } from '@css/ui';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { currentMe, onSessionChange, refreshSession, type SessionEnd } from './api';

export type AuthStatus = 'loading' | 'signed-in' | 'signed-out';

interface AuthValue {
  status: AuthStatus;
  me: Me | null;
  /** Why the last session ended on this device, for the message on the login screen. */
  ended?: SessionEnd;
}

const AuthContext = createContext<AuthValue>({ status: 'loading', me: null });

/**
 * Holds who is signed in (AUTH.md 5). At start it restores the session from the refresh cookie
 * with one silent refresh; afterwards it follows the API client's sign-in and sign-out events.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<AuthValue>(() => {
    const me = currentMe();
    return me ? { status: 'signed-in', me } : { status: 'loading', me: null };
  });

  useEffect(() => {
    const stop = onSessionChange((me, ended) =>
      setValue({ status: me ? 'signed-in' : 'signed-out', me, ended }),
    );
    if (!currentMe())
      refreshSession()
        .then((pair) => {
          if (!pair)
            setValue((v) => (v.status === 'loading' ? { status: 'signed-out', me: null } : v));
        })
        .catch(() =>
          setValue((v) => (v.status === 'loading' ? { status: 'signed-out', me: null } : v)),
        );
    return stop;
  }, []);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  return useContext(AuthContext);
}

/** Login path with the reason a session ended, so the login screen can say why. */
export function loginPath(ended?: SessionEnd): string {
  return ended && ended !== 'expired' ? `/login?ended=${ended}` : '/login';
}

/** Shows its children only to a signed-in user; others go to the login screen. */
export function RequireAuth({ children }: { children: (me: Me) => ReactNode }) {
  const { status, me, ended } = useAuth();
  const router = useRouter();
  const t = useTranslations('common.state');
  useEffect(() => {
    if (status === 'signed-out') router.replace(loginPath(ended));
  }, [status, ended, router]);
  const content = useMemo(() => (me ? children(me) : null), [me, children]);
  if (status !== 'signed-in' || !me)
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status" aria-busy="true">
        <Spinner />
        <VisuallyHidden>{t('loading')}</VisuallyHidden>
      </div>
    );
  return content;
}
