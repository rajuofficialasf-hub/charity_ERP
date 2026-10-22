import { uuidv7 } from '@css/shared';
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
) {
  const [state, setState] = useState<FormAnswers>(() => read(storageKey) ?? fresh(initialRows));

  useEffect(() => {
    // an untouched form leaves nothing behind, also right after it was sent
    if (!storageKey || (state.answers.length === 0 && state.step === 0)) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // a full or blocked storage only loses the reload copy; the form keeps working
    }
  }, [storageKey, state]);

  /** Clears the stored copy and starts again with a new client id. */
  const clear = useCallback(() => {
    if (storageKey)
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        // nothing stored, nothing to clear
      }
    setState(fresh(initialRows));
  }, [storageKey, initialRows]);

  return { state, setState, clear };
}

function fresh(rows: Record<string, number>): FormAnswers {
  return { clientUuid: uuidv7(), answers: [], rows: { ...rows }, step: 0 };
}

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
