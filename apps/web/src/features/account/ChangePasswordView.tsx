import { minPasswordLength } from '@css/shared/auth';
import { Alert, Button, Card, Form, PasswordField, Text } from '@css/ui';
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

  /** The password is changed: the session is read again and the home page opens once it says so. */
  const startWorking = async () => {
    try {
      const pair = await refreshSession();
      if (pair && !pair.me.passwordChangeRequired) void navigate('/', { replace: true });
    } catch {
      // the change itself succeeded; the next page load reads the session again
    }
  };

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
      if (due) void startWorking();
    } catch (failure) {
      if (failure instanceof ApiFailure && failure.details.length)
        setErrors(Object.fromEntries(failure.details.map((d) => [d.path ?? '', d.message])));
      else setError(failure instanceof ApiFailure ? failure.message : tl('offline'));
    } finally {
      setPending(false);
    }
  };

  return (
    <AccountPage
      title={() => t('title')}
      eyebrow={t('eyebrow')}
      description={t('description')}
      wide
    >
      {(me) => (
        <div className="page-split">
          <Card>
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
          </Card>
          <aside className="page-split-side" aria-label={t('tip.title')}>
            <Card accent title={t('tip.title')} headingLevel={2}>
              <Text tone="muted">{t('tip.body')}</Text>
              {/* while a new password is required, no other page opens yet */}
              {!me.passwordChangeRequired && (
                <Button variant="ghost" size="sm" href="/account/sessions">
                  {t('tip.devices')}
                </Button>
              )}
            </Card>
          </aside>
        </div>
      )}
    </AccountPage>
  );
}
