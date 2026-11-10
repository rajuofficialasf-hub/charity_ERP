import { uuidv7 } from '@css/shared';
import { z } from 'zod';
import {
  mayPurge,
  type OutboxEvent,
  type RowResult,
  type SyncRecord,
  transition,
} from '@css/shared/sync';
import { offlineDb, openRow, type OutboxKind, type OutboxRow, sealRow } from './db';
import { requireDataKey } from './keys';

/**
 * The outbox: every offline write as one record that waits for the server
 * (docs/architecture/OFFLINE_SYNC.md, outbox pattern and record lifecycle). The
 * clear columns carry the state machine of `@css/shared/sync`; the payload and the version the
 * edit started from are sealed. A record edited while its batch is on its way keeps the edit as
 * its next version, sent after the result arrives, so a replayed batch keeps its exact bytes.
 */

/** The sealed part of an outbox row. */
export interface OutboxSecret {
  payload: Record<string, unknown>;
  baseVersion: string | null;
  /** An edit made while the record was on its way: it follows as a new version. */
  next?: { payload: Record<string, unknown>; baseVersion: string | null; updatedAt: string };
}

export interface NewRecord {
  clientUuid?: string;
  kind: OutboxKind;
  projectId: string;
  formVersionId: string;
  target?: string | null;
  dependencies?: string[];
  payload: Record<string, unknown>;
  baseVersion?: string | null;
  now?: Date;
}

/** The records the server has not accepted yet. */
export const WAITING_STATES = ['pending', 'syncing', 'failed'] as const;

/** The code of a record that could never go: larger than a batch may be. */
export const TOO_LARGE = 'sync.batch_too_large';
/** The code of a record whose dependency failed for good. */
export const DEPENDENCY_FAILED = 'sync.dependency_failed';

/** The client ids of the batch on its way, if any: their rows are frozen until its result. */
async function inFlightIds(): Promise<Set<string>> {
  const row = await offlineDb().meta.get('inflight');
  const parsed = z.object({ uuids: z.array(z.string()) }).safeParse(row?.value);
  return new Set(parsed.success ? parsed.data.uuids : []);
}

/**
 * Adds a record, or a new version of one that has not gone yet. A record on its way keeps the
 * edit as its next version; a record the server accepted cannot be edited here (the screen
 * makes an update record aimed at the server id instead).
 */
export async function enqueue(input: NewRecord): Promise<OutboxRow> {
  const db = offlineDb();
  const key = requireDataKey();
  const now = input.now ?? new Date();
  const id = input.clientUuid ?? uuidv7();
  const secret: OutboxSecret = { payload: input.payload, baseVersion: input.baseVersion ?? null };
  const existing = await db.outbox.get(id);
  if (!existing) {
    const row = await sealRow(
      key,
      {
        clientUuid: id,
        kind: input.kind,
        projectId: input.projectId,
        formVersionId: input.formVersionId,
        target: input.target ?? null,
        dependencies: input.dependencies ?? [],
        state: 'pending' as const,
        attempts: 0,
        firstAttemptAt: null,
        nextRetryAt: null,
        failureCode: null,
        serverId: null,
        syncedAt: null,
        verificationReason: null,
        photosPending: false,
        createdAt: now,
        updatedAt: now,
      },
      secret,
    );
    await db.outbox.put(row);
    return row;
  }
  if (existing.state === 'synced') throw new Error('outbox: a synced record takes no new version');
  // a record on its way, or one waiting for the replay of its batch, keeps the edit for after
  if (
    existing.state === 'syncing' ||
    (existing.state === 'pending' && (await inFlightIds()).has(id))
  ) {
    const current = await openRow<OutboxSecret>(key, existing);
    const row = await sealRow(
      key,
      { ...existing, updatedAt: now },
      {
        ...current,
        next: {
          payload: input.payload,
          baseVersion: secret.baseVersion,
          updatedAt: now.toISOString(),
        },
      },
    );
    await db.outbox.put(row);
    return row;
  }
  const row = await sealRow(
    key,
    { ...transition(existing, { type: 'edited', at: now }), updatedAt: now },
    secret,
  );
  await db.outbox.put(row);
  return row;
}

export function readSecret(row: OutboxRow): Promise<OutboxSecret> {
  return openRow<OutboxSecret>(requireDataKey(), row);
}

