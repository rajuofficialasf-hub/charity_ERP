import { CORRECTION_FIELDS, type CorrectionField } from '@css/shared/registration';
import { Alert, Button, CheckboxGroup, Modal, TextArea } from '@css/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { FIELD_LABEL } from '../../features/account/profile-api';
import { ApiFailure } from '../../lib/api';
import { requestCorrections } from './registrations-api';

/**
 * Asks the registrant to correct the checked fields, with one note (BR-030; POST
 * /registrations/{userId}/correction-requests). Only the checked fields reopen for the registrant.
 */
export function CorrectionDialog({
  userId,
  isOpen,
  onClose,
  onDone,
}: {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations('admin.registrations');
  const tf = useTranslations('registration');
  const tc = useTranslations('common.action');
  const [fields, setFields] = useState<CorrectionField[]>([]);
  const [note, setNote] = useState('');
  const send = useMutation({
    mutationFn: () => requestCorrections(userId, fields, note.trim()),
    onSuccess: () => {
      reset();
      onDone();
    },
  });
  const reset = () => {
    setFields([]);
    setNote('');
    send.reset();
  };
  const close = () => {
    reset();
    onClose();
  };
  const failure = send.error instanceof ApiFailure ? send.error : null;
  const ready = fields.length > 0 && note.trim().length >= 3;
  return (
    <Modal
      title={t('correct')}
      isOpen={isOpen}
      onClose={close}
      dismissible={!send.isPending}
      secondaryAction={
        <Button variant="secondary" onPress={close} disabled={send.isPending}>
          {tc('cancel')}
        </Button>
      }
      primaryAction={
        <Button onPress={() => send.mutate()} disabled={!ready} loading={send.isPending}>
          {t('correct_send')}
        </Button>
      }
    >
      {failure && (
        <Alert tone="danger" live="alert">
          {failure.details[0]?.message ?? failure.message}
        </Alert>
      )}
      <CheckboxGroup
        label={t('correct_fields')}
        required
        columns={2}
        value={fields}
        onChange={(ids) => setFields(ids as CorrectionField[])}
        options={CORRECTION_FIELDS.map((f) => ({ id: f, label: tf(FIELD_LABEL[f]) }))}
      />
      <TextArea
        label={t('correct_note')}
        required
        maxLength={1000}
        value={note}
        onChange={setNote}
      />
    </Modal>
  );
}
