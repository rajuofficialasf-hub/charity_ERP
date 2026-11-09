import { Button } from '@/ui';
import { useTranslations } from 'use-intl';

/**
 * The foot of a dialog that does one thing: cancel, then the action the page names. Cancel waits
 * while the action runs, so a dialog that cannot close then cannot be left either.
 */
export function DialogButtons({
  onCancel,
  onConfirm,
  confirmLabel,
  disabled = false,
  pending = false,
  danger = false,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  /** The action may not run yet, for example while a required answer is empty. */
  disabled?: boolean;
  pending?: boolean;
  danger?: boolean;
}) {
  const tc = useTranslations('common');
  return (
    <>
      <Button variant="secondary" onClick={onCancel} disabled={pending}>
        {tc('action.cancel')}
      </Button>
      <Button
        variant={danger ? 'danger' : 'primary'}
        onClick={onConfirm}
        disabled={disabled}
        loading={pending}
      >
        {confirmLabel}
      </Button>
    </>
  );
}
