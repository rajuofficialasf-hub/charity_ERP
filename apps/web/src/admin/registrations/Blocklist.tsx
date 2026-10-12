import { Button, ConfirmDialog } from '@css/ui';
import { useMutation } from '@tanstack/react-query';
import { Ban, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../lib/api';
import { block, unblock } from './registrations-api';

/**
 * Puts a volunteer on the blocklist or lifts the block, each with a mandatory reason (BD-06,
 * BR-047; POST /volunteers/{id}/block and /unblock). The reason stays in the audit log only.
 */
export function BlocklistAction({
  volunteerId,
  name,
  blocked,
  onDone,
}: {
  volunteerId: string;
  name: string;
  blocked: boolean;
  onDone: (message: string) => void;
}) {
  const t = useTranslations('admin.registrations');
  const [open, setOpen] = useState(false);
  const change = useMutation({
    mutationFn: (reason: string) => (blocked ? unblock : block)(volunteerId, reason.trim()),
    onSuccess: () => {
      setOpen(false);
      change.reset();
      onDone(blocked ? t('unblocked') : t('blocked'));
    },
  });
  const failure = change.error instanceof ApiFailure ? change.error : null;
  return (
    <>
      <Button variant="secondary" icon={blocked ? Undo2 : Ban} onPress={() => setOpen(true)}>
        {blocked ? t('unblock') : t('block')}
      </Button>
      <ConfirmDialog
        isOpen={open}
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
          setOpen(false);
        }}
      />
    </>
  );
}
