import {
  BACKGROUND_SYNC_TAG,
  BATCH_ENVELOPE_BYTES,
  BATCH_MAX_BYTES,
  BATCH_MAX_RECORDS,
  clockOffsetMs,
  FLUSH_INTERVAL_MS,
  isTransientResponse,
  SNAPSHOT_MIN_INTERVAL_MS,
  type SyncBatchRequest,
} from '@css/shared/sync';
import { uuidv7 } from '@css/shared';
import { z } from 'zod';
import { ApiFailure, currentMe, refreshSession } from '../api/client';
import { offlineDb, type OutboxRow, sealedSchema } from './db';
import { currentDataKey } from './keys';
import {
  apply,
  applyResult,
  counts,
  due,
  markFailed,
  nextDue,
  purge,
  readSecret,
  recoverInterrupted,
  TOO_LARGE,
  toSyncRecord,
  waitingCount,
} from './outbox';
import { application } from '../features/applications/applications-api';
import {
  applySnapshot,
  cursor,
  recordsWithoutDetail,
  META,
  metaString,
  openValue,
  replaceLocations,
  sealValue,
  storeDetail,
} from './snapshot';
import type { Sealed } from './crypto';
import * as photoQueue from './photo-queue';
import { locationsAll, postBatch, pullSnapshot } from './sync-api';

/**
 * The sync engine (docs/architecture/OFFLINE_SYNC.md, outbox pattern and record lifecycle): one
 * flush at a time, started by the app's open, the `online` event, the return to the foreground,
 * a local write, "sync now", a service-worker message and a timer. A flush refreshes an expired
 * token, sends the due records in batches under fresh idempotency keys, keeps the batch on its
 * way in the store so a timed-out batch is replayed byte for byte, applies every result, pulls
 * the data set when it is due, and purges what the server confirmed long enough ago.
 */

export type SyncState = 'idle' | 'syncing' | 'offline' | 'signed_out';

export interface SyncStatus {
  state: SyncState;
  pending: number;
  syncing: number;
  failed: number;
  lastSyncAt: Date | null;
  /** The code of the last failure of a whole flush, for the status screen. */
  lastError: string | null;
}

