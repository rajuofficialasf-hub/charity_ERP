import { describe, expect, it } from 'vitest';
import { RETRY_DELAYS_MS, RETRY_GIVE_UP_DAYS, RETRY_JITTER } from './constants';
import {
  BATCH_IN_PROGRESS,
  clockOffsetMs,
  correctedTime,
  isTransientResponse,
  isTransientStatus,
  nextRetryAt,
  retryExhausted,
} from './retry';

const NOW = new Date('2026-10-31T06:00:00.000Z');
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe('the retry ladder', () => {
  it('waits 30 s, 2 min, 10 min, 1 h and then every hour, without jitter at the middle draw', () => {
    const at = (attempt: number) =>
      nextRetryAt(attempt, NOW, undefined, () => 0.5).getTime() - NOW.getTime();
    expect(at(1)).toBe(30_000);
    expect(at(2)).toBe(2 * MINUTE);
    expect(at(3)).toBe(10 * MINUTE);
    expect(at(4)).toBe(HOUR);
    expect(at(5)).toBe(HOUR);
    expect(at(40)).toBe(HOUR);
    expect(RETRY_DELAYS_MS).toEqual([30_000, 2 * MINUTE, 10 * MINUTE, HOUR]);
  });

  it('spreads each wait by at most a fifth either way', () => {
    const low = nextRetryAt(2, NOW, undefined, () => 0).getTime() - NOW.getTime();
    const high = nextRetryAt(2, NOW, undefined, () => 1).getTime() - NOW.getTime();
    expect(low).toBe(2 * MINUTE * (1 - RETRY_JITTER));
    expect(high).toBe(2 * MINUTE * (1 + RETRY_JITTER));
  });

  it('lets the server say when to come back instead', () => {
    const at = nextRetryAt(1, NOW, 900, () => 0.9);
    expect(at.getTime() - NOW.getTime()).toBe(900_000);
  });

  it('ignores a Retry-After that is not a number, negative or longer than an hour', () => {
    for (const bad of [Number.NaN, -5, 7 * 3_600]) {
      const at = nextRetryAt(1, NOW, bad, () => 0.5);
      expect(at.getTime() - NOW.getTime()).toBe(30_000);
    }
    expect(nextRetryAt(1, NOW, 0, () => 0.5).getTime()).toBe(NOW.getTime());
  });

  it('gives up after seven days of trying, counted from the first attempt', () => {
    const first = NOW;
    const sixDays = new Date(NOW.getTime() + 6 * 24 * HOUR);
    const eightDays = new Date(NOW.getTime() + 8 * 24 * HOUR);
    expect(retryExhausted(first, sixDays)).toBe(false);
    expect(retryExhausted(first, eightDays)).toBe(true);
    expect(RETRY_GIVE_UP_DAYS).toBe(7);
  });

  it('calls the network, a timeout, a busy and a failing server transient, and nothing else', () => {
    for (const status of [0, 408, 429, 500, 502, 503, 504])
      expect(isTransientStatus(status), String(status)).toBe(true);
    for (const status of [400, 401, 403, 404, 409, 413, 422, 426])
      expect(isTransientStatus(status), String(status)).toBe(false);
  });

  it('treats a batch the server is still working on as transient, other conflicts as final', () => {
    expect(isTransientResponse(409, BATCH_IN_PROGRESS)).toBe(true);
    expect(isTransientResponse(409, 'application.not_editable')).toBe(false);
    expect(isTransientResponse(503, null)).toBe(true);
  });
});

describe('the device clock', () => {
  it('learns how far the phone is from the server and corrects a device time by it', () => {
    const device = new Date('2026-10-31T08:00:00.000Z');
    const server = new Date('2026-10-31T06:00:00.000Z');
    const offset = clockOffsetMs(device, server);
    expect(offset).toBe(-2 * HOUR);
    expect(correctedTime(new Date('2026-10-31T07:30:00.000Z'), offset).toISOString()).toBe(
      '2026-10-31T05:30:00.000Z',
    );
  });
});