export async function counts(): Promise<{ pending: number; syncing: number; failed: number }> {
  const db = offlineDb();
  const [pending, syncing, failed] = await Promise.all([
    db.outbox.where('state').equals('pending').count(),
    db.outbox.where('state').equals('syncing').count(),
    db.outbox.where('state').equals('failed').count(),
  ]);
  return { pending, syncing, failed };
}

/** Records not yet accepted by the server, for the warnings and the server's count. */
export function waitingCount(): Promise<number> {
  return offlineDb()
    .outbox.where('state')
    .anyOf([...WAITING_STATES])
    .count();
}

/** Rows left on their way by a closed app wait again; the ones of a batch to replay stay. */
export async function recoverInterrupted(now: Date, keep: ReadonlySet<string>): Promise<void> {
  const db = offlineDb();
  const stuck = await db.outbox.where('state').equals('syncing').toArray();
  for (const row of stuck)
    if (!keep.has(row.clientUuid))
      await db.outbox.put({ ...transition(row, { type: 'interrupted', at: now }) });
}

/**
 * The records ready to go, oldest first, each after the records it depends on. A record whose
 * dependency is still waiting stays for a later flush; one whose dependency failed fails too.
 */
export async function due(now: Date): Promise<OutboxRow[]> {
  const db = offlineDb();
  const pending = (await db.outbox.where('state').equals('pending').toArray())
    .filter((r) => r.nextRetryAt === null || r.nextRetryAt.getTime() <= now.getTime())
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const ready: OutboxRow[] = [];
  const readyIds = new Set<string>();
  for (const row of pending) {
    let ok = true;
    for (const dependency of row.dependencies) {
      if (readyIds.has(dependency)) continue;
      const parent = await db.outbox.get(dependency);
      if (!parent || parent.state === 'synced') continue;
      if (parent.state === 'failed') {
        await db.outbox.put({
          ...row,
          state: 'failed',
          failureCode: DEPENDENCY_FAILED,
          nextRetryAt: null,
        });
        ok = false;
        break;
      }
      ok = false;
      break;
    }
    if (!ok) continue;
    ready.push(row);
    readyIds.add(row.clientUuid);
  }
  return ready;
}

/** The record as the batch carries it. */
export function toSyncRecord(row: OutboxRow, secret: OutboxSecret): SyncRecord {
  return {
    clientUuid: row.clientUuid,
    kind: row.kind,
    ...(row.target ? { target: row.target } : {}),
    projectId: row.projectId,
    formVersionId: row.formVersionId,
    ...(secret.baseVersion ? { baseVersion: secret.baseVersion } : {}),
    payload: secret.payload,
    clientCreatedAt: row.createdAt.toISOString(),
    clientUpdatedAt: row.updatedAt.toISOString(),
    ...(row.dependencies.length ? { dependencies: row.dependencies } : {}),
  };
}

/** Applies one event of the state machine to the named rows. */
export async function apply(clientUuids: readonly string[], event: OutboxEvent): Promise<void> {
  const db = offlineDb();
  for (const id of clientUuids) {
    const row = await db.outbox.get(id);
    if (row) await db.outbox.put({ ...transition(row, event) });
  }
}

/** The earliest time a pending record wants to try again, or null when none waits for a time. */
export async function nextDue(): Promise<Date | null> {
  const db = offlineDb();
  const pending = await db.outbox.where('state').equals('pending').toArray();
  const pendingIds = new Set(pending.map((r) => r.clientUuid));
  const parents = new Map(
    (await db.outbox.bulkGet(pending.flatMap((r) => r.dependencies)))
      .filter((r): r is OutboxRow => r !== undefined)
      .map((r) => [r.clientUuid, r]),
  );
  // a dependant whose parent still waits goes when the parent does: the parent's time counts
  const free = pending.filter((r) =>
    r.dependencies.every((d) => {
      const parent = parents.get(d);
      return (
        !parent || parent.state === 'synced' || (pendingIds.has(d) && parent.nextRetryAt === null)
      );
    }),
  );
  if (free.some((r) => r.nextRetryAt === null)) return new Date(0);
  const times = pending.map((r) => r.nextRetryAt).filter((t): t is Date => t !== null);
  return times.length ? new Date(Math.min(...times.map((t) => t.getTime()))) : null;
}

