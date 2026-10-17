import { type InvitationView, PASSWORD_MIN_LENGTH } from '@css/shared/auth';
import { Alert, Button, Form, PasswordField, Skeleton } from '@css/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslations } from 'use-intl';
import { AuthShell } from '../../components/AuthShell';
import { DocumentTitle } from '../../components/DocumentTitle';
import { PasswordRules } from '../../components/PasswordRules';
import { api, ApiFailure } from '../../lib/api';

/**
 * The token of the link `/invite#<token>`: read from the fragment, which the browser never sends
 * to a server, and taken off the address bar so it stays out of the history and screenshots.
 */
function useLinkToken(): string {
  const [token] = useState(() => {
    const value = window.location.hash.replace(/^#/, '');
    if (value) window.history.replaceState(null, '', window.location.pathname);
    return value;
  });
  return token;
}

/**
 * An official created by the admin chooses the first password through the single-use link
 * (DECISION_LOG D-097, AUTH.md 2.2, SCR-065): the page shows the name and the job ID of the open
 * link, the password rules of the account, then sends the person to log in with the job ID. A
 * used, replaced or expired link says to ask the admin for a new one.
 */
export function InvitePage() {
  const t = useTranslations('auth.invite');
  const tp = useTranslations('auth.password');
  const tl = useTranslations('auth.login');
  const token = useLinkToken();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const view = useQuery({
    queryKey: ['invitation', token],
    queryFn: () =>
      api<InvitationView>('/auth/invitations/check', { method: 'POST', body: { token } }, false),
    enabled: token.length > 0,
    retry: false,
    staleTime: Infinity,
  });
  const accept = useMutation({
    mutationFn: () =>
      api<void>('/auth/invitations/accept', { method: 'POST', body: { token, password } }, false),
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // two values the person just typed on this device, not a secret check
    // eslint-disable-next-line security/detect-possible-timing-attacks
    if (password !== confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    accept.mutate();
  };
  const failure = accept.error instanceof ApiFailure ? accept.error : undefined;
  const passwordError = failure?.details.find((d) => d.path === 'password')?.message;

  const body = () => {
    if (!token)
      return (
        <Alert tone="danger" live="alert">
          {t('missing')}
        </Alert>
      );
    if (view.isPending) return <Skeleton shape="card" />;
    // the link is unknown, used, replaced or expired: on opening, or closed while the page was open
    const dead = view.error ?? (failure && failure.status !== 422 ? failure : null);
    if (dead)
      return (
        <div className="auth-shell-stack">
          <Alert tone="danger" live="alert">
            {dead instanceof ApiFailure ? dead.message : tl('offline')}
          </Alert>
          <p className="m-0">{t('ask_admin')}</p>
          <Button variant="secondary" href="/login" fullWidth>
            {t('to_login')}
          </Button>
        </div>
      );
    const { data } = view;
    if (!data) return null;
    if (accept.isSuccess)
      return (
        <div className="auth-shell-stack">
          <Alert tone="success" live="status">
            {t('done', { jobId: data.jobId })}
          </Alert>
          <Button href="/login" fullWidth>
            {t('to_login')}
          </Button>
        </div>
      );
    const minLength = data.minPasswordLength ?? PASSWORD_MIN_LENGTH;
    return (
      <Form onSubmit={submit} aria-label={t('title')}>
        <div className="auth-shell-stack">
          <p className="m-0">{t('greeting', { name: data.displayName })}</p>
          <p className="m-0">{t('job_id', { jobId: data.jobId })}</p>
          <PasswordField
            label={tp('new')}
            name="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            required
            error={passwordError}
          />
          <PasswordRules password={password} id="invite-rules" minLength={minLength} />
          <PasswordField
            label={tp('confirm')}
            name="confirm"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            required
            error={mismatch ? tp('mismatch') : undefined}
          />
          {accept.error && !(accept.error instanceof ApiFailure) && (
            <Alert tone="danger" live="alert">
              {tl('offline')}
            </Alert>
          )}
          <Button type="submit" fullWidth loading={accept.isPending}>
            {t('submit')}
          </Button>
        </div>
      </Form>
    );
  };

  return (
    <AuthShell title={t('title')}>
      <DocumentTitle title={t('title')} />
      {body()}
    </AuthShell>
  );
}
