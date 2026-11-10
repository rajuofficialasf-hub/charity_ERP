import { createHash } from 'node:crypto';
import type { Tx } from '../src/core/prisma.service.js';
import { Prisma, type PrismaClient } from '../src/generated/prisma/client.js';

/**
 * Seed helpers. Seeds are deterministic: every row gets an id from seedId(key), every write
 * goes through upsert(), which touches a row only when a value differs, so a second run changes
 * nothing (not even updated_at). Development and test only (see run.ts).
 */

/** Fixed time part of seed ids: 2026-10-11T00:00:00Z. */
const SEED_TIME = Date.UTC(2026, 9, 11);
/** Fixed timestamp written where a business timestamp is required (approvals, grants). */
export const SEED_AT = new Date(SEED_TIME).toISOString();

/** A stable UUID (version 7 layout) for a seed key: fixed time, the rest from SHA-256 of the key. */
export function seedId(key: string): string {
  const hash = createHash('sha256').update(`css-erp-seed:${key}`).digest();
  const bytes = Buffer.alloc(16);
  bytes.writeUIntBE(SEED_TIME, 0, 6);
  hash.copy(bytes, 6, 0, 10);
  bytes[6] = 0x70 | (bytes[6]! & 0x0f);
  bytes[8] = 0x80 | (bytes[8]! & 0x3f);
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Marks a value that must be written as jsonb. */
export class Json {
  constructor(readonly value: unknown) {}
}
export const json = (value: unknown) => new Json(value);

export type Outcome = 'inserted' | 'updated' | 'unchanged';
export interface TableCounts {
  inserted: number;
  updated: number;
  unchanged: number;
}

/** A seed set's transaction: the demo set hashes passwords and writes a few hundred rows in it. */
const SEED_TRANSACTION = { maxWait: 10_000, timeout: 120_000 };

/** A table or column name of the seed's own code, checked before it becomes part of a statement. */
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
function identifier(name: string): Prisma.Sql {
  if (!IDENTIFIER.test(name)) throw new Error(`seed: "${name}" is not a table or column name`);
  return Prisma.raw(`"${name}"`);
}

export class SeedContext {
  readonly counts = new Map<string, TableCounts>();
  actorId: string | null = null;
  private tx: Tx | null = null;
  constructor(readonly prisma: PrismaClient) {}

  /** The open transaction of transaction(), or the client itself between transactions. */
  get db(): Tx {
    return this.tx ?? this.prisma;
  }

  /** Runs the work in one transaction; every write of the context inside it joins that transaction. */
  async transaction(work: () => Promise<void>): Promise<void> {
    if (this.tx) throw new Error('seed: a transaction is already open');
    await this.prisma.$transaction(async (tx) => {
      this.tx = tx;
      try {
        await work();
      } finally {
        this.tx = null;
      }
    }, SEED_TRANSACTION);
  }

  /**
   * Audit columns of business tables, written by the system actor
   * (docs/database/DATABASE_SCHEMA.md, "Audit columns and the system actor").
   */
  audit(): { created_by: string | null; updated_by: string | null } {
    return { created_by: this.actorId, updated_by: this.actorId };
  }

  /**
   * INSERT ... ON CONFLICT (key) DO UPDATE only when a value differs. Columns in `insertOnly`
   * (for example password_hash, created_by) are written on insert and never updated.
   */
  async upsert(
    table: string,
    row: Record<string, unknown>,
    options: { key?: string[]; insertOnly?: string[] } = {},
  ): Promise<Outcome> {
    const key = options.key ?? ['id'];
    const insertOnly = new Set([...(options.insertOnly ?? []), 'created_by']);
    const cols = Object.keys(row);
    const values = cols.map((c) => {
      const v = row[c];
      return v instanceof Json ? Prisma.sql`${JSON.stringify(v.value)}::jsonb` : v;
    });
    const updatable = cols.filter((c) => !key.includes(c) && !insertOnly.has(c));
    const target = identifier(table);
    const names = (list: string[], of?: Prisma.Sql) =>
      Prisma.join(list.map((c) => (of ? Prisma.sql`${of}.${identifier(c)}` : identifier(c))));
    const excluded = Prisma.sql`EXCLUDED`;
    const conflict = updatable.length
      ? Prisma.sql`DO UPDATE SET ${Prisma.join(
          updatable.map((c) => Prisma.sql`${identifier(c)} = EXCLUDED.${identifier(c)}`),
        )}
         WHERE (${names(updatable, target)}) IS DISTINCT FROM (${names(updatable, excluded)})`
      : Prisma.sql`DO NOTHING`;
    const written = await this.db.$queryRaw<{ inserted: boolean }[]>`
      INSERT INTO ${target} (${names(cols)}) VALUES (${Prisma.join(values)})
      ON CONFLICT (${names(key)}) ${conflict}
      RETURNING (xmax = 0) AS inserted`;
    const outcome: Outcome =
      written.length === 0 ? 'unchanged' : written[0]!.inserted ? 'inserted' : 'updated';
    const c = this.counts.get(table) ?? { inserted: 0, updated: 0, unchanged: 0 };
    c[outcome]++;
    this.counts.set(table, c);
    return outcome;
  }

  totals(): TableCounts {
    const t = { inserted: 0, updated: 0, unchanged: 0 };
    for (const c of this.counts.values()) {
      t.inserted += c.inserted;
      t.updated += c.updated;
      t.unchanged += c.unchanged;
    }
    return t;
  }
}
