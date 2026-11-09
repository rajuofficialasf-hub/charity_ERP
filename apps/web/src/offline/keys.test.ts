// @vitest-environment node
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { importDataKey, newKeyBytes } from './crypto';
import { closeOfflineDb, OFFLINE_DB_NAME, offlineDb, openRow, type OutboxRow, sealRow } from './db';
import {
  afterSignIn,
  clearLostPending,
  currentDataKey,
  forgetKeys,
  noteLostPending,
  openOffline,
  peekLostPending,
  storedSessionId,
  takeOfflineNotice,
} from './keys';

const USER = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const OTHER_USER = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';
const SESSION_A = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4b01';
const SESSION_B = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4b02';
const KEY_A = 'a'.repeat(43);
const KEY_B = 'b'.repeat(43);
const ANSWERS = { answers: [{ fieldKey: 'q_id', value: { t: 'short_text', v: '1234567890' } }] };

const storage = new Map<string, string>();
beforeEach(() => {
  // the note lives in localStorage, which Node has not
  Object.defineProperty(globalThis, 'window', {
    value: {
      localStorage: {
        getItem: (k: string) => storage.get(k) ?? null,
        setItem: (k: string, v: string) => storage.set(k, v),
        removeItem: (k: string) => storage.delete(k),
      },
    },
    configurable: true,
  });
});
afterEach(async () => {
  forgetKeys();
  takeOfflineNotice();
  clearLostPending();
  storage.clear();
  closeOfflineDb();
  await Dexie.delete(OFFLINE_DB_NAME);
});

async function pendingRow(key: CryptoKey, clientUuid: string): Promise<OutboxRow> {
  const now = new Date();
  return sealRow(
    key,
    {
      clientUuid,
      kind: 'application_draft' as const,
      projectId: 'p1',
      formVersionId: 'v1',
      target: null,
      dependencies: [],
      state: 'pending' as const,
      attempts: 0,
      firstAttemptAt: null,
      nextRetryAt: null,
      failureCode: null,
      createdAt: now,
      updatedAt: now,
    },
    ANSWERS,
  );
}

describe('the key ring', () => {
  it('makes a ring at the first sign-in and remembers the session it is keyed under', async () => {
    const key = await afterSignIn({ sessionId: SESSION_A, userId: USER, deviceKey: KEY_A });
    expect(currentDataKey()).toBe(key);
    expect(key.extractable).toBe(false);
    expect(await storedSessionId()).toBe(SESSION_A);
    const row = await offlineDb().keys.get('current');
    expect(row?.deviceBoundKey.extractable).toBe(false);
    expect(takeOfflineNotice()).toBeNull();
  });

  it('opens the same key again from the device-bound key on a cold start without the server', async () => {
    const key = await afterSignIn({ sessionId: SESSION_A, userId: USER, deviceKey: KEY_A });
    await offlineDb().outbox.put(await pendingRow(key, 'r1'));
    forgetKeys();
    expect(currentDataKey()).toBeNull();
    expect(await openOffline()).toEqual({ sessionId: SESSION_A, userId: USER });
    const reopened = currentDataKey()!;
    const stored = (await offlineDb().outbox.get('r1'))!;
    expect(await openRow(reopened, stored)).toEqual(ANSWERS);
  });

  it('re-keys the ring under a new session with the previous device key, and the rows still open', async () => {
    const key = await afterSignIn({ sessionId: SESSION_A, userId: USER, deviceKey: KEY_A });
    await offlineDb().outbox.put(await pendingRow(key, 'r1'));
    forgetKeys();
    // the device-bound key is gone with this browser profile: only the server's key can help
    await offlineDb().keys.update('current', {
      deviceBoundKey: await importDataKey(newKeyBytes()),
    });
    const again = await afterSignIn({
      sessionId: SESSION_B,
      userId: USER,
      deviceKey: KEY_B,
      previousDeviceKey: KEY_A,
    });
    expect(await storedSessionId()).toBe(SESSION_B);
    expect(await openRow(again, (await offlineDb().outbox.get('r1'))!)).toEqual(ANSWERS);
    expect(takeOfflineNotice()).toEqual({ kind: 'recovered', count: 1 });
    // the next sign-in of the same session opens with its own key alone
    forgetKeys();
    await afterSignIn({ sessionId: SESSION_B, userId: USER, deviceKey: KEY_B });
    expect(await openRow(currentDataKey()!, (await offlineDb().outbox.get('r1'))!)).toEqual(
      ANSWERS,
    );
  });

  it('notes the lost records and clears the ring when nothing opens it', async () => {
    const key = await afterSignIn({ sessionId: SESSION_A, userId: USER, deviceKey: KEY_A });
    await offlineDb().outbox.put(await pendingRow(key, 'r1'));
    await offlineDb().outbox.put(await pendingRow(key, 'r2'));
    forgetKeys();
    await offlineDb().keys.update('current', {
      deviceBoundKey: await importDataKey(newKeyBytes()),
    });
    await afterSignIn({ sessionId: SESSION_B, userId: USER, deviceKey: KEY_B });
    expect(takeOfflineNotice()).toEqual({ kind: 'unrecoverable', count: 2 });
    expect(peekLostPending()).toEqual({ count: 2, reason: 'unrecoverable' });
    expect(await offlineDb().outbox.count()).toBe(0);
    expect(await storedSessionId()).toBe(SESSION_B);
  });

  it('clears another user’s ring and tables, notes what they lose, and tells the next person only that', async () => {
    const key = await afterSignIn({ sessionId: SESSION_A, userId: OTHER_USER, deviceKey: KEY_A });
    await offlineDb().outbox.put(await pendingRow(key, 'r1'));
    forgetKeys();
    await afterSignIn({ sessionId: SESSION_B, userId: USER, deviceKey: KEY_B });
    expect(takeOfflineNotice()).toEqual({ kind: 'cleared' });
    expect(peekLostPending()).toEqual({ count: 1, reason: 'unrecoverable' });
    expect(await offlineDb().outbox.count()).toBe(0);
    expect((await offlineDb().keys.get('current'))?.userId).toBe(USER);
  });

  it('lets two openers at once share one ring', async () => {
    const [key, offline] = await Promise.all([
      afterSignIn({ sessionId: SESSION_A, userId: USER, deviceKey: KEY_A }),
      openOffline(),
    ]);
    expect(offline).toEqual({ sessionId: SESSION_A, userId: USER });
    expect(await offlineDb().keys.count()).toBe(1);
    const row = (await offlineDb().keys.get('current'))!;
    await offlineDb().outbox.put(await pendingRow(key, 'r1'));
    forgetKeys();
    expect(await openOffline()).toEqual({ sessionId: row.sessionId, userId: USER });
    expect(await openRow(currentDataKey()!, (await offlineDb().outbox.get('r1'))!)).toEqual(
      ANSWERS,
    );
  });

  it('keeps a lost-pending note until it is cleared, and ignores a broken one', () => {
    noteLostPending({ count: 3, reason: 'logout' });
    expect(peekLostPending()).toEqual({ count: 3, reason: 'logout' });
    clearLostPending();
    expect(peekLostPending()).toBeUndefined();
    storage.set('css_lost_pending', '{"count":"x"}');
    expect(peekLostPending()).toBeUndefined();
  });
});
