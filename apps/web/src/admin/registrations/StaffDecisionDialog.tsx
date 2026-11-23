import type { Locale } from '@css/shared/i18n';
import { Alert, Dialog, Form, FormSelectField, FormTextField, RadioGroup } from '@/ui';
import { useQuery } from '@tanstack/react-query';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useLocale, useTranslations } from 'use-intl';
import { z } from 'zod';
import { ApiFailure } from '../../api/client';
import { useAuth } from '../../lib/auth';
import { showFailure, useSchemaResolver } from '../../lib/form-schema';
import { mayGiveRole } from '../roles';
import { decideStaff, roles } from './registrations-api';
import { DialogActions } from '../DialogActions';

type Decision = 'approve' | 'reject';

/** An approval names the role; a rejection gives a reason of three letters at least. */
const DECISION_SCHEMA = z
  .object({ decision: z.enum(['approve', 'reject']), roleKey: z.string(), reason: z.string() })
  .superRefine((v, ctx) => {
    if (v.decision === 'approve' && !v.roleKey)
      ctx.addIssue({ code: 'custom', path: ['roleKey'], message: 'validation.required' });
    if (v.decision === 'reject' && v.reason.trim().length < 3)
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'validation.too_short' });
  });
type DecisionFields = z.infer<typeof DECISION_SCHEMA>;
const EMPTY: DecisionFields = { decision: 'approve', roleKey: '', reason: '' };

/**
 * The Department Head or the Monitoring Team approves an official's registration with the role
 * it gets, or rejects it with a reason (POST /staff-registrations/{userId}/decision).
 */
export function StaffDecisionDialog({
  userId,
  name,
  open,
  onClose,
  onDone,
}: {
  userId: string;
  name: string;
  open: boolean;
  onClose: () => void;
  onDone: (decision: Decision) => void;
}) {
  const t = useTranslations('admin.registrations');
  const tc = useTranslations('common.action');
  const ts = useTranslations('common.state.error');
  const locale = useLocale() as Locale;
  const { me } = useAuth();
  const catalogue = useQuery({ queryKey: ['admin', 'roles'], queryFn: roles, enabled: open });
  const form = useForm<DecisionFields>({
    resolver: useSchemaResolver(DECISION_SCHEMA),
    defaultValues: EMPTY,
    reValidateMode: 'onSubmit',
  });
  const decision = useWatch({ control: form.control, name: 'decision' });
  const ready = DECISION_SCHEMA.safeParse(useWatch({ control: form.control })).success;
  const pending = form.formState.isSubmitting;
  const error =
    form.formState.errors.root?.server?.message ??
    (catalogue.error instanceof ApiFailure
      ? (catalogue.error.details[0]?.message ?? catalogue.error.message)
      : undefined);

  const save = async (values: DecisionFields) => {
    try {
      await decideStaff(
        userId,
        values.decision === 'approve'
          ? { decision: values.decision, roleKey: values.roleKey }
          : { decision: values.decision, reason: values.reason.trim() },
      );
    } catch (failure) {
      showFailure(form, failure, ts('text'));
      return;
    }
    form.reset(EMPTY);
    onDone(values.decision);
  };
  const close = () => {
    form.reset(EMPTY);
    onClose();
  };
  const options = (catalogue.data ?? [])
    // an Admin and the Department Head are an Admin's to give
    .filter((r) => r.kind === 'official' && me !== null && mayGiveRole(me, r.key))
    .map((r) => ({ value: r.key, label: r.name[locale] }));

  return (
    <Dialog
      title={t('staff.title', { name })}
      open={open}
      onClose={close}
      dismissible={!pending}
      actions={
        <DialogActions
          cancelLabel={tc('cancel')}
          onCancel={close}
          submitLabel={t('staff.submit')}
          onSubmit={() => void form.handleSubmit(save)()}
          pending={pending}
          disabled={!ready}
        />
      }
    >
      <Form form={form} onSubmit={save} label={t('staff.title', { name })}>
        {error && <Alert tone="error">{error}</Alert>}
        <Controller
          control={form.control}
          name="decision"
          render={({ field, fieldState }) => (
            <RadioGroup
              label={t('staff.decision')}
              orientation="horizontal"
              value={field.value}
              onChange={(id) => field.onChange(id as Decision)}
              error={fieldState.error?.message}
              options={[
                { value: 'approve', label: t('staff.approve') },
                { value: 'reject', label: t('staff.reject') },
              ]}
            />
          )}
        />
        {decision === 'approve' ? (
          <FormSelectField
            name="roleKey"
            label={t('staff.role')}
            required
            options={options}
            searchable={false}
          />
        ) : (
          <FormTextField
            name="reason"
            rows={4}
            label={t('reason')}
            hint={t('staff.reason_hint')}
            required
            maxLength={1000}
          />
        )}
      </Form>
    </Dialog>
  );
}
