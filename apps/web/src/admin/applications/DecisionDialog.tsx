import { Alert, Button, Modal, Text, TextArea } from '@css/ui';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../lib/api';

/**
 * Asks for a decision's texts before it is sent: the office's reason, kept in the record for the
 * officials, and for a rejection the message written for the volunteer, which is all they read.
 */
export function DecisionDialog({
  title,
  confirm,
  withMessage = false,
  danger = false,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  confirm: string;
  /** A rejection needs the volunteer's message beside the office's reason. */
  withMessage?: boolean;
  danger?: boolean;
  pending: boolean;
  error: unknown;
  onConfirm: (input: { reason: string; message?: string }) => void;
  onClose: () => void;
}) {
  const t = useTranslations('applications.office.decision');
  const tc = useTranslations('common.action');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const ready = reason.trim().length >= 3 && (!withMessage || message.trim().length >= 3);
  return (
    <Modal
      title={title}
      size="sm"
      isOpen
      onClose={onClose}
      dismissible={!pending}
      secondaryAction={
        <Button variant="secondary" onPress={onClose} disabled={pending}>
          {tc('cancel')}
        </Button>
      }
      primaryAction={
        <Button
          variant={danger ? 'danger' : 'primary'}
          onPress={() =>
            onConfirm({
              reason: reason.trim(),
              ...(withMessage ? { message: message.trim() } : {}),
            })
          }
          disabled={!ready}
          loading={pending}
        >
          {confirm}
        </Button>
      }
    >
      <TextArea
        label={t('reason')}
        helper={t('reason_help')}
        value={reason}
        onChange={setReason}
        required
        name="reason"
      />
      {withMessage ? (
        <>
          <TextArea
            label={t('message')}
            helper={t('message_help')}
            value={message}
            onChange={setMessage}
            required
            name="message"
          />
          <Text tone="muted">{t('who_reads')}</Text>
        </>
      ) : null}
      {error ? (
        <Alert tone="danger">{error instanceof ApiFailure ? error.message : t('failed')}</Alert>
      ) : null}
    </Modal>
  );
}
