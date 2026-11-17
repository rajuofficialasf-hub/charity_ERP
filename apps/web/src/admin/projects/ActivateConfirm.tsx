import { ConfirmDialog } from '@/ui';
import { useTranslations } from 'use-intl';

/**
 * The question before a project is activated, with what follows from it (docs/DECISION_LOG.md
 * D-182): once active, volunteers take applications in the window and the project's code,
 * program, year and workflow are fixed.
 */
export function ActivateConfirm({
  open,
  pending,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('admin.projects.lifecycle');
  return (
    <ConfirmDialog
      open={open}
      title={t('confirm_activate.title')}
      consequences={[t('confirm_activate.window'), t('confirm_activate.fixed')]}
      confirmLabel={t('action.activate')}
      pending={pending}
      onConfirm={() => onConfirm()}
      onCancel={onCancel}
    />
  );
}
