import { formatDate } from '@css/shared/format';
import { Alert, Button, DateField, Modal, TextArea } from '@css/ui';
import { type ReactNode, useState } from 'react';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../lib/api';

/**
 * Asks for the reason of a lifecycle move (and, for the deadline extension, the new end date)
 * before it is sent; a reason has at least 3 characters, as the server requires.
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
  const [reason, setReason] = useState('');
  const [newApplyTo, setNewApplyTo] = useState<string | null>(null);
  const later = !date || (newApplyTo !== null && (!date.current || newApplyTo > date.current));
  const ready = reason.trim().length >= 3 && later;
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
            onConfirm({ reason: reason.trim(), ...(newApplyTo ? { newApplyTo } : {}) })
          }
          disabled={!ready}
          loading={pending}
        >
          {confirm}
        </Button>
      }
    >
      {error instanceof ApiFailure && (
        <Alert tone="danger" live="alert">
          {error.message}
          {errorDetails}
        </Alert>
      )}
      {date && (
        <DateField
          label={t('new_apply_to')}
          helper={date.current ? t('after', { date: formatDate(date.current) }) : undefined}
          required
          min={date.current ?? undefined}
          value={newApplyTo}
          onChange={setNewApplyTo}
        />
      )}
      <TextArea
        label={t('reason')}
        helper={t('reason_hint')}
        required
        maxLength={1000}
        value={reason}
        onChange={setReason}
      />
    </Modal>
  );
}
