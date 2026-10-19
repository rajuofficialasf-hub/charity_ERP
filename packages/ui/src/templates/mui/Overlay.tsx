import MuiDialog from '@mui/material/Dialog';
import MuiDrawer from '@mui/material/Drawer';
import useMediaQuery from '@mui/material/useMediaQuery';
import { X } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { Button } from '../../components/Button/Button.js';
import { TextArea } from '../../components/Field/TextField.js';
import type { ConfirmDialogProps, DrawerProps, ModalProps } from '../../contract.js';
import { useUi } from '../../provider/UiProvider.js';
import { cx } from '../../utils/cx.js';

/** The width below which every dialog and drawer is a bottom sheet. */
const PHONE = '(max-width: 639.95px)';

/** The title row of a dialog, with the close button when the dialog has one. */
function DialogHead({
  titleId,
  title,
  onClose,
  closeDisabled,
}: {
  titleId: string;
  title: string;
  onClose?: () => void;
  closeDisabled?: boolean;
}) {
  const { messages } = useUi();
  return (
    <header className="ui-dialog-head">
      <h2 id={titleId} className="ui-dialog-title">
        {title}
      </h2>
      {onClose && (
        <Button variant="ghost" icon={X} iconOnly onPress={onClose} disabled={closeDisabled}>
          {messages.common.close}
        </Button>
      )}
    </header>
  );
}

/**
 * Modal dialog on MUI's dialog (the APG dialog pattern): focus trapped and returned, Escape and the
 * scrim close it unless it is saving; a bottom sheet on phones.
 */
export function Modal({
  title,
  size = 'md',
  isOpen,
  onClose,
  primaryAction,
  secondaryAction,
  dismissible = true,
  fullOnPhone = false,
  children,
  className,
}: ModalProps) {
  const titleId = useId();
  return (
    <MuiDialog
      open={isOpen}
      onClose={() => dismissible && onClose()}
      aria-labelledby={titleId}
      maxWidth={false}
      className="ui-overlay"
      slotProps={{
        paper: {
          className: cx(
            'ui-dialog',
            `ui-dialog-${size}`,
            fullOnPhone && 'ui-dialog-full',
            className,
          ),
        },
      }}
    >
      <span className="ui-sheet-handle" aria-hidden="true" />
      <DialogHead titleId={titleId} title={title} onClose={onClose} closeDisabled={!dismissible} />
      <div className="ui-dialog-body">{children}</div>
      {(primaryAction || secondaryAction) && (
        <footer className="ui-dialog-foot">
          {secondaryAction}
          {primaryAction}
        </footer>
      )}
    </MuiDialog>
  );
}

/**
 * Side panel over the page (filters, tablet detail, setup preview) on MUI's drawer; it blocks the
 * page like a modal and is a bottom sheet on phones, whose drag handle also closes it.
 */
export function Drawer({
  title,
  side = 'right',
  isOpen,
  onClose,
  footer,
  children,
  className,
}: DrawerProps) {
  const { messages } = useUi();
  const titleId = useId();
  const phone = useMediaQuery(PHONE);
  const anchor = phone ? 'bottom' : side;
  return (
    <MuiDrawer
      anchor={anchor}
      open={isOpen}
      onClose={() => onClose()}
      className="ui-overlay"
      slotProps={{
        paper: {
          className: cx('ui-dialog', 'ui-drawer', `ui-drawer-${anchor}`, className),
          role: 'dialog',
          'aria-modal': true,
          'aria-labelledby': titleId,
        },
      }}
    >
      <button
        type="button"
        className="ui-sheet-handle-button"
        onClick={onClose}
        aria-label={messages.common.close}
      >
        <span className="ui-sheet-handle" aria-hidden="true" />
      </button>
      <DialogHead titleId={titleId} title={title} onClose={onClose} />
      <div className="ui-dialog-body">{children}</div>
      {footer && <footer className="ui-dialog-foot">{footer}</footer>}
    </MuiDrawer>
  );
}

/**
 * Confirmation for irreversible or significant actions (DESIGN_SYSTEM 5.10): role alertdialog,
 * confirm disabled until a required reason is entered, focus starts on cancel for danger.
 */
export function ConfirmDialog({
  title,
  message,
  tone = 'default',
  reasonRequired = false,
  reasonLabel,
  confirmLabel,
  consequence,
  isOpen,
  onConfirm,
  onCancel,
  pending = false,
}: ConfirmDialogProps) {
  const { messages } = useUi();
  const [reason, setReason] = useState('');
  const titleId = useId();
  const messageId = useId();
  const blocked = reasonRequired && reason.trim().length === 0;
  const close = () => {
    setReason('');
    onCancel();
  };
  let body: ReactNode = null;
  if (message || (consequence && consequence.length > 0) || reasonRequired)
    body = (
      <div className="ui-dialog-body">
        {message && (
          <div id={messageId} className="ui-confirm-message">
            {message}
          </div>
        )}
        {consequence && consequence.length > 0 && (
          <ul className="ui-confirm-consequence">
            {consequence.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        {reasonRequired && (
          <TextArea
            label={reasonLabel ?? messages.field.reason}
            required
            value={reason}
            onChange={setReason}
            disabled={pending}
            className="ui-confirm-reason"
          />
        )}
      </div>
    );
  return (
    <MuiDialog
      open={isOpen}
      role="alertdialog"
      onClose={() => !pending && close()}
      aria-labelledby={titleId}
      aria-describedby={message ? messageId : undefined}
      maxWidth={false}
      className="ui-overlay"
      slotProps={{
        paper: {
          className: cx('ui-dialog', 'ui-dialog-sm', 'ui-confirm', tone === 'danger' && 't-danger'),
        },
      }}
    >
      <span className="ui-sheet-handle" aria-hidden="true" />
      <DialogHead titleId={titleId} title={title} />
      {body}
      <footer className="ui-dialog-foot">
        <Button
          variant="secondary"
          onPress={close}
          disabled={pending}
          autoFocus={tone === 'danger'}
        >
          {messages.common.cancel}
        </Button>
        <Button
          variant={tone === 'danger' ? 'danger' : 'primary'}
          onPress={() => onConfirm(reason.trim())}
          disabled={blocked}
          loading={pending}
        >
          {confirmLabel}
        </Button>
      </footer>
    </MuiDialog>
  );
}
