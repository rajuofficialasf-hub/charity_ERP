// @vitest-environment node
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeOfflineDb, OFFLINE_DB_NAME } from './db';
import { afterSignIn, forgetKeys } from './keys';
import { apply, applyResult, enqueue } from './outbox';
import { dueReminder, markReminderShown } from './reminders';

if (!globalThis.crypto?.subtle)
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

const SESSION = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4b01';
const PROJECT = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4c01';
const VERSION = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4d01';
const T0 = new Date('2026-10-31T10:00:00Z');
const HOUR = 60 * 60_000;
const at = (hours: number) => new Date(T0.getTime() + hours * HOUR);

const draft = (now: Date) =>
  enqueue({
    kind: 'application_draft',
    projectId: PROJECT,
    formVersionId: VERSION,
    payload: { answers: [] },
    now,
  });

// The reminder about records left waiting: after a day, once a day, gone once everything went.
beforeEach(async () => {
  await afterSignIn({ sessionId: SESSION, userId: 'u1', deviceKey: 'k'.repeat(43) });
});
afterEach(async () => {
  forgetKeys();
  closeOfflineDb();
  await Dexie.delete(OFFLINE_DB_NAME);
});

describe('the pending reminder', () => {
  it('is due only once a record has waited a day, and counts every waiting record', async () => {
    await draft(T0);
    await draft(at(20));
    expect(await dueReminder(at(23))).toBeNull();
    expect(await dueReminder(at(25))).toEqual({ count: 2, oldestAt: T0 });
  });

  it('comes once a day, not on every look', async () => {
    await draft(T0);
    expect(await dueReminder(at(25))).not.toBeNull();
    await markReminderShown(at(25));
    expect(await dueReminder(at(30))).toBeNull();
    expect(await dueReminder(at(49))).toEqual({ count: 1, oldestAt: T0 });
  });

  it('stops when the record went', async () => {
    const row = await draft(T0);
    await apply([row.clientUuid], { type: 'flush', at: at(1) });
    await applyResult({ clientUuid: row.clientUuid, result: 'synced', serverId: 'srv' }, at(1));
    expect(await dueReminder(at(30))).toBeNull();
  });
});
