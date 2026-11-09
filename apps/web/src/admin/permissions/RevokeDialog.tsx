import { ConfirmDialog } from '@/ui';
import type { EffectivePermission } from '@css/shared/access';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import { api, ApiFailure } from '../../lib/api';

/** Ends a permission given in the panel, with a reason (POST /permission-grants/{id}/revoke). */
export function RevokeDialog({
  grant,
  onClose,
  onDone,
}: {
  grant: EffectivePermission | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations('admin.permissions');
  const end = useMutation({
    mutationFn: (reason: string) =>
      api<void>(`/permission-grants/${grant!.grantId}/revoke`, {
        method: 'POST',
        body: { reason: reason.trim() },
      }),
    onSuccess: () => {
      end.reset();
      onDone();
    },
  });
  const failure = end.error instanceof ApiFailure ? end.error : null;
  return (
    <ConfirmDialog
      open={grant !== null}
      title={t('end_title')}
      message={
        <>
          {t('end_body', { permission: grant?.permission ?? '' })}
          {failure && (
            <p className="admin-error">{failure.details[0]?.message ?? failure.message}</p>
          )}
        </>
      }
      tone="danger"
      reasonRequired
      reasonLabel={t('dialog.reason')}
      confirmLabel={t('end_confirm')}
      pending={end.isPending}
      onConfirm={(reason) => end.mutate(reason)}
      onCancel={() => {
        end.reset();
        onClose();
      }}
    />
  );
}
