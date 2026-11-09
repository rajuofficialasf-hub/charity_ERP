import { isoDateInDhaka } from '@css/shared/format';

/**
 * The rules of a record that arrives through sync (docs/architecture/OFFLINE_SYNC.md "Conflict
 * rules at sync"), pure, so the service and the tests agree: the device time moved onto the
 * server's clock, a record made before a deadline that passed meanwhile, and a record made on a
 * form version a newer one replaced meanwhile.
 */

/** How far a device clock may be off before the server stops believing it: the offset is capped at a day. */
export const CLOCK_OFFSET_MAX_MS = 24 * 3_600_000;

/** The offset the server works with: the learned one, within a day either way. */
export function clampedOffset(offsetMs: number): number {
  return Math.max(-CLOCK_OFFSET_MAX_MS, Math.min(CLOCK_OFFSET_MAX_MS, offsetMs));
}

/**
 * A device time moved onto the server's clock by the offset learned from the batch, and never
 * after now: the phone cannot date a record into the future.
 */
export function correctedDeviceTime(iso: string, offsetMs: number, now: Date): Date {
  return new Date(Math.min(new Date(iso).getTime() + offsetMs, now.getTime()));
}

/** The day (in Dhaka) of a date-only window end, as the deadline guard reads it. */
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Whether a record made while the window was open arrives after it closed: such a record is held
 * for the office instead of refused. A window still open, or a record made after it closed, is
 * not a late sync.
 */
export function lateSync(createdAt: Date, now: Date, applyTo: Date | null): boolean {
  const end = day(applyTo);
  if (!end) return false;
  const today = isoDateInDhaka(now);
  if (today <= end) return false;
  return isoDateInDhaka(createdAt) <= end;
}

/**
 * Whether a record on a retired version was made after its successor was published: the phone
 * still had the old form, so the office checks whether the new questions matter.
 */
export function staleVersion(createdAt: Date, successorPublishedAt: Date | null): boolean {
  return successorPublishedAt !== null && createdAt.getTime() >= successorPublishedAt.getTime();
}

/** The flags a sync may add, and the one the result names as its reason, in order of weight. */
export const SYNC_FLAGS = ['existing_identity', 'late_sync', 'stale_form_version'] as const;
export type SyncFlag = (typeof SYNC_FLAGS)[number];

/** The reason a held record tells the phone: the first of its sync flags. */
export function verificationReason(flags: readonly string[]): SyncFlag | null {
  return SYNC_FLAGS.find((f) => flags.includes(f)) ?? null;
}
