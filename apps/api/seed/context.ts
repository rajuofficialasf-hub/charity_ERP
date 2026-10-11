import { createHash } from 'node:crypto';
import type { Client } from 'pg';

/**
 * Seed helpers (T1.3). Seeds are deterministic: every row gets an id from seedId(key), every write
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

export class SeedContext {
  readonly counts = new Map<string, TableCounts>();
  actorId: string | null = null;
  constructor(readonly db: Client) {}

  /** Audit columns of business tables, written by the system actor (DATABASE_SCHEMA section 3). */
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
      return v instanceof Json ? JSON.stringify(v.value) : v;
    });
    const placeholders = cols.map((c, i) =>
      row[c] instanceof Json ? `$${i + 1}::jsonb` : `$${i + 1}`,
    );
    const updatable = cols.filter((c) => !key.includes(c) && !insertOnly.has(c));
    const q = (c: string) => `"${c}"`;
    const conflict = updatable.length
      ? `DO UPDATE SET ${updatable.map((c) => `${q(c)} = EXCLUDED.${q(c)}`).join(', ')}
         WHERE (${updatable.map((c) => `"${table}".${q(c)}`).join(', ')}) IS DISTINCT FROM (${updatable.map((c) => `EXCLUDED.${q(c)}`).join(', ')})`
      : 'DO NOTHING';
    const sql = `INSERT INTO "${table}" (${cols.map(q).join(', ')}) VALUES (${placeholders.join(', ')})
      ON CONFLICT (${key.map(q).join(', ')}) ${conflict}
      RETURNING (xmax = 0) AS inserted`;
    const res = await this.db.query<{ inserted: boolean }>(sql, values);
    const outcome: Outcome =
      res.rowCount === 0 ? 'unchanged' : res.rows[0]!.inserted ? 'inserted' : 'updated';
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
