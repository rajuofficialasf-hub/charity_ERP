import { uuidv7 } from '@css/shared';
import type { Answer } from '@css/shared/forms';
import { useCallback, useState } from 'react';
import type { FormAnswers } from './answers';

/** The keys under which a plain copy of a form's answers may sit in the tab's storage. */
const EARLIER_COPIES = ['apply:', 'public-apply:'];

/**
 * Removes any plain copy of a form's answers from the tab's storage under those keys, so a
 * person's answers, the identity number among them, never wait there unencrypted.
 */
function clearEarlierCopies(): void {
  try {
    for (const key of Object.keys(sessionStorage))
      if (EARLIER_COPIES.some((prefix) => key.startsWith(prefix))) sessionStorage.removeItem(key);
  } catch {
    // a blocked storage holds nothing to clear
  }
}

/**
 * The answers of the form, held in memory only: nothing personal is written to the browser's
 * storage, where it would wait unencrypted (docs/architecture/OFFLINE_SYNC.md, the encrypted
 * store). A volunteer's application keeps its draft in the encrypted offline store at the end of
 * each part, so a reload loses at most the part being typed.
 */
export function useFormAnswers(initialRows: Record<string, number>, initialAnswers: Answer[] = []) {
  const [state, setState] = useState<FormAnswers>(() => {
    clearEarlierCopies();
    return fresh(initialRows, initialAnswers);
  });

  /** Starts again with a new client id. */
  const clear = useCallback(() => {
    setState((s) => ({ ...fresh(initialRows, initialAnswers), generation: s.generation + 1 }));
  }, [initialRows, initialAnswers]);

  return { state, setState, clear };
}

/** A new set of answers; a screen may start it with answers it already knows (a found person, a draft). */
function fresh(rows: Record<string, number>, answers: Answer[] = []): FormAnswers {
  return { clientUuid: uuidv7(), answers: [...answers], rows: { ...rows }, step: 0, generation: 0 };
}