/** What the engine needs from its surroundings; the tests give it a clock and a scheduler of their own. */
export interface EngineDeps {
  now: () => Date;
  setTimer: (run: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  random: () => number;
  online: () => boolean;
  /** The pause between the retries of an upload's part; the tests give none. */
  sleep?: (ms: number) => Promise<void>;
}

export type FlushReason =
  'open' | 'online' | 'foreground' | 'write' | 'manual' | 'timer' | 'service_worker';

interface InFlight {
  key: string;
  body: SyncBatchRequest;
  uuids: string[];
}

/** The batch on its way as the store keeps it: the body sealed, the key and the ids readable. */
const storedInFlight = z.object({
  key: z.string(),
  uuids: z.array(z.string()),
  body: sealedSchema,
});
type StoredInFlight = z.infer<typeof storedInFlight>;

/** The service worker's word that a sync may run now. */
const flushMessage = z.object({ type: z.literal('flush') });

const DEFAULT_DEPS: EngineDeps = {
  now: () => new Date(),
  setTimer: (run, ms) => setTimeout(run, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  random: Math.random,
  online: () => navigator.onLine,
};

/** How many cached drafts get their answers pulled in one flush. */
const HYDRATE_PER_FLUSH = 20;

const INITIAL: SyncStatus = {
  state: 'idle',
  pending: 0,
  syncing: 0,
  failed: 0,
  lastSyncAt: null,
  lastError: null,
};

export class SyncEngine {
  status: SyncStatus = INITIAL;
  private readonly listeners = new Set<(status: SyncStatus) => void>();
  private current: Promise<void> | null = null;
  /** A flush asked while one runs: it starts right after, so a record written meanwhile goes too. */
  private queued: {
    reason: FlushReason;
    snapshot: boolean;
    promise: Promise<void>;
    start: () => void;
  } | null = null;
  private retryTimer: unknown = null;
  private intervalTimer: unknown = null;
  private cleanups: (() => void)[] = [];
  private started = false;

  constructor(private readonly deps: EngineDeps = DEFAULT_DEPS) {}

  subscribe(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  /** Listens for the triggers and flushes once; `stop` undoes everything. */
  start(): void {
    if (this.started) return;
    this.started = true;
    const online = () => void this.flush('online');
    const visible = () => {
      if (document.visibilityState === 'visible') void this.flush('foreground');
    };
    const message = (event: MessageEvent) => {
      if (flushMessage.safeParse(event.data).success) void this.flush('service_worker');
    };
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', visible);
    const worker = navigator.serviceWorker;
    worker?.addEventListener('message', message);
    this.cleanups = [
      () => window.removeEventListener('online', online),
      () => document.removeEventListener('visibilitychange', visible),
      () => worker?.removeEventListener('message', message),
    ];
    this.scheduleInterval();
    void this.flush('open', { snapshot: true });
  }

  stop(): void {
    this.started = false;
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
    if (this.retryTimer !== null) this.deps.clearTimer(this.retryTimer);
    if (this.intervalTimer !== null) this.deps.clearTimer(this.intervalTimer);
    this.retryTimer = null;
    this.intervalTimer = null;
  }

  /**
   * One flush at a time. A flush asked while one runs starts right after it, so what was written
   * meanwhile goes as well, and its promise settles when that later run ends; several asks
   * during one run fold into one, the strongest request kept. With `snapshot` the data set is
   * pulled even before its interval is up.
   */
  flush(reason: FlushReason, options: { snapshot?: boolean } = {}): Promise<void> {
    const snapshot = options.snapshot === true;
    if (!this.current) return this.begin(reason, snapshot);
    if (this.queued) {
      if (reason === 'manual') this.queued.reason = 'manual';
      this.queued.snapshot ||= snapshot;
      return this.queued.promise;
    }
    let start = () => undefined as void;
    const promise = new Promise<void>((resolve) => {
      start = () => {
        const q = this.queued;
        this.queued = null;
        void this.begin(q?.reason ?? reason, q?.snapshot ?? snapshot).then(resolve, resolve);
      };
    });
    this.queued = { reason, snapshot, promise, start };
    return promise;
  }

  private begin(reason: FlushReason, snapshot: boolean): Promise<void> {
    const run = this.run(reason, { snapshot }).finally(() => {
      this.current = null;
      this.queued?.start();
    });
    this.current = run;
    return run;
  }

  private async run(reason: FlushReason, options: { snapshot?: boolean }): Promise<void> {
    if (!this.deps.online()) {
      await this.publish({ state: 'offline' }, true);
      return;
    }
    // every flush starts from a live session: a cold start refreshes first; only a refresh the
    // server refused means the session is gone, a refresh that failed on the way is tried later
    if (!currentMe()) {
      let pair;
      try {
        pair = await refreshSession();
      } catch (error) {
        await this.publish(
          {
            state: this.deps.online() ? 'idle' : 'offline',
            lastError: error instanceof ApiFailure ? error.code : 'network',
          },
          true,
        );
        return;
      }
      if (!pair) {
        await this.publish({ state: 'signed_out' }, true);
        return;
      }
    }
    // the store's key could not be opened: nothing can be read to send, and the person is told
    // while records wait, never left with a silent outbox
    if (!currentDataKey()) {
      await this.publish({ state: 'idle', lastError: 'offline.store_unavailable' }, true);
      return;
    }
    await this.publish({ state: 'syncing', lastError: null });
    try {
      const inflight = await this.inFlight();
      await recoverInterrupted(this.deps.now(), new Set(inflight?.uuids ?? []));
      await photoQueue.recoverInterrupted();
      let open = true;
      if (inflight && (await this.inFlightDue(inflight))) open = await this.send(inflight);
      if (open) for (const batch of await this.batches()) if (!(await this.send(batch))) break;
      // the text first, then the photos of the records the server knows
      await photoQueue.uploadDue(this.deps.now, {
        random: this.deps.random,
        ...(this.deps.sleep ? { sleep: this.deps.sleep } : {}),
      });
      await this.snapshotIfDue(options.snapshot === true || reason === 'manual');
      await this.hydrateRecords();
      await purge(this.deps.now());
      await this.publish({ state: 'idle', lastSyncAt: this.deps.now() }, true);
    } catch (error) {
      if (error instanceof ApiFailure && error.status === 401) {
        await this.publish({ state: 'signed_out', lastError: error.code }, true);
        return;
      }
      if (error instanceof ApiFailure && [403, 426].includes(error.status)) {
        await this.publish({ state: 'idle', lastError: error.code }, true);
        return;
      }
      await this.publish(
        {
          state: this.deps.online() ? 'idle' : 'offline',
          lastError: error instanceof ApiFailure ? error.code : 'network',
        },
        true,
      );
    } finally {
      await this.scheduleRetry();
      // not awaited: the flush must end whatever the worker's state
      void this.askBackgroundSync();
    }
  }

  /**
   * Asks the browser for a one-shot sync while records wait, where it offers one (Android
   * Chrome); the worker then wakes an open window to flush. Elsewhere, and always on an iPhone,
   * the foreground triggers are the whole mechanism. The registration is read, never awaited
   * through `ready`, which settles only once a worker is active (never in a development build).
   */
  private async askBackgroundSync(): Promise<void> {
    try {
      if (!currentDataKey() || (await waitingCount()) === 0) return;
      const registration = await navigator.serviceWorker?.getRegistration();
      const sync = (registration as { sync?: { register(tag: string): Promise<void> } } | undefined)
        ?.sync;
      await sync?.register(BACKGROUND_SYNC_TAG);
    } catch {
      // no Background Sync in this browser: the next open or return of the network flushes
    }
  }

  private async inFlight(): Promise<InFlight | null> {
    const row = await offlineDb().meta.get(META.inflight);
    const stored = storedInFlight.safeParse(row?.value);
    if (!stored.success) return null;
    return {
      key: stored.data.key,
      uuids: stored.data.uuids,
      body: await openValue(stored.data.body as Sealed),
    };
  }

  /** Writes the batch on its way with its body sealed; the same JSON comes back for the replay. */
  private async keepInFlight(batch: InFlight): Promise<void> {
    const stored: StoredInFlight = {
      key: batch.key,
      uuids: batch.uuids,
      body: await sealValue(batch.body),
    };
    await offlineDb().meta.put({ key: META.inflight, value: stored });
  }

  /**
   * Whether the batch on its way is to be sent again now: its records wait for their retry time
   * after a transient failure. A batch whose records are all gone is dropped.
   */
  private async inFlightDue(inflight: InFlight): Promise<boolean> {
    const db = offlineDb();
    const rows = (await db.outbox.bulkGet(inflight.uuids)).filter(
      (r): r is OutboxRow => r !== undefined,
    );
    if (!rows.length) {
      await db.meta.delete(META.inflight);
      return false;
    }
    if (!rows.some((r) => r.state === 'syncing' || r.state === 'pending')) {
      // every record of it failed for good or was removed: an edit of one goes as a new version
      await db.meta.delete(META.inflight);
      return false;
    }
    const now = this.deps.now().getTime();
    return rows.some(
      (r) =>
        r.state === 'syncing' ||
        (r.state === 'pending' && (r.nextRetryAt === null || r.nextRetryAt.getTime() <= now)),
    );
  }

  /** The due records cut into batches; a record too large for any batch fails on its own. */
  private async batches(): Promise<InFlight[]> {
    const rows = await due(this.deps.now());
    const result: InFlight[] = [];
    let current: { records: SyncBatchRequest['records']; uuids: string[]; bytes: number } | null =
      null;
    const waiting = await waitingCount();
    let placed = 0;
    const close = () => {
      if (current && current.records.length) {
        placed += current.records.length;
        result.push({
          key: uuidv7(),
          uuids: current.uuids,
          body: {
            deviceTime: this.deps.now().toISOString(),
            records: current.records,
            pendingAfter: Math.max(0, waiting - placed),
          },
        });
      }
      current = null;
    };
    for (const row of rows) {
      const record = toSyncRecord(row, await readSecret(row));
      const bytes = new TextEncoder().encode(JSON.stringify(record)).length;
      if (bytes > BATCH_MAX_BYTES - BATCH_ENVELOPE_BYTES) {
        await markFailed([row.clientUuid], TOO_LARGE, this.deps.now());
        continue;
      }
      if (
        current &&
        (current.records.length >= BATCH_MAX_RECORDS ||
          current.bytes + bytes > BATCH_MAX_BYTES - BATCH_ENVELOPE_BYTES)
      )
        close();
      current ??= { records: [], uuids: [], bytes: 0 };
      current.records.push(record);
      current.uuids.push(row.clientUuid);
      current.bytes += bytes;
    }
    close();
    return result;
  }

  /**
   * Sends one batch. The batch is written to the store first, so a crash or a timeout replays
   * the same bytes under the same key; its records are on their way until the result or a
   * final refusal. False when the batch ended in a transient failure, so nothing follows it.
   */
  private async send(batch: InFlight): Promise<boolean> {
    const db = offlineDb();
    const now = this.deps.now();
    await this.keepInFlight(batch);
    const pendingRows = (await db.outbox.bulkGet(batch.uuids)).filter(
      (r): r is OutboxRow => r !== undefined && r.state === 'pending',
    );
    await apply(
      pendingRows.map((r) => r.clientUuid),
      { type: 'flush', at: now },
    );
    await this.publish({ state: 'syncing' });
    try {
      const response = await postBatch(batch.body, batch.key);
      const at = this.deps.now();
      await db.meta.put({
        key: META.clockOffsetMs,
        value: clockOffsetMs(new Date(batch.body.deviceTime), new Date(response.serverTime)),
      });
      for (const result of response.results) await applyResult(result, at);
      await db.meta.delete(META.inflight);
      return true;
    } catch (error) {
      const at = this.deps.now();
      if (error instanceof ApiFailure && [401, 403, 426].includes(error.status)) {
        // the session is gone, the person may not act now, or the app is out of date: nothing
        // is wrong with the records, so they wait again and the flush stops with the reason
        await apply(batch.uuids, { type: 'interrupted', at });
        throw error;
      }
      if (!(error instanceof ApiFailure) || isTransientResponse(error.status, error.code)) {
        // the batch stays in the store: the next flush sends the same bytes under the same key
        await apply(batch.uuids, {
          type: 'transient',
          at,
          status: error instanceof ApiFailure ? error.status : 0,
          retryAfterSeconds: error instanceof ApiFailure ? error.retryAfter : undefined,
          random: this.deps.random,
        });
        return false;
      }
      await markFailed(batch.uuids, error.code, at);
      await db.meta.delete(META.inflight);
      return true;
    }
  }

  private async snapshotIfDue(force: boolean): Promise<void> {
    const pulledAt = await metaString(META.pulledAt);
    const now = this.deps.now();
    if (
      !force &&
      pulledAt &&
      now.getTime() - new Date(pulledAt).getTime() < SNAPSHOT_MIN_INTERVAL_MS
    )
      return;
    let where = await cursor();
    let view = await pullSnapshot(where.since, where.afterId);
    await applySnapshot(view, this.deps.now());
    while (view.hasMore) {
      where = await cursor();
      view = await pullSnapshot(where.since, where.afterId);
      await applySnapshot(view, this.deps.now());
    }
    if ((await metaString(META.locationsVersion)) !== view.locationsVersion)
      await replaceLocations(await locationsAll(), view.locationsVersion);
  }

  /** The answers of the cached records, pulled a few at a time, so they open and edit without network. */
  private async hydrateRecords(): Promise<void> {
    for (const id of await recordsWithoutDetail(HYDRATE_PER_FLUSH)) {
      // a record the server no longer gives stays as its summary; the next data set settles it
      const record = await application(id).catch(() => null);
      if (!record) continue;
      const { form, ...detail } = record.data;
      void form;
      await storeDetail(detail, record.meta.etag ?? '');
    }
  }

  private async scheduleRetry(): Promise<void> {
    if (this.retryTimer !== null) this.deps.clearTimer(this.retryTimer);
    this.retryTimer = null;
    if (!this.started) return;
    const texts = await nextDue();
    const photos = await photoQueue.nextDue();
    const at =
      texts && photos ? new Date(Math.min(texts.getTime(), photos.getTime())) : (texts ?? photos);
    if (!at) return;
    const wait = Math.max(0, at.getTime() - this.deps.now().getTime());
    // a record due now without a timer waits for the next trigger: the flush just ran
    if (wait === 0) return;
    this.retryTimer = this.deps.setTimer(() => {
      this.retryTimer = null;
      void this.flush('timer');
    }, wait);
  }

  private scheduleInterval(): void {
    this.intervalTimer = this.deps.setTimer(() => {
      this.intervalTimer = null;
      void this.flush('timer', { snapshot: true }).finally(() => {
        if (this.started) this.scheduleInterval();
      });
    }, FLUSH_INTERVAL_MS);
  }

  private async publish(patch: Partial<SyncStatus>, tally = false): Promise<void> {
    const tallies = tally && currentDataKey() ? await counts().catch(() => null) : null;
    this.status = { ...this.status, ...(tallies ?? {}), ...patch };
    for (const listener of this.listeners) listener(this.status);
  }
}

/** The one engine of the page. */
export const syncEngine = new SyncEngine();
