import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { cloneTemplate } from './support/db.js';

// The database roles of docs/database/DATABASE_SCHEMA.md, "Database roles and privileges" after the
// role script runs: the application role deletes only the three kinds of project setup rows it is
// allowed to, nothing else.
let db: Client;
let drop: () => Promise<void>;
const script = readFileSync(join(import.meta.dirname, '../../prisma/sql/roles.sql'), 'utf8');

beforeAll(async () => {
  ({ client: db, drop } = await cloneTemplate(inject('templateDb')));
  await db.query(script);
});
afterAll(async () => drop());

const can = async (role: string, table: string, privilege: string) =>
  (
    await db.query<{ ok: boolean }>('SELECT has_table_privilege($1, $2, $3) AS ok', [
      role,
      table,
      privilege,
    ])
  ).rows[0]!.ok;

describe('the application role after the role script', () => {
  it('deletes the project setup rows the setup removes', async () => {
    for (const table of ['fund_sources', 'project_areas', 'dawah_syllabus_topics'])
      expect(await can('css_app', table, 'DELETE'), table).toBe(true);
  });

  it('deletes nothing else of the business data', async () => {
    const { rows } = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const deletable: string[] = [];
    for (const { table_name } of rows)
      if (await can('css_app', table_name, 'DELETE')) deletable.push(table_name);
    expect(deletable.sort()).toEqual(['dawah_syllabus_topics', 'fund_sources', 'project_areas']);
  });

  it('draws the BEN number of a new beneficiary from its sequence', async () => {
    const { rows } = await db.query<{ ok: boolean }>(
      `SELECT has_sequence_privilege('css_app', 'beneficiaries_ben_no_seq', 'USAGE') AS ok`,
    );
    expect(rows[0]!.ok).toBe(true);
  });

  it('still writes the append-only logs by insert only', async () => {
    expect(await can('css_app', 'audit_log', 'INSERT')).toBe(true);
    expect(await can('css_app', 'audit_log', 'UPDATE')).toBe(false);
    expect(await can('css_app', 'audit_log', 'DELETE')).toBe(false);
  });
});
