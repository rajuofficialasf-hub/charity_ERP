import { uuidv7 } from '@css/shared';
import Dexie from 'dexie';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError, ME, pair } from '../../test/auth';
import { EMPTY_SNAPSHOT } from '../../test/msw/handlers';
import { server } from '../../test/msw/server';
import { login, resetClientForTests } from '../lib/api';
import { closeOfflineDb, OFFLINE_DB_NAME, offlineDb, type OutboxRow } from './db';
import { currentDataKey, forgetKeys } from './keys';
import { apply, applyResult, enqueue, readSecret } from './outbox';
import { META } from './snapshot';
import { type EngineDeps, SyncEngine, type SyncStatus } from './sync-engine';

const SESSION = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4b01';
const PROJECT = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4c01';
const VERSION = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4d01';
const T0 = new Date('2026-10-31T10:00:00Z');
const tokenOf = (sid: string) => `h.${btoa(JSON.stringify({ sid }))}.s`;
const volunteer = { ...ME, kind: 'volunteer' as const };

/** A clock and a scheduler the test moves by hand. */
function fakeDeps() {
  let now = T0;
  let online = true;
  const timers: { run: () => void; at: number; handle: number }[] = [];
  let handles = 0;
  const deps: EngineDeps = {
    now: () => now,
    setTimer: (run, ms) => {
      const handle = (handles += 1);
      timers.push({ run, at: now.getTime() + ms, handle });
      return handle;
    },
    clearTimer: (handle) => {
      const index = timers.findIndex((t) => t.handle === handle);
      if (index >= 0) timers.splice(index, 1);
    },
    random: () => 0.5,
    online: () => online,
  };
  return {
    deps,
    timers,
    setOnline(value: boolean) {
      online = value;
    },
    advance(ms: number) {
      now = new Date(now.getTime() + ms);
    },
    /** Fires every timer due by now, as the browser would. */
    async fireDue() {
      const due = timers.filter((t) => t.at <= now.getTime());
      for (const t of due) {
        timers.splice(timers.indexOf(t), 1);
        t.run();
      }
      await Promise.resolve();
    },
  };
}

interface Post {
  key: string | null;
  body: { deviceTime: string; records: { clientUuid: string; kind: string }[] };
}

/** A batch handler that accepts every record, and remembers what it got. */
function acceptAll(posts: Post[], results: (r: { clientUuid: string }) => object = () => ({})) {
  return http.post('*/api/v1/sync/batch', async ({ request }) => {
    const body = (await request.json()) as Post['body'];
    posts.push({ key: request.headers.get('idempotency-key'), body });
    return HttpResponse.json({
      data: {
        serverTime: '2026-10-31T10:00:02.000Z',
        results: body.records.map((r) => ({
          clientUuid: r.clientUuid,
          result: 'synced',
          serverId: uuidv7(),
          status: r.kind === 'application_submit' ? 'submitted' : 'draft',
          ...results(r),
        })),
      },
      meta: {},
    });
  });
}

const draft = (now: Date, payload: Record<string, unknown> = { answers: [] }) =>
  enqueue({ kind: 'application_draft', projectId: PROJECT, formVersionId: VERSION, payload, now });
const row = (id: string) => offlineDb().outbox.get(id) as Promise<OutboxRow>;

beforeEach(async () => {
  resetClientForTests();
  document.cookie = 'css_csrf=nonce.mac; path=/';
  server.use(
    http.post('*/api/v1/auth/login', () =>
      HttpResponse.json({ data: pair(volunteer, tokenOf(SESSION)), meta: {} }),
    ),
  );
  await login('a', 'b');
  expect(currentDataKey()).not.toBeNull();
});
afterEach(async () => {
  document.cookie = 'css_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  forgetKeys();
  closeOfflineDb();
  await Dexie.delete(OFFLINE_DB_NAME);
});

