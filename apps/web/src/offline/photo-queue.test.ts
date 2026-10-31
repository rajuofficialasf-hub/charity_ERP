import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeOfflineDb, OFFLINE_DB_NAME, offlineDb } from './db';
import { afterSignIn, forgetKeys } from './keys';
import { enqueue } from './outbox';
import {
  add,
  freeSpace,
  markPending,
  PHOTO_BUDGET_FULL,
  read,
  usage,
  waitingByRecord,
} from './photo-queue';

const USER = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const SESSION = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4b01';
const RECORD = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4e01';
const JPEG = new Uint8Array([
  0xff,
  0xd8,
  0xff,
  0xe0,
  ...Array.from({ length: 2_000 }, (_, i) => i % 251),
]);
const facts = {
  name: 'house.jpg',
  mime: 'image/jpeg',
  source: 'camera' as const,
  capturedAt: '2026-10-31T09:00:00.000Z',
  gps: { lat: 23.81, lng: 90.41 },
};

beforeEach(async () => {
  await afterSignIn({ sessionId: SESSION, userId: USER, deviceKey: 'k'.repeat(43) });
});
afterEach(async () => {
  forgetKeys();
  closeOfflineDb();
  await Dexie.delete(OFFLINE_DB_NAME);
  vi.restoreAllMocks();
});

