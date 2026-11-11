import type { FormDefinition } from '@css/shared/forms';
import { useState } from 'react';
import type { Selection } from './selection';

/** How many steps back the builder remembers. */
export const HISTORY_LIMIT = 100;
/** Changes closer together than this, with the same part chosen, are one step (typing). */
export const MERGE_WINDOW_MS = 1000;

/** The draft at one moment, with the part of the form that was chosen then. */
export interface HistoryStep {
  definition: FormDefinition;
  selection: Selection | null;
}

interface Stacks {
  /** The drafts an undo leads back to, the latest last. */
  past: HistoryStep[];
  /** The drafts a redo leads on to, the next one last. */
  future: HistoryStep[];
  /** When the last change was made and what was chosen then; none after an undo or a redo. */
  last: { at: number; selection: Selection | null } | null;
}

const EMPTY: Stacks = { past: [], future: [], last: null };

const sameSelection = (a: Selection | null, b: Selection | null) =>
  a?.section === b?.section && a?.field === b?.field;

const pushed = (steps: HistoryStep[], step: HistoryStep) => [...steps, step].slice(-HISTORY_LIMIT);

/**
 * The undo and redo of the builder's draft. The draft on screen stays the page's own: each call
 * hands in the draft and the selection as they are at that moment, and an undo or a redo hands
 * back the ones to show, which the page sets and saves like any other change. So the saved draft
 * the server sends back takes the place of the one on screen without a step. Changes made within
 * a second of each other with the same part chosen are one step; a change after an undo drops
 * what could be redone.
 */
export function useDraftHistory({ now = Date.now }: { now?: () => number } = {}) {
  const [stacks, setStacks] = useState<Stacks>(EMPTY);

  /**
   * Call before a change, with the draft and the selection it leaves. `merge: false` keeps the
   * change a step of its own (an added, copied or removed question), whatever comes before or
   * after it.
   */
  const record = (leaving: HistoryStep, { merge = true }: { merge?: boolean } = {}) => {
    const at = now();
    setStacks(({ past, last }) => {
      const typing =
        merge &&
        last !== null &&
        at - last.at < MERGE_WINDOW_MS &&
        sameSelection(last.selection, leaving.selection);
      return {
        // typing goes on from the step it started: the draft before its first letter is kept
        past: typing ? past : pushed(past, leaving),
        future: [],
        last: merge ? { at, selection: leaving.selection } : null,
      };
    });
  };

  /** The step before, given the draft on screen (kept for the redo); null with nothing to undo. */
  const undo = (current: HistoryStep): HistoryStep | null => {
    const step = stacks.past.at(-1);
    if (!step) return null;
    setStacks({
      past: stacks.past.slice(0, -1),
      future: pushed(stacks.future, current),
      last: null,
    });
    return step;
  };

  /** The step undone last, given the draft on screen (kept for the undo); null with none. */
  const redo = (current: HistoryStep): HistoryStep | null => {
    const step = stacks.future.at(-1);
    if (!step) return null;
    setStacks({
      past: pushed(stacks.past, current),
      future: stacks.future.slice(0, -1),
      last: null,
    });
    return step;
  };

  /** Forgets every step: the draft on screen is another version, or was read again. */
  const clear = () => setStacks((s) => (s === EMPTY ? s : EMPTY));

  return {
    canUndo: stacks.past.length > 0,
    canRedo: stacks.future.length > 0,
    record,
    undo,
    redo,
    clear,
  };
}
