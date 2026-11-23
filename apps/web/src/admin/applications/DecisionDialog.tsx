import { Alert, Dialog, Form, FormTextField, Text } from '@/ui';
import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { useSchemaResolver } from '../../lib/form-schema';
import type { CommentReason, OfficeApplication } from './applications-api';
import { DialogActions } from '../DialogActions';

/** The texts a decision sends; each one only when the decision asks for it. */
export interface DecisionTexts {
  reason?: string;
  message?: string;
  comment?: string;
}

/** Each text the decision asks for has three letters at least, in the server's words. */
function decisionSchema(asks: { reason: boolean; message: boolean; comment: boolean }) {
  const texts = { reason: z.string(), message: z.string(), comment: z.string() };
  return z.object(texts).superRefine((v, ctx) => {
    const short = (text: string) => text.trim().length < 3;
    if (asks.reason && short(v.reason))
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'workflow.reason_required' });
    if (asks.message && short(v.message))
      ctx.addIssue({ code: 'custom', path: ['message'], message: 'workflow.message_required' });
    if (asks.comment && short(v.comment))
      ctx.addIssue({ code: 'custom', path: ['comment'], message: 'workflow.comment_required' });
  });
}
type DecisionFields = z.infer<ReturnType<typeof decisionSchema>>;

/**
 * Asks for a decision's texts before it is sent: the office's reason, kept in the record for the
 * officials; for a rejection the message written for the volunteer, which is all they read; and
 * the comment a decision against the score order, into a full quota or for a person who appears
 * again in a project that holds the repeat asks for, which says why. An approval that writes a
 * known person's new mobile to the profile says so first, or that the number stays on the
 * application because another profile has it.
 */
export function DecisionDialog({
  title,
  confirm,
  withReason = true,
  withMessage = false,
  note,
  comments = [],
  mobileChange = null,
  danger = false,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  confirm: string;
  /** The office's reason; an approval has none. */
  withReason?: boolean;
  /** A rejection needs the volunteer's message beside the office's reason. */
  withMessage?: boolean;
  /** What follows from the decision, said before it is confirmed. */
  note?: string;
  /** Why the decision asks for a comment; none asks no comment. */
  comments?: readonly CommentReason[];
  /** The mobile an approval writes to the known person's profile, told before it is sent. */
  mobileChange?: OfficeApplication['profileMobileChange'];
  danger?: boolean;
  pending: boolean;
  /** Why the last try failed, in the reader's words. */
  error: string | null;
  onConfirm: (input: DecisionTexts) => void;
  onClose: () => void;
}) {
  const t = useTranslations('applications.office.decision');
  const tc = useTranslations('common.action');
  const withComment = comments.length > 0;
  const schema = useMemo(
    () => decisionSchema({ reason: withReason, message: withMessage, comment: withComment }),
    [withReason, withMessage, withComment],
  );
  const form = useForm<DecisionFields>({
    resolver: useSchemaResolver(schema),
    defaultValues: { reason: '', message: '', comment: '' },
    reValidateMode: 'onSubmit',
  });
  const ready = schema.safeParse(useWatch({ control: form.control })).success;

  const send = (v: DecisionFields) =>
    onConfirm({
      ...(withReason ? { reason: v.reason.trim() } : {}),
      ...(withMessage ? { message: v.message.trim() } : {}),
      ...(withComment ? { comment: v.comment.trim() } : {}),
    });

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
      <Form form={form} onSubmit={send} label={title} error={error ?? undefined}>
        {note ? <Text>{note}</Text> : null}
        {mobileChange ? (
          mobileChange.heldByOther ? (
            <Alert tone="warning">{t('mobile_held', { to: mobileChange.to })}</Alert>
          ) : (
            <Alert tone="info">
              {mobileChange.from
                ? t('mobile_change', { from: mobileChange.from, to: mobileChange.to })
                : t('mobile_new', { to: mobileChange.to })}
            </Alert>
          )
        ) : null}
        {withReason ? (
          <FormTextField
            name="reason"
            rows={4}
            label={t('reason')}
            hint={t('reason_help')}
            required
          />
        ) : null}
        {withMessage ? (
          <>
            <FormTextField
              name="message"
              rows={4}
              label={t('message')}
              hint={t('message_help')}
              required
            />
            <Text tone="muted">{t('who_reads')}</Text>
          </>
        ) : null}
        {withComment ? (
          <>
            <Alert tone="warning">
              {comments.map((why) => (
                <Text key={why}>{t(`why.${why}`)}</Text>
              ))}
            </Alert>
            <FormTextField
              name="comment"
              rows={4}
              label={t('comment')}
              hint={t('comment_help')}
              required
            />
          </>
        ) : null}
      </Form>
    </Dialog>
  );
}
