import {
  importDataKey,
  importDeviceKey,
  newDeviceBoundKey,
  newKeyBytes,
  unwrapKey,
  wrapKey,
} from './crypto';
import { clearOfflineTables, type KeysRow, offlineDb } from './db';

/**
 * The key ring of the phone's store (docs/architecture/OFFLINE_SYNC.md, local storage security).
 * The data key opens every sealed row. It is kept wrapped under the session's device key (from
 * the server, memory only) and under the device-bound key of this browser, so the store opens on
 * a cold start too. The open data key lives in this module for the page's lifetime, and only one
 * opener runs at a time, so two openers never make two rings.
 */

/** What the sign-in brings for the store. */
export interface SignedInSession {
  sessionId: string;
  userId: string;
  deviceKey: string;
  previousDeviceKey?: string;
}

/** What the screens tell the person about the store after a sign-in. */
export type OfflineNotice =
  | { kind: 'recovered'; count: number }
  | { kind: 'unrecoverable'; count: number }
  | { kind: 'cleared' };

/** The note of records lost before a login, told to the server at the next login. */
export interface LostPending {
  count: number;
  reason: 'logout' | 'unrecoverable';
}

const LOST_PENDING_KEY = 'css_lost_pending';
const ROW_ID = 'current';

let held: { sessionId: string; userId: string; dataKey: CryptoKey } | null = null;
let notice: OfflineNotice | null = null;
let opening: Promise<unknown> | null = null;

/** Runs one opener after the one before it, whatever that one's outcome. */
function oneAtATime<T>(work: () => Promise<T>): Promise<T> {
  const next = (opening ?? Promise.resolve())
    .catch(() => undefined)
    .then(work)
    .finally(() => {
      if (opening === next) opening = null;
    });
  opening = next;
  return next;
}

/** The open data key of this page, or null before a sign-in or a cold-start open. */
export function currentDataKey(): CryptoKey | null {
  return held?.dataKey ?? null;
}

/** The open data key, or an error for a caller that cannot work without it. */
export function requireDataKey(): CryptoKey {
  const key = currentDataKey();
  if (!key) throw new Error('offline store: the key ring is not open');
  return key;
}

/** Forgets the open key; the wrapped copies stay in the store. */
export function forgetKeys(): void {
  held = null;
}

/** The notice of the last sign-in, handed out once. */
export function takeOfflineNotice(): OfflineNotice | null {
  const current = notice;
  notice = null;
  return current;
}

/** The session the store was last keyed under, for the login to ask its key back. */
export async function storedSessionId(): Promise<string | null> {
  const row = await offlineDb().keys.get(ROW_ID);
  return row?.sessionId ?? null;
}

/** Records not yet accepted by the server: what a clear would lose. */
async function pendingCount(): Promise<number> {
  return offlineDb().outbox.where('state').anyOf(['pending', 'syncing', 'failed']).count();
}

export function noteLostPending(entry: LostPending): void {
  try {
    window.localStorage.setItem(LOST_PENDING_KEY, JSON.stringify(entry));
  } catch {
    // storage may be unavailable in a private window
  }
}

export function peekLostPending(): LostPending | undefined {
  try {
    const raw = window.localStorage.getItem(LOST_PENDING_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<LostPending>;
    return typeof parsed.count === 'number' &&
      (parsed.reason === 'logout' || parsed.reason === 'unrecoverable')
      ? { count: parsed.count, reason: parsed.reason }
      : undefined;
  } catch {
    return undefined;
  }
}

export function clearLostPending(): void {
  try {
    window.localStorage.removeItem(LOST_PENDING_KEY);
  } catch {
    // nothing to clear
  }
}

/** Asks the browser to keep the store through storage pressure; false when it will not say so. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

async function newRing(session: SignedInSession): Promise<CryptoKey> {
  const raw = newKeyBytes();
  const [deviceBoundKey, serverKey] = await Promise.all([
    newDeviceBoundKey(),
    importDeviceKey(session.deviceKey),
  ]);
  const [wrappedByServer, wrappedByDevice] = await Promise.all([
    wrapKey(serverKey, raw),
    wrapKey(deviceBoundKey, raw),
  ]);
  await offlineDb().keys.put({
    id: ROW_ID,
    sessionId: session.sessionId,
    userId: session.userId,
    wrappedByServer,
    wrappedByDevice,
    deviceBoundKey,
    createdAt: new Date(),
  });
  const dataKey = await importDataKey(raw);
  held = { sessionId: session.sessionId, userId: session.userId, dataKey };
  return dataKey;
}

/** The raw data key out of the row, by whichever key opens it; null when none does. */
async function unwrapWith(
  row: KeysRow,
  session: SignedInSession,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const attempts: (() => Promise<Uint8Array<ArrayBuffer>>)[] = [];
  if (row.sessionId === session.sessionId)
    attempts.push(async () =>
      unwrapKey(await importDeviceKey(session.deviceKey), row.wrappedByServer),
    );
  const previous = session.previousDeviceKey;
  if (previous)
    attempts.push(async () => unwrapKey(await importDeviceKey(previous), row.wrappedByServer));
  attempts.push(() => unwrapKey(row.deviceBoundKey, row.wrappedByDevice));
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch {
      // the next key may open it
    }
  }
  return null;
}

/** Notes what a clear loses, so the next login tells the server, then empties every table. */
async function clearAfterCounting(): Promise<number> {
  const count = await pendingCount();
  if (count > 0) noteLostPending({ count, reason: 'unrecoverable' });
  await clearOfflineTables();
  return count;
}

/**
 * Opens the store's keys after a sign-in: a fresh ring on a clean device; the existing ring
 * re-wrapped under the new session's key when the session changed; another user's ring, or one
 * nothing opens, is cleared after its pending count is noted.
 */
export function afterSignIn(session: SignedInSession): Promise<CryptoKey> {
  return oneAtATime(async () => {
    const db = offlineDb();
    const row = await db.keys.get(ROW_ID);
    if (!row) return newRing(session);
    if (row.userId !== session.userId) {
      await clearAfterCounting();
      notice = { kind: 'cleared' };
      return newRing(session);
    }
    const raw = await unwrapWith(row, session);
    if (!raw) {
      const count = await clearAfterCounting();
      notice = { kind: 'unrecoverable', count };
      return newRing(session);
    }
    if (row.sessionId !== session.sessionId) {
      const serverKey = await importDeviceKey(session.deviceKey);
      await db.keys.update(ROW_ID, {
        sessionId: session.sessionId,
        wrappedByServer: await wrapKey(serverKey, raw),
      });
      const count = await pendingCount();
      if (count > 0) notice = { kind: 'recovered', count };
    }
    const dataKey = await importDataKey(raw);
    held = { sessionId: session.sessionId, userId: session.userId, dataKey };
    return dataKey;
  });
}

/**
 * Opens the store without the server, on a cold start offline: the device-bound key unwraps the
 * data key and the row says whose store it is. Null when this browser holds no ring.
 */
export function openOffline(): Promise<{ sessionId: string; userId: string } | null> {
  return oneAtATime(async () => {
    if (held) return { sessionId: held.sessionId, userId: held.userId };
    const row = await offlineDb().keys.get(ROW_ID);
    if (!row) return null;
    try {
      const raw = await unwrapKey(row.deviceBoundKey, row.wrappedByDevice);
      held = { sessionId: row.sessionId, userId: row.userId, dataKey: await importDataKey(raw) };
      return { sessionId: row.sessionId, userId: row.userId };
    } catch {
      return null;
    }
  });
}
