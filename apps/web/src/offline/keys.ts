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
 * The key ring of the phone's store (docs/architecture/OFFLINE_SYNC.md 7, D-139). The data key
 * opens every sealed row. It is kept wrapped under the session's device key (from the server,
 * memory only) and under the device-bound key of this browser, so the store opens on a cold
 * start too. The open data key lives in this module for the page's lifetime.
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

/** The open data key of this page, or null before a sign-in or a cold-start open. */
export function currentDataKey(): CryptoKey | null {
  return held?.dataKey ?? null;
}

/** The user whose store is open, or null. */
export function heldSession(): { sessionId: string; userId: string } | null {
  return held ? { sessionId: held.sessionId, userId: held.userId } : null;
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

/** Records not yet accepted by the server: what a wipe would lose. */
export async function pendingCount(): Promise<number> {
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
  const deviceBoundKey = await newDeviceBoundKey();
  const serverKey = await importDeviceKey(session.deviceKey);
  const row: KeysRow = {
    id: ROW_ID,
    sessionId: session.sessionId,
    userId: session.userId,
    wrappedByServer: await wrapKey(serverKey, raw),
    wrappedByDevice: await wrapKey(deviceBoundKey, raw),
    deviceBoundKey,
    createdAt: new Date(),
  };
  await offlineDb().keys.put(row);
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
  if (session.previousDeviceKey)
    attempts.push(async () =>
      unwrapKey(await importDeviceKey(session.previousDeviceKey!), row.wrappedByServer),
    );
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

/**
 * Opens the store's keys after a sign-in: a fresh ring on a clean device; the existing ring
 * re-wrapped under the new session's key when the session changed; another user's ring, or one
 * nothing opens, is cleared after its pending count is noted.
 */
export async function afterSignIn(session: SignedInSession): Promise<CryptoKey> {
  const db = offlineDb();
  const row = await db.keys.get(ROW_ID);
  if (!row) return newRing(session);
  if (row.userId !== session.userId) {
    await clearOfflineTables();
    notice = { kind: 'cleared' };
    return newRing(session);
  }
  const raw = await unwrapWith(row, session);
  if (!raw) {
    const count = await pendingCount();
    if (count > 0) noteLostPending({ count, reason: 'unrecoverable' });
    await clearOfflineTables();
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
}

/**
 * Opens the store without the server, on a cold start offline: the device-bound key unwraps the
 * data key and the row says whose store it is. Null when this browser holds no ring.
 */
export async function openOffline(): Promise<{ sessionId: string; userId: string } | null> {
  const row = await offlineDb().keys.get(ROW_ID);
  if (!row) return null;
  try {
    const raw = await unwrapKey(row.deviceBoundKey, row.wrappedByDevice);
    held = { sessionId: row.sessionId, userId: row.userId, dataKey: await importDataKey(raw) };
    return { sessionId: row.sessionId, userId: row.userId };
  } catch {
    return null;
  }
}
