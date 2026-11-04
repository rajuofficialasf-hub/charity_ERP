import { Alert, Button, LinkButton, Text, TextField } from '@/ui';
import { useTranslations } from 'use-intl';
import { type FormEvent, useState } from 'react';
import { PasswordRules } from '../../components/PasswordRules';
import { api, ApiFailure } from '../../lib/api';

type Step = 'start' | 'code' | 'done';

/** Shown only in development and test builds, never in production (BD-49). */
const DUMMY_OTP_NOTE = import.meta.env.VITE_OTP_DUMMY === '1';

/** Field errors of a 422 answer by field name. */
function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiFailure)) return {};
  return Object.fromEntries(error.details.map((d) => [d.path ?? '', d.message]));
}

/** Forgotten password: login id → OTP and new password → done (SCR-001, AUTH.md 3, O-05). */
export function ResetForm() {
  const t = useTranslations('auth.reset');
  const tp = useTranslations('auth.password');
  const tl = useTranslations('auth.login');
  const [step, setStep] = useState<Step>('start');
  const [loginId, setLoginId] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const run = async (work: () => Promise<void>) => {
    setError(null);
    setErrors({});
    setPending(true);
    try {
      await work();
    } catch (failure) {
      const byField = fieldErrors(failure);
      setErrors(byField);
      if (!Object.keys(byField).length)
        setError(failure instanceof ApiFailure ? failure.message : tl('offline'));
    } finally {
      setPending(false);
    }
  };

  const start = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    void run(async () => {
      await api<void>('/auth/password/reset/start', { method: 'POST', body: { loginId } }, false);
      setStep('code');
    });
  };

  const complete = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Two values the user just typed on this device, not a secret check.
    // eslint-disable-next-line security/detect-possible-timing-attacks
    if (password !== confirm) {
      setErrors({ confirm: tp('mismatch') });
      return;
    }
    void run(async () => {
      await api<void>(
        '/auth/password/reset/complete',
        { method: 'POST', body: { loginId, code, newPassword: password } },
        false,
      );
      setStep('done');
    });
  };

  if (step === 'done')
    return (
      <div className="auth-shell-stack">
        <Alert tone="success">{t('done')}</Alert>
        <LinkButton to="/login" fullWidth>
          {t('back')}
        </LinkButton>
      </div>
    );

  if (step === 'start')
    return (
      <form method="post" noValidate onSubmit={start} aria-label={t('title')}>
        <div className="auth-shell-stack">
          <Text>{t('intro')}</Text>
          <TextField
            label={tl('login_id')}
            name="loginId"
            value={loginId}
            onChange={setLoginId}
            autoComplete="username"
            required
            error={errors.loginId}
          />
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" fullWidth loading={pending}>
            {t('send')}
          </Button>
          <LinkButton variant="text" to="/login">
            {t('back')}
          </LinkButton>
        </div>
      </form>
    );

  return (
    <form method="post" noValidate onSubmit={complete} aria-label={t('title')}>
      <div className="auth-shell-stack">
        <Alert tone="info">{t('sent')}</Alert>
        {DUMMY_OTP_NOTE && <Alert tone="warning">{t('dummy_note')}</Alert>}
        <TextField
          label={t('code')}
          name="code"
          value={code}
          onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          error={errors.code}
        />
        <TextField
          type="password"
          label={t('new_password')}
          name="newPassword"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          required
          error={errors.newPassword}
        />
        <PasswordRules password={password} id="reset-rules" />
        <TextField
          type="password"
          label={t('confirm_password')}
          name="confirm"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          required
          error={errors.confirm}
        />
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" fullWidth loading={pending}>
          {t('submit')}
        </Button>
        <Button variant="text" onClick={() => start()} disabled={pending}>
          {t('resend')}
        </Button>
      </div>
    </form>
  );
}
