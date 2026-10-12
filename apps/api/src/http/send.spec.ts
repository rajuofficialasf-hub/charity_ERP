import { describe, expect, it } from 'vitest';
import { mapData, ok, page } from './send';

// The field mask changes only the data of a handler result (RBAC.md 6).
describe('mapData', () => {
  const upper = (data: unknown) => String(data).toUpperCase();

  it('maps a plain result', () => {
    expect(mapData('a', upper)).toBe('A');
  });

  it('maps the data of ok() and page() and keeps their meta', () => {
    expect(mapData(ok('a', { etag: 'x' }), upper)).toEqual(ok('A', { etag: 'x' }));
    const meta = { nextCursor: 'c', prevCursor: null, limit: 10 };
    const mapped = mapData(page(['a', 'b'], meta), (rows) => (rows as string[]).map(upper));
    expect(mapped).toEqual(page(['A', 'B'], meta));
  });
});
