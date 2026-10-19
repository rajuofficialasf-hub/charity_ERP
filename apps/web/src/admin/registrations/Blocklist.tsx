import { Button, ConfirmDialog } from '@css/ui';
import { useMutation } from '@tanstack/react-query';
import { Ban, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../lib/api';
import { block, unblock } from './registrations-api';

interface BlocklistTarget {
  volunteerId: string;
  name: string;
  blocked: boolean;
  onDone: (message: string) => void;
}

/**
 * Puts a volunteer on the blocklist or lifts the block, each with a mandatory reason (BD-06,
 * BR-047; POST /volunteers/{id}/block and /unblock). The reason stays in the audit log only.
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
        icon={target.blocked ? Undo2 : Ban}
        onPress={() => setOpen(true)}
      >
        {target.blocked ? t('unblock') : t('block')}
      </Button>
      <BlocklistDialog {...target} isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** The confirmation of a block or its lift, with the reason; opened from a button or a menu. */
export function BlocklistDialog({
  volunteerId,
  name,
  blocked,
  onDone,
  isOpen,
  onClose,
}: BlocklistTarget & { isOpen: boolean; onClose: () => void }) {
  const t = useTranslations('admin.registrations');
  const change = useMutation({
    mutationFn: (reason: string) => (blocked ? unblock : block)(volunteerId, reason.trim()),
    onSuccess: () => {
      onClose();
      change.reset();
      onDone(blocked ? t('unblocked') : t('blocked'));
    },
  });
  const failure = change.error instanceof ApiFailure ? change.error : null;
  return (
    <ConfirmDialog
      isOpen={isOpen}
      title={blocked ? t('unblock_title', { name }) : t('block_title', { name })}
      message={
        failure && <p className="admin-error">{failure.details[0]?.message ?? failure.message}</p>
      }
      consequence={blocked ? undefined : [t('block_consequence')]}
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