/**
 * The server's answer for one record. An edit kept as the next version follows: as a new
 * version of the same record when it failed, as an update aimed at the server id when it went.
 */
export async function applyResult(result: RowResult, at: Date): Promise<void> {
  const db = offlineDb();
  const row = await db.outbox.get(result.clientUuid);
  if (!row || row.state !== 'syncing') return;
  const key = requireDataKey();
  const secret = await openRow<OutboxSecret>(key, row);
  const tracked = transition(row, {
    type: 'result',
    at,
    result: result.result,
    serverId: result.serverId ?? null,
    code: result.code ?? null,
    ...(result.params ? { params: result.params } : {}),
    pendingPhotos: result.pendingPhotos,
  });
  if (!secret.next) {
    await db.outbox.put(tracked);
    return;
  }
  const { next, ...rest } = secret;
  if (tracked.state === 'failed') {
    const row2 = await sealRow(
      key,
      { ...transition(tracked, { type: 'edited', at }), updatedAt: new Date(next.updatedAt) },
      { payload: next.payload, baseVersion: next.baseVersion },
    );
    await db.outbox.put(row2);
    return;
  }
  await db.outbox.put(await sealRow(key, tracked, rest));
  // a submit carries nothing to edit; an answer's correction goes again as a correction
  if (row.kind === 'application_submit') return;
  await enqueue({
    kind: row.kind === 'field_update' ? 'field_update' : 'application_update',
    projectId: row.projectId,
    formVersionId: row.formVersionId,
    target: row.kind === 'field_update' ? row.target : (tracked.serverId ?? row.target ?? null),
    dependencies: row.kind !== 'field_update' && !tracked.serverId ? [row.clientUuid] : [],
    payload: next.payload,
    baseVersion: next.baseVersion,
    now: new Date(next.updatedAt),
  });
}

export async function markFailed(
  clientUuids: readonly string[],
  code: string,
  at: Date,
): Promise<void> {
  const db = offlineDb();
  for (const id of clientUuids) {
    const row = await db.outbox.get(id);
    if (!row || row.state === 'synced') continue;
    await db.outbox.put({
      ...row,
      state: 'failed',
      failureCode: code,
      failureParams: null,
      nextRetryAt: null,
      updatedAt: at,
    });
  }
}

/** The person asks for a failed or waiting record to go now. */
export function retryNow(clientUuid: string, at: Date): Promise<void> {
  return apply([clientUuid], { type: 'retry_now', at });
}

/** The person drops a record the server never accepted, with its photos. */
export async function remove(clientUuid: string): Promise<void> {
  const db = offlineDb();
  await db.transaction('rw', [db.outbox, db.photos], async () => {
    await db.photos.where('clientUuid').equals(clientUuid).delete();
    await db.outbox.delete(clientUuid);
  });
}

/**
 * Drops the synced records the phone no longer needs: confirmed by the server (the result named
 * the server id and the cached data set lists the application), old enough, with no photo and
 * no dependant still waiting.
 */
export async function purge(now: Date): Promise<number> {
  const db = offlineDb();
  const synced = await db.outbox.where('state').equals('synced').toArray();
  const waiting = await db.outbox
    .where('state')
    .anyOf([...WAITING_STATES])
    .toArray();
  const serverIds = synced.map((r) => r.serverId).filter((id): id is string => Boolean(id));
  const listed = new Set(
    (await db.applications.bulkGet(serverIds)).flatMap((a) => (a ? [a.id] : [])),
  );
  const photos = await db.photos
    .where('clientUuid')
    .anyOf(synced.map((r) => r.clientUuid))
    .toArray();
  let removed = 0;
  for (const row of synced) {
    const confirmed =
      row.serverId !== null && row.serverId !== undefined && listed.has(row.serverId);
    const photosPending = photos.some(
      (p) => p.clientUuid === row.clientUuid && p.state !== 'uploaded',
    );
    const dependantsPending = waiting.some((r) => r.dependencies.includes(row.clientUuid));
    if (
      mayPurge(
        {
          state: row.state,
          syncedAt: row.syncedAt ?? null,
          confirmed,
          photosPending: photosPending || Boolean(row.photosPending),
          dependantsPending,
        },
        now,
      )
    ) {
      await db.photos.where('clientUuid').equals(row.clientUuid).delete();
      await db.outbox.delete(row.clientUuid);
      removed += 1;
    }
  }
  return removed;
}
