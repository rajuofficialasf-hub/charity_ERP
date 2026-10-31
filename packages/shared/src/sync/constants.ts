/**
 * The values of offline synchronisation the owner decided (docs/DECISION_LOG.md, the row
 * "Offline synchronization and mobile storage" of 2026-10-10, and docs/architecture/OFFLINE_SYNC.md
 * "Values decided"). Changing one is a decision, not a setting: nothing here is editable in the app.
 */

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/** The waits before the first, second, third and fourth retry; every later retry waits the last one. */
export const RETRY_DELAYS_MS = [30 * SECOND, 2 * MINUTE, 10 * MINUTE, HOUR] as const;
/** Each wait is spread by this share either way, so phones do not all come back at once. */
export const RETRY_JITTER = 0.2;
/** After this many days of retries a record stays failed until the person acts. */
export const RETRY_GIVE_UP_DAYS = 7;

/** A batch holds at most this many text records. */
export const BATCH_MAX_RECORDS = 50;
/** A batch's records weigh at most this many bytes of JSON. */
export const BATCH_MAX_BYTES = 1024 * 1024;
/** The margin the server's body limit adds for the envelope around the records. */
export const BATCH_ENVELOPE_BYTES = 64 * 1024;

/** Photos travel in parts of this size (the upload service of the file platform). */
export const PHOTO_PART_BYTES = 256 * 1024;
/** The photo queue may hold this much on each platform. */
export const PHOTO_BUDGET_BYTES = { android: 200 * 1024 * 1024, ios: 100 * 1024 * 1024 } as const;
/** The share of the budget at which the app warns and suggests syncing. */
export const PHOTO_WARN_RATIO = 0.8;
/** A photo is compressed until it is at most this big (the picture quality requirement). */
export const PHOTO_TARGET_BYTES = 300 * 1024;

/** A synced record leaves the phone this many days after the server confirmed it. */
export const PURGE_AFTER_DAYS = 7;
/** The first reminder about pending records comes after this long; then once a day. */
export const REMINDER_AFTER_HOURS = 24;
/** The data set is pulled again at most this often unless the person asks. */
export const SNAPSHOT_MIN_INTERVAL_MS = 15 * MINUTE;
/** The outbox flushes on this timer while the app is open and online. */
export const FLUSH_INTERVAL_MS = 15 * MINUTE;
/** The tag of the one-shot Background Sync the page asks for while records wait (Android Chrome). */
export const BACKGROUND_SYNC_TAG = 'outbox';
