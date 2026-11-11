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

/** Whether the key stays with what holds the focus: a text field undoes its own typing. */
function keepsItsKeys(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLTextAreaElement || target.isContentEditable) return true;
  return target instanceof HTMLInputElement && !NOT_TEXT.has(target.type);
}

/**
 * Whether a dialog is open over the page: what it shows is the draft of that moment, so the draft
 * does not change under it, wherever the focus is (a click on the dialog's own text leaves it on
 * the page's body).
 */
const dialogOpen = () => document.querySelector('[aria-modal="true"]') !== null;

/**
 * The undo and redo of the builder's draft: two buttons in the form head, and Ctrl+Z, Ctrl+Y and
 * Ctrl+Shift+Z (Cmd on a Mac) wherever the focus is not in a text field. The keys rest while a
 * dialog is open and while a question is being dragged (`resting`).
 */
export function HistoryButtons({
  canUndo,
  canRedo,
  resting = false,
  onUndo,
  onRedo,
}: {
  canUndo: boolean;
  canRedo: boolean;
  /** The keys do nothing for now: a question is on its way to another place. */
  resting?: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const t = useTranslations('forms.builder');
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || !(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    const redo = key === 'y' || (key === 'z' && event.shiftKey);
    if (!redo && key !== 'z') return;
    if (resting || dialogOpen() || keepsItsKeys(event.target)) return;
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
      <IconButton label={t('redo')} icon="redo" size="small" disabled={!canRedo} onClick={onRedo} />
    </span>
  );
}
