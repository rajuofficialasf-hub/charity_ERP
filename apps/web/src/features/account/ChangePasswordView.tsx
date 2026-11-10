import { minPasswordLength, passwordChangeRequestSchema } from '@css/shared/auth';
import { Alert, Card, Form, FormSubmitButton, FormTextField, LinkButton, Text } from '@/ui';
import { useTranslations } from 'use-intl';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { AccountPage } from '../../components/AccountPage';
import { DocumentTitle } from '../../components/DocumentTitle';
import { PasswordRules } from '../../components/PasswordRules';
import { PERMISSION_PANEL_ROLES } from '../../admin/roles';
import { api, ApiFailure, refreshSession } from '../../api/client';
import { showFieldErrors, useSchemaResolver } from '../../lib/form-schema';

type ChangeFields = { currentPassword: string; newPassword: string; confirm: string };

/** The password change request and the new password typed again. */
function useChangeSchema() {
  const t = useTranslations('auth.password');
  return useMemo(
    () =>
      passwordChangeRequestSchema
        .extend({ confirm: z.string() })
        .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: t('mismatch') }),
    [t],
  );
}

/**
 * Change own password (docs/architecture/AUTH.md, the password change): the other devices are
 * logged out.
 */
export function ChangePasswordView() {
  const t = useTranslations('auth.password');
  const tl = useTranslations('auth.login');
  const form = useForm<ChangeFields>({
    resolver: useSchemaResolver(useChangeSchema()),
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
    reValidateMode: 'onSubmit',
  });
  const next = useWatch({ control: form.control, name: 'newPassword' });
  const error = form.formState.errors.root?.server?.message;
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

  const submit = async ({ currentPassword, newPassword }: ChangeFields, due: boolean) => {
    setDone(false);
    try {
      await api<void>('/auth/password/change', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      form.reset();
      setDone(true);
      if (due) void startWorking();
    } catch (failure) {
      if (!showFieldErrors(form, failure))
        form.setError('root.server', {
          message: failure instanceof ApiFailure ? failure.message : tl('offline'),
        });
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
              form={form}
              onSubmit={(values) => submit(values, me.passwordChangeRequired === true)}
              label={t('title')}
            >
              <DocumentTitle title={t('title')} />
              <div className="auth-shell-stack">
                {me.passwordChangeRequired && !done && (
                  <Alert tone="info">{t('required_notice')}</Alert>
                )}
                {done && <Alert tone="success">{t('done')}</Alert>}
                <FormTextField
                  type="password"
                  label={t('current')}
                  name="currentPassword"
                  autoComplete="current-password"
                  required
                />
                <FormTextField
                  type="password"
                  label={t('new')}
                  name="newPassword"
                  autoComplete="new-password"
                  required
                />
                <PasswordRules
                  password={next}
                  id="change-rules"
                  minLength={minPasswordLength(
                    me.passwordChangeRequired === true ||
                      me.roles.some((r) => PERMISSION_PANEL_ROLES.includes(r)),
                  )}
                />
                <FormTextField
                  type="password"
                  label={t('confirm')}
                  name="confirm"
                  autoComplete="new-password"
                  required
                />
                {error && <Alert tone="error">{error}</Alert>}
                <FormSubmitButton>{t('submit')}</FormSubmitButton>
              </div>
            </Form>
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
