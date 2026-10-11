import { PrismaPg } from '@prisma/adapter-pg';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import {
  buildPage,
  decodeCursor,
  keysetWhere,
  orderBy,
  parseSort,
} from '../../src/core/pagination';
import { PrismaClient } from '../../src/generated/prisma/client';
import { cloneTemplate } from './support/db';
import { user } from './support/fixtures';

// Keyset pagination on a real table (API_STANDARDS 4): every row exactly once, forwards and back,
// even with equal sort values (the id breaks ties).
const SECRET = 'integration-secret-0123456789abcdef';
let db: Client;
let drop: () => Promise<void>;
let prisma: PrismaClient;

beforeAll(async () => {
  const clone = await cloneTemplate(inject('templateDb'));
  db = clone.client;
  drop = clone.drop;
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: clone.url }) });
  for (let i = 0; i < 23; i++)
    await user(db, { display_name: `Sample ${String(i % 5).padStart(2, '0')}` });
});

afterAll(async () => {
  await prisma.$disconnect();
  await drop();
});

type Row = { id: string; displayName: string };

async function fetchPage(cursor: string | null, limit: number) {
  const sort = parseSort('displayName', ['displayName'], []);
  const decoded = cursor ? decodeCursor(SECRET, 'users', cursor) : null;
  const direction = decoded?.d ?? 'next';
  const fetched = (await prisma.user.findMany({
    where: { kind: 'staff', ...(decoded ? keysetWhere(sort, decoded) : {}) },
    orderBy: orderBy(sort, direction),
    take: limit + 1,
    select: { id: true, displayName: true },
  })) as Row[];
  return buildPage(fetched, {
    limit,
    sort,
    direction,
    hadCursor: !!decoded,
    secret: SECRET,
    binding: 'users',
  });
}

describe('keyset pagination on users', () => {
  it('visits every row once forwards and returns the same pages backwards', async () => {
    const expected = (
      await prisma.user.findMany({
        where: { kind: 'staff' },
        orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
        select: { id: true },
      })
    ).map((r) => r.id);
    expect(expected).toHaveLength(23);

    const pages: string[][] = [];
    let cursor: string | null = null;
    let last: Awaited<ReturnType<typeof fetchPage>> | undefined;
    do {
      last = await fetchPage(cursor, 7);
      pages.push(last.rows.map((r) => r.id));
      cursor = last.meta.nextCursor;
    } while (cursor);
    expect(pages.flat()).toEqual(expected);
    expect(pages.map((p) => p.length)).toEqual([7, 7, 7, 2]);

    const back = await fetchPage(last.meta.prevCursor, 7);
    expect(back.rows.map((r) => r.id)).toEqual(pages[2]);
  });
});
