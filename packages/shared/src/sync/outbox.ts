import { PURGE_AFTER_DAYS } from './constants.js';
import { nextRetryAt, retryExhausted } from './retry.js';

const DAY_MS = 24 * 60 * 60_000;

/** The life of a record on the phone: waiting, on its way, accepted, or refused for good. */
export const OUTBOX_STATES = ['pending', 'syncing', 'synced', 'failed'] as const;
export type OutboxState = (typeof OUTBOX_STATES)[number];

/** What the server answers for one record. */
export const SYNC_RESULTS = ['synced', 'needs_verification', 'pending_photos', 'failed'] as const;
export type SyncResult = (typeof SYNC_RESULTS)[number];

/** The reason of a record that gave up retrying. */
export const RETRY_EXHAUSTED = 'retry_exhausted';

/** The part of an outbox record the state machine reads and writes. */
export interface OutboxTracking {
  state: OutboxState;
  attempts: number;
  firstAttemptAt: Date | null;
  nextRetryAt: Date | null;
  failureCode: string | null;
  serverId?: string | null;
  syncedAt?: Date | null;
  verificationReason?: string | null;
  photosPending?: boolean;
}

export type OutboxEvent =
  | { type: 'flush'; at: Date }
  | {
      type: 'result';
      at: Date;
      result: SyncResult;
      serverId?: string | null;
      code?: string | null;
    }
  | {
      type: 'transient';
      at: Date;
      status: number;
      retryAfterSeconds?: number;
      random?: () => number;
    }
  | { type: 'edited'; at: Date }
  | { type: 'retry_now'; at: Date };

/**
 * The next tracking state of a record after an event. Pure, so the phone's store and its tests
 * agree on every edge; an event a state cannot take throws, because the caller has a bug.
 */
export function transition<T extends OutboxTracking>(record: T, event: OutboxEvent): T {
  switch (event.type) {
    case 'flush':
      expectState(record, event, ['pending']);
      return {
        ...record,
        state: 'syncing',
        attempts: record.attempts + 1,
        firstAttemptAt: record.firstAttemptAt ?? event.at,
        nextRetryAt: null,
      };
    case 'result': {
      expectState(record, event, ['syncing']);
      if (event.result === 'failed')
        return {
          ...record,
          state: 'failed',
          failureCode: event.code ?? 'failed',
          nextRetryAt: null,
        };
      return {
        ...record,
        state: 'synced',
        failureCode: null,
        nextRetryAt: null,
        serverId: event.serverId ?? record.serverId ?? null,
        syncedAt: event.at,
        verificationReason: event.result === 'needs_verification' ? (event.code ?? null) : null,
        photosPending: event.result === 'pending_photos',
      };
    }
    case 'transient': {
      expectState(record, event, ['syncing']);
      const first = record.firstAttemptAt ?? event.at;
      if (retryExhausted(first, event.at))
        return { ...record, state: 'failed', failureCode: RETRY_EXHAUSTED, nextRetryAt: null };
      return {
        ...record,
        state: 'pending',
        failureCode: null,
        nextRetryAt: nextRetryAt(record.attempts, event.at, event.retryAfterSeconds, event.random),
      };
    }
    case 'edited':
      // the corrected record is a new version under the same client id: its retries start over
      expectState(record, event, ['pending', 'failed']);
      return {
        ...record,
        state: 'pending',
        attempts: 0,
        firstAttemptAt: null,
        nextRetryAt: null,
        failureCode: null,
      };
    case 'retry_now':
      expectState(record, event, ['pending', 'failed']);
      return { ...record, state: 'pending', nextRetryAt: null, failureCode: null };
  }
}

function expectState(record: OutboxTracking, event: OutboxEvent, allowed: OutboxState[]): void {
  if (!allowed.includes(record.state))
    throw new Error(`outbox: a ${record.state} record cannot take ${event.type}`);
}

/** What the purge reads about a synced record. */
export interface PurgeView {
  state: OutboxState;
  syncedAt: Date | null;
  /** The server acknowledged the record after the sync (a later snapshot or result named it). */
  confirmed: boolean;
  photosPending: boolean;
  dependantsPending: boolean;
}

/** A synced record leaves the phone only when confirmed, old enough, and nothing of it waits. */
export function mayPurge(record: PurgeView, now: Date): boolean {
  if (record.state !== 'synced' || !record.syncedAt || !record.confirmed) return false;
  if (record.photosPending || record.dependantsPending) return false;
  return now.getTime() - record.syncedAt.getTime() >= PURGE_AFTER_DAYS * DAY_MS;
}
