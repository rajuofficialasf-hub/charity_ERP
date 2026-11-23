import { describe, expect, it } from 'vitest';
import { officeKeyset, officeOrderBy, officeSort } from './list-order.js';

const ID = '01900000-0000-7000-8000-000000000001';
const AT = '2026-11-20T10:00:00.000Z';

describe("the office's orders of applications", () => {
  it('come by arrival, or by score and then arrival, the id last', () => {
    expect(officeSort(false).map((s) => s.field)).toEqual(['submittedAt', 'id']);
    expect(officeSort(true).map((s) => s.field)).toEqual(['totalScore', 'submittedAt', 'id']);
    expect(officeOrderBy(false, 'next')).toEqual([
      { submittedAt: { sort: 'asc', nulls: 'last' } },
      { id: 'asc' },
    ]);
    // a backward page reads the same order turned round, the empty values first
    expect(officeOrderBy(true, 'prev')).toEqual([
      { totalScore: { sort: 'asc', nulls: 'first' } },
      { submittedAt: { sort: 'desc', nulls: 'first' } },
      { id: 'desc' },
    ]);
  });

  it('read on after a sent row into the later ones and the drafts, and after a draft into the drafts only', () => {
    expect(officeKeyset(false, [AT, ID], 'next')).toEqual({
      OR: [
        { submittedAt: { gt: new Date(AT) } },
        { submittedAt: null },
        { AND: [{ submittedAt: new Date(AT) }, { id: { gt: ID } }] },
      ],
    });
    expect(officeKeyset(false, [null, ID], 'next')).toEqual({
      AND: [{ submittedAt: null }, { id: { gt: ID } }],
    });
    // back from a draft: every sent row, and the earlier drafts
    expect(officeKeyset(false, [null, ID], 'prev')).toEqual({
      OR: [{ submittedAt: { not: null } }, { AND: [{ submittedAt: null }, { id: { lt: ID } }] }],
    });
  });

  it('refuse a cursor whose values do not fit the order', () => {
    expect(() => officeKeyset(true, [AT, ID], 'next')).toThrow(
      expect.objectContaining({ code: 'validation.failed', status: 422 }),
    );
    expect(() => officeKeyset(false, ['not a time', ID], 'next')).toThrow(
      expect.objectContaining({ code: 'validation.failed' }),
    );
  });
});
