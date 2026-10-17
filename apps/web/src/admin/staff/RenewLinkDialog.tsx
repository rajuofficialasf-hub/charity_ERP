import type { InvitationIssued } from '@css/shared/auth';
import { Alert, Button, Modal, TextField } from '@css/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../lib/api';
import { renewLink, type StaffMember } from './staff-api';

/**
 * A new set-password link for an official who has not set a password yet (BR-262): the open link
 * stops working. A corrected email, when the first one was mistyped, goes with it.
 */
export function RenewLinkDialog({
  official,
  onClose,
  onDone,
}: {
  official: StaffMember;
  onClose: () => void;
  onDone: (issued: InvitationIssued) => void;
}) {
  const t = useTranslations('admin.staff.renew');
  const tc = useTranslations('common.action');
  const [email, setEmail] = useState('');
  const save = useMutation({
    mutationFn: () => renewLink(official.id, email.trim().toLowerCase() || undefined),
    onSuccess: onDone,
  });
  const failure = save.error instanceof ApiFailure ? save.error : undefined;
  return (
    <Modal
      title={t('title', { name: official.displayName })}
      isOpen
      onClose={onClose}
      dismissible={!save.isPending}
      secondaryAction={
        <Button variant="secondary" onPress={onClose} disabled={save.isPending}>
          {tc('cancel')}
        </Button>
      }
      primaryAction={
        <Button onPress={() => save.mutate()} loading={save.isPending}>
          {t('submit')}
        </Button>
      }
    >
      {save.error && (
        <Alert tone="danger" live="alert">
          {failure ? (failure.details[0]?.message ?? failure.message) : t('offline')}
        </Alert>
      )}
      <p className="m-0">{t('explain')}</p>
      <TextField
        label={t('email')}
        helper={t('email_hint')}
        type="email"
        maxLength={254}
        lang="en"
        value={email}
        onChange={setEmail}
      />
    </Modal>
  );
}
