import { PERMISSION_SETS, type PermissionSet, permissionSetAllowed } from '@css/shared/projects';
import { Alert, Button, Modal, Select, Switch } from '@css/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../../lib/api';
import { type Assignment, changeAssignment } from './project-volunteers-api';

/**
 * Changes one assignment's permission set (only the sets meant for the volunteer's type are
 * offered) and, for a caller who may, its paid flag.
 */
export function ChangeAssignmentDialog({
  assignment,
  markPaid,
  onClose,
  onDone,
}: {
  assignment: Assignment;
  markPaid: boolean;
  onClose: () => void;
  onDone: (changed: Assignment) => void;
}) {
  const t = useTranslations('admin.projects.volunteers');
  const td = useTranslations('admin.projects.volunteers.change_dialog');
  const tc = useTranslations('common.action');
  const [set, setSet] = useState<PermissionSet>(assignment.permissionSet);
  const [paid, setPaid] = useState(assignment.isPaid);
  const save = useMutation({
    mutationFn: () =>
      changeAssignment(assignment.id, {
        ...(set !== assignment.permissionSet ? { permissionSet: set } : {}),
        ...(paid !== assignment.isPaid ? { isPaid: paid } : {}),
      }),
    onSuccess: onDone,
  });
  const changed = set !== assignment.permissionSet || paid !== assignment.isPaid;
  return (
    <Modal
      title={td('title')}
      size="sm"
      isOpen
      onClose={onClose}
      dismissible={!save.isPending}
      secondaryAction={
        <Button variant="secondary" onPress={onClose} disabled={save.isPending}>
          {tc('cancel')}
        </Button>
      }
      primaryAction={
        <Button onPress={() => save.mutate()} disabled={!changed} loading={save.isPending}>
          {tc('save')}
        </Button>
      }
    >
      {save.error instanceof ApiFailure && (
        <Alert tone="danger" live="alert">
          {save.error.details[0]?.message ?? save.error.message}
        </Alert>
      )}
      <p>{assignment.displayName}</p>
      <Select
        label={t('column.set')}
        value={set}
        onChange={(value) => {
          const next = PERMISSION_SETS.find((s) => s === value);
          if (next) setSet(next);
        }}
        searchable={false}
        options={PERMISSION_SETS.filter((s) => permissionSetAllowed(s, assignment.type)).map(
          (s) => ({ id: s, label: t(`set.${s}`) }),
        )}
      />
      {markPaid && (
        <Switch isSelected={paid} onChange={setPaid}>
          {td('paid')}
        </Switch>
      )}
    </Modal>
  );
}
