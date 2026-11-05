import { Alert, Button, Dialog, Text, TextField } from '@/ui';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import type { CommentReason } from './applications-api';

/** The texts a decision sends; each one only when the decision asks for it. */
export interface DecisionTexts {
  reason?: string;
  message?: string;
  comment?: string;
}

/**
 * Asks for a decision's texts before it is sent: the office's reason, kept in the record for the
 * officials; for a rejection the message written for the volunteer, which is all they read; and
 * the comment a decision against the score order or into a full quota asks for, which says why.
 */
export function DecisionDialog({
  title,
  confirm,
  withReason = true,
  withMessage = false,
  comments = [],
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
  /** Why the decision asks for a comment; none asks no comment. */
  comments?: readonly CommentReason[];
  danger?: boolean;
  pending: boolean;
  /** Why the last try failed, in the reader's words. */
  error: string | null;
  onConfirm: (input: DecisionTexts) => void;
  onClose: () => void;
}) {
  const t = useTranslations('applications.office.decision');
  const tc = useTranslations('common.action');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [comment, setComment] = useState('');
  const filled = (text: string) => text.trim().length >= 3;
  const ready =
    (!withReason || filled(reason)) &&
    (!withMessage || filled(message)) &&
    (!comments.length || filled(comment));
  return (
    <Dialog
      title={title}
      size="small"
      open
      onClose={onClose}
      dismissible={!pending}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {tc('cancel')}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() =>
              onConfirm({
                ...(withReason ? { reason: reason.trim() } : {}),
                ...(withMessage ? { message: message.trim() } : {}),
                ...(comments.length ? { comment: comment.trim() } : {}),
              })
            }
            disabled={!ready}
            loading={pending}
          >
            {confirm}
          </Button>
        </>
      }
    >
      {withReason ? (
        <TextField
          rows={4}
          label={t('reason')}
          hint={t('reason_help')}
          value={reason}
          onChange={setReason}
          required
          name="reason"
        />
      ) : null}
      {withMessage ? (
        <>
          <TextField
            rows={4}
            label={t('message')}
            hint={t('message_help')}
            value={message}
            onChange={setMessage}
            required
            name="message"
          />
          <Text tone="muted">{t('who_reads')}</Text>
        </>
      ) : null}
      {comments.length ? (
        <>
          <Alert tone="warning">
            {comments.map((why) => (
              <Text key={why}>{t(`why.${why}`)}</Text>
            ))}
          </Alert>
          <TextField
            rows={4}
            label={t('comment')}
            hint={t('comment_help')}
            value={comment}
            onChange={setComment}
            required
            name="comment"
          />
        </>
      ) : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
    </Dialog>
  );
}
