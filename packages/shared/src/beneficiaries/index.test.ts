import { describe, expect, it } from 'vitest';
import { beneficiaryFilterSchema } from './index';

// The filters of the beneficiary tab.
describe('beneficiaryFilterSchema', () => {
  const ok = (v: unknown) => beneficiaryFilterSchema.safeParse(v).success;

  it('takes every filter, the year as text from the query string', () => {
    expect(ok({})).toBe(true);
    expect(beneficiaryFilterSchema.parse({ year: '2026' })).toEqual({ year: 2026 });
    expect(ok({ type: 'widow', blocked: 'false', q: 'আমেনা' })).toBe(true);
    expect(ok({ helpedMoreThanOnceInYear: 'true' })).toBe(true);
  });

  it('refuses a bad id, an odd type, a year out of range and unknown keys', () => {
    expect(ok({ unionId: 'savar' })).toBe(false);
    expect(ok({ type: 'Widow!' })).toBe(false);
    expect(ok({ year: '1999' })).toBe(false);
    expect(ok({ year: '2026.5' })).toBe(false);
    expect(ok({ status: 'active' })).toBe(false);
    // the repeat filter has one value; "false" is no filter
    expect(ok({ helpedMoreThanOnceInYear: 'false' })).toBe(false);
  });
});
