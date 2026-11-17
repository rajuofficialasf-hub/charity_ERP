import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { runSeed } from '../../seed/run.js';
import { prismaClientFor } from '../../src/core/prisma.service.js';
import { cloneTemplate } from './support/db.js';
import { expectSqlError, SQLSTATE } from './support/expect-sql.js';
import * as f from './support/fixtures.js';

// Programs, permanent projects and yearly sessions in the database
// (docs/database/DATABASE_SCHEMA.md, "project_series" and "projects"): a session names its series,
// sits in its program, runs between two days, and is the only session of its series that starts
// in its year.
let db: Client;
let url: string;
let drop: () => Promise<void>;

beforeAll(async () => {
  ({ client: db, url, drop } = await cloneTemplate(inject('templateDb')));
  const prisma = prismaClientFor(url);
  try {
    await runSeed(prisma, ['base', 'demo'], { NODE_ENV: 'test', DATABASE_URL: url });
  } finally {
    await prisma.$disconnect();
  }
}, 180_000);
afterAll(async () => drop());

interface Series {
  id: string;
  program: string;
  code: string;
  workflow: string;
}

/** A series with its first session (2026), as a fixture project is one. */
async function series(): Promise<Series & { first: string }> {
  const p = await f.project(db);
  const { rows } = await db.query<{ series_id: string; code: string }>(
    'SELECT series_id, code FROM projects WHERE id = $1',
    [p.id],
  );
  return {
    id: rows[0]!.series_id,
    program: p.program,
    code: rows[0]!.code,
    workflow: p.workflow,
    first: p.id,
  };
}

/** One more session of a series, running the whole of its year unless the row says otherwise. */
const session = (s: Series, year: number, over: Record<string, unknown> = {}) =>
  f.projectRow(db, {
    id: randomUUID(),
    program_id: s.program,
    series_id: s.id,
    code: s.code,
    year,
    name_bn: 'প্রকল্প',
    name_en: 'Project',
    workflow_definition_id: s.workflow,
    workflow_version: 1,
    ...over,
  });

const program = () =>
  f.insert(db, 'programs', {
    id: randomUUID(),
    code: `PX${randomUUID().slice(0, 6).toUpperCase()}`,
    name_bn: 'প্রোগ্রাম',
    name_en: 'Program',
  });

