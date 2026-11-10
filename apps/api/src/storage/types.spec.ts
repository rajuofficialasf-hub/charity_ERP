import { describe, expect, it } from 'vitest';
import { BUCKETS, knownBucket } from './types.js';

// A bucket name read back from the database is narrowed to the buckets the storage knows.
describe('knownBucket', () => {
  it('answers every bucket of the storage and refuses any other name', () => {
    for (const bucket of BUCKETS) expect(knownBucket(bucket)).toBe(bucket);
    expect(() => knownBucket('private')).toThrow('unknown bucket private');
    expect(() => knownBucket('')).toThrow();
  });
});
