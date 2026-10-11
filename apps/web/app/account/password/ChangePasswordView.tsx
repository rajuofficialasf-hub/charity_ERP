'use client';

import { Alert, Button, Form, PasswordField } from '@css/ui';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { AccountPage } from '../../_components/AccountPage';
import { PasswordRules } from '../../_components/PasswordRules';
import { api, ApiFailure } from '../../_lib/api';
import { useHydrated } from '../../_lib/use-hydrated';

/** Change own password (SCR-006, AUTH.md 3): the other devices are logged out. */
export function ChangePasswordView() {
  const t = useTranslations('auth.password');
  const tl = useTranslations('auth.login');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const hydrated = useHydrated();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrors({});
    setError(null);
    setDone(false);
    if (next !== confirm) {
      setErrors({ confirm: t('mismatch') });
      return;
    }
    setPending(true);
    try {
      await api<void>('/auth/password/change', {
        method: 'POST',
        body: { currentPassword: current, newPassword: next },
      });
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
    } catch (failure) {
      if (failure instanceof ApiFailure && failure.details.length)
        setErrors(Object.fromEntries(failure.details.map((d) => [d.path ?? '', d.message])));
      else setError(failure instanceof ApiFailure ? failure.message : tl('offline'));
    } finally {
      setPending(false);
    }
  };

  return (
    <AccountPage title={() => t('title')}>
      {() => (
        <Form onSubmit={submit} aria-label={t('title')}>
          <div className="auth-shell-stack">
            {done && (
              <Alert tone="success" live="status">
                {t('done')}
              </Alert>
            )}
            <PasswordField
              label={t('current')}
              name="currentPassword"
              value={current}
              onChange={setCurrent}
              autoComplete="current-password"
              required
              error={errors.currentPassword}
            />
            <PasswordField
              label={t('new')}
              name="newPassword"
              value={next}
              onChange={setNext}
              autoComplete="new-password"
              required
              error={errors.newPassword}
            />
            <PasswordRules password={next} id="change-rules" />
            <PasswordField
              label={t('confirm')}
              name="confirm"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              required
              error={errors.confirm}
            />
            {error && (
              <Alert tone="danger" live="alert">
                {error}
              </Alert>
            )}
            <Button type="submit" loading={pending} disabled={!hydrated}>
              {t('submit')}
            </Button>
          </div>
        </Form>
      )}
    </AccountPage>
  );
}
