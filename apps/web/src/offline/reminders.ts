import { REMINDER_AFTER_HOURS } from '@css/shared/sync';
import { offlineDb } from './db';

/**
 * The reminder about records left waiting (docs/architecture/OFFLINE_SYNC.md, "Values decided"):
 * a notice on the device once a record has waited a day, and once a day after that while
 * anything waits; nothing goes through the server. The last time it was shown sits in the meta
 * table, so a reopened app does not repeat it the same day.
 */

const HOUR_MS = 60 * 60_000;
const SHOWN_KEY = 'reminder.shownAt';

export interface Reminder {
  /** Records the server has not accepted yet. */
  count: number;
  /** When the oldest of them was written. */
  oldestAt: Date;
}

/** The reminder due now, or null: nothing waits, nothing has waited a day, or one was shown today. */
export async function dueReminder(now: Date): Promise<Reminder | null> {
  const db = offlineDb();
  const waiting = await db.outbox.where('state').anyOf(['pending', 'syncing', 'failed']).toArray();
  if (!waiting.length) return null;
  const oldest = waiting.reduce((a, b) => (a.createdAt <= b.createdAt ? a : b));
  if (now.getTime() - oldest.createdAt.getTime() < REMINDER_AFTER_HOURS * HOUR_MS) return null;
  const shown = await db.meta.get(SHOWN_KEY);
  const shownAt = typeof shown?.value === 'string' ? new Date(shown.value) : null;
  if (shownAt && now.getTime() - shownAt.getTime() < REMINDER_AFTER_HOURS * HOUR_MS) return null;
  return { count: waiting.length, oldestAt: oldest.createdAt };
}

/** Remembers that the reminder was shown, so the next one waits a day. */
export async function markReminderShown(now: Date): Promise<void> {
  await offlineDb().meta.put({ key: SHOWN_KEY, value: now.toISOString() });
}