describe('the photo queue', () => {
  it('keeps a photo sealed: neither the picture nor its position is readable in the store', async () => {
    const id = await add({
      clientUuid: RECORD,
      slot: 'house_photo',
      blob: new Blob([JPEG], { type: 'image/jpeg' }),
      facts,
    });
    const row = (await offlineDb().photos.get(id))!;
    const stored = new Uint8Array(row.data);
    expect([...stored.slice(0, 4)]).not.toEqual([0xff, 0xd8, 0xff, 0xe0]);
    expect(new TextDecoder().decode(row.data)).not.toContain('23.81');
    expect(JSON.stringify({ ...row, data: undefined, iv: undefined })).not.toContain('23.81');
    const back = (await read(id))!;
    expect(new Uint8Array(await back.blob.arrayBuffer())).toEqual(JPEG);
    expect(back.facts).toEqual(facts);
    expect(await waitingByRecord()).toEqual(new Map([[RECORD, 1]]));
  });

  it('warns at four fifths of the budget and refuses at the top', async () => {
    const budget = 10_000;
    const photo = (size: number) => new Blob([new Uint8Array(size)], { type: 'image/jpeg' });
    await add({ clientUuid: RECORD, slot: 'a', blob: photo(5_000), facts, budget });
    expect((await usage(budget)).level).toBe('ok');
    await add({ clientUuid: RECORD, slot: 'b', blob: photo(3_500), facts, budget });
    expect(await usage(budget)).toEqual({ usedBytes: 8_500, budgetBytes: budget, level: 'warn' });
    await expect(
      add({ clientUuid: RECORD, slot: 'c', blob: photo(2_000), facts, budget }),
    ).rejects.toThrow(PHOTO_BUDGET_FULL);
    // the space of a photo the server holds can be freed; a waiting one never goes by itself
    const rows = await offlineDb().photos.toArray();
    await offlineDb().photos.update(rows[0]!.id, { state: 'uploaded' });
    expect(await freeSpace()).toBe(5_000);
    expect((await usage(budget)).usedBytes).toBe(3_500);
  });

  it('marks the answers that name a waiting photo as pending slots', async () => {
    const id = await add({
      clientUuid: RECORD,
      slot: 'house_photo',
      blob: new Blob([JPEG], { type: 'image/jpeg' }),
      facts,
    });
    const marked = await markPending([
      { fieldKey: 'note', repeatIndex: 0, value: { t: 'long_text', v: 'x' } },
      { fieldKey: 'house_photo', repeatIndex: 0, value: { t: 'photo', v: [id] } },
      {
        fieldKey: 'other_photo',
        repeatIndex: 0,
        value: { t: 'photo', v: ['01900000-0000-7000-8000-0000000000f1'] },
      },
    ]);
    expect(marked[0]).toEqual({
      fieldKey: 'note',
      repeatIndex: 0,
      value: { t: 'long_text', v: 'x' },
    });
    expect(marked[1]).toEqual({
      fieldKey: 'house_photo',
      repeatIndex: 0,
      value: { pendingPhoto: true, slot: 'house_photo' },
    });
    expect(marked[2]).toMatchObject({ value: { t: 'photo' } });
  });

  it('names the server’s file for an uploaded photo and leaves other files alone', async () => {
    const id = await add({
      clientUuid: RECORD,
      slot: 'house_photo',
      blob: new Blob([JPEG], { type: 'image/jpeg' }),
      facts,
    });
    await offlineDb().photos.update(id, {
      state: 'uploaded',
      fileId: '01900000-0000-7000-8000-0000000000f9',
    });
    const marked = await markPending([
      { fieldKey: 'house_photo', repeatIndex: 0, value: { t: 'photo', v: [id] } },
    ]);
    expect(marked[0]).toEqual({
      fieldKey: 'house_photo',
      repeatIndex: 0,
      value: { t: 'photo', v: ['01900000-0000-7000-8000-0000000000f9'] },
    });
  });

  it('lets a photo left on its way by a closed app wait again', async () => {
    const id = await add({ clientUuid: RECORD, slot: 'a', blob: new Blob([JPEG]), facts });
    await offlineDb().photos.update(id, { state: 'uploading' });
    const { recoverInterrupted } = await import('./photo-queue');
    await recoverInterrupted();
    expect((await offlineDb().photos.get(id))?.state).toBe('pending');
  });

  it('climbs the retry ladder on a failure on the way, fails for good on a refusal, and gives up after seven days', async () => {
    const { http, HttpResponse } = await import('msw');
    const { server } = await import('../../test/msw/server');
    const { apiError, ME, pair, sessionToken } = await import('../../test/auth');
    const { login, resetClientForTests } = await import('../lib/api');
    const { uploadDue } = await import('./photo-queue');
    resetClientForTests();
    document.cookie = 'css_csrf=nonce.mac; path=/';
    server.use(
      http.post('*/api/v1/auth/login', () =>
        HttpResponse.json({ data: pair({ ...ME, kind: 'volunteer' }, sessionToken()), meta: {} }),
      ),
    );
    await login('a', 'b');
    const T0 = new Date('2026-10-31T10:00:00Z');
    let now = T0;
    const record = await enqueue({
      clientUuid: RECORD,
      kind: 'application_draft',
      projectId: 'p',
      formVersionId: 'v',
      payload: { answers: [] },
      now: T0,
    });
    await offlineDb().outbox.update(record.clientUuid, { state: 'synced', serverId: RECORD });
    const id = await add({ clientUuid: RECORD, slot: 'a', blob: new Blob([JPEG]), facts });
    server.use(
      http.post('*/api/v1/upload-sessions', () =>
        apiError(503, 'server.busy', 'busy', { 'Retry-After': '120' }),
      ),
    );
    await uploadDue(() => now, { sleep: async () => undefined, random: () => 0.5 });
    expect(await offlineDb().photos.get(id)).toMatchObject({
      state: 'pending',
      attempts: 1,
      nextRetryAt: new Date(T0.getTime() + 120_000),
    });
    now = new Date(T0.getTime() + 121_000);
    server.use(
      http.post('*/api/v1/upload-sessions', () => apiError(422, 'file.type_not_allowed', 'no')),
    );
    await uploadDue(() => now, { sleep: async () => undefined });
    expect(await offlineDb().photos.get(id)).toMatchObject({
      state: 'failed',
      failureCode: 'file.type_not_allowed',
    });
    // eight days later the person retries, the network fails again: the photo gives up
    const { retryNow } = await import('./photo-queue');
    await retryNow(id);
    now = new Date(T0.getTime() + 8 * 86_400_000);
    server.use(http.post('*/api/v1/upload-sessions', () => HttpResponse.error()));
    await uploadDue(() => now, { sleep: async () => undefined });
    expect(await offlineDb().photos.get(id)).toMatchObject({
      state: 'failed',
      failureCode: 'retry_exhausted',
    });
    document.cookie = 'css_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  }, 20_000);

  it('goes with the record it belongs to when the record is removed', async () => {
    await enqueue({
      clientUuid: RECORD,
      kind: 'application_draft',
      projectId: 'p',
      formVersionId: 'v',
      payload: { answers: [] },
    });
    await add({ clientUuid: RECORD, slot: 'a', blob: new Blob([JPEG]), facts });
    const { remove } = await import('./outbox');
    await remove(RECORD);
    expect(await offlineDb().photos.count()).toBe(0);
  });
});
