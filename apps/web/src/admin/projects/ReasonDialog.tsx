import { formatDate } from '@css/shared/format';
import { Dialog, Form, FormDateField, FormTextField } from '@/ui';
import { type ReactNode, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { ApiFailure } from '../../api/client';
import { useSchemaResolver } from '../../lib/form-schema';
import { DialogActions } from '../DialogActions';

/**
 * A reason of three letters at least, as the server requires, and, when the move asks for a new
 * end date, one later than the current end date.
 */
function reasonSchema(date?: { current: string | null }) {
  return z.object({ reason: z.string(), newApplyTo: z.string() }).superRefine((v, ctx) => {
    if (v.reason.trim().length < 3)
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'validation.too_short' });
    if (date && !(v.newApplyTo && (!date.current || v.newApplyTo > date.current)))
      ctx.addIssue({
        code: 'custom',
        path: ['newApplyTo'],
        message: v.newApplyTo ? 'project.deadline_not_later' : 'validation.required',
      });
  });
}
type ReasonFields = z.infer<ReturnType<typeof reasonSchema>>;

/**
 * Asks for the reason of a lifecycle move (and, for the deadline extension, the new end date)
 * before it is sent; the caller sends it and hands back its pending state and refusal.
 */
export function ReasonDialog({
  title,
  confirm,
  danger = false,
  date,
  pending,
  error,
  errorDetails,
  onConfirm,
  onClose,
}: {
  title: string;
  confirm: string;
  danger?: boolean;
  /** The current end date, when the move asks for a later one. */
  date?: { current: string | null };
  pending: boolean;
  error: unknown;
  /** What the error names beyond its message (the projects of a merge conflict). */
  errorDetails?: ReactNode;
  onConfirm: (input: { reason: string; newApplyTo?: string }) => void;
  onClose: () => void;
}) {
  const t = useTranslations('admin.projects.lifecycle');
  const tc = useTranslations('common.action');
  const current = date?.current;
  const asksDate = Boolean(date);
  const schema = useMemo(
    () => reasonSchema(asksDate ? { current: current ?? null } : undefined),
    [asksDate, current],
  );
  const form = useForm<ReasonFields>({
    resolver: useSchemaResolver(schema),
    defaultValues: { reason: '', newApplyTo: '' },
    reValidateMode: 'onSubmit',
  });
  const ready = schema.safeParse(useWatch({ control: form.control })).success;
  const failure = error instanceof ApiFailure ? error : undefined;

  // Enter in the date field submits too; a move already on its way is not sent twice
  const send = ({ reason, newApplyTo }: ReasonFields) => {
    if (pending) return;
    onConfirm({ reason: reason.trim(), ...(newApplyTo ? { newApplyTo } : {}) });
  };

  return (
    <Dialog
      title={title}
      size="small"
      open
      onClose={onClose}
      dismissible={!pending}
      actions={
        <DialogActions
          cancelLabel={tc('cancel')}
          onCancel={onClose}
          submitLabel={confirm}
          onSubmit={() => void form.handleSubmit(send)()}
          pending={pending}
          disabled={!ready}
          submitVariant={danger ? 'danger' : 'primary'}
        />
      }
    >
      <Form form={form} onSubmit={send} label={title} error={failure?.message}>
        {failure && errorDetails}
        {date && (
          <FormDateField
            name="newApplyTo"
            label={t('new_apply_to')}
            hint={date.current ? t('after', { date: formatDate(date.current) }) : undefined}
            required
            min={date.current ?? undefined}
          />
        )}
        <FormTextField
          name="reason"
          rows={4}
          label={t('reason')}
          hint={t('reason_hint')}
          required
          maxLength={1000}
        />
      </Form>
    </Dialog>
  );
}
