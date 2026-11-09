import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeOfflineDb, OFFLINE_DB_NAME, offlineDb } from './db';
import { afterSignIn, forgetKeys } from './keys';
import {
  apply,
  applyResult,
  DEPENDENCY_FAILED,
  due,
  enqueue,
  markFailed,
  nextDue,
  purge,
  readSecret,
  remove,
  retryNow,
  toSyncRecord,
} from './outbox';
import { META } from './snapshot';

const USER = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const SESSION = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4b01';
const PROJECT = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4c01';
const VERSION = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4d01';
const SERVER_ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4e01';
const T0 = new Date('2026-10-31T10:00:00Z');
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1_000);
const answers = (village: string) => ({
  answers: [{ fieldKey: 'q_village', value: { t: 'short_text', v: village } }],
});
const draft = (over: Partial<Parameters<typeof enqueue>[0]> = {}) =>
  enqueue({
    kind: 'application_draft',
    projectId: PROJECT,
    formVersionId: VERSION,
    payload: answers('নমুনা গ্রাম'),
    now: T0,
    ...over,
  });

beforeEach(async () => {
  await afterSignIn({ sessionId: SESSION, userId: USER, deviceKey: 'k'.repeat(43) });
});
afterEach(async () => {
  forgetKeys();
  closeOfflineDb();
  await Dexie.delete(OFFLINE_DB_NAME);
});

