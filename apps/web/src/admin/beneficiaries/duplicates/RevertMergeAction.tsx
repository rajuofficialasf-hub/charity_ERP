import { Button } from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { ReasonDialog } from '../../projects/ReasonDialog';
import { revertMerge } from './merge-api';

/**
 * Reverts a merge in force from a profile's merge history, with a reason: exactly what moved goes
 * back. Shown only when the profile's action flag allows it; the server checks again.
 */
export function RevertMergeAction({
  mergeId,
  benNo,
  onDone,
}: {
  mergeId: string;
  /** The other profile of the merge, as the history row names it. */
  benNo: string;
  onDone: (message: string) => void;
}) {
  const t = useTranslations('admin.beneficiaries.merge');
  const [open, setOpen] = useState(false);
  const revert = useMutation({
    mutationFn: (reason: string) => revertMerge(mergeId, reason),
    onSuccess: () => {
      setOpen(false);
      onDone(t('reverted'));
    },
  });
  return (
    <>
      <Button
        variant="secondary"
        size="small"
        startIcon="undo"
        onClick={() => {
          revert.reset();
          setOpen(true);
        }}
      >
        {t('revert')}
      </Button>
      {open && (
        <ReasonDialog
          title={t('revert_title', { benNo })}
          confirm={t('revert')}
          danger
          pending={revert.isPending}
          error={revert.error}
          onConfirm={({ reason }) => revert.mutate(reason)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
