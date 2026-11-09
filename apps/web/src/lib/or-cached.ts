import { ApiFailure } from '../api/client';

/**
 * Whether a failed call never reached a working server: the network, a timeout, a busy or a
 * failing server. A refusal (401, 403, 404, 422) is the server's word and is never covered up.
 */
export function failedOnTheWay(error: unknown): boolean {
  if (!(error instanceof ApiFailure)) return true;
  return error.status === 0 || error.status === 429 || error.status >= 500;
}

/**
 * The server's answer, or what the phone holds when the server could not be reached. A refusal
 * passes through, so a volunteer who lost a project or a record hears it; a copy the phone does
 * not hold, or an empty one, leaves the original failure to the screen.
 */
export async function orCached<T>(
  work: () => Promise<T>,
  cached: () => Promise<T | null | undefined>,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (!failedOnTheWay(error)) throw error;
    const copy = await cached().catch(() => null);
    if (copy === null || copy === undefined) throw error;
    if (Array.isArray(copy) && copy.length === 0) throw error;
    return copy;
  }
}
