import { ConfirmDialog } from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import { api, ApiFailure } from '../../api/client';

/** A live panel override to end: a permission given in the panel, or one taken away there. */
export interface EndingOverride {
  id: string;
  /** The permission by name, as the list shows it. */
  label: string;
  effect: 'grant' | 'revoke';
}

/**
 * Ends a panel override with a reason (POST /permission-grants/{id}/revoke): a permission given in
 * the panel is withdrawn, and one taken away there is given back. A refusal of the server (the
 * hard rules) is said inside the dialog.
 */
export function RevokeDialog({
  override,
  onClose,
  onDone,
}: {
  override: EndingOverride | null;
  onClose: () => void;
  onDone: (effect: EndingOverride['effect']) => void;
}) {
  const t = useTranslations('admin.permissions');
  const ts = useTranslations('common.state.error');
  const end = useMutation({
    mutationFn: (reason: string) =>
      api<void>(`/permission-grants/${override!.id}/revoke`, {
        method: 'POST',
        body: { reason: reason.trim() },
      }),
    onSuccess: () => {
      const effect = override!.effect;
      end.reset();
      onDone(effect);
    },
  });
  const failure = !end.isError
    ? null
    : end.error instanceof ApiFailure
      ? (end.error.details[0]?.message ?? end.error.message)
      : ts('text');
  const lifting = override?.effect === 'revoke';
  return (
    <ConfirmDialog
      open={override !== null}
      title={lifting ? t('lift_title') : t('end_title')}
      message={
        <>
          {lifting
            ? t('lift_body', { permission: override?.label ?? '' })
            : t('end_body', { permission: override?.label ?? '' })}
          {failure && <p className="admin-error">{failure}</p>}
        </>
      }
      tone={lifting ? 'default' : 'danger'}
      reasonRequired
      reasonLabel={t('dialog.reason')}
      confirmLabel={lifting ? t('lift_confirm') : t('end_confirm')}
      pending={end.isPending}
      onConfirm={(reason) => end.mutate(reason)}
      onCancel={() => {
        end.reset();
        onClose();
      }}
    />
  );
}
