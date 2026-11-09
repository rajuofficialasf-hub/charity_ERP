import { Button, ConfirmDialog } from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../lib/api';
import { blockBeneficiary, unblockBeneficiary } from '../beneficiaries/beneficiaries-api';
import { block, unblock } from './registrations-api';

/** A volunteer or a beneficiary: the two subjects of the blocklist, each with its own route. */
type BlocklistSubject =
  | { volunteerId: string; beneficiaryId?: undefined }
  | { beneficiaryId: string; volunteerId?: undefined };

type BlocklistTarget = BlocklistSubject & {
  name: string;
  blocked: boolean;
  onDone: (message: string) => void;
};

/**
 * Puts a volunteer or a beneficiary on the blocklist or lifts the block, each with a mandatory
 * reason (POST /volunteers/{id}/block or /beneficiaries/{id}/block, and /unblock). The reason is
 * kept with the block for the officials who may read it.
 */
export function BlocklistAction({
  danger = false,
  ...target
}: BlocklistTarget & {
  /** A block shows in the danger colour (a profile's action panel); a lift never does. */
  danger?: boolean;
}) {
  const t = useTranslations('admin.registrations');
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant={danger && !target.blocked ? 'danger' : 'secondary'}
        startIcon={target.blocked ? 'undo' : 'block'}
        onClick={() => setOpen(true)}
      >
        {target.blocked ? t('unblock') : t('block')}
      </Button>
      <BlocklistDialog {...target} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** The confirmation of a block or its lift, with the reason; opened from a button or a menu. */
export function BlocklistDialog({
  open,
  onClose,
  ...target
}: BlocklistTarget & { open: boolean; onClose: () => void }) {
  const t = useTranslations('admin.registrations');
  const tb = useTranslations('admin.beneficiaries.block');
  const { name, blocked, onDone } = target;
  const send = (reason: string) =>
    target.beneficiaryId !== undefined
      ? (blocked ? unblockBeneficiary : blockBeneficiary)(target.beneficiaryId, reason)
      : (blocked ? unblock : block)(target.volunteerId, reason);
  const beneficiary = target.beneficiaryId !== undefined;
  const change = useMutation({
    mutationFn: (reason: string) => send(reason.trim()),
    onSuccess: () => {
      onClose();
      change.reset();
      onDone(blocked ? t('unblocked') : beneficiary ? tb('done') : t('blocked'));
    },
  });
  const failure = change.error instanceof ApiFailure ? change.error : null;
  return (
    <ConfirmDialog
      open={open}
      title={blocked ? t('unblock_title', { name }) : t('block_title', { name })}
      message={
        failure && <p className="admin-error">{failure.details[0]?.message ?? failure.message}</p>
      }
      consequences={
        blocked ? undefined : [beneficiary ? tb('consequence') : t('block_consequence')]
      }
      tone={blocked ? 'default' : 'danger'}
      reasonRequired
      reasonLabel={t('reason')}
      confirmLabel={blocked ? t('unblock_confirm') : t('block_confirm')}
      pending={change.isPending}
      onConfirm={(reason) => change.mutate(reason)}
      onCancel={() => {
        change.reset();
        onClose();
      }}
    />
  );
}
