import type { Locale } from '@css/shared/i18n';
import { Alert, Button, Modal, RadioGroup, Select, TextArea } from '@css/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { ApiFailure } from '../../lib/api';
import { decideStaff, roles } from './registrations-api';

type Decision = 'approve' | 'reject';
/** The Main Admin's role is never given through a registration (BR-028, D-080). */
const NOT_GIVEN = 'department_head';

/**
 * The Department Head or the Monitoring Team approves an official's registration with the role
 * it gets, or rejects it with a reason (BR-028; POST /staff-registrations/{userId}/decision).
 */
export function StaffDecisionDialog({
  userId,
  name,
  isOpen,
  onClose,
  onDone,
}: {
  userId: string;
  name: string;
  isOpen: boolean;
  onClose: () => void;
  onDone: (decision: Decision) => void;
}) {
  const t = useTranslations('admin.registrations');
  const tc = useTranslations('common.action');
  const locale = useLocale() as Locale;
  const [decision, setDecision] = useState<Decision>('approve');
  const [roleKey, setRoleKey] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const catalogue = useQuery({ queryKey: ['admin', 'roles'], queryFn: roles, enabled: isOpen });
  const save = useMutation({
    mutationFn: () =>
      decideStaff(
        userId,
        decision === 'approve'
          ? { decision, roleKey: roleKey! }
          : { decision, reason: reason.trim() },
      ),
    onSuccess: () => {
      const done = decision;
      reset();
      onDone(done);
    },
  });
  const reset = () => {
    setDecision('approve');
    setRoleKey(null);
    setReason('');
    save.reset();
  };
  const close = () => {
    reset();
    onClose();
  };
  const failure = save.error ?? catalogue.error;
  const ready = decision === 'approve' ? roleKey !== null : reason.trim().length >= 3;
  const options = (catalogue.data ?? [])
    .filter((r) => r.kind === 'official' && r.key !== NOT_GIVEN)
    .map((r) => ({ id: r.key, label: r.name[locale] }));
  return (
    <Modal
      title={t('staff.title', { name })}
      isOpen={isOpen}
      onClose={close}
      dismissible={!save.isPending}
      secondaryAction={
        <Button variant="secondary" onPress={close} disabled={save.isPending}>
          {tc('cancel')}
        </Button>
      }
      primaryAction={
        <Button onPress={() => save.mutate()} disabled={!ready} loading={save.isPending}>
          {t('staff.submit')}
        </Button>
      }
    >
      {failure instanceof ApiFailure && (
        <Alert tone="danger" live="alert">
          {failure.details[0]?.message ?? failure.message}
        </Alert>
      )}
      <RadioGroup
        label={t('staff.decision')}
        orientation="horizontal"
        value={decision}
        onChange={(id) => setDecision(id as Decision)}
        options={[
          { id: 'approve', label: t('staff.approve') },
          { id: 'reject', label: t('staff.reject') },
        ]}
      />
      {decision === 'approve' ? (
        <Select
          label={t('staff.role')}
          required
          value={roleKey}
          onChange={setRoleKey}
          options={options}
          searchable={false}
        />
      ) : (
        <TextArea
          label={t('reason')}
          helper={t('staff.reason_hint')}
          required
          maxLength={1000}
          value={reason}
          onChange={setReason}
        />
      )}
    </Modal>
  );
}
