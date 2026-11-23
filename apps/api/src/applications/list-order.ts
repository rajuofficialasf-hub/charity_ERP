import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../i18n/api-error.js';

/** A column the office's list orders by before the id, empty values last. */
interface OrderColumn {
  field: 'totalScore' | 'submittedAt';
  direction: 'asc' | 'desc';
}

/**
 * The office's orders of a project's applications, each ending on the id so every row has one
 * place: by arrival, the earliest sent first; by score, the highest first and an equal score by
 * arrival. A draft has no arrival and an unscored application no score: both come last. The
 * volunteer's own list keeps the newest first and does not use these.
 */
const ARRIVAL: readonly OrderColumn[] = [{ field: 'submittedAt', direction: 'asc' }];
const SCORE: readonly OrderColumn[] = [
  { field: 'totalScore', direction: 'desc' },
  { field: 'submittedAt', direction: 'asc' },
];

const columnsOf = (byScore: boolean) => (byScore ? SCORE : ARRIVAL);

/** The order as the page's builder reads it, to write a row's values into its cursor. */
export function officeSort(byScore: boolean): { field: string; direction: 'asc' | 'desc' }[] {
  return [...columnsOf(byScore), { field: 'id', direction: 'asc' }];
}

/** The order as Prisma reads it; reversed, empty values first, for a backward page. */
export function officeOrderBy(
  byScore: boolean,
  direction: 'next' | 'prev',
): Prisma.ApplicationOrderByWithRelationInput[] {
  const back = direction === 'prev';
  return [
    ...columnsOf(byScore).map((c) => ({
      [c.field]: {
        sort: back ? (c.direction === 'asc' ? 'desc' : 'asc') : c.direction,
        nulls: back ? 'first' : 'last',
      },
    })),
    { id: back ? 'desc' : 'asc' },
  ] as Prisma.ApplicationOrderByWithRelationInput[];
}

const cursorValues = (byScore: boolean) =>
  byScore
    ? z.tuple([z.number().nullable(), z.iso.datetime().nullable(), z.uuid()])
    : z.tuple([z.iso.datetime().nullable(), z.uuid()]);

/** A row's values of the order: a cursor carries them, and a batch of an export reads after them. */
export type OfficeCursorValues = (number | string | null)[];

/**
 * The rows after (`next`) or before (`prev`) the row whose order values are `values`, the id last;
 * a cursor whose values do not fit the order is refused as a bad request.
 */
export function officeKeyset(
  byScore: boolean,
  values: unknown,
  direction: 'next' | 'prev',
): Prisma.ApplicationWhereInput {
  const parsed = cursorValues(byScore).safeParse(values);
  if (!parsed.success)
    throw new ApiError('validation.failed', 422, undefined, [
      { path: 'cursor', code: 'validation.failed' },
    ]);
  const read = parsed.data as OfficeCursorValues;
  const columns = columnsOf(byScore);
  const id = read.at(-1) as string;
  const next = direction === 'next';
  const valueOf = (c: OrderColumn, v: number | string | null) =>
    v === null ? null : c.field === 'submittedAt' ? new Date(v) : v;
  const from = (k: number): Prisma.ApplicationWhereInput => {
    if (k === columns.length) return { id: next ? { gt: id } : { lt: id } };
    const c = columns[k]!;
    const v = valueOf(c, read[k] ?? null);
    const beyond = (c.direction === 'asc') === next ? 'gt' : 'lt';
    if (v === null)
      return next
        ? { AND: [{ [c.field]: null }, from(k + 1)] }
        : { OR: [{ [c.field]: { not: null } }, { AND: [{ [c.field]: null }, from(k + 1)] }] };
    return {
      OR: [
        { [c.field]: { [beyond]: v } },
        ...(next ? [{ [c.field]: null }] : []),
        { AND: [{ [c.field]: v }, from(k + 1)] },
      ],
    };
  };
  return from(0);
}
