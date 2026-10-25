import { uuidv7 } from '@css/shared';
import type { Answer } from '@css/shared/forms';
import { useCallback, useEffect, useState } from 'react';
import { type FormAnswers, storedAnswersOf } from './answers';

/**
 * The answers of the form, kept in the open tab only when the screen gives a storage key: a
 * reload brings them back, closing the tab or sending clears them, and nothing personal stays on
 * the device after that (the encrypted offline store comes with its own task). Without a key, as
 * in the builder's preview, nothing is written anywhere.
 */
export function useFormAnswers(
  storageKey: string | undefined,
  initialRows: Record<string, number>,
  initialAnswers: Answer[] = [],
) {
  const [state, setState] = useState<FormAnswers>(
    () => read(storageKey) ?? fresh(initialRows, initialAnswers),
  );

  useEffect(() => {
    if (!storageKey) return;
    try {
      // an untouched form leaves nothing behind: emptied again, or just sent
      if (untouched(state, initialRows)) sessionStorage.removeItem(storageKey);
      else sessionStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // a full or blocked storage only loses the reload copy; the form keeps working
    }
  }, [storageKey, state, initialRows]);

  /** Clears the stored copy and starts again with a new client id. */
  const clear = useCallback(() => {
    if (storageKey)
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        // nothing stored, nothing to clear
      }
    setState((s) => ({ ...fresh(initialRows), generation: s.generation + 1 }));
  }, [storageKey, initialRows]);

  return { state, setState, clear };
}

/** A new set of answers; a screen may start it with answers it already knows (a found person, a draft). */
function fresh(rows: Record<string, number>, answers: Answer[] = []): FormAnswers {
  return { clientUuid: uuidv7(), answers: [...answers], rows: { ...rows }, step: 0, generation: 0 };
}

const untouched = (state: FormAnswers, rows: Record<string, number>) =>
  state.answers.length === 0 &&
  state.step === 0 &&
  Object.entries(state.rows).every(([group, n]) => n === (rows[group] ?? 0));

function read(storageKey: string | undefined): FormAnswers | null {
  if (!storageKey) return null;
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return null;
    return storedAnswersOf(JSON.parse(raw));
  } catch {
    return null;
  }
}
