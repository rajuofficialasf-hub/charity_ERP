import { formatCount } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { Alert, Button, LinkButton, Text, TextField } from '@/ui';
import { useNavigate } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { useLocaleSwitch } from '../../i18n/LocaleProvider';
import { type FormEvent, useEffect, useState } from 'react';
import { ApiFailure, login } from '../../api/client';
import { useAuth } from '../../lib/auth';

/** Text of a failed login (docs/ui/SCREENS.md "Login and password reset" states): generic, lock time, retry time or the server message. */
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

/** Sign in with mobile number or email and password (docs/ui/SCREENS.md "Login and password reset", AUTH.md 4). */
export function LoginForm({ ended }: { ended?: string }) {
  const t = useTranslations('auth.login');
  const tr = useTranslations('registration');
  const locale = useLocale();
  const navigate = useNavigate();
  const { setLocale } = useLocaleSwitch();
  const { status } = useAuth();
  const failureText = useFailureText();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
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
    if (status === 'signed-in' && !pending) void navigate('/', { replace: true });
  }, [status, pending, navigate]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const me = await login(loginId, password);
      // The interface follows the user's stored language (I18N 2).
      if (me.language !== locale) setLocale(me.language);
      void navigate('/', { replace: true });
    } catch (failure) {
      setError(failureText(failure));
      setPending(false);
    }
  };

  return (
    <form method="post" noValidate onSubmit={submit} aria-label={t('title')}>
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
        <TextField
          type="password"
          label={t('password')}
          name="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          required
        />
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" fullWidth loading={pending} disabled={offline}>
          {t('submit')}
        </Button>
        <LinkButton variant="text" to="/login/reset">
          {t('forgot')}
        </LinkButton>
        <Text>{tr('link_intro')}</Text>
        <LinkButton variant="secondary" to="/register" fullWidth>
          {tr('link')}
        </LinkButton>
      </div>
    </form>
  );
}