describe('the outbox', () => {
  it('keeps a new record waiting with its payload sealed, and a sync record of it', async () => {
    const row = await draft();
    expect(row.state).toBe('pending');
    expect(JSON.stringify({ ...row, data: undefined })).not.toContain('নমুনা গ্রাম');
    const secret = await readSecret(row);
    expect(secret).toEqual({ payload: answers('নমুনা গ্রাম'), baseVersion: null });
    expect(toSyncRecord(row, secret)).toEqual({
      clientUuid: row.clientUuid,
      kind: 'application_draft',
      projectId: PROJECT,
      formVersionId: VERSION,
      payload: answers('নমুনা গ্রাম'),
      clientCreatedAt: T0.toISOString(),
      clientUpdatedAt: T0.toISOString(),
    });
  });

  it('makes a new version of a waiting or failed record, with its retries started over', async () => {
    const row = await draft();
    await apply([row.clientUuid], { type: 'flush', at: at(1) });
    await apply([row.clientUuid], { type: 'transient', at: at(2), status: 0, random: () => 0.5 });
    const edited = await draft({
      clientUuid: row.clientUuid,
      payload: answers('অন্য গ্রাম'),
      now: at(3),
    });
    expect(edited).toMatchObject({ state: 'pending', attempts: 0, nextRetryAt: null });
    expect(await readSecret(edited)).toMatchObject({ payload: answers('অন্য গ্রাম') });
    await markFailed([row.clientUuid], 'validation.failed', at(4));
    await retryNow(row.clientUuid, at(5));
    expect((await offlineDb().outbox.get(row.clientUuid))?.state).toBe('pending');
    await remove(row.clientUuid);
    expect(await offlineDb().outbox.get(row.clientUuid)).toBeUndefined();
  });

  it('keeps an edit of a record on its way as its next version, sent after the result', async () => {
    const row = await draft();
    await apply([row.clientUuid], { type: 'flush', at: at(1) });
    await draft({ clientUuid: row.clientUuid, payload: answers('পরে'), now: at(2) });
    expect((await offlineDb().outbox.get(row.clientUuid))?.state).toBe('syncing');
    await applyResult(
      { clientUuid: row.clientUuid, result: 'synced', serverId: SERVER_ID, status: 'draft' },
      at(3),
    );
    const rows = await offlineDb().outbox.toArray();
    expect(rows).toHaveLength(2);
    const first = rows.find((r) => r.clientUuid === row.clientUuid)!;
    expect(first).toMatchObject({ state: 'synced', serverId: SERVER_ID });
    const follow = rows.find((r) => r.clientUuid !== row.clientUuid)!;
    expect(follow).toMatchObject({
      kind: 'application_update',
      target: SERVER_ID,
      state: 'pending',
      dependencies: [],
    });
    expect(await readSecret(follow)).toMatchObject({ payload: answers('পরে') });
  });

  it('sends records oldest first, a dependant after its parent, and fails one whose parent failed', async () => {
    const first = await draft({ now: at(0) });
    const send = await enqueue({
      kind: 'application_submit',
      projectId: PROJECT,
      formVersionId: VERSION,
      payload: {},
      dependencies: [first.clientUuid],
      now: at(1),
    });
    const later = await draft({ now: at(2) });
    expect((await due(at(10))).map((r) => r.clientUuid)).toEqual([
      first.clientUuid,
      send.clientUuid,
      later.clientUuid,
    ]);
    // the parent is on its way: its dependant waits for a later flush
    await apply([first.clientUuid], { type: 'flush', at: at(3) });
    expect((await due(at(10))).map((r) => r.clientUuid)).toEqual([later.clientUuid]);
    await markFailed([first.clientUuid], 'validation.failed', at(4));
    expect((await due(at(10))).map((r) => r.clientUuid)).toEqual([later.clientUuid]);
    expect(await offlineDb().outbox.get(send.clientUuid)).toMatchObject({
      state: 'failed',
      failureCode: DEPENDENCY_FAILED,
    });
    // a record waiting for its retry time is not due before it
    await apply([later.clientUuid], { type: 'flush', at: at(5) });
    await apply([later.clientUuid], {
      type: 'transient',
      at: at(6),
      status: 503,
      random: () => 0.5,
    });
    expect(await due(at(10))).toEqual([]);
    expect((await due(at(6 + 31))).map((r) => r.clientUuid)).toEqual([later.clientUuid]);
  });

  it('names the parent’s retry time as the next due time while its dependant waits for it', async () => {
    const parent = await draft({ now: at(0) });
    await enqueue({
      kind: 'application_submit',
      projectId: PROJECT,
      formVersionId: VERSION,
      payload: {},
      dependencies: [parent.clientUuid],
      now: at(1),
    });
    await apply([parent.clientUuid], { type: 'flush', at: at(2) });
    await apply([parent.clientUuid], {
      type: 'transient',
      at: at(3),
      status: 503,
      retryAfterSeconds: 30,
      random: () => 0.5,
    });
    expect(await nextDue()).toEqual(at(33));
  });

  it('lets a correction edited on its way go again as a correction', async () => {
    const fill = await enqueue({
      kind: 'field_update',
      projectId: PROJECT,
      formVersionId: VERSION,
      target: SERVER_ID,
      payload: { unlockId: SERVER_ID, value: { t: 'short_text', v: 'এক' } },
      now: at(0),
    });
    await apply([fill.clientUuid], { type: 'flush', at: at(1) });
    await enqueue({
      clientUuid: fill.clientUuid,
      kind: 'field_update',
      projectId: PROJECT,
      formVersionId: VERSION,
      target: SERVER_ID,
      payload: { unlockId: SERVER_ID, value: { t: 'short_text', v: 'দুই' } },
      now: at(2),
    });
    await applyResult({ clientUuid: fill.clientUuid, result: 'synced', status: 'approved' }, at(3));
    const follow = (await offlineDb().outbox.toArray()).find(
      (r) => r.clientUuid !== fill.clientUuid,
    )!;
    expect(follow).toMatchObject({ kind: 'field_update', target: SERVER_ID, state: 'pending' });
    expect(await readSecret(follow)).toMatchObject({
      payload: { unlockId: SERVER_ID, value: { t: 'short_text', v: 'দুই' } },
    });
  });

  it('purges a confirmed record after seven days, but not one with a photo or a dependant waiting', async () => {
    const old = await draft({ now: at(0) });
    const withPhoto = await draft({ now: at(0) });
    const withDependant = await draft({ now: at(0) });
    const young = await draft({ now: at(0) });
    for (const row of [old, withPhoto, withDependant, young]) {
      await apply([row.clientUuid], { type: 'flush', at: at(1) });
      await applyResult(
        {
          clientUuid: row.clientUuid,
          result: 'synced',
          serverId: `${SERVER_ID.slice(0, -1)}${row === young ? '9' : '1'}`,
          status: 'draft',
        },
        row === young ? at(7 * 86_400 - 60) : at(2),
      );
    }
    const db = offlineDb();
    const serverIds = (await db.outbox.toArray()).map((r) => r.serverId!);
    await db.applications.bulkPut(
      serverIds.map((id) => ({
        id,
        projectId: PROJECT,
        status: 'draft',
        updatedAt: T0.toISOString(),
        iv: new Uint8Array(12),
        data: new ArrayBuffer(0),
      })),
    );
    await db.photos.put({
      id: 'p1',
      clientUuid: withPhoto.clientUuid,
      slot: 'q_photo',
      state: 'pending',
      size: 10,
      attempts: 0,
      nextRetryAt: null,
      failureCode: null,
      fileId: null,
      createdAt: T0,
      iv: new Uint8Array(12),
      data: new ArrayBuffer(0),
    });
    await enqueue({
      kind: 'application_submit',
      projectId: PROJECT,
      formVersionId: VERSION,
      payload: {},
      dependencies: [withDependant.clientUuid],
      now: at(3),
    });
    await db.meta.put({ key: META.since, value: 'x' });
    // the purged record's photos go with it; a record with a photo still waiting stays whole
    const { add } = await import('./photo-queue');
    await add({
      clientUuid: old.clientUuid,
      slot: 'q_photo',
      blob: new Blob([new Uint8Array(10)]),
      facts: { name: 'old.jpg', mime: 'image/jpeg', source: 'camera' },
    });
    await db.photos.update(
      (await db.photos.where('clientUuid').equals(old.clientUuid).first())!.id,
      { state: 'uploaded', fileId: SERVER_ID },
    );
    expect(await purge(at(7 * 86_400 + 10))).toBe(1);
    expect(await db.photos.where('clientUuid').equals(old.clientUuid).count()).toBe(0);
    expect(await db.photos.where('clientUuid').equals(withPhoto.clientUuid).count()).toBe(1);
    const left = (await db.outbox.toArray()).map((r) => r.clientUuid).sort();
    expect(left).not.toContain(old.clientUuid);
    expect(left).toEqual(
      expect.arrayContaining([withPhoto.clientUuid, withDependant.clientUuid, young.clientUuid]),
    );
  });
});
