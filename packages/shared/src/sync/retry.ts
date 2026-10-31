import { RETRY_DELAYS_MS, RETRY_GIVE_UP_DAYS, RETRY_JITTER } from './constants.js';

const DAY_MS = 24 * 60 * 60_000;

/** The server is still working on a batch the phone sent before; it says when to ask again. */
export const BATCH_IN_PROGRESS = 'sync.batch_in_progress';

/** A status worth sending again: no answer at all, a timeout, a busy or a failing server. */
export function isTransientStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

/** A transient answer by status and code: a batch still in progress is one too. */
export function isTransientResponse(status: number, code?: string | null): boolean {
  return isTransientStatus(status) || (status === 409 && code === BATCH_IN_PROGRESS);
}

/** The longest a server's Retry-After is followed; beyond it the ladder decides. */
export const RETRY_AFTER_MAX_SECONDS = 3_600;

/**
 * When to try again after the given attempt (1 for the first retry). The server's `Retry-After`
 * wins over the ladder; otherwise the ladder's wait is spread by the jitter with the given draw
 * in [0, 1], so the caller's tests can pin it.
 */
export function nextRetryAt(
  attempt: number,
  now: Date,
  retryAfterSeconds?: number,
  random: () => number = Math.random,
): Date {
  if (
    retryAfterSeconds !== undefined &&
    Number.isFinite(retryAfterSeconds) &&
    retryAfterSeconds >= 0 &&
    retryAfterSeconds <= RETRY_AFTER_MAX_SECONDS
  )
    return new Date(now.getTime() + retryAfterSeconds * 1_000);
  const index = Math.min(Math.max(attempt, 1), RETRY_DELAYS_MS.length) - 1;
  // the ladder is a fixed tuple, so its last step is always there
  const base = RETRY_DELAYS_MS.at(index) ?? RETRY_DELAYS_MS[3];
  const spread = base * RETRY_JITTER * (random() * 2 - 1);
  return new Date(now.getTime() + Math.round(base + spread));
}

/** Whether the retries of a record that first went out at `firstAttemptAt` are over at `now`. */
export function retryExhausted(firstAttemptAt: Date, now: Date): boolean {
  return now.getTime() - firstAttemptAt.getTime() > RETRY_GIVE_UP_DAYS * DAY_MS;
}

/** How far the phone's clock is from the server's: add it to a device time to get server time. */
export function clockOffsetMs(deviceTime: Date, serverTime: Date): number {
  return serverTime.getTime() - deviceTime.getTime();
}

/** A device time moved onto the server's clock. */
export function correctedTime(deviceTime: Date, offsetMs: number): Date {
  return new Date(deviceTime.getTime() + offsetMs);
}
