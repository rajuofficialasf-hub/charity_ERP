import { describe, expect, it } from 'vitest';
import { PURGE_AFTER_DAYS } from './constants';
import { mayPurge, type OutboxState, transition } from './outbox';

const NOW = new Date('2026-10-31T06:00:00.000Z');
const DAY = 24 * 60 * 60_000;

const record = (state: OutboxState, extra: Partial<Parameters<typeof transition>[0]> = {}) => ({
  state,
  attempts: 0,
  firstAttemptAt: null,
  nextRetryAt: null,
  failureCode: null,
  ...extra,
});

describe('an outbox record', () => {
  it('goes from pending to syncing when a flush picks it up', () => {
    const next = transition(record('pending'), { type: 'flush', at: NOW });
    expect(next.state).toBe('syncing');
    expect(next.firstAttemptAt).toEqual(NOW);
    expect(next.attempts).toBe(1);
  });

  it('keeps the first attempt time over later flushes', () => {
    const first = transition(record('pending'), { type: 'flush', at: NOW });
    const back = transition(first, { type: 'transient', at: NOW, status: 503, random: () => 0.5 });
    const again = transition(back, { type: 'flush', at: new Date(NOW.getTime() + 60_000) });
    expect(again.firstAttemptAt).toEqual(NOW);
    expect(again.attempts).toBe(2);
  });

  it('is synced with its server id when the server says so', () => {
    const next = transition(record('syncing'), {
      type: 'result',
      at: NOW,
      result: 'synced',
      serverId: 'app-1',
    });
    expect(next.state).toBe('synced');
    expect(next.serverId).toBe('app-1');
    expect(next.syncedAt).toEqual(NOW);
  });

  it('counts a record the office must verify as synced, and keeps the reason', () => {
    const next = transition(record('syncing'), {
      type: 'result',
      at: NOW,
      result: 'needs_verification',
      serverId: 'app-2',
      code: 'existing_identity',
    });
    expect(next.state).toBe('synced');
    expect(next.verificationReason).toBe('existing_identity');
  });

  it('keeps a record with photos still to upload as synced and remembers that', () => {
    const next = transition(record('syncing'), {
      type: 'result',
      at: NOW,
      result: 'pending_photos',
      serverId: 'app-3',
    });
    expect(next.state).toBe('synced');
    expect(next.photosPending).toBe(true);
  });

  it('fails for good on a permanent refusal and sets no retry', () => {
    const next = transition(record('syncing', { attempts: 1, firstAttemptAt: NOW }), {
      type: 'result',
      at: NOW,
      result: 'failed',
      code: 'limit_exceeded',
    });
    expect(next.state).toBe('failed');
    expect(next.failureCode).toBe('limit_exceeded');
    expect(next.nextRetryAt).toBeNull();
  });

  it('goes back to pending with the next retry time on a transient failure', () => {
    const next = transition(record('syncing', { attempts: 1, firstAttemptAt: NOW }), {
      type: 'transient',
      at: NOW,
      status: 0,
      random: () => 0.5,
    });
    expect(next.state).toBe('pending');
    expect(next.nextRetryAt).toEqual(new Date(NOW.getTime() + 30_000));
    expect(next.failureCode).toBeNull();
  });

  it('honours the server’s Retry-After on a transient failure', () => {
    const next = transition(record('syncing', { attempts: 1, firstAttemptAt: NOW }), {
      type: 'transient',
      at: NOW,
      status: 429,
      retryAfterSeconds: 120,
      random: () => 0.5,
    });
    expect(next.nextRetryAt).toEqual(new Date(NOW.getTime() + 120_000));
  });

  it('stops retrying after seven days and says so', () => {
    const eightDaysIn = new Date(NOW.getTime() + 8 * DAY);
    const next = transition(record('syncing', { attempts: 100, firstAttemptAt: NOW }), {
      type: 'transient',
      at: eightDaysIn,
      status: 503,
      random: () => 0.5,
    });
    expect(next.state).toBe('failed');
    expect(next.failureCode).toBe('retry_exhausted');
    expect(next.nextRetryAt).toBeNull();
  });

  it('becomes pending again, as a new version, when the person corrects a failed record', () => {
    const next = transition(record('failed', { failureCode: 'limit_exceeded', attempts: 3 }), {
      type: 'edited',
      at: NOW,
    });
    expect(next.state).toBe('pending');
    expect(next.failureCode).toBeNull();
    expect(next.attempts).toBe(0);
    expect(next.nextRetryAt).toBeNull();
  });

  it('lets the person retry a failed record at once', () => {
    const next = transition(record('failed', { failureCode: 'retry_exhausted' }), {
      type: 'retry_now',
      at: NOW,
    });
    expect(next.state).toBe('pending');
    expect(next.nextRetryAt).toBeNull();
  });

  it('refuses a result for a record that is not syncing', () => {
    expect(() =>
      transition(record('pending'), { type: 'result', at: NOW, result: 'synced', serverId: 'x' }),
    ).toThrow();
    expect(() => transition(record('synced'), { type: 'flush', at: NOW })).toThrow();
  });
});

describe('purging a synced record', () => {
  const synced = {
    state: 'synced' as const,
    syncedAt: NOW,
    confirmed: true,
    photosPending: false,
    dependantsPending: false,
  };

  it('happens seven days after the server confirmed it and nothing of it is pending', () => {
    const later = new Date(NOW.getTime() + (PURGE_AFTER_DAYS + 1) * DAY);
    expect(mayPurge(synced, later)).toBe(true);
    expect(mayPurge(synced, new Date(NOW.getTime() + 3 * DAY))).toBe(false);
  });

  it('waits while a photo or a dependant record is still pending, or the server never confirmed', () => {
    const later = new Date(NOW.getTime() + 10 * DAY);
    expect(mayPurge({ ...synced, photosPending: true }, later)).toBe(false);
    expect(mayPurge({ ...synced, dependantsPending: true }, later)).toBe(false);
    expect(mayPurge({ ...synced, confirmed: false }, later)).toBe(false);
    expect(mayPurge({ ...synced, state: 'pending' }, later)).toBe(false);
  });
});