describe('the sync engine', () => {
  it('flushes when the network returns and marks the record synced with its server id', async () => {
    const posts: Post[] = [];
    server.use(acceptAll(posts));
    const world = fakeDeps();
    const engine = new SyncEngine(world.deps);
    const statuses: SyncStatus[] = [];
    engine.subscribe((s) => statuses.push(s));
    world.setOnline(false);
    const record = await draft(T0);
    engine.start();
    await vi.waitFor(() => expect(statuses.at(-1)?.state).toBe('offline'));
    world.setOnline(true);
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(statuses.at(-1)?.state).toBe('idle'));
    expect(await row(record.clientUuid)).toMatchObject({
      state: 'synced',
      serverId: expect.any(String),
    });
    expect(posts).toHaveLength(1);
    expect(posts[0]!.body.deviceTime).toBe(T0.toISOString());
    expect(statuses.at(-1)).toMatchObject({ state: 'idle', pending: 0, lastSyncAt: T0 });
    expect(await offlineDb().meta.get(META.clockOffsetMs)).toEqual({
      key: META.clockOffsetMs,
      value: 2_000,
    });
    expect(await offlineDb().meta.get(META.inflight)).toBeUndefined();
    // the data set was pulled and the locations master taken with its version
    expect(await offlineDb().meta.get(META.locationsVersion)).toEqual({
      key: META.locationsVersion,
      value: EMPTY_SNAPSHOT.locationsVersion,
    });
    engine.stop();
    posts.length = 0;
    await draft(T0);
    window.dispatchEvent(new Event('online'));
    await new Promise((r) => setTimeout(r, 30));
    expect(posts).toHaveLength(0);
    expect(world.timers).toHaveLength(0);
  });

  it('keeps a record pending after a network failure and climbs the retry ladder', async () => {
    server.use(http.post('*/api/v1/sync/batch', () => HttpResponse.error()));
    const world = fakeDeps();
    const engine = new SyncEngine(world.deps);
    const record = await draft(T0);
    engine.start();
    await vi.waitFor(async () => expect((await row(record.clientUuid)).attempts).toBe(1));
    expect(await row(record.clientUuid)).toMatchObject({
      state: 'pending',
      nextRetryAt: new Date(T0.getTime() + 30_000),
    });
    // the batch stays in the store for the replay, its body sealed
    const kept = await offlineDb().meta.get(META.inflight);
    expect(kept).toBeDefined();
    expect(
      JSON.stringify(kept, (_k, v: unknown) => (v instanceof ArrayBuffer ? '<bytes>' : v)),
    ).not.toContain('answers');
    await vi.waitFor(() =>
      expect(world.timers.some((t) => t.at === T0.getTime() + 30_000)).toBe(true),
    );
    world.advance(30_000);
    await world.fireDue();
    await vi.waitFor(async () => expect((await row(record.clientUuid)).attempts).toBe(2));
    expect((await row(record.clientUuid)).nextRetryAt).toEqual(
      new Date(T0.getTime() + 30_000 + 120_000),
    );
    engine.stop();
  });

  it('waits as long as the server says, and replays the same bytes under the same key', async () => {
    const posts: Post[] = [];
    let first = true;
    server.use(
      http.post('*/api/v1/sync/batch', async ({ request }) => {
        const body = (await request.json()) as Post['body'];
        posts.push({ key: request.headers.get('idempotency-key'), body });
        if (first) {
          first = false;
          return apiError(409, 'sync.batch_in_progress', 'wait', { 'Retry-After': '5' });
        }
        return HttpResponse.json({
          data: {
            serverTime: T0.toISOString(),
            results: body.records.map((r) => ({
              clientUuid: r.clientUuid,
              result: 'synced',
              serverId: uuidv7(),
              status: 'draft',
            })),
          },
          meta: {},
        });
      }),
    );
    const world = fakeDeps();
    const engine = new SyncEngine(world.deps);
    const record = await draft(T0, {
      answers: [{ fieldKey: 'q', value: { t: 'short_text', v: 'এক' } }],
    });
    await engine.flush('manual');
    expect((await row(record.clientUuid)).nextRetryAt).toEqual(new Date(T0.getTime() + 5_000));
    // the person edits meanwhile: the edit waits as the next version
    await enqueue({
      clientUuid: record.clientUuid,
      kind: 'application_draft',
      projectId: PROJECT,
      formVersionId: VERSION,
      payload: { answers: [{ fieldKey: 'q', value: { t: 'short_text', v: 'দুই' } }] },
      now: new Date(T0.getTime() + 1_000),
    });
    // before the wait is over nothing goes; after it the same bytes go under the same key, and
    // the edit follows in a batch of its own
    await engine.flush('write');
    expect(posts).toHaveLength(1);
    world.advance(5_000);
    await engine.flush('manual');
    expect(posts).toHaveLength(3);
    expect(posts[1]!.key).toBe(posts[0]!.key);
    expect(posts[1]!.body).toEqual(posts[0]!.body);
    expect(posts[2]!.body.records.map((r) => r.kind)).toEqual(['application_update']);
    expect((await row(record.clientUuid)).state).toBe('synced');
    // the edit follows as an update aimed at the server id
    const follow = (await offlineDb().outbox.toArray()).find(
      (r) => r.clientUuid !== record.clientUuid && r.kind === 'application_update',
    );
    expect(follow).toBeDefined();
    expect(await readSecret(follow!)).toMatchObject({
      payload: { answers: [{ fieldKey: 'q', value: { t: 'short_text', v: 'দুই' } }] },
    });
    engine.stop();
  });

  it('fails a record for good on a permanent refusal and sets no timer', async () => {
    server.use(http.post('*/api/v1/sync/batch', () => apiError(422, 'validation.failed', 'bad')));
    const world = fakeDeps();
    const engine = new SyncEngine(world.deps);
    const record = await draft(T0);
    engine.start();
    await vi.waitFor(async () => expect((await row(record.clientUuid)).state).toBe('failed'));
    expect((await row(record.clientUuid)).failureCode).toBe('validation.failed');
    // only the interval timer remains
    expect(world.timers).toHaveLength(1);
    expect(await offlineDb().meta.get(META.inflight)).toBeUndefined();
    engine.stop();
  });

  it('sends a submit after its draft in the same batch, and cuts many records into batches', async () => {
    const posts: Post[] = [];
    server.use(acceptAll(posts));
    const world = fakeDeps();
    const engine = new SyncEngine(world.deps);
    const first = await draft(T0);
    const send = await enqueue({
      kind: 'application_submit',
      projectId: PROJECT,
      formVersionId: VERSION,
      payload: {},
      dependencies: [first.clientUuid],
      now: new Date(T0.getTime() + 1_000),
    });
    for (let i = 0; i < 58; i += 1) await draft(new Date(T0.getTime() + 2_000 + i));
    await engine.flush('manual');
    expect(posts.map((p) => p.body.records.length)).toEqual([50, 10]);
    expect(posts[0]!.body.records.slice(0, 2).map((r) => r.clientUuid)).toEqual([
      first.clientUuid,
      send.clientUuid,
    ]);
    expect(new Set(posts.map((p) => p.key)).size).toBe(2);
    expect((await row(send.clientUuid)).state).toBe('synced');
  });

  it('refuses a record larger than a batch on the phone, without a request', async () => {
    const posts: Post[] = [];
    server.use(acceptAll(posts));
    const world = fakeDeps();
    const engine = new SyncEngine(world.deps);
    const record = await draft(T0, { answers: [{ fieldKey: 'q', value: 'x'.repeat(1_100_000) }] });
    await engine.flush('manual');
    expect(posts).toHaveLength(0);
    expect(await row(record.clientUuid)).toMatchObject({
      state: 'failed',
      failureCode: 'sync.batch_too_large',
    });
  });

  it('keeps a record the office must check as synced, with the reason', async () => {
    const posts: Post[] = [];
    server.use(
      acceptAll(posts, () => ({
        result: 'needs_verification',
        code: 'late_sync',
        status: 'needs_verification',
      })),
    );
    const world = fakeDeps();
    const engine = new SyncEngine(world.deps);
    const record = await draft(T0);
    await engine.flush('manual');
    expect(await row(record.clientUuid)).toMatchObject({
      state: 'synced',
      verificationReason: 'late_sync',
    });
  });

  it('pulls the data set, then again only after its interval or on request', async () => {
    let pulls = 0;
    server.use(
      acceptAll([]),
      http.get('*/api/v1/sync/snapshot', () => {
        pulls += 1;
        return HttpResponse.json({ data: EMPTY_SNAPSHOT, meta: {} });
      }),
    );
    const world = fakeDeps();
    const engine = new SyncEngine(world.deps);
    await engine.flush('open', { snapshot: true });
    expect(pulls).toBe(1);
    world.advance(60_000);
    await engine.flush('write');
    expect(pulls).toBe(1);
    await engine.flush('manual');
    expect(pulls).toBe(2);
    world.advance(16 * 60_000);
    await engine.flush('write');
    expect(pulls).toBe(3);
  });

  it('purges a confirmed record after seven days during a flush', async () => {
    const serverId = uuidv7();
    server.use(
      acceptAll([]),
      // the server still lists the application: the record is confirmed
      http.get('*/api/v1/sync/snapshot', () =>
        HttpResponse.json({ data: { ...EMPTY_SNAPSHOT, applicationIds: [serverId] }, meta: {} }),
      ),
    );
    const world = fakeDeps();
    const engine = new SyncEngine(world.deps);
    const record = await draft(T0);
    await apply([record.clientUuid], { type: 'flush', at: T0 });
    await applyResult(
      { clientUuid: record.clientUuid, result: 'synced', serverId, status: 'draft' },
      T0,
    );
    await offlineDb().applications.put({
      id: serverId,
      projectId: PROJECT,
      status: 'draft',
      updatedAt: T0.toISOString(),
      iv: new Uint8Array(12),
      data: new ArrayBuffer(0),
    });
    world.advance(8 * 86_400_000);
    await engine.flush('manual');
    expect(await offlineDb().outbox.get(record.clientUuid)).toBeUndefined();
  });

  it('keeps a request for the data set made while a flush runs', async () => {
    let pulls = 0;
    let release: () => void = () => {};
    server.use(
      http.post('*/api/v1/sync/batch', async ({ request }) => {
        await new Promise<void>((r) => (release = r));
        const body = (await request.json()) as Post['body'];
        return HttpResponse.json({
          data: {
            serverTime: T0.toISOString(),
            results: body.records.map((r) => ({
              clientUuid: r.clientUuid,
              result: 'synced',
              serverId: uuidv7(),
              status: 'draft',
            })),
          },
          meta: {},
        });
      }),
      http.get('*/api/v1/sync/snapshot', () => {
        pulls += 1;
        return HttpResponse.json({ data: EMPTY_SNAPSHOT, meta: {} });
      }),
    );
    const world = fakeDeps();
    const engine = new SyncEngine(world.deps);
    await offlineDb().meta.put({ key: META.pulledAt, value: T0.toISOString() });
    await draft(T0);
    const first = engine.flush('write');
    await new Promise((r) => setTimeout(r, 20));
    const asked = engine.flush('manual', { snapshot: true });
    expect(asked).toBe(first);
    release();
    await first;
    await vi.waitFor(() => expect(pulls).toBe(1));
  });

  it('leaves the records waiting when the app is out of date or the person may not act now', async () => {
    server.use(
      http.post('*/api/v1/sync/batch', () => apiError(426, 'client.upgrade_required', 'old')),
    );
    const world = fakeDeps();
    const engine = new SyncEngine(world.deps);
    const statuses: SyncStatus[] = [];
    engine.subscribe((s) => statuses.push(s));
    const record = await draft(T0);
    await engine.flush('manual');
    expect(statuses.at(-1)).toMatchObject({ state: 'idle', lastError: 'client.upgrade_required' });
    expect(await offlineDb().outbox.get(record.clientUuid)).toMatchObject({ state: 'pending' });
  });

  it('does not call the session lost when the refresh itself failed on the way', async () => {
    resetClientForTests();
    server.use(http.post('*/api/v1/auth/refresh', () => HttpResponse.error()));
    const world = fakeDeps();
    const engine = new SyncEngine(world.deps);
    const statuses: SyncStatus[] = [];
    engine.subscribe((s) => statuses.push(s));
    await engine.flush('manual');
    expect(statuses.at(-1)).toMatchObject({ state: 'idle', lastError: 'network' });
  });

  it('sends no later batch after one failed on the way, so a dependant never meets a missing parent', async () => {
    const posts: Post[] = [];
    server.use(
      http.post('*/api/v1/sync/batch', async ({ request }) => {
        posts.push({
          key: request.headers.get('idempotency-key'),
          body: (await request.json()) as Post['body'],
        });
        return HttpResponse.error();
      }),
    );
    const world = fakeDeps();
    const engine = new SyncEngine(world.deps);
    for (let i = 0; i < 51; i += 1) await draft(new Date(T0.getTime() + i));
    await engine.flush('manual');
    expect(posts).toHaveLength(1);
    expect(posts[0]!.body.records).toHaveLength(50);
    expect((posts[0]!.body as { pendingAfter?: number }).pendingAfter).toBe(1);
  });

  it('stops when the session has expired and leaves the outbox waiting', async () => {
    server.use(
      http.post('*/api/v1/sync/batch', () => apiError(401, 'auth.token_expired', 'expired')),
      http.post('*/api/v1/auth/refresh', () => apiError(401, 'auth.refresh_invalid', 'again')),
    );
    const world = fakeDeps();
    const engine = new SyncEngine(world.deps);
    const statuses: SyncStatus[] = [];
    engine.subscribe((s) => statuses.push(s));
    const record = await draft(T0);
    await engine.flush('manual');
    expect(statuses.at(-1)?.state).toBe('signed_out');
    expect(await offlineDb().outbox.get(record.clientUuid)).toMatchObject({ state: 'pending' });
    expect(await offlineDb().meta.get(META.inflight)).toBeDefined();
  });
});
