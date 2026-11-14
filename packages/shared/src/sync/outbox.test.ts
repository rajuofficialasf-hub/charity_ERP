import { describe, expect, it } from 'vitest';
import { PURGE_AFTER_DAYS } from './constants';
import {
  HELD_WITHOUT_REASON,
  mayPurge,
  type OutboxState,
  type OutboxTracking,
  transition,
} from './outbox';

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

describe('the values of a refusal', () => {
  const syncing: OutboxTracking = {
    state: 'syncing',
    attempts: 1,
    firstAttemptAt: new Date(0),
    nextRetryAt: null,
    failureCode: null,
  };
  it('keeps the values a refusal names, and drops them when the record is edited', () => {
    const failed = transition(syncing, {
      type: 'result',
      at: new Date(1),
      result: 'failed',
      code: 'application.answer_not_in_list',
      params: { question: 'লিঙ্গ' },
    });
    expect(failed).toMatchObject({
      failureCode: 'application.answer_not_in_list',
      failureParams: { question: 'লিঙ্গ' },
    });
    expect(transition(failed, { type: 'edited', at: new Date(2) }).failureParams).toBeNull();
  });
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

  it('counts a record the office holds without a reason as held too, and as no longer held once it is plainly synced', () => {
    for (const code of [undefined, null]) {
      const held = transition(record('syncing'), {
        type: 'result',
        at: NOW,
        result: 'needs_verification',
        serverId: 'app-5',
        ...(code === undefined ? {} : { code }),
      });
      expect(held.state).toBe('synced');
      expect(held.verificationReason).toBe(HELD_WITHOUT_REASON);
    }
    const plain = transition(record('syncing'), {
      type: 'result',
      at: NOW,
      result: 'synced',
      serverId: 'app-5',
    });
    expect(plain.verificationReason).toBeNull();
  });

  it('remembers the photos still to upload beside any result', () => {
    const synced = transition(record('syncing'), {
      type: 'result',
      at: NOW,
      result: 'synced',
      serverId: 'app-3',
      pendingPhotos: 2,
    });
    expect(synced.state).toBe('synced');
    expect(synced.photosPending).toBe(true);
    const verifying = transition(record('syncing'), {
      type: 'result',
      at: NOW,
      result: 'needs_verification',
      serverId: 'app-4',
      code: 'existing_identity',
      pendingPhotos: 1,
    });
    expect(verifying.photosPending).toBe(true);
    expect(verifying.verificationReason).toBe('existing_identity');
  });

  it('waits again, with its attempts kept, when the app closed while it was on its way', () => {
    const inFlight = transition(record('pending', { attempts: 2 }), { type: 'flush', at: NOW });
    const next = transition(inFlight, { type: 'interrupted', at: NOW });
    expect(next.state).toBe('pending');
    expect(next.attempts).toBe(3);
    expect(next.nextRetryAt).toBeNull();
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
    const next = transition(record('failed', { failureCode: 'limit_exceeded', attempts: 2 }), {
      type: 'retry_now',
      at: NOW,
    });
    expect(next.state).toBe('pending');
    expect(next.nextRetryAt).toBeNull();
    expect(next.attempts).toBe(2);
  });

  it('starts the seven days again when the person retries a record that gave up', () => {
    const longAgo = new Date(NOW.getTime() - 9 * DAY);
    const retried = transition(
      record('failed', { failureCode: 'retry_exhausted', attempts: 40, firstAttemptAt: longAgo }),
      { type: 'retry_now', at: NOW },
    );
    const sent = transition(retried, { type: 'flush', at: NOW });
    const hiccup = transition(sent, { type: 'transient', at: NOW, status: 503, random: () => 0.5 });
    expect(hiccup.state).toBe('pending');
    expect(hiccup.nextRetryAt).toEqual(new Date(NOW.getTime() + 30_000));
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
