import { ApiFailure } from '../../lib/api';

/** A failed write in the reader's words: the server's message, a stale version named as such. */
export function failureOf(
  error: unknown,
  texts: { stale: string; fallback: string },
): { text: string; stale: boolean } {
  if (error instanceof ApiFailure && error.status === 412)
    return { text: texts.stale, stale: true };
  if (error instanceof ApiFailure)
    return { text: error.details[0]?.message ?? error.message, stale: false };
  return { text: texts.fallback, stale: false };
}
