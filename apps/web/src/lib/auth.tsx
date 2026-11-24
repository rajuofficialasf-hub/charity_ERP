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

/**
 * Login path with the reason a session ended, so the login screen can say why, and the page to
 * return to. An explicit logout keeps no page: whoever signs in next on the device starts at their
 * own home.
 */
export function loginPath(ended?: SessionEnd, next?: string): string {
  const query = new URLSearchParams();
  if (ended && ended !== 'expired') query.set('ended', ended);
  if (ended !== 'logout' && next && returnPath(next)) query.set('next', next);
  const search = query.toString();
  return search ? `/login?${search}` : '/login';
}

/**
 * The pages the sign-in returns to: an address of the app itself, as a link in a notice or an
 * email opens it. It starts with one slash (never `//` or `/\`), holds no backslash, space or
 * control character and no `..` step, and is not the sign-in itself; anything else (another host,
 * a scheme) leads home, so the sign-in never sends a person away from the app.
 */
// eslint-disable-next-line no-control-regex -- control characters are what the class refuses
const RETURN_PATH = /^\/(?![/\\])[^\\\s\u0000-\u001f]*$/;
const RETURN_MAX = 1000;

/** The path the sign-in may return to, or null. */
export function returnPath(next: string | null | undefined): string | null {
  if (!next || next.length > RETURN_MAX || !RETURN_PATH.test(next)) return null;
  const path = next.split(/[?#]/)[0]!;
  if (path.split('/').some((step) => step === '..' || step === '.')) return null;
  if (path === '/login' || path.startsWith('/login/')) return null;
  return next;
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
