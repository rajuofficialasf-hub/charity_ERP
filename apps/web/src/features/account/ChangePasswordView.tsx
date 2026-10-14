import { minPasswordLength } from '@css/shared/auth';
import { Alert, Button, Form, PasswordField } from '@css/ui';
import { useTranslations } from 'use-intl';
import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { AccountPage } from '../../components/AccountPage';
import { DocumentTitle } from '../../components/DocumentTitle';
import { PasswordRules } from '../../components/PasswordRules';
import { PERMISSION_PANEL_ROLES } from '../../admin/roles';
import { api, ApiFailure, refreshSession } from '../../lib/api';

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
  const navigate = useNavigate();

  const submit = async (event: FormEvent<HTMLFormElement>, due: boolean) => {
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
      if (due) {
        // the session now says nothing is due: read it again, then start working
        await refreshSession();
        void navigate('/', { replace: true });
      }
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
      {(me) => (
        <Form
          onSubmit={(event) => submit(event, me.passwordChangeRequired === true)}
          aria-label={t('title')}
        >
          <DocumentTitle title={t('title')} />
          <div className="auth-shell-stack">
            {me.passwordChangeRequired && !done && (
              <Alert tone="info" live="status">
                {t('required_notice')}
              </Alert>
            )}
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
            <PasswordRules
              password={next}
              id="change-rules"
              minLength={minPasswordLength(
                me.passwordChangeRequired === true ||
                  me.roles.some((r) => PERMISSION_PANEL_ROLES.includes(r)),
              )}
            />
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
            <Button type="submit" loading={pending}>
              {t('submit')}
            </Button>
          </div>
        </Form>
      )}
    </AccountPage>
  );
}
