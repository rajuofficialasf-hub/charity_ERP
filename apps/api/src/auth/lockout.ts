/** Lockout rule (AUTH.md 6): 5 consecutive failures lock the login id for 15 minutes. */
export const LOCKOUT_RULES = { maxFailures: 5, lockMs: 15 * 60_000 } as const;

/** Next counter state after a failed attempt: either a higher count or a lock until a time. */
export function afterFailure(
  failedCount: number,
  now: Date,
): { failedCount: number; lockedUntil: Date | null } {
  const next = failedCount + 1;
  if (next >= LOCKOUT_RULES.maxFailures)
    return { failedCount: 0, lockedUntil: new Date(now.getTime() + LOCKOUT_RULES.lockMs) };
  return { failedCount: next, lockedUntil: null };
}

/** Whole minutes until a lock ends, at least 1 (shown on the login screen, SCR-001). */
export function minutesLeft(lockedUntil: Date, now: Date): number {
  return Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000));
}

/**
 * The same lockout for login ids without an account, kept in memory, so that a lock never tells
 * an attacker whether an account exists (AUTH.md 6). Bounded: the oldest entries are dropped.
 */
export class UnknownIdLockout {
  private readonly entries = new Map<string, { failedCount: number; lockedUntil: Date | null }>();

  constructor(private readonly capacity = 10_000) {}

  lockedUntil(key: string, now: Date): Date | null {
    const entry = this.entries.get(key);
    if (!entry?.lockedUntil) return null;
    if (entry.lockedUntil <= now) {
      this.entries.delete(key);
      return null;
    }
    return entry.lockedUntil;
  }

  fail(key: string, now: Date): Date | null {
    const state = afterFailure(this.entries.get(key)?.failedCount ?? 0, now);
    this.entries.delete(key);
    this.entries.set(key, state);
    if (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    return state.lockedUntil;
  }
}
