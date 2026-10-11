'use client';

import { formatCount } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { Alert, Button, Form, PasswordField, TextField } from '@css/ui';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState, useTransition } from 'react';
import { setLocaleAction } from '../_components/locale-action';
import { ApiFailure, login } from '../_lib/api';
import { useAuth } from '../_lib/auth';
import { useHydrated } from '../_lib/use-hydrated';

/** Text of a failed login (SCR-001 states): generic, lock time, retry time or the server message. */
function useFailureText() {
  const t = useTranslations('auth.login');
  const locale = useLocale() as Locale;
  return (error: unknown): string => {
    if (!(error instanceof ApiFailure)) return t('offline');
    if (error.code === 'auth.account_locked' && error.retryAfter)
      return t('locked_for', { minutes: formatCount(Math.ceil(error.retryAfter / 60), locale) });
    if (error.code === 'rate_limit.exceeded' && error.retryAfter)
      return t('retry_after', { seconds: formatCount(error.retryAfter, locale) });
    return error.message;
  };
}

/** Sign in with mobile number or email and password (SCR-001, AUTH.md 4). */
export function LoginForm({ ended }: { ended?: string }) {
  const t = useTranslations('auth.login');
  const locale = useLocale();
  const router = useRouter();
  const { status } = useAuth();
  const failureText = useFailureText();
  const hydrated = useHydrated();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    if (status === 'signed-in' && !pending) router.replace('/');
  }, [status, pending, router]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const me = await login(loginId, password);
      // The interface follows the user's stored language (I18N 2, O-56).
      if (me.language !== locale) await setLocaleAction(me.language);
      startTransition(() => {
        router.replace('/');
        router.refresh();
      });
    } catch (failure) {
      setError(failureText(failure));
      setPending(false);
    }
  };

  return (
    <Form onSubmit={submit} aria-label={t('title')}>
      <div className="auth-shell-stack">
        {ended === 'revoked' && <Alert tone="warning">{t('session_ended')}</Alert>}
        {ended === 'logout' && <Alert tone="success">{t('signed_out')}</Alert>}
        {offline && <Alert tone="warning">{t('offline')}</Alert>}
        <TextField
          label={t('login_id')}
          name="loginId"
          value={loginId}
          onChange={setLoginId}
          autoComplete="username"
          required
        />
        <PasswordField
          label={t('password')}
          name="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          required
        />
        {error && (
          <Alert tone="danger" live="alert">
            {error}
          </Alert>
        )}
        <Button type="submit" fullWidth loading={pending} disabled={offline || !hydrated}>
          {t('submit')}
        </Button>
        <Button variant="ghost" href="/login/reset">
          {t('forgot')}
        </Button>
      </div>
    </Form>
  );
}
