/* eslint-disable security/detect-object-injection -- field names come from per-endpoint whitelists */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { normalizeText } from '@css/shared/i18n';
import { z } from 'zod';
import { ApiError } from '../i18n/api-error.js';
import type { PageMeta } from '../http/send.js';

/**
 * Pagination, sorting, filtering and search helpers (docs/api/API_STANDARDS.md, "Pagination: keyset
 * cursors" and "Filtering, sorting and searching"): keyset cursors signed with CURSOR_SECRET and
 * bound to the endpoint and caller, whitelisted sorting with the id as final tiebreaker, comma
 * lists, From/To ranges, trigram-friendly search and capped totals.
 */
export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;
export const TOTAL_CAP = 10_000;

/** Query fields every list endpoint accepts; endpoints extend this strict schema with filters. */
export const pageQuery = z.strictObject({
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  cursor: z.string().max(1024).optional(),
  include: z.enum(['total']).optional(),
  sort: z.string().max(200).optional(),
});
export type PageQuery = z.infer<typeof pageQuery>;

/**
 * The page number the volunteer and the beneficiary lists accept besides the cursor: an
 * offset into the same order, so a person can jump to any page the counted total shows.
 */
export const pageNumberQuery = z.strictObject({
  page: z.coerce.number().int().min(1).optional(),
});
export type PageNumberQuery = z.infer<typeof pageNumberQuery>;

/**
 * The rows a page number skips. It is refused together with a cursor, and past the counted range
 * of the totals, which keeps the offset cheap on the largest list; later rows page by cursor.
 */
export function pageOffset(query: {
  page?: number | undefined;
  cursor?: string | undefined;
  limit: number;
}): number | undefined {
  if (query.page === undefined) return undefined;
  const offset = (query.page - 1) * query.limit;
  if (query.cursor || offset >= TOTAL_CAP)
    throw new ApiError('validation.failed', 422, undefined, [
      { path: 'page', code: 'validation.failed' },
    ]);
  return offset;
}

export interface SortField {
  field: string;
  direction: 'asc' | 'desc';
}

/** `sort=-submittedAt,appNo` against a whitelist; the id is always the final tiebreaker. */
export function parseSort(
  sort: string | undefined,
  allowed: readonly string[],
  fallback: SortField[],
): SortField[] {
  const fields: SortField[] = sort
    ? sort.split(',').map((part) => {
        const trimmed = part.trim();
        const field = trimmed.replace(/^-/, '');
        if (!allowed.includes(field))
          throw new ApiError('validation.failed', 422, undefined, [
            { path: 'sort', code: 'validation.option_unknown' },
          ]);
        return { field, direction: trimmed.startsWith('-') ? 'desc' : 'asc' };
      })
    : [...fallback];
  if (!fields.some((f) => f.field === 'id'))
    fields.push({ field: 'id', direction: fields.at(-1)?.direction ?? 'asc' });
  return fields;
}

export interface CursorBody {
  /** Sort values of the boundary row, in sort order. */
  v: unknown[];
  /** Direction the cursor pages towards. */
  d: 'next' | 'prev';
}

const sign = (secret: string, binding: string, body: string) =>
  createHmac('sha256', secret).update(`${binding}\u0000${body}`).digest('base64url');

/** Opaque cursor: base64url body plus an HMAC over the body and a binding (endpoint and caller). */
export function encodeCursor(secret: string, binding: string, body: CursorBody): string {
  const encoded = Buffer.from(JSON.stringify(body)).toString('base64url');
  return `${encoded}.${sign(secret, binding, encoded)}`;
}

/** Verifies and decodes a cursor; a forged, foreign or broken cursor is a validation error. */
export function decodeCursor(secret: string, binding: string, cursor: string): CursorBody {
  const fail = () =>
    new ApiError('validation.failed', 422, undefined, [
      { path: 'cursor', code: 'validation.failed' },
    ]);
  const [encoded, mac] = cursor.split('.');
  if (!encoded || !mac) throw fail();
  const expected = Buffer.from(sign(secret, binding, encoded));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw fail();
  try {
    const body = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as CursorBody;
    if (!Array.isArray(body.v) || (body.d !== 'next' && body.d !== 'prev')) throw fail();
    return body;
  } catch {
    throw fail();
  }
}

