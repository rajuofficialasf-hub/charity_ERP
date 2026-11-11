import type { FormDefinition } from '@css/shared/forms';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { field, section, T } from '../../../test/forms';
import type { Selection } from './selection';
import { HISTORY_LIMIT, type HistoryStep, TYPED, useDraftHistory } from './use-draft-history';

// The builder's undo and redo: the drafts left behind by each change with the part chosen then,
// each change a step of its own except typing in one place, and nothing kept across another
// version.

/** A draft whose one question carries this text. */
const draftOf = (text: string): FormDefinition => ({
  sections: [section('extra', [field('q_note', 'short_text', { label: T(text) })])],
});
const NOTE: Selection = { section: 'extra', field: 'q_note' };
const PART: Selection = { section: 'extra' };
const at = (definition: FormDefinition, selection: Selection | null = NOTE): HistoryStep => ({
  definition,
  selection,
});

/** The history on a clock the test moves by hand. */
function history() {
  const clock = { ms: 10_000 };
  const hook = renderHook(() => useDraftHistory({ now: () => clock.ms }));
  return {
    get now() {
      return hook.result.current;
    },
    /** A change that leaves this draft behind, after so many milliseconds. */
    change(leaving: HistoryStep, afterMs: number, options?: { merge?: boolean }) {
      clock.ms += afterMs;
      act(() => hook.result.current.record(leaving, options));
    },
    /** A typed change that leaves this draft behind, after so many milliseconds. */
    type(leaving: HistoryStep, afterMs: number) {
      this.change(leaving, afterMs, TYPED);
    },
    undo(current: HistoryStep) {
      let step: HistoryStep | null = null;
      act(() => {
        step = hook.result.current.undo(current);
      });
      return step as HistoryStep | null;
    },
    redo(current: HistoryStep) {
      let step: HistoryStep | null = null;
      act(() => {
        step = hook.result.current.redo(current);
      });
      return step as HistoryStep | null;
    },
    /** Every step an undo still reaches, the latest first, starting from this draft. */
    undoAll(current: HistoryStep) {
      const steps: HistoryStep[] = [];
      for (let step = this.undo(current); step; step = this.undo(step)) steps.push(step);
      return steps;
    },
  };
}

describe('the history of a draft', () => {
  it('has nothing to undo or redo at first', () => {
    const h = history();
    expect(h.now.canUndo).toBe(false);
    expect(h.now.canRedo).toBe(false);
    expect(h.undo(at(draftOf('ক')))).toBeNull();
    expect(h.redo(at(draftOf('ক')))).toBeNull();
  });

  it('undoes to the draft and the selection a change left, and redoes to the ones the undo left', () => {
    const h = history();
    const before = at(draftOf('ক'), NOTE);
    const after = at(draftOf('খ'), null);
    h.change(before, 0);
    expect(h.now.canUndo).toBe(true);
    const undone = h.undo(after);
    expect(undone).toBe(before);
    expect(h.now.canUndo).toBe(false);
    expect(h.now.canRedo).toBe(true);
    const redone = h.redo(undone!);
    expect(redone).toBe(after);
    expect(h.now.canUndo).toBe(true);
    expect(h.now.canRedo).toBe(false);
  });

  it('keeps three typed changes within a second at one selection as one step', () => {
    const h = history();
    const start = at(draftOf(''));
    h.type(start, 0);
    h.type(at(draftOf('ক')), 300);
    h.type(at(draftOf('কখ')), 900);
    expect(h.undoAll(at(draftOf('কখগ')))).toEqual([start]);
  });

  it('keeps two changes that were not typed apart, however soon and at one selection', () => {
    const h = history();
    const first = at(draftOf(''));
    const second = at(draftOf('ক'));
    h.change(first, 0);
    h.change(second, 50);
    expect(h.undoAll(at(draftOf('কখ')))).toEqual([second, first]);
  });

  it('starts a new typed step a second after the last one', () => {
    const h = history();
    const first = at(draftOf(''));
    const second = at(draftOf('ক'));
    h.type(first, 0);
    h.type(second, 1000);
    expect(h.undoAll(at(draftOf('কখ')))).toEqual([second, first]);
  });

  it('starts a new step when another part is chosen, however soon the typing', () => {
    const h = history();
    const first = at(draftOf(''), NOTE);
    const second = at(draftOf('ক'), PART);
    const third = at(draftOf('কখ'), null);
    h.type(first, 0);
    h.type(second, 100);
    h.type(third, 100);
    expect(h.undoAll(at(draftOf('কখগ'), null))).toEqual([third, second, first]);
  });

  it('keeps a change that was not typed apart from the typing around it', () => {
    const h = history();
    const first = at(draftOf(''));
    const second = at(draftOf('ক'));
    const third = at(draftOf('কখ'));
    h.type(first, 0);
    h.change(second, 100);
    h.type(third, 100);
    expect(h.undoAll(at(draftOf('কখগ')))).toEqual([third, second, first]);
  });

  it('does not join typing to the typing before an undo', () => {
    const h = history();
    const first = at(draftOf(''));
    h.type(first, 0);
    const undone = h.undo(at(draftOf('ক')));
    // typed again at once, in the same place
    h.type(undone!, 100);
    expect(h.now.canRedo).toBe(false);
    expect(h.undoAll(at(draftOf('খ')))).toEqual([first]);
  });

  it('drops what could be redone once a new change is made', () => {
    const h = history();
    h.change(at(draftOf('')), 0);
    const undone = h.undo(at(draftOf('ক')));
    expect(h.now.canRedo).toBe(true);
    h.change(undone!, 5000);
    expect(h.now.canRedo).toBe(false);
    expect(h.redo(at(draftOf('খ')))).toBeNull();
  });

  it('adds no step when the saved draft comes back in place of the one on screen', () => {
    const h = history();
    const before = at(draftOf('ক'));
    h.change(before, 0);
    // the server's copy of the changed draft: another object, never recorded
    const echoed = at(draftOf('খ'));
    expect(h.undo(echoed)).toBe(before);
    expect(h.now.canUndo).toBe(false);
    expect(h.redo(before)).toBe(echoed);
  });

  it('remembers the last hundred steps and drops the oldest', () => {
    const h = history();
    const steps = Array.from({ length: HISTORY_LIMIT + 5 }, (_, i) => at(draftOf(String(i))));
    for (const step of steps) h.change(step, 2000);
    const reached = h.undoAll(at(draftOf('শেষ')));
    expect(reached).toHaveLength(HISTORY_LIMIT);
    expect(reached[0]).toBe(steps.at(-1));
    expect(reached.at(-1)).toBe(steps[5]);
  });

  it('forgets both ways when another version opens', () => {
    const h = history();
    h.change(at(draftOf('')), 0);
    h.change(at(draftOf('ক')), 2000);
    h.undo(at(draftOf('কখ')));
    expect(h.now.canUndo).toBe(true);
    expect(h.now.canRedo).toBe(true);
    act(() => h.now.clear());
    expect(h.now.canUndo).toBe(false);
    expect(h.now.canRedo).toBe(false);
    // and the next typing does not join what was typed before
    h.type(at(draftOf('গ')), 100);
    expect(h.undoAll(at(draftOf('ঘ')))).toHaveLength(1);
  });
});
