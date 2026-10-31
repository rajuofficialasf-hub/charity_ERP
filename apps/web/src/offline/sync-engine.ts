import {
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
import { ApiFailure, currentMe, refreshSession } from '../lib/api';
import { offlineDb, type OutboxRow } from './db';
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
import { applySnapshot, cursor, META, metaString, replaceLocations } from './snapshot';
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
}

export type FlushReason =
  'open' | 'online' | 'foreground' | 'write' | 'manual' | 'timer' | 'service_worker';

interface InFlight {
  key: string;
  body: SyncBatchRequest;
  uuids: string[];
}

const DEFAULT_DEPS: EngineDeps = {
  now: () => new Date(),
  setTimer: (run, ms) => setTimeout(run, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  random: Math.random,
  online: () => navigator.onLine,
};

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
  private flushing: Promise<void> | null = null;
  private again = false;
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
      if ((event.data as { type?: unknown } | null)?.type === 'flush')
        void this.flush('service_worker');
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
   * One flush; a flush asked while one runs makes the running one go round once more. With
   * `snapshot` the data set is pulled even before its interval is up.
   */
  flush(reason: FlushReason, options: { snapshot?: boolean } = {}): Promise<void> {
    if (this.flushing) {
      this.again = true;
      return this.flushing;
    }
    this.flushing = this.run(reason, options).finally(() => {
      this.flushing = null;
      if (this.again) {
        this.again = false;
        void this.flush('write');
      }
    });
    return this.flushing;
  }

  private async run(reason: FlushReason, options: { snapshot?: boolean }): Promise<void> {
    if (!this.deps.online()) {
      await this.publish({ state: 'offline' });
      return;
    }
    // every flush starts from a live session: a cold start refreshes first
    if (!currentMe()) {
      const pair = await refreshSession().catch(() => null);
      if (!pair) {
        await this.publish({ state: 'signed_out' });
        return;
      }
    }
    if (!currentDataKey()) return;
    await this.publish({ state: 'syncing', lastError: null });
    try {
      const inflight = await this.inFlight();
      await recoverInterrupted(this.deps.now(), new Set(inflight?.uuids ?? []));
      if (inflight && (await this.inFlightDue(inflight))) await this.send(inflight);
      for (const batch of await this.batches()) await this.send(batch);
      await this.snapshotIfDue(options.snapshot === true || reason === 'manual');
      await purge(this.deps.now());
      await this.publish({ state: 'idle', lastSyncAt: this.deps.now() });
    } catch (error) {
      if (error instanceof ApiFailure && error.status === 401) {
        await this.publish({ state: 'signed_out', lastError: error.code });
        return;
      }
      await this.publish({
        state: this.deps.online() ? 'idle' : 'offline',
        lastError: error instanceof ApiFailure ? error.code : 'network',
      });
    } finally {
      await this.scheduleRetry();
    }
  }

  private async inFlight(): Promise<InFlight | null> {
    const row = await offlineDb().meta.get(META.inflight);
    return (row?.value as InFlight | undefined) ?? null;
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
    const close = () => {
      if (current && current.records.length)
        result.push({
          key: uuidv7(),
          uuids: current.uuids,
          body: { deviceTime: this.deps.now().toISOString(), records: current.records },
        });
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
   * final refusal.
   */
  private async send(batch: InFlight): Promise<void> {
    const db = offlineDb();
    const now = this.deps.now();
    await db.meta.put({ key: META.inflight, value: batch });
    const pendingRows = (await db.outbox.bulkGet(batch.uuids)).filter(
      (r): r is OutboxRow => r !== undefined && r.state === 'pending',
    );
    await apply(
      pendingRows.map((r) => r.clientUuid),
      { type: 'flush', at: now },
    );
    await this.publish({ state: 'syncing' });
    const body: SyncBatchRequest = {
      ...batch.body,
      pendingAfter: Math.max(0, (await waitingCount()) - batch.uuids.length),
    };
    try {
      const response = await postBatch(body, batch.key);
      const at = this.deps.now();
      await db.meta.put({
        key: META.clockOffsetMs,
        value: clockOffsetMs(new Date(batch.body.deviceTime), new Date(response.serverTime)),
      });
      for (const result of response.results) await applyResult(result, at);
      await db.meta.delete(META.inflight);
    } catch (error) {
      const at = this.deps.now();
      if (error instanceof ApiFailure && error.status === 401) {
        // the session is gone: the records wait again for the next sign-in
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
        return;
      }
      await markFailed(batch.uuids, error.code, at);
      await db.meta.delete(META.inflight);
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

  private async scheduleRetry(): Promise<void> {
    if (this.retryTimer !== null) this.deps.clearTimer(this.retryTimer);
    this.retryTimer = null;
    if (!this.started) return;
    const at = await nextDue();
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

  private async publish(patch: Partial<SyncStatus>): Promise<void> {
    const tallies = currentDataKey() ? await counts().catch(() => null) : null;
    this.status = { ...this.status, ...(tallies ?? {}), ...patch };
    for (const listener of this.listeners) listener(this.status);
  }
}

/** The one engine of the page. */
export const syncEngine = new SyncEngine();
