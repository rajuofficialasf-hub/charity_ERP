import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiError } from '../i18n/api-error';
import {
  buildPage,
  capTotal,
  decodeCursor,
  encodeCursor,
  keysetWhere,
  orderBy,
  pageQuery,
  parseList,
  parseRange,
  parseSort,
  searchWhere,
} from './pagination';
import { issueCode } from './validation';

const SECRET = 'unit-test-secret-0123456789abcdefgh';

describe('cursors (API_STANDARDS 4)', () => {
  it('round-trips and refuses tampering, other bindings and garbage', () => {
    const cursor = encodeCursor(SECRET, 'GET /x|user-1', { v: ['b', 'id-2'], d: 'next' });
    expect(decodeCursor(SECRET, 'GET /x|user-1', cursor)).toEqual({ v: ['b', 'id-2'], d: 'next' });
    const [body, mac] = cursor.split('.');
    const forged = Buffer.from(JSON.stringify({ v: ['z', 'id-9'], d: 'next' })).toString(
      'base64url',
    );
    expect(() => decodeCursor(SECRET, 'GET /x|user-1', `${forged}.${mac}`)).toThrow(ApiError);
    expect(() => decodeCursor(SECRET, 'GET /x|user-2', cursor)).toThrow(ApiError);
    expect(() => decodeCursor(SECRET, 'GET /x|user-1', `${body}`)).toThrow(ApiError);
    expect(() => decodeCursor(SECRET, 'GET /x|user-1', 'garbage.value')).toThrow(ApiError);
  });
});

describe('sorting and keyset (API_STANDARDS 4, 5)', () => {
  it('parses whitelisted sort fields and always ends with the id', () => {
    expect(parseSort('-submittedAt,appNo', ['submittedAt', 'appNo'], [])).toEqual([
      { field: 'submittedAt', direction: 'desc' },
      { field: 'appNo', direction: 'asc' },
      { field: 'id', direction: 'asc' },
    ]);
    expect(parseSort(undefined, ['name'], [{ field: 'name', direction: 'desc' }])).toEqual([
      { field: 'name', direction: 'desc' },
      { field: 'id', direction: 'desc' },
    ]);
    expect(() => parseSort('password', ['name'], [])).toThrow(ApiError);
  });

  it('builds the keyset condition and order, flipped for backward pages', () => {
    const sort = parseSort('-createdAt', ['createdAt'], []);
    expect(keysetWhere(sort, { v: ['2026-10-11', 'id-5'], d: 'next' })).toEqual({
      OR: [{ createdAt: { lt: '2026-10-11' } }, { createdAt: '2026-10-11', id: { lt: 'id-5' } }],
    });
    expect(keysetWhere(sort, { v: ['2026-10-11', 'id-5'], d: 'prev' })).toEqual({
      OR: [{ createdAt: { gt: '2026-10-11' } }, { createdAt: '2026-10-11', id: { gt: 'id-5' } }],
    });
    expect(orderBy(sort, 'prev')).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
  });

  it('builds a page from limit + 1 rows with next and previous cursors', () => {
    const sort = parseSort(undefined, ['name'], [{ field: 'name', direction: 'asc' }]);
    const rows = [
      { id: '1', name: 'a' },
      { id: '2', name: 'b' },
      { id: '3', name: 'c' },
    ];
    const first = buildPage(rows, {
      limit: 2,
      sort,
      direction: 'next',
      hadCursor: false,
      secret: SECRET,
      binding: 'b',
      total: 12_345,
    });
    expect(first.rows.map((r) => r.id)).toEqual(['1', '2']);
    expect(first.meta.prevCursor).toBeNull();
    expect(first.meta.total).toBe('10000+');
    expect(decodeCursor(SECRET, 'b', first.meta.nextCursor!)).toEqual({ v: ['b', '2'], d: 'next' });
    const last = buildPage(rows.slice(2), {
      limit: 2,
      sort,
      direction: 'next',
      hadCursor: true,
      secret: SECRET,
      binding: 'b',
    });
    expect(last.meta.nextCursor).toBeNull();
    expect(last.meta.prevCursor).not.toBeNull();
  });
});

describe('filters and search (API_STANDARDS 5)', () => {
  it('parses lists, ranges, totals and search terms', () => {
    expect(parseList(' submitted, reviewed,,submitted ')).toEqual(['submitted', 'reviewed']);
    expect(parseRange('2026-10-01', '2026-10-31')).toEqual({
      gte: new Date('2026-09-30T18:00:00.000Z'),
      lte: new Date('2026-10-31T17:59:59.999Z'),
    });
    expect(() => parseRange('01-10-2026')).toThrow(ApiError);
    expect(capTotal(10_000)).toBe(10_000);
    expect(searchWhere('a', ['name'])).toBeUndefined();
    expect(searchWhere(' রহিমা ', ['nameBn', 'appNo'])).toEqual({
      OR: [
        { nameBn: { contains: 'রহিমা', mode: 'insensitive' } },
        { appNo: { contains: 'রহিমা', mode: 'insensitive' } },
      ],
    });
  });

  it('accepts page defaults and rejects unknown or out-of-range parameters', () => {
    expect(pageQuery.parse({})).toEqual({ limit: 25 });
    expect(pageQuery.safeParse({ limit: '101' }).success).toBe(false);
    expect(pageQuery.safeParse({ limtt: '5' }).success).toBe(false);
  });
});

describe('validation codes (API_STANDARDS 7)', () => {
  it('maps zod issues to catalogue codes', () => {
    const schema = z.object({
      name: z.string().min(1).max(5),
      age: z.number().max(120),
      kind: z.enum(['a', 'b']),
      nid: z.string().refine(() => false, { params: { code: 'validation.nid_format' } }),
    });
    const result = schema.safeParse({ name: 'toolongname', age: 200, kind: 'c', nid: '1' });
    expect(result.success).toBe(false);
    const codes = Object.fromEntries(
      result.error!.issues.map((i) => [i.path.join('.'), issueCode(i)]),
    );
    expect(codes).toEqual({
      name: 'validation.too_long',
      age: 'validation.out_of_range',
      kind: 'validation.option_unknown',
      nid: 'validation.nid_format',
    });
    const missing = z.object({ name: z.string() }).safeParse({});
    expect(issueCode(missing.error!.issues[0]!)).toBe('validation.required');
  });
});
