import { describe, expect, it } from 'vitest';
import { dhakaDayStart, dhakaYear } from './dhaka-day.js';

// The day and the year as Dhaka counts them (UTC+6): midnight there is 18:00 UTC of the day before.
describe('the Dhaka day', () => {
  it('starts at midnight in Dhaka, 18:00 UTC the day before', () => {
    expect(dhakaDayStart(new Date('2026-11-17T10:00:00Z')).toISOString()).toBe(
      '2026-11-16T18:00:00.000Z',
    );
  });

  it('turns at the edge: a moment before midnight in Dhaka is the old day, midnight the new one', () => {
    expect(dhakaDayStart(new Date('2026-11-17T17:59:59.999Z')).toISOString()).toBe(
      '2026-11-16T18:00:00.000Z',
    );
    expect(dhakaDayStart(new Date('2026-11-17T18:00:00.000Z')).toISOString()).toBe(
      '2026-11-17T18:00:00.000Z',
    );
  });

  it('gives the year in Dhaka, which turns six hours before UTC', () => {
    expect(dhakaYear(new Date('2026-12-31T17:59:59.999Z'))).toBe(2026);
    expect(dhakaYear(new Date('2026-12-31T18:00:00.000Z'))).toBe(2027);
    expect(dhakaYear(new Date('2027-01-01T00:00:00.000Z'))).toBe(2027);
  });
});
