import {
  invitationAcceptRequestSchema,
  type InvitationView,
  PASSWORD_MIN_LENGTH,
} from '@css/shared/auth';
import { Alert, Button, Form, FormTextField, LinkButton, Skeleton, Text } from '@/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { AuthShell } from '../../components/AuthShell';
import { DocumentTitle } from '../../components/DocumentTitle';
import { PasswordRules } from '../../components/PasswordRules';
import { api, ApiFailure } from '../../api/client';
import { useSchemaResolver } from '../../lib/form-schema';

type PasswordFields = { password: string; confirm: string };

/** The password of the accept request, filled, and the same password typed again. */
function usePasswordSchema() {
  const tp = useTranslations('auth.password');
  return useMemo(
    () =>
      invitationAcceptRequestSchema
        .pick({ password: true })
        .extend({ confirm: z.string() })
        .refine((v) => v.password === v.confirm, { path: ['confirm'], message: tp('mismatch') }),
    [tp],
  );
}

/** The message a refused accept gives for the password itself, if it names it. */
const passwordErrorOf = (error: unknown) =>
  error instanceof ApiFailure
    ? error.details.find((d) => d.path === 'password')?.message
    : undefined;

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
 * (docs/architecture/AUTH.md, "Officials created by the admin"; docs/ui/SCREENS.md "Set-password
 * link of a new official"): the page shows the name and the job ID of the open link, the password
 * rules of the account, then sends the person to log in with the job ID. A used, replaced or
 * expired link says to ask the admin for a new one.
 */
export function InvitePage() {
  const t = useTranslations('auth.invite');
  const tp = useTranslations('auth.password');
  const tl = useTranslations('auth.login');
  const token = useLinkToken();
  const form = useForm<PasswordFields>({
    resolver: useSchemaResolver(usePasswordSchema()),
    defaultValues: { password: '', confirm: '' },
    reValidateMode: 'onSubmit',
  });
  const password = useWatch({ control: form.control, name: 'password' });
  const view = useQuery({
    queryKey: ['invitation', token],
    queryFn: () =>
      api<InvitationView>('/auth/invitations/check', { method: 'POST', body: { token } }, false),
    enabled: token.length > 0,
    retry: false,
    staleTime: Infinity,
  });
  const accept = useMutation({
    mutationFn: (chosen: string) =>
      api<void>(
        '/auth/invitations/accept',
        { method: 'POST', body: { token, password: chosen } },
        false,
      ),
    onError: (error) => {
      const message = passwordErrorOf(error);
      if (message) form.setError('password', { type: 'server', message });
    },
  });
  const submit = ({ password: chosen }: PasswordFields) => accept.mutate(chosen);
  const failure = accept.error instanceof ApiFailure ? accept.error : undefined;
  const passwordError = passwordErrorOf(accept.error);

  const body = () => {
    if (!token) return <Alert tone="error">{t('missing')}</Alert>;
    if (view.isPending) return <Skeleton shape="card" />;
    // only an unknown (404) or a closed (410) link is dead, on opening or while the page was open;
    // a busy server or a lost connection keeps the link, which the person tries again
    const dead = [view.error, accept.error].find(
      (e): e is ApiFailure => e instanceof ApiFailure && (e.status === 404 || e.status === 410),
    );
    if (dead)
      return (
        <div className="auth-shell-stack">
          <Alert tone="error">{dead.message}</Alert>
          <Text>{t('ask_admin')}</Text>
          <LinkButton variant="secondary" to="/login" fullWidth>
            {t('to_login')}
          </LinkButton>
        </div>
      );
    if (view.error)
      return (
        <div className="auth-shell-stack">
          <Alert tone="error">
            {view.error instanceof ApiFailure ? view.error.message : tl('offline')}
          </Alert>
          <Button variant="secondary" onClick={() => void view.refetch()} fullWidth>
            {t('retry')}
          </Button>
        </div>
      );
    const { data } = view;
    if (!data) return null;
    if (accept.isSuccess)
      return (
        <div className="auth-shell-stack">
          <Alert tone="success">{t('done', { jobId: data.jobId })}</Alert>
          <LinkButton to="/login" fullWidth>
            {t('to_login')}
          </LinkButton>
        </div>
      );
    const minLength = data.minPasswordLength ?? PASSWORD_MIN_LENGTH;
    return (
      <Form form={form} onSubmit={submit} label={t('title')}>
        <div className="auth-shell-stack">
          <Text>{t('greeting', { name: data.displayName })}</Text>
          <Text>{t('job_id', { jobId: data.jobId })}</Text>
          <FormTextField
            type="password"
            label={tp('new')}
            name="password"
            autoComplete="new-password"
            required
          />
          <PasswordRules password={password} id="invite-rules" minLength={minLength} />
          <FormTextField
            type="password"
            label={tp('confirm')}
            name="confirm"
            autoComplete="new-password"
            required
          />
          {accept.error && !passwordError && (
            <Alert tone="error">{failure ? failure.message : tl('offline')}</Alert>
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
