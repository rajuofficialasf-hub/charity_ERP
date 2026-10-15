import { describe, expect, it } from 'vitest';
import { volunteerFilterSchema } from './index';

// The filters of the volunteer tab.
describe('volunteerFilterSchema', () => {
  const ok = (v: unknown) => volunteerFilterSchema.safeParse(v).success;

  it('takes every filter alone and none at all', () => {
    expect(ok({})).toBe(true);
    expect(ok({ divisionId: '01900000-0000-7000-8000-000000000001' })).toBe(true);
    expect(
      ok({ type: 'local_daee', state: 'pending', category: 'inactive', blocked: 'true' }),
    ).toBe(true);
    expect(ok({ q: 'রহিমা' })).toBe(true);
  });

  it('refuses a bad id, an unknown state, type or category, a short search and unknown keys', () => {
    expect(ok({ districtId: 'dhaka' })).toBe(false);
    expect(ok({ state: 'sleeping' })).toBe(false);
    expect(ok({ type: 'staff' })).toBe(false);
    expect(ok({ category: 'E' })).toBe(false);
    expect(ok({ blocked: 'yes' })).toBe(false);
    expect(ok({ q: 'a' })).toBe(false);
    expect(ok({ q: 'x'.repeat(101) })).toBe(false);
    expect(ok({ rating: '5' })).toBe(false);
  });
});
