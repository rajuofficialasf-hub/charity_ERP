import { loginRequestSchema } from '@css/shared/auth';
import { formatCount } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { Alert, Button, Form, FormTextField, LinkButton, Text } from '@/ui';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import type { z } from 'zod';
import { useLocaleSwitch } from '../../i18n/LocaleProvider';
import { useEffect, useState } from 'react';
import { ApiFailure, login } from '../../api/client';
import { useAuth } from '../../lib/auth';
import { useSchemaResolver } from '../../lib/form-schema';

/** The two fields of the login request: each only has to be filled before the server answers. */
const loginFields = loginRequestSchema.pick({ loginId: true, password: true });
type LoginFields = z.input<typeof loginFields>;

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

/**
 * Sign in with mobile number or email and password (docs/ui/SCREENS.md "Login and password reset";
 * docs/architecture/AUTH.md, "Login").
 */
export function LoginForm({ ended }: { ended?: string }) {
  const t = useTranslations('auth.login');
  const tr = useTranslations('registration');
  const locale = useLocale();
  const navigate = useNavigate();
  const { setLocale } = useLocaleSwitch();
  const { status } = useAuth();
  const failureText = useFailureText();
  const form = useForm<LoginFields>({
    resolver: useSchemaResolver(loginFields),
    defaultValues: { loginId: '', password: '' },
    reValidateMode: 'onSubmit',
  });
  const { errors, isSubmitting, isSubmitSuccessful } = form.formState;
  // a login that succeeded stays busy until the home page opens
  const pending = isSubmitting || isSubmitSuccessful;
  const error = errors.root?.server?.message;
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

  const submit = async ({ loginId, password }: LoginFields) => {
    try {
      const me = await login(loginId, password);
      // The interface follows the user's stored language (docs/ui/I18N.md, "Languages and locale
      // resolution").
      if (me.language !== locale) setLocale(me.language);
      void navigate('/', { replace: true });
    } catch (failure) {
      // a refusal is a form error, so the submit does not count as a success
      form.setError('root.server', { message: failureText(failure) });
    }
  };

  return (
    <Form form={form} onSubmit={submit} label={t('title')}>
      <div className="auth-shell-stack">
        {ended === 'revoked' && <Alert tone="warning">{t('session_ended')}</Alert>}
        {ended === 'logout' && <Alert tone="success">{t('signed_out')}</Alert>}
        {offline && <Alert tone="warning">{t('offline')}</Alert>}
        <FormTextField label={t('login_id')} name="loginId" autoComplete="username" required />
        <FormTextField
          type="password"
          label={t('password')}
          name="password"
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
    </Form>
  );
}