describe('a project series and its sessions', () => {
  it('gives the seeded project a series with its code, names and program, for the whole of its year, and the closed session of 2025 the same series', async () => {
    const { rows } = await db.query(
      `SELECT p.code, p.year, p.period_from::text, p.period_to::text,
              s.code AS series_code, s.name_bn = p.name_bn AND s.name_en = p.name_en AS same_names,
              s.program_id = p.program_id AS same_program, g.code AS program_code
         FROM projects p
         JOIN project_series s ON s.id = p.series_id
         JOIN programs g ON g.id = s.program_id
        ORDER BY p.year`,
    );
    // the demo seed's earlier session (docs/testing/DEMO_ACCOUNTS.md) carries a name of its own year
    expect(rows).toEqual([
      {
        code: 'WNT',
        year: 2025,
        period_from: '2025-01-01',
        period_to: '2025-12-31',
        series_code: 'WNT',
        same_names: false,
        same_program: true,
        program_code: 'HUM',
      },
      {
        code: 'WNT',
        year: 2026,
        period_from: '2026-01-01',
        period_to: '2026-12-31',
        series_code: 'WNT',
        same_names: true,
        same_program: true,
        program_code: 'HUM',
      },
    ]);
  });

  it('refuses a project without a series or a period', async () => {
    const s = await series();
    const row = {
      id: randomUUID(),
      program_id: s.program,
      series_id: s.id,
      code: s.code,
      year: 2027,
      period_from: '2027-01-01',
      period_to: '2027-12-31',
      name_bn: 'প্রকল্প',
      name_en: 'Project',
      workflow_definition_id: s.workflow,
      workflow_version: 1,
    };
    for (const column of ['series_id', 'period_from', 'period_to'])
      await expectSqlError(
        f.insert(db, 'projects', { ...row, [column]: null }),
        SQLSTATE.notNullViolation,
        new RegExp(column),
      );
  });

  it('keeps a session in the program of its series', async () => {
    const s = await series();
    const other = await program();
    // a new session in another program than its series
    await expectSqlError(
      session(s, 2027, { program_id: other }),
      SQLSTATE.foreignKeyViolation,
      /projects_series_id_program_id_fkey/,
    );
    // an existing session moved alone, and the series moved from under its session
    await expectSqlError(
      db.query('UPDATE projects SET program_id = $1 WHERE id = $2', [other, s.first]),
      SQLSTATE.foreignKeyViolation,
      /projects_series_id_program_id_fkey/,
    );
    await expectSqlError(
      db.query('UPDATE project_series SET program_id = $1 WHERE id = $2', [other, s.id]),
      SQLSTATE.foreignKeyViolation,
      /projects_series_id_program_id_fkey/,
    );
    // a series that does not exist
    await expectSqlError(
      session(s, 2027, { series_id: randomUUID() }),
      SQLSTATE.foreignKeyViolation,
      /projects_series_id_program_id_fkey/,
    );
    // the two rows move together in one statement
    await db.query(
      `WITH moved AS (UPDATE project_series SET program_id = $1 WHERE id = $2 RETURNING id)
       UPDATE projects SET program_id = $1 FROM moved WHERE projects.series_id = moved.id`,
      [other, s.id],
    );
    const { rows } = await db.query(
      `SELECT p.program_id AS session, s.program_id AS series
         FROM projects p JOIN project_series s ON s.id = p.series_id WHERE p.id = $1`,
      [s.first],
    );
    expect(rows).toEqual([{ session: other, series: other }]);
  });

  it('takes one session of a series per start year, and the same code in another year', async () => {
    const s = await series();
    const next = await session(s, 2027);
    await expectSqlError(session(s, 2027), SQLSTATE.uniqueViolation);
    await expectSqlError(session(s, 2026), SQLSTATE.uniqueViolation);
    // the series alone decides, also for a session whose code drifted from its series'
    await expectSqlError(
      session(s, 2027, { code: 'DRIFTED' }),
      SQLSTATE.uniqueViolation,
      /projects_series_id_year_key/,
    );
    const { rows } = await db.query(
      'SELECT id, code, year FROM projects WHERE series_id = $1 ORDER BY year',
      [s.id],
    );
    expect(rows).toEqual([
      { id: s.first, code: s.code, year: 2026 },
      { id: next, code: s.code, year: 2027 },
    ]);
  });

  it('lets a year be started again once its session is cancelled, and never by two live sessions', async () => {
    const s = await series();
    const cancel = (id: string) =>
      db.query(`UPDATE projects SET status = 'cancelled', cancelled_at = now() WHERE id = $1`, [
        id,
      ]);
    const first = await session(s, 2027);
    await cancel(first);
    // the cancelled session no longer holds 2027: one live session takes it
    const second = await session(s, 2027);
    await expectSqlError(
      session(s, 2027),
      SQLSTATE.uniqueViolation,
      /projects_(series_id|code)_year_key/,
    );
    await expectSqlError(
      session(s, 2027, { code: 'DRIFTED' }),
      SQLSTATE.uniqueViolation,
      /projects_series_id_year_key/,
    );
    // a cancelled session cannot come back onto a year a live one holds
    await expectSqlError(
      db.query(`UPDATE projects SET status = 'draft', cancelled_at = NULL WHERE id = $1`, [first]),
      SQLSTATE.uniqueViolation,
      /projects_(series_id|code)_year_key/,
    );
    // any number of cancelled sessions share the year with the one live session
    await cancel(second);
    const third = await session(s, 2027);
    const { rows } = await db.query(
      'SELECT id, status FROM projects WHERE series_id = $1 AND year = 2027 ORDER BY created_at, id',
      [s.id],
    );
    expect(rows.map((r) => r.status).sort()).toEqual(['cancelled', 'cancelled', 'draft']);
    expect(rows.find((r) => r.status === 'draft')?.id).toBe(third);
  });

  it('never lets two sessions carry one code in one year, whatever their series', async () => {
    const s = await series();
    const other = await series();
    // a session of another series whose code drifted to this one's
    await expectSqlError(
      session(other, 2027, { code: s.code, year: 2026 }),
      SQLSTATE.uniqueViolation,
      /projects_code_year_key/,
    );
    await expectSqlError(
      db.query('UPDATE projects SET code = $1 WHERE id = $2', [s.code, other.first]),
      SQLSTATE.uniqueViolation,
      /projects_code_year_key/,
    );
  });

  it('refuses a period whose end is before its start, and one longer than 24 months', async () => {
    const s = await series();
    await expectSqlError(
      session(s, 2027, { period_from: '2027-06-01', period_to: '2027-05-31' }),
      SQLSTATE.checkViolation,
      /projects_period_check/,
    );
    await expectSqlError(
      session(s, 2027, { period_from: '2027-01-01', period_to: '2029-01-01' }),
      SQLSTATE.checkViolation,
      /projects_period_check/,
    );
    // June to July of the next year, and the longest period: 24 months to the day
    const crossing = await session(s, 2027, { period_from: '2027-06-01', period_to: '2028-07-31' });
    const longest = await session(s, 2029, { period_from: '2029-01-01', period_to: '2030-12-31' });
    // one month alone
    const month = await session(s, 2031, { period_from: '2031-03-01', period_to: '2031-03-31' });
    const { rows } = await db.query(
      `SELECT id, period_from::text, period_to::text FROM projects WHERE id = ANY($1::uuid[]) ORDER BY year`,
      [[crossing, longest, month]],
    );
    expect(rows).toEqual([
      { id: crossing, period_from: '2027-06-01', period_to: '2028-07-31' },
      { id: longest, period_from: '2029-01-01', period_to: '2030-12-31' },
      { id: month, period_from: '2031-03-01', period_to: '2031-03-31' },
    ]);
  });

  it('holds the year of a session to the year its period starts in', async () => {
    const s = await series();
    await expectSqlError(
      session(s, 2027, { period_from: '2028-01-01', period_to: '2028-12-31' }),
      SQLSTATE.checkViolation,
      /projects_period_year_check/,
    );
    // a session that ends in the next year still counts by its start
    await expectSqlError(
      session(s, 2028, { period_from: '2027-06-01', period_to: '2028-07-31' }),
      SQLSTATE.checkViolation,
      /projects_period_year_check/,
    );
    await expectSqlError(
      db.query('UPDATE projects SET year = 2025 WHERE id = $1', [s.first]),
      SQLSTATE.checkViolation,
      /projects_period_year_check/,
    );
    // the year and the period change together
    await db.query(
      `UPDATE projects SET year = 2025, period_from = '2025-01-01', period_to = '2025-12-31' WHERE id = $1`,
      [s.first],
    );
  });

  it('keeps a series code unique and in the shape of a project code', async () => {
    const s = await series();
    const row = (code: string) =>
      f.insert(db, 'project_series', {
        id: randomUUID(),
        program_id: s.program,
        code,
        name_bn: 'প্রকল্প',
        name_en: 'Project',
      });
    await expectSqlError(row(s.code), SQLSTATE.uniqueViolation, /project_series_code_key/);
    for (const code of ['x', 'swb', 'ABCDEFGHI', 'SW1'])
      await expectSqlError(row(code), SQLSTATE.checkViolation, /project_series_code_format/);
  });

  it('stamps a series on every change, and never removes one that holds a session', async () => {
    const s = await series();
    await db.query(`UPDATE project_series SET updated_at = '2026-01-01T00:00:00Z' WHERE id = $1`, [
      s.id,
    ]);
    await db.query(
      `UPDATE project_series SET description_bn = 'পরিবারকে স্বাবলম্বী করা', description_en = 'Making a family self-reliant' WHERE id = $1`,
      [s.id],
    );
    const { rows } = await db.query<{ fresh: boolean; description_bn: string }>(
      `SELECT updated_at > now() - interval '1 minute' AS fresh, description_bn FROM project_series WHERE id = $1`,
      [s.id],
    );
    expect(rows).toEqual([{ fresh: true, description_bn: 'পরিবারকে স্বাবলম্বী করা' }]);
    await expectSqlError(
      db.query('DELETE FROM project_series WHERE id = $1', [s.id]),
      SQLSTATE.foreignKeyViolation,
    );
  });

  it('gives a program a short description in both languages, empty until written', async () => {
    const id = await program();
    const read = async () =>
      (await db.query('SELECT description_bn, description_en FROM programs WHERE id = $1', [id]))
        .rows;
    expect(await read()).toEqual([{ description_bn: null, description_en: null }]);
    await db.query(
      `UPDATE programs SET description_bn = 'মানবিক সহায়তা', description_en = 'Humanitarian aid' WHERE id = $1`,
      [id],
    );
    expect(await read()).toEqual([
      { description_bn: 'মানবিক সহায়তা', description_en: 'Humanitarian aid' },
    ]);
  });
});
