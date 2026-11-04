import { minPasswordLength } from '@css/shared/auth';
import { Alert, Button, Card, LinkButton, Text, TextField } from '@/ui';
import { useTranslations } from 'use-intl';
import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { AccountPage } from '../../components/AccountPage';
import { DocumentTitle } from '../../components/DocumentTitle';
import { PasswordRules } from '../../components/PasswordRules';
import { PERMISSION_PANEL_ROLES } from '../../admin/roles';
import { api, ApiFailure, refreshSession } from '../../lib/api';

/**
 * Change own password (docs/architecture/AUTH.md, the password change): the other devices are
 * logged out.
 */
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
            <form
              method="post"
              noValidate
              onSubmit={(event) => void submit(event, me.passwordChangeRequired === true)}
              aria-label={t('title')}
            >
              <DocumentTitle title={t('title')} />
              <div className="auth-shell-stack">
                {me.passwordChangeRequired && !done && (
                  <Alert tone="info">{t('required_notice')}</Alert>
                )}
                {done && <Alert tone="success">{t('done')}</Alert>}
                <TextField
                  type="password"
                  label={t('current')}
                  name="currentPassword"
                  value={current}
                  onChange={setCurrent}
                  autoComplete="current-password"
                  required
                  error={errors.currentPassword}
                />
                <TextField
                  type="password"
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
                <TextField
                  type="password"
                  label={t('confirm')}
                  name="confirm"
                  value={confirm}
                  onChange={setConfirm}
                  autoComplete="new-password"
                  required
                  error={errors.confirm}
                />
                {error && <Alert tone="error">{error}</Alert>}
                <Button type="submit" loading={pending}>
                  {t('submit')}
                </Button>
              </div>
            </form>
          </Card>
          <aside className="page-split-side" aria-label={t('tip.title')}>
            <Card title={t('tip.title')} headingLevel={2}>
              <Text tone="muted">{t('tip.body')}</Text>
              {/* while a new password is required, no other page opens yet */}
              {!me.passwordChangeRequired && (
                <LinkButton variant="text" to="/account/sessions">
                  {t('tip.devices')}
                </LinkButton>
              )}
            </Card>
          </aside>
        </div>
      )}
    </AccountPage>
  );
}
