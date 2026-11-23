import { Button, type ButtonProps } from '@/ui';
import type { ReactNode } from 'react';

/**
 * The footer of an admin dialog: "cancel" and the dialog's own action. While the action runs, the
 * cancel waits and the action shows that it is busy; the dialogs give their own words for both.
 */
export function DialogActions({
  cancelLabel,
  onCancel,
  submitLabel,
  onSubmit,
  pending,
  disabled,
  submitVariant,
}: {
  cancelLabel: ReactNode;
  onCancel: () => void;
  submitLabel: ReactNode;
  onSubmit: () => void;
  pending: boolean;
  disabled?: boolean;
  submitVariant?: ButtonProps['variant'];
}) {
  return (
    <>
      <Button variant="secondary" onClick={onCancel} disabled={pending}>
        {cancelLabel}
      </Button>
      <Button
        {...(submitVariant ? { variant: submitVariant } : {})}
        onClick={onSubmit}
        disabled={disabled}
        loading={pending}
      >
        {submitLabel}
      </Button>
    </>
  );
}
