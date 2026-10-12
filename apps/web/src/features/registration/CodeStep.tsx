import { Alert, Button, Form, TextField } from '@css/ui';
import { type FormEvent, useState } from 'react';
import { useTranslations } from 'use-intl';
import { type Draft, failureOf, resendCode, verifyCodes } from './registration-api';

/** Shown only in development and test builds, never in production (BD-49). */
const DUMMY_OTP_NOTE = import.meta.env.VITE_OTP_DUMMY === '1';

const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6);

/**
 * Steps 2 and 3: the code from the mobile, then the code from the email. They are two screens
 * for the user, but the API checks both codes together (AUTH.md 2), so the form opens only after
 * both are right. A contact of an existing account is reported only here, after both codes
 * (DECISION_LOG D-086).
 */
export function CodeStep({
  draft,
  onVerified,
}: {
  draft: Draft;
  onVerified: (verified: Draft) => void;
}) {
  const t = useTranslations('registration.code');
  const tl = useTranslations('auth.login');
  const tr = useTranslations('registration');
  const [channel, setChannel] = useState<'mobile' | 'email'>('mobile');
  const [mobileCode, setMobileCode] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [exists, setExists] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const next = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setChannel('email');
  };

  const verify = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setErrors({});
    setError(null);
    void verifyCodes(draft.registrationId, mobileCode, emailCode)
      .then((verified) =>
        onVerified({ ...draft, token: verified.registrationToken, programs: verified.programs }),
      )
      .catch((failure: unknown) => {
        const f = failureOf(failure, tl('offline'));
        setExists(f.code === 'registration.account_exists');
        setErrors(f.fields);
        setError(f.message);
        // a wrong mobile code sends the user back to the mobile screen
        if (f.fields.mobileCode) setChannel('mobile');
      })
      .finally(() => setPending(false));
  };

  const resend = () => {
    setNotice(null);
    void resendCode(draft.registrationId, channel === 'mobile' ? 'sms' : 'email')
      .then(() => setNotice(t('resent')))
      .catch((failure: unknown) => setError(failureOf(failure, tl('offline')).message));
  };

  const mobileStep = channel === 'mobile';
  return (
    <Form onSubmit={mobileStep ? next : verify} aria-label={mobileStep ? t('mobile') : t('email')}>
      <div className="auth-shell-stack">
        <Alert tone="info" live="status">
          {mobileStep
            ? t('mobile_sent', { mobile: draft.mobile })
            : t('email_sent', { email: draft.email })}
        </Alert>
        {DUMMY_OTP_NOTE && <Alert tone="warning">{tr('dummy_note')}</Alert>}
        {mobileStep ? (
          <TextField
            key="mobileCode"
            label={t('mobile')}
            name="mobileCode"
            value={mobileCode}
            onChange={(v) => setMobileCode(digits(v))}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            error={errors.mobileCode}
          />
        ) : (
          <TextField
            key="emailCode"
            label={t('email')}
            name="emailCode"
            value={emailCode}
            onChange={(v) => setEmailCode(digits(v))}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            error={errors.emailCode}
          />
        )}
        {notice && (
          <Alert tone="success" live="status">
            {notice}
          </Alert>
        )}
        {error && (
          <Alert tone="danger" live="alert">
            {error}
          </Alert>
        )}
        {exists && (
          <Button href="/login" variant="secondary" fullWidth>
            {t('exists_login')}
          </Button>
        )}
        <Button type="submit" fullWidth loading={pending}>
          {mobileStep ? t('next') : t('verify')}
        </Button>
        <Button variant="ghost" onPress={resend} disabled={pending}>
          {t('resend')}
        </Button>
      </div>
    </Form>
  );
}
