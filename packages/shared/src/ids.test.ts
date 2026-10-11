import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { uuidv7, uuidv7Time } from './ids.js';

describe('uuidv7', () => {
  it('produces RFC 9562 version 7 UUIDs', () => {
    const id = uuidv7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(z.uuid({ version: 'v7' }).safeParse(id).success).toBe(true);
  });

  it('encodes the creation time and sorts by it', () => {
    const t = Date.UTC(2026, 9, 11, 10, 0, 0);
    const a = uuidv7(t);
    const b = uuidv7(t + 1);
    expect(uuidv7Time(a)).toBe(t);
    expect(a < b).toBe(true);
  });

  it('does not repeat', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uuidv7()));
    expect(ids.size).toBe(1000);
  });
});
