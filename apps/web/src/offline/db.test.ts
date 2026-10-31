// @vitest-environment node
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { importDataKey, newKeyBytes } from './crypto';
import {
  closeOfflineDb,
  deleteOfflineDb,
  OFFLINE_DB_NAME,
  offlineDb,
  openRow,
  type OutboxRow,
  sealRow,
} from './db';

afterEach(async () => {
  closeOfflineDb();
  await Dexie.delete(OFFLINE_DB_NAME);
});

const NID = '1234567890123';

describe('the phone store', () => {
  it('keeps an outbox row with its answers sealed and only the index columns readable', async () => {
    const key = await importDataKey(newKeyBytes());
    const now = new Date('2026-10-31T10:00:00Z');
    const row: OutboxRow = await sealRow(
      key,
      {
        clientUuid: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a01',
        kind: 'application_draft',
        projectId: 'p1',
        formVersionId: 'v1',
        target: null,
        dependencies: [],
        state: 'pending',
        attempts: 0,
        firstAttemptAt: null,
        nextRetryAt: null,
        failureCode: null,
        createdAt: now,
        updatedAt: now,
      },
      { answers: [{ fieldKey: 'q_id', value: { t: 'short_text', v: NID } }] },
    );
    await offlineDb().outbox.put(row);
    const stored = await offlineDb().outbox.get(row.clientUuid);
    expect(stored).toBeDefined();
    expect(Object.keys(stored!)).not.toContain('answers');
    const clear = JSON.stringify({ ...stored, data: undefined, iv: undefined });
    expect(clear).not.toContain(NID);
    expect(new TextDecoder().decode(stored!.data)).not.toContain(NID);
    expect(await openRow(key, stored!)).toEqual({
      answers: [{ fieldKey: 'q_id', value: { t: 'short_text', v: NID } }],
    });
    expect(await offlineDb().outbox.where('state').equals('pending').count()).toBe(1);
  });

  it('empties every table at once and keeps the database for the next session', async () => {
    const { clearOfflineTables } = await import('./db');
    await offlineDb().meta.put({ key: 'since', value: '2026-10-31' });
    await offlineDb().locations.put({
      id: 'l1',
      parentId: null,
      level: 'division',
      code: '10',
      name: { bn: 'ঢাকা', en: 'Dhaka' },
      active: true,
    });
    await clearOfflineTables();
    expect(await offlineDb().meta.count()).toBe(0);
    expect(await offlineDb().locations.count()).toBe(0);
    expect(await Dexie.exists(OFFLINE_DB_NAME)).toBe(true);
  });

  it('deletes the database by its name, leaving nothing behind', async () => {
    await offlineDb().meta.put({ key: 'since', value: '2026-10-31' });
    await deleteOfflineDb();
    expect(await Dexie.exists(OFFLINE_DB_NAME)).toBe(false);
  });
});
