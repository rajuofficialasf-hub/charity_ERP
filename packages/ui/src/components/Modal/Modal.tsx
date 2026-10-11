'use client';

import { useId, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Dialog, Heading, Modal as AriaModal, ModalOverlay } from 'react-aria-components';
import { useUi } from '../../provider/UiProvider.js';
import { cx } from '../../utils/cx.js';
import { Button } from '../Button/Button.js';
import { TextArea } from '../Field/TextField.js';

export interface ModalProps {
  title: string;
  /** sm 400 px, md 560 px (default), lg 720 px; a bottom sheet on phones (DESIGN_SYSTEM 5.8). */
  size?: 'sm' | 'md' | 'lg';
  isOpen: boolean;
  onClose: () => void;
  /** Footer buttons; the primary action last. */
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  /** false while saving: Escape and the scrim no longer close the dialog. */
  dismissible?: boolean;
  /** Full screen on phones (long forms). */
  fullOnPhone?: boolean;
  children?: ReactNode;
  className?: string;
}

/** Modal dialog on the APG dialog pattern: focus trapped and returned, Escape closes. */
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
  const { messages } = useUi();
  return (
    <ModalOverlay
      className="ui-overlay"
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      isDismissable={dismissible}
      isKeyboardDismissDisabled={!dismissible}
    >
      <AriaModal
        className={cx('ui-dialog', `ui-dialog-${size}`, fullOnPhone && 'ui-dialog-full', className)}
      >
        <Dialog className="ui-dialog-frame">
          <span className="ui-sheet-handle" aria-hidden="true" />
          <header className="ui-dialog-head">
            <Heading slot="title" className="ui-dialog-title">
              {title}
            </Heading>
            <Button variant="ghost" icon={X} iconOnly onPress={onClose} disabled={!dismissible}>
              {messages.common.close}
            </Button>
          </header>
          <div className="ui-dialog-body">{children}</div>
          {(primaryAction || secondaryAction) && (
            <footer className="ui-dialog-foot">
              {secondaryAction}
              {primaryAction}
            </footer>
          )}
        </Dialog>
      </AriaModal>
    </ModalOverlay>
  );
}

export interface DrawerProps {
  title: string;
  /** right (default) or bottom; every drawer is a bottom sheet on phones (DESIGN_SYSTEM 5.9). */
  side?: 'right' | 'bottom';
  isOpen: boolean;
  onClose: () => void;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** Side panel over the page (filters, tablet detail, setup preview); blocks the page like a modal. */
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
  return (
    <ModalOverlay
      className="ui-overlay"
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      isDismissable
    >
      <AriaModal className={cx('ui-dialog', 'ui-drawer', `ui-drawer-${side}`, className)}>
        <Dialog className="ui-dialog-frame">
          {/* The drag handle is also a close button (DESIGN_SYSTEM 5.9). */}
          <button
            type="button"
            className="ui-sheet-handle-button"
            onClick={onClose}
            aria-label={messages.common.close}
          >
            <span className="ui-sheet-handle" aria-hidden="true" />
          </button>
          <header className="ui-dialog-head">
            <Heading slot="title" className="ui-dialog-title">
              {title}
            </Heading>
            <Button variant="ghost" icon={X} iconOnly onPress={onClose}>
              {messages.common.close}
            </Button>
          </header>
          <div className="ui-dialog-body">{children}</div>
          {footer && <footer className="ui-dialog-foot">{footer}</footer>}
        </Dialog>
      </AriaModal>
    </ModalOverlay>
  );
}

export interface ConfirmDialogProps {
  /** Names the record and what will happen, in plain words. */
  title: string;
  message?: ReactNode;
  tone?: 'default' | 'danger';
  /** Adds a required reason (reject, waitlist, blocklist, field unlock, deciding against the score). */
  reasonRequired?: boolean;
  reasonLabel?: string;
  /** A verb naming the action ("reject application"), never "OK". */
  confirmLabel: string;
  /** Effects listed before confirming, for example "the volunteer loses access to 12 applications". */
  consequence?: string[];
  isOpen: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  /** The action is running: confirm shows a spinner and the dialog cannot be dismissed. */
  pending?: boolean;
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
  const messageId = useId();
  const blocked = reasonRequired && reason.trim().length === 0;
  const close = () => {
    setReason('');
    onCancel();
  };
  return (
    <ModalOverlay
      className="ui-overlay"
      isOpen={isOpen}
      onOpenChange={(open) => !open && close()}
      isDismissable={!pending}
      isKeyboardDismissDisabled={pending}
    >
      <AriaModal
        className={cx('ui-dialog', 'ui-dialog-sm', 'ui-confirm', tone === 'danger' && 't-danger')}
      >
        <Dialog
          role="alertdialog"
          className="ui-dialog-frame"
          aria-describedby={message ? messageId : undefined}
        >
          <span className="ui-sheet-handle" aria-hidden="true" />
          <header className="ui-dialog-head">
            <Heading slot="title" className="ui-dialog-title">
              {title}
            </Heading>
          </header>
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
        </Dialog>
      </AriaModal>
    </ModalOverlay>
  );
}