/**
 * Prisma `where` for the rows after (or before) the cursor row under the given sort:
 * (f1 > v1) OR (f1 = v1 AND f2 > v2) OR ... with the comparison flipped for descending fields
 * and for backward paging.
 */
export function keysetWhere(sort: SortField[], cursor: CursorBody): Record<string, unknown> {
  const or = sort.map((field, i) => {
    const forward = (field.direction === 'asc') === (cursor.d === 'next');
    const clause: Record<string, unknown> = {};
    for (let j = 0; j < i; j++) clause[sort[j]!.field] = cursor.v[j];
    clause[field.field] = { [forward ? 'gt' : 'lt']: cursor.v[i] };
    return clause;
  });
  return { OR: or };
}

/** Prisma `orderBy` for the sort, reversed when paging backwards. */
export function orderBy(
  sort: SortField[],
  direction: 'next' | 'prev' = 'next',
): Record<string, 'asc' | 'desc'>[] {
  return sort.map(({ field, direction: d }) => ({
    [field]: direction === 'next' ? d : d === 'asc' ? 'desc' : 'asc',
  }));
}

/**
 * Builds the page from `limit + 1` fetched rows: trims the extra row, restores order for backward
 * pages and creates the next and previous cursors.
 */
export function buildPage<T extends Record<string, unknown>>(
  fetched: T[],
  options: {
    limit: number;
    sort: SortField[];
    direction: 'next' | 'prev';
    hadCursor: boolean;
    secret: string;
    binding: string;
    total?: number;
  },
): { rows: T[]; meta: PageMeta } {
  const { limit, sort, direction, hadCursor, secret, binding } = options;
  const more = fetched.length > limit;
  const rows = fetched.slice(0, limit);
  if (direction === 'prev') rows.reverse();
  const valuesOf = (row: T) =>
    sort.map((s) =>
      row[s.field] instanceof Date ? (row[s.field] as Date).toISOString() : row[s.field],
    );
  const first = rows[0];
  const last = rows.at(-1);
  const hasNext = direction === 'next' ? more : hadCursor;
  const hasPrev = direction === 'next' ? hadCursor : more;
  return {
    rows,
    meta: {
      nextCursor:
        hasNext && last ? encodeCursor(secret, binding, { v: valuesOf(last), d: 'next' }) : null,
      prevCursor:
        hasPrev && first ? encodeCursor(secret, binding, { v: valuesOf(first), d: 'prev' }) : null,
      limit,
      ...(options.total === undefined ? {} : { total: capTotal(options.total) }),
    },
  };
}

/**
 * Totals are exact up to 10,000 rows and "10000+" beyond (docs/api/API_STANDARDS.md, "Pagination:
 * keyset cursors").
 */
export function capTotal(count: number): number | '10000+' {
  return count > TOTAL_CAP ? '10000+' : count;
}

/** `status=submitted,reviewed` → ['submitted', 'reviewed'] (trimmed, unique, no empties). */
export function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ];
}

/** `submittedFrom` / `submittedTo` (inclusive dates) → a Prisma range in Dhaka days. */
export function parseRange(from?: string, to?: string): { gte?: Date; lte?: Date } | undefined {
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (from && !day.test(from))
    throw new ApiError('validation.failed', 422, undefined, [
      { path: 'from', code: 'validation.failed' },
    ]);
  if (to && !day.test(to))
    throw new ApiError('validation.failed', 422, undefined, [
      { path: 'to', code: 'validation.failed' },
    ]);
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: new Date(`${from}T00:00:00+06:00`) } : {}),
    ...(to ? { lte: new Date(`${to}T23:59:59.999+06:00`) } : {}),
  };
}

/**
 * `q=` search over names and numbers: NFC-normalized, at least 2 characters, matched with
 * case-insensitive contains, which PostgreSQL serves from the pg_trgm GIN indexes.
 */
export function searchWhere(
  q: string | undefined,
  fields: readonly string[],
): Record<string, unknown> | undefined {
  const term = q ? normalizeText(q) : '';
  if (term.length < 2) return undefined;
  return { OR: fields.map((field) => ({ [field]: { contains: term, mode: 'insensitive' } })) };
}
