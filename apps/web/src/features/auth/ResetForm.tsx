import { passwordResetStartRequestSchema } from '@css/shared/auth';
import { Alert, Button, Form, FormSubmitButton, FormTextField, LinkButton, Text } from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { PasswordRules } from '../../components/PasswordRules';
import { api } from '../../api/client';
import { showFailure, useSchemaResolver } from '../../lib/form-schema';

type Step = 'start' | 'code' | 'done';
type StartFields = z.input<typeof passwordResetStartRequestSchema>;
type CodeFields = { code: string; newPassword: string; confirm: string };

/** Shown only in development and test builds, never in production. */
const DUMMY_OTP_NOTE = import.meta.env.VITE_OTP_DUMMY === '1';

const sixDigits = (value: string) => value.replace(/\D/g, '').slice(0, 6);

/**
 * The code step: each field only has to be filled before the server answers (the code and the
 * password rules are the server's to say), and the two new passwords must match.
 */
function useCodeSchema() {
  const tp = useTranslations('auth.password');
  return useMemo(
    () =>
      z
        .object({
          code: z.string().min(1),
          newPassword: z.string().min(1),
          confirm: z.string().min(1),
        })
        .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: tp('mismatch') }),
    [tp],
  );
}

/**
 * Forgotten password: login id → OTP and new password → done (docs/ui/SCREENS.md "Login and
 * password reset"; docs/architecture/AUTH.md, "Password rules").
 */
export function ResetForm() {
  const t = useTranslations('auth.reset');
  const tl = useTranslations('auth.login');
  const [step, setStep] = useState<Step>('start');
  const startForm = useForm<StartFields>({
    resolver: useSchemaResolver(passwordResetStartRequestSchema),
    defaultValues: { loginId: '' },
    reValidateMode: 'onSubmit',
  });
  const codeForm = useForm<CodeFields>({
    resolver: useSchemaResolver(useCodeSchema()),
    defaultValues: { code: '', newPassword: '', confirm: '' },
    reValidateMode: 'onSubmit',
  });
  const password = useWatch({ control: codeForm.control, name: 'newPassword' });

  const sendCode = (loginId: string) =>
    api<void>('/auth/password/reset/start', { method: 'POST', body: { loginId } }, false);

  const start = async ({ loginId }: StartFields) => {
    try {
      await sendCode(loginId);
      setStep('code');
    } catch (failure) {
      showFailure(startForm, failure, tl('offline'));
    }
  };

  const resend = useMutation({
    mutationFn: () => sendCode(startForm.getValues('loginId')),
    onMutate: () => codeForm.clearErrors(),
    onError: (failure) => showFailure(codeForm, failure, tl('offline')),
  });

  const complete = async ({ code, newPassword }: CodeFields) => {
    try {
      await api<void>(
        '/auth/password/reset/complete',
        {
          method: 'POST',
          body: { loginId: startForm.getValues('loginId'), code, newPassword },
        },
        false,
      );
      setStep('done');
    } catch (failure) {
      showFailure(codeForm, failure, tl('offline'));
    }
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

  if (step === 'start') {
    const error = startForm.formState.errors.root?.server?.message;
    return (
      <Form form={startForm} onSubmit={start} label={t('title')}>
        <div className="auth-shell-stack">
          <Text>{t('intro')}</Text>
          <FormTextField label={tl('login_id')} name="loginId" autoComplete="username" required />
          {error && <Alert tone="error">{error}</Alert>}
          <FormSubmitButton fullWidth>{t('send')}</FormSubmitButton>
          <LinkButton variant="text" to="/login">
            {t('back')}
          </LinkButton>
        </div>
      </Form>
    );
  }

  const pending = codeForm.formState.isSubmitting || resend.isPending;
  const error = codeForm.formState.errors.root?.server?.message;
  return (
    <Form form={codeForm} onSubmit={complete} label={t('title')}>
      <div className="auth-shell-stack">
        <Alert tone="info">{t('sent')}</Alert>
        {DUMMY_OTP_NOTE && <Alert tone="warning">{t('dummy_note')}</Alert>}
        <FormTextField
          label={t('code')}
          name="code"
          normalize={sixDigits}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
        />
        <FormTextField
          type="password"
          label={t('new_password')}
          name="newPassword"
          autoComplete="new-password"
          required
        />
        <PasswordRules password={password} id="reset-rules" />
        <FormTextField
          type="password"
          label={t('confirm_password')}
          name="confirm"
          autoComplete="new-password"
          required
        />
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" fullWidth loading={pending}>
          {t('submit')}
        </Button>
        <Button variant="text" onClick={() => resend.mutate()} disabled={pending}>
          {t('resend')}
        </Button>
      </div>
    </Form>
  );
}
