import type { Me } from '@css/shared/auth';
import { LoadingState } from '@/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useTranslations } from 'use-intl';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { currentMe, onSessionChange, refreshSession, type SessionEnd } from '../api/client';

export type AuthStatus = 'loading' | 'signed-in' | 'signed-out';

interface AuthValue {
  status: AuthStatus;
  me: Me | null;
  /** Why the last session ended on this device, for the message on the login screen. */
  ended?: SessionEnd;
}

const AuthContext = createContext<AuthValue>({ status: 'loading', me: null });

/**
 * Holds who is signed in (docs/architecture/AUTH.md, "Tokens and device sessions"). At start it
 * restores the session from the refresh cookie with one silent refresh; afterwards it follows the
 * API client's sign-in and sign-out events. When the session ends or another user signs in, the
 * server-data cache is emptied, so no record or photo of one session is shown in the next
 * (docs/architecture/AUTH.md, "Devices: listing, remote revocation and local-data wipe").
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const userId = useRef<string | null>(currentMe()?.id ?? null);
  const version = useRef<number | null>(currentMe()?.permissionVersion ?? null);
  const [value, setValue] = useState<AuthValue>(() => {
    const me = currentMe();
    return me ? { status: 'signed-in', me } : { status: 'loading', me: null };
  });

  useEffect(() => {
    const stop = onSessionChange((me, ended) => {
      // only a change of the signed-in user empties the cache: a token refresh of the same user
      // keeps it, and a repeated "signed out" must not clear again (a cleared query refetches,
      // its 401 ends the session again: a loop)
      const next = me?.id ?? null;
      if (userId.current !== null && next !== userId.current) queryClient.clear();
      // the same user with other permissions (a role granted or taken back): what the earlier
      // answers showed may no longer be theirs to see, so they are dropped and the open screen asks
      // again (docs/plans/2026-10-14-1400-feat-volunteer-form-refine-plan.md)
      else if (
        me &&
        next === userId.current &&
        version.current !== null &&
        me.permissionVersion !== version.current
      )
        void queryClient.resetQueries();
      userId.current = next;
      version.current = me?.permissionVersion ?? null;
      setValue({ status: me ? 'signed-in' : 'signed-out', me, ended });
    });
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
  }, [queryClient]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  return useContext(AuthContext);
}

/** Login path with the reason a session ended, so the login screen can say why. */
export function loginPath(ended?: SessionEnd, next?: string): string {
  const query = new URLSearchParams();
  if (ended && ended !== 'expired') query.set('ended', ended);
  if (next && returnPath(next)) query.set('next', next);
  const search = query.toString();
  return search ? `/login?${search}` : '/login';
}

/**
 * The pages the sign-in returns to: the app's own address of a photo, which a copied link opens.
 * Anything else, another host or a scheme among it, leads home, so the sign-in never sends a
 * person away from the app.
 */
const RETURN_PATHS = [/^\/photos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/];

/** The path the sign-in may return to, or null. */
export function returnPath(next: string | null | undefined): string | null {
  return next && RETURN_PATHS.some((path) => path.test(next)) ? next : null;
}

/** The screen a signed-in user with a new password due is kept on. */
export const PASSWORD_PATH = '/account/password';

/** Shows its children only to a signed-in user; others go to the login screen. */
export function RequireAuth({ children }: { children: (me: Me) => ReactNode }) {
  const { status, me, ended } = useAuth();
  const navigate = useNavigate();
  const t = useTranslations('common.state');
  const { pathname } = useLocation();
  useEffect(() => {
    if (status === 'signed-out') void navigate(loginPath(ended, pathname), { replace: true });
  }, [status, ended, navigate, pathname]);
  const content = useMemo(() => (me ? children(me) : null), [me, children]);
  // a new password is due before anything else (a global role was approved)
  if (me?.passwordChangeRequired && pathname !== PASSWORD_PATH)
    return <Navigate to={PASSWORD_PATH} replace />;
  if (status !== 'signed-in' || !me)
    return (
      <div className="app-loading" aria-busy="true">
        <LoadingState label={t('loading')} />
      </div>
    );
  return content;
}
