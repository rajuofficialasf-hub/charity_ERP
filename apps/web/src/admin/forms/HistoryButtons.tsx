import { IconButton } from '@/ui';
import { useEffect, useEffectEvent } from 'react';
import { useTranslations } from 'use-intl';

/** The inputs that hold no text, so they have no undo of their own. */
const NOT_TEXT = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

/**
 * Whether the key stays with what holds the focus: a text field undoes its own typing, and an
 * open dialog works on a copy of its own until it is closed.
 */
function keepsItsKeys(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLTextAreaElement || target.isContentEditable) return true;
  if (target instanceof HTMLInputElement) return !NOT_TEXT.has(target.type);
  return target.closest('[role="dialog"], [role="alertdialog"]') !== null;
}

/**
 * The undo and redo of the builder's draft: two buttons in the form head, and Ctrl+Z, Ctrl+Y and
 * Ctrl+Shift+Z (Cmd on a Mac) wherever the focus is not in a text field.
 */
export function HistoryButtons({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const t = useTranslations('forms.builder');
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || !(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    const redo = key === 'y' || (key === 'z' && event.shiftKey);
    if ((!redo && key !== 'z') || keepsItsKeys(event.target)) return;
    // the browser's own undo would reach into the text field typed in last
    event.preventDefault();
    if (redo) onRedo();
    else onUndo();
  });
  useEffect(() => {
    const listen = (event: KeyboardEvent) => onKey(event);
    document.addEventListener('keydown', listen);
    return () => document.removeEventListener('keydown', listen);
  }, []);
  return (
    <span className="fb-history">
      <IconButton label={t('undo')} icon="undo" size="small" disabled={!canUndo} onClick={onUndo} />
      {/* the set has no redo arrow of its own: the undo arrow, turned to the right */}
      <span className="fb-history-redo">
        <IconButton
          label={t('redo')}
          icon="undo"
          size="small"
          disabled={!canRedo}
          onClick={onRedo}
        />
      </span>
    </span>
  );
}
