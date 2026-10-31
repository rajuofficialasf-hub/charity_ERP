import { describe, expect, it } from 'vitest';
import { correctedDeviceTime, lateSync, staleVersion, verificationReason } from './rules';

// Dhaka is UTC+6: 2026-03-10 18:30 UTC is already 11 March there
const dhakaMidnight = new Date('2026-03-10T18:00:00Z');
const applyTo = new Date('2026-03-10T00:00:00Z');

describe('the device time on the server clock', () => {
  it('moves the device time by the offset learned from the batch', () => {
    expect(correctedDeviceTime('2026-03-10T10:00:00Z', 2 * 3_600_000).toISOString()).toBe(
      '2026-03-10T12:00:00.000Z',
    );
    expect(correctedDeviceTime('2026-03-10T10:00:00Z', -60_000).toISOString()).toBe(
      '2026-03-10T09:59:00.000Z',
    );
  });
});

describe('a late sync', () => {
  it('holds a record made on the last day of the window that arrives the day after', () => {
    const madeOnTheLastDay = new Date('2026-03-10T15:00:00Z');
    expect(lateSync(madeOnTheLastDay, dhakaMidnight, applyTo)).toBe(true);
  });

  it('is not late while the window is still open, nor when the record was made after it', () => {
    const stillOpen = new Date('2026-03-10T12:00:00Z');
    expect(lateSync(new Date('2026-03-09T12:00:00Z'), stillOpen, applyTo)).toBe(false);
    expect(lateSync(dhakaMidnight, new Date('2026-03-11T06:00:00Z'), applyTo)).toBe(false);
  });

  it('knows no late sync without an end of the window', () => {
    expect(lateSync(new Date('2026-01-01T00:00:00Z'), dhakaMidnight, null)).toBe(false);
  });
});

describe('a stale form version', () => {
  it('flags a record made at or after the newer version was published', () => {
    const published = new Date('2026-03-10T10:00:00Z');
    expect(staleVersion(new Date('2026-03-10T09:59:59Z'), published)).toBe(false);
    expect(staleVersion(published, published)).toBe(true);
    expect(staleVersion(new Date('2026-03-11T00:00:00Z'), published)).toBe(true);
  });

  it('is never stale without a newer version', () => {
    expect(staleVersion(new Date('2026-03-11T00:00:00Z'), null)).toBe(false);
  });
});

describe('the reason a held record tells the phone', () => {
  it('names the heaviest sync flag, and nothing for a record held for another reason', () => {
    expect(verificationReason(['stale_form_version', 'existing_identity'])).toBe(
      'existing_identity',
    );
    expect(verificationReason(['late_sync'])).toBe('late_sync');
    expect(verificationReason(['public_entry'])).toBeNull();
    expect(verificationReason([])).toBeNull();
  });
});
