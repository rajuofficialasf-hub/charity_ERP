import type { RegistrationKind } from '@css/shared/registration';
import { Alert, Button, Form, RadioGroup, TextField } from '@css/ui';
import { type FormEvent, useState } from 'react';
import { useTranslations } from 'use-intl';
import { type Draft, failureOf, startRegistration } from './registration-api';

/** Step 1: who registers, and the mobile number and email the two codes go to (AUTH.md 2). */
export function StartStep({ onStarted }: { onStarted: (draft: Draft) => void }) {
  const t = useTranslations('registration.start');
  const tl = useTranslations('auth.login');
  const [kind, setKind] = useState<RegistrationKind>('volunteer');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setErrors({});
    setError(null);
    void startRegistration({ mobile, email, kind })
      .then((started) =>
        onStarted({
          registrationId: started.registrationId,
          kind,
          mobile,
          email: email.toLowerCase(),
        }),
      )
      .catch((failure: unknown) => {
        const f = failureOf(failure, tl('offline'));
        setErrors(f.fields);
        setError(f.message);
      })
      .finally(() => setPending(false));
  };

  return (
    <Form onSubmit={submit} aria-label={t('send')}>
      <div className="auth-shell-stack">
        <p className="m-0">{t('intro')}</p>
        <RadioGroup
          label={t('kind')}
          name="kind"
          orientation="horizontal"
          value={kind}
          onChange={(id) => setKind(id as RegistrationKind)}
          options={[
            { id: 'volunteer', label: t('volunteer') },
            { id: 'staff', label: t('staff') },
          ]}
        />
        <TextField
          label={t('mobile')}
          name="mobile"
          value={mobile}
          onChange={(v) => setMobile(v.replace(/\D/g, '').slice(0, 11))}
          inputMode="numeric"
          autoComplete="tel"
          required
          error={errors.mobile}
        />
        <TextField
          label={t('email')}
          name="email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          required
          error={errors.email}
        />
        {error && (
          <Alert tone="danger" live="alert">
            {error}
          </Alert>
        )}
        <Button type="submit" fullWidth loading={pending}>
          {t('send')}
        </Button>
      </div>
    </Form>
  );
}
