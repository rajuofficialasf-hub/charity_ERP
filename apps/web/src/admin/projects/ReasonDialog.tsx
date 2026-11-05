import { formatDate } from '@css/shared/format';
import { Alert, Button, DateField, Dialog, TextField } from '@/ui';
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
              onConfirm({ reason: reason.trim(), ...(newApplyTo ? { newApplyTo } : {}) })
            }
            disabled={!ready}
            loading={pending}
          >
            {confirm}
          </Button>
        </>
      }
    >
      {error instanceof ApiFailure && (
        <Alert tone="error">
          {error.message}
          {errorDetails}
        </Alert>
      )}
      {date && (
        <DateField
          label={t('new_apply_to')}
          hint={date.current ? t('after', { date: formatDate(date.current) }) : undefined}
          required
          min={date.current ?? undefined}
          value={newApplyTo ?? ''}
          onChange={(v) => setNewApplyTo(v || null)}
        />
      )}
      <TextField
        rows={4}
        label={t('reason')}
        hint={t('reason_hint')}
        required
        maxLength={1000}
        value={reason}
        onChange={setReason}
      />
    </Dialog>
  );
}
