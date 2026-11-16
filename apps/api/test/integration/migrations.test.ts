import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { runSeed } from '../../seed/run.js';
import { prismaClientFor } from '../../src/core/prisma.service.js';
import { expectSqlError, SQLSTATE } from './support/expect-sql.js';
import {
  application,
  beneficiary,
  fakeMobile,
  fakeNid,
  locationTree,
  project,
  projectRow,
  user,
  volunteer,
} from './support/fixtures.js';
import {
  createDatabase,
  dropDatabase,
  migrationDirs,
  MIGRATIONS_DIR,
  newClient,
  runMigrations,
  uniqueName,
  urlFor,
} from './support/db.js';

// Reversible migrations (docs/testing/TEST_STRATEGY.md, "Data integrity"). The round trip runs on a
// database holding the base and demo seed, so down.sql is proven to work with data.
const created: string[] = [];
afterAll(async () => {
  for (const name of created) await dropDatabase(name);
});

async function freshDatabase(prefix: string): Promise<string> {
  const name = uniqueName(prefix);
  await createDatabase(name);
  created.push(name);
  return name;
}

/** Catalog snapshot of the public schema: everything a migration can create. */
async function snapshot(database: string): Promise<Record<string, string[]>> {
  const client = newClient(urlFor(database));
  await client.connect();
  try {
    const q = async (sql: string) =>
      (await client.query(sql)).rows.map((r) => Object.values(r).join(' | ')).sort();
    return {
      relations: await q(
        `SELECT c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S')`,
      ),
      columns: await q(
        `SELECT table_name, column_name, data_type, is_nullable, coalesce(column_default, ''), coalesce(generation_expression, '') FROM information_schema.columns WHERE table_schema = 'public'`,
      ),
      constraints: await q(
        `SELECT conrelid::regclass::text, conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE connamespace = 'public'::regnamespace`,
      ),
      indexes: await q(
        `SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'`,
      ),
      triggers: await q(
        `SELECT tgrelid::regclass::text, tgname, pg_get_triggerdef(oid) FROM pg_trigger WHERE NOT tgisinternal`,
      ),
      functions: await q(
        `SELECT p.proname, md5(p.prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'`,
      ),
      extensions: await q(`SELECT extname FROM pg_extension WHERE extname <> 'plpgsql'`),
    };
  } finally {
    await client.end();
  }
}

describe('migrations', () => {
  it('every migration folder has a migration.sql and a non-empty hand-written down.sql', () => {
    const dirs = migrationDirs();
    expect(dirs.length).toBeGreaterThan(0);
    for (const dir of dirs) {
      expect(existsSync(join(MIGRATIONS_DIR, dir, 'migration.sql')), `${dir}/migration.sql`).toBe(
        true,
      );
      const down = join(MIGRATIONS_DIR, dir, 'down.sql');
      expect(existsSync(down), `${dir}/down.sql`).toBe(true);
      expect(
        readFileSync(down, 'utf8').replace(/--.*$/gm, '').trim().length,
        `${dir}/down.sql is empty`,
      ).toBeGreaterThan(0);
    }
  });

  it('up, down and up again leave the identical schema; down removes everything, also with seed data', async () => {
    const db = await freshDatabase('rt');
    const empty = await snapshot(db);
    await runMigrations(db, 'up');
    const first = await snapshot(db);
    expect((first.relations ?? []).length).toBeGreaterThan(91);
    const prisma = prismaClientFor(urlFor(db));
    try {
      const report = await runSeed(prisma, ['base', 'demo'], {
        NODE_ENV: 'test',
        DATABASE_URL: urlFor(db),
      });
      expect(report.totals.inserted).toBeGreaterThan(700);
    } finally {
      await prisma.$disconnect();
    }
    await runMigrations(db, 'down');
    expect(await snapshot(db)).toEqual(empty);
    await runMigrations(db, 'up');
    expect(await snapshot(db)).toEqual(first);
  });

  it('each later migration down.sql restores the schema of the migration before it', async () => {
    const dirs = migrationDirs();
    const db = await freshDatabase('step');
    const client = newClient(urlFor(db));
    await client.connect();
    try {
      const apply = (dir: string, file: 'migration.sql' | 'down.sql') =>
        client.query(readFileSync(join(MIGRATIONS_DIR, dir, file), 'utf8'));
      await apply(dirs[0]!, 'migration.sql');
      for (const dir of dirs.slice(1)) {
        const before = await snapshot(db);
        await apply(dir, 'migration.sql');
        // a migration marked as data only must leave the schema exactly as it was
        const dataOnly = readFileSync(
          join(MIGRATIONS_DIR, dir, 'migration.sql'),
          'utf8',
        ).startsWith('-- Data only:');
        if (dataOnly) expect(await snapshot(db), `${dir} is data only`).toEqual(before);
        else expect(await snapshot(db), `${dir} changes the schema`).not.toEqual(before);
        await apply(dir, 'down.sql');
        expect(await snapshot(db), `${dir}/down.sql`).toEqual(before);
        await apply(dir, 'migration.sql');
      }
    } finally {
      await client.end();
    }
  });

  it('the registration drafts down.sql removes contact-change codes and staff photo links and keeps the rest', async () => {
    const db = await freshDatabase('regdown');
    await runMigrations(db, 'up');
    const client = newClient(urlFor(db));
    await client.connect();
    try {
      const otp = (purpose: string) =>
        client.query(
          `INSERT INTO otp_codes (id, purpose, channel, address_hash, code_hash, expires_at) VALUES (gen_random_uuid(), $1, 'sms', 'h', 'c', now())`,
          [purpose],
        );
      await otp('contact_change');
      await otp('registration');
      const file = (
        await client.query(
          `INSERT INTO files (id, bucket, storage_driver, object_key, kind, mime, size_bytes, sha256, source) VALUES (gen_random_uuid(), 'profiles', 'nas', 'k/1.jpg', 'profile_photo', 'image/jpeg', 10, $1, 'gallery') RETURNING id`,
          ['a'.repeat(64)],
        )
      ).rows[0].id as string;
      for (const entity of ['user', 'volunteer'])
        await client.query(
          `INSERT INTO file_links (id, file_id, entity_type, entity_id, slot) VALUES (gen_random_uuid(), $1, $2, gen_random_uuid(), 'photo')`,
          [file, entity],
        );
      // the later migration first, as a rollback would
      for (const dir of [
        '20261013000000_registration_draft_channels',
        '20261012000000_registration_drafts',
      ])
        await client.query(readFileSync(join(MIGRATIONS_DIR, dir, 'down.sql'), 'utf8'));
      const rows = async (sql: string) => (await client.query(sql)).rows.map((r) => r.v as string);
      expect(await rows('SELECT purpose AS v FROM otp_codes')).toEqual(['registration']);
      expect(await rows('SELECT entity_type AS v FROM file_links')).toEqual(['volunteer']);
      expect(await rows('SELECT id AS v FROM files')).toEqual([file]);
    } finally {
      await client.end();
    }
  });

  it('the beneficiary master migration numbers existing profiles in the order they were created', async () => {
    const dirs = migrationDirs();
    const at = dirs.indexOf('20261020160000_beneficiary_master');
    expect(at).toBeGreaterThan(0);
    const db = await freshDatabase('benno');
    const client = newClient(urlFor(db));
    await client.connect();
    try {
      const apply = (dir: string, file: 'migration.sql' | 'down.sql' = 'migration.sql') =>
        client.query(readFileSync(join(MIGRATIONS_DIR, dir, file), 'utf8'));
      for (const dir of dirs.slice(0, at)) await apply(dir);
      const loc = await locationTree(client);
      // created out of id order, so the numbers must follow the creation time
      const late = await beneficiary(client, loc, { created_at: '2026-10-03T00:00:00Z' });
      const early = await beneficiary(client, loc, { created_at: '2026-10-01T00:00:00Z' });
      const middle = await beneficiary(client, loc, { created_at: '2026-10-02T00:00:00Z' });
      const before = (await client.query('SELECT id, updated_at FROM beneficiaries ORDER BY id'))
        .rows;
      await apply(dirs[at]!);
      const numbers = async () =>
        Object.fromEntries(
          (await client.query('SELECT id, ben_no FROM beneficiaries')).rows.map((r) => [
            r.id as string,
            r.ben_no as number,
          ]),
        );
      expect(await numbers()).toEqual({ [early]: 1, [middle]: 2, [late]: 3 });
      // numbering is not an edit of the profile
      expect(
        (await client.query('SELECT id, updated_at FROM beneficiaries ORDER BY id')).rows,
      ).toEqual(before);
      const next = await beneficiary(client, loc);
      expect((await numbers())[next]).toBe(4);
      const indexes = async () =>
        (
          await client.query(
            `SELECT indexname AS v FROM pg_indexes WHERE tablename = 'beneficiaries' AND indexname LIKE 'beneficiaries_dup_%'`,
          )
        ).rows
          .map((r) => r.v as string)
          .sort();
      expect(await indexes()).toEqual([
        'beneficiaries_dup_name_dob_union_idx',
        'beneficiaries_dup_name_father_mobile_idx',
      ]);
      await apply(dirs[at]!, 'down.sql');
      expect(await indexes()).toEqual([]);
      expect(
        (await client.query(`SELECT to_regclass('beneficiary_merge_dismissals') AS t`)).rows[0].t,
      ).toBeNull();
    } finally {
      await client.end();
    }
  });

  it('the help counters migration counts everyone by the shared rule, merges included, without stamping a profile', async () => {
    const dirs = migrationDirs();
    const at = dirs.indexOf('20261115120000_beneficiary_help_counters');
    expect(at).toBeGreaterThan(0);
    const db = await freshDatabase('help');
    const client = newClient(urlFor(db));
    await client.connect();
    try {
      const apply = (dir: string, file: 'migration.sql' | 'down.sql' = 'migration.sql') =>
        client.query(readFileSync(join(MIGRATIONS_DIR, dir, file), 'utf8'));
      for (const dir of dirs.slice(0, at)) await apply(dir);
      const loc = await locationTree(client);
      const y2025 = [await project(client, { year: 2025 }), await project(client, { year: 2025 })];
      const y2026 = [await project(client, { year: 2026 }), await project(client, { year: 2026 })];
      const approvedAt = new Date().toISOString();
      const apply_ = (
        p: Awaited<ReturnType<typeof project>>,
        beneficiaryId: string,
        over: Record<string, unknown> = {},
      ) =>
        application(
          client,
          { project: p, loc },
          { beneficiary_id: beneficiaryId, status: 'approved', approved_at: approvedAt, ...over },
        );
      const twice = await beneficiary(client, loc);
      await apply_(y2025[0]!, twice);
      await apply_(y2025[1]!, twice, { status: 'completed', outcome: 'distributed' });
      await apply_(y2026[0]!, twice);
      // closed: counted only when approved before the close and delivered
      await apply_(y2026[1]!, twice, { status: 'closed', outcome: 'not_distributed' });
      const never = await beneficiary(client, loc);
      await apply_(y2025[0]!, never, { status: 'rejected', approved_at: null });
      await apply_(y2026[0]!, never, { status: 'closed', approved_at: null });
      // a merge left one application on the retired profile; it counts for the kept one too
      const keptOne = await beneficiary(client, loc);
      const retired = await beneficiary(client, loc);
      await apply_(y2026[1]!, keptOne);
      const left = await apply_(y2026[1]!, retired, { status: 'closed', outcome: null });
      const proposer = await user(client);
      await client.query(
        `INSERT INTO profile_merges (id, kept_id, merged_id, status, reason, proposed_by, merged_by, merged_at, snapshot)
         VALUES (gen_random_uuid(), $1, $2, 'merged', 'একই মানুষ', $3, $3, now(), $4)`,
        [keptOne, retired, proposer, JSON.stringify({ moved: {}, leftBehind: [left] })],
      );
      await client.query('UPDATE beneficiaries SET merged_into_id = $1 WHERE id = $2', [
        keptOne,
        retired,
      ]);
      const stamps = async () =>
        (await client.query('SELECT id, updated_at FROM beneficiaries ORDER BY id')).rows;
      const before = await stamps();
      await apply(dirs[at]!);
      const counters = Object.fromEntries(
        (
          await client.query('SELECT id, help_count, max_helps_in_year FROM beneficiaries')
        ).rows.map((r) => [
          r.id as string,
          [r.help_count as number, r.max_helps_in_year as number],
        ]),
      );
      expect(counters[twice]).toEqual([3, 2]);
      expect(counters[never]).toEqual([0, 0]);
      expect(counters[keptOne]).toEqual([2, 2]);
      expect(counters[retired]).toEqual([1, 1]);
      // counting is not an edit of the profile
      expect(await stamps()).toEqual(before);
      await apply(dirs[at]!, 'down.sql');
      const columns = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'beneficiaries' AND column_name IN ('help_count', 'max_helps_in_year')`,
      );
      expect(columns.rows).toEqual([]);
      // the update stamp follows every edit again after the rollback
      await client.query(`UPDATE beneficiaries SET village = 'অন্য গ্রাম' WHERE id = $1`, [never]);
      const after = (
        await client.query('SELECT updated_at FROM beneficiaries WHERE id = $1', [never])
      ).rows[0].updated_at as Date;
      const old = before.find((r) => r.id === never)!.updated_at as Date;
      expect(after.getTime()).toBeGreaterThan(old.getTime());
    } finally {
      await client.end();
    }
  });

  it('the project series migration makes every existing project the one session of its own series, and down gives the projects back', async () => {
    const dirs = migrationDirs();
    const at = dirs.indexOf('20261116120000_project_series');
    expect(at).toBeGreaterThan(0);
    const db = await freshDatabase('series');
    const client = newClient(urlFor(db));
    await client.connect();
    try {
      const apply = (dir: string, file: 'migration.sql' | 'down.sql' = 'migration.sql') =>
        client.query(readFileSync(join(MIGRATIONS_DIR, dir, file), 'utf8'));
      for (const dir of dirs.slice(0, at)) await apply(dir);
      const maker = await user(client);
      // every state a project can be in, three years, and two projects of one program
      const draft = await project(client, { year: 2027, created_by: maker, updated_by: maker });
      const active = await project(client, {
        year: 2026,
        status: 'active',
        name_bn: 'শীতবস্ত্র বিতরণ 2026',
        name_en: 'Winter Clothing 2026',
        created_at: '2026-01-05T00:00:00Z',
      });
      const closing = await project(client, { year: 2026, status: 'closing' });
      const closed = await project(client, {
        year: 2025,
        status: 'closed',
        program_id: active.program,
      });
      const cancelled = await project(client, {
        year: 2026,
        status: 'cancelled',
        cancelled_at: '2026-02-01T00:00:00Z',
      });
      const all = [draft, active, closing, closed, cancelled].map((p) => p.id);
      // an application keeps its project and its number
      const loc = await locationTree(client);
      const entry = await application(
        client,
        { project: active, loc },
        { app_no: 'TST-2026-00001', beneficiary_id: await beneficiary(client, loc) },
      );
      const PROJECT =
        'id, program_id, code, year, name_bn, name_en, status, created_at, created_by, updated_at, updated_by';
      const projects = async () =>
        (await client.query(`SELECT ${PROJECT} FROM projects ORDER BY id`)).rows;
      const seriesCount = async () =>
        (await client.query('SELECT count(*)::int AS n FROM project_series')).rows[0].n as number;
      const before = await projects();
      expect(before).toHaveLength(5);

      await apply(dirs[at]!);
      // nothing a project held has changed, its update stamp included
      expect(await projects()).toEqual(before);
      const sessions = (
        await client.query(
          `SELECT p.id, p.series_id, p.period_from::text, p.period_to::text,
                  s.description_bn, s.description_en
             FROM projects p JOIN project_series s ON s.id = p.series_id ORDER BY p.id`,
        )
      ).rows;
      expect(sessions).toHaveLength(5);
      for (const row of sessions) {
        const p = before.find((b) => b.id === row.id)!;
        // the series is the project's own: its id, program, code, names and audit columns
        expect(row.series_id).toBe(p.id);
        expect(row.period_from).toBe(`${p.year}-01-01`);
        expect(row.period_to).toBe(`${p.year}-12-31`);
        expect([row.description_bn, row.description_en]).toEqual([null, null]);
        const series = (
          await client.query(
            `SELECT id, program_id, code, name_bn, name_en, created_at, created_by, updated_at, updated_by FROM project_series WHERE id = $1`,
            [row.series_id],
          )
        ).rows[0];
        expect(series).toEqual({
          id: p.id,
          program_id: p.program_id,
          code: p.code,
          name_bn: p.name_bn,
          name_en: p.name_en,
          created_at: p.created_at,
          created_by: p.created_by,
          updated_at: p.updated_at,
          updated_by: p.updated_by,
        });
      }
      expect(await seriesCount()).toBe(5);
      expect(
        (await client.query('SELECT project_id, app_no FROM applications WHERE id = $1', [entry]))
          .rows,
      ).toEqual([{ project_id: active.id, app_no: 'TST-2026-00001' }]);
      expect(
        (await client.query('SELECT description_bn, description_en FROM programs')).rows.every(
          (r) => r.description_bn === null && r.description_en === null,
        ),
      ).toBe(true);

      // the next year of the same project: a second session of the series, with its code
      const code = before.find((b) => b.id === active.id)!.code as string;
      const next = await projectRow(client, {
        id: randomUUID(),
        program_id: active.program,
        series_id: active.id,
        code,
        year: 2027,
        period_from: '2027-06-01',
        period_to: '2028-07-31',
        name_bn: 'শীতবস্ত্র বিতরণ 2026',
        name_en: 'Winter Clothing 2026',
        workflow_definition_id: active.workflow,
        workflow_version: 1,
      });

      // two sessions now share a code, which no two projects could before: down stops, whole
      await expectSqlError(
        apply(dirs[at]!, 'down.sql'),
        SQLSTATE.uniqueViolation,
        new RegExp(`project_series_in_use.*${code}`),
      );
      expect(await seriesCount()).toBe(5);
      expect(
        (await client.query('SELECT series_id FROM projects WHERE id = $1', [next])).rows,
      ).toEqual([{ series_id: active.id }]);
      // cancelling the later session frees nothing, since a cancelled session keeps its code
      await client.query(
        `UPDATE projects SET status = 'cancelled', cancelled_at = now() WHERE id = $1`,
        [next],
      );
      await expectSqlError(apply(dirs[at]!, 'down.sql'), SQLSTATE.uniqueViolation);
      // with a code of its own it is a project like the others again
      await client.query(`UPDATE projects SET code = 'TSTNEXT' WHERE id = $1`, [next]);
      const stamps = async () =>
        (await client.query('SELECT id, updated_at FROM projects ORDER BY id')).rows;
      const stamped = await stamps();
      await apply(dirs[at]!, 'down.sql');
      expect(
        (await client.query(`SELECT to_regclass('project_series') AS t`)).rows[0].t,
      ).toBeNull();
      const columns = await client.query(
        `SELECT table_name, column_name FROM information_schema.columns
          WHERE (table_name = 'projects' AND column_name IN ('series_id', 'period_from', 'period_to'))
             OR (table_name = 'programs' AND column_name IN ('description_bn', 'description_en'))`,
      );
      expect(columns.rows).toEqual([]);
      // the five projects are as they were before the migration, and the sixth stays a project
      expect((await projects()).filter((p) => all.includes(p.id as string))).toEqual(before);
      expect(await stamps()).toEqual(stamped);
      expect((await projects()).map((p) => p.id)).toContain(next);
      // a code is unique across all projects again
      await expectSqlError(
        client.query(`UPDATE projects SET code = $1 WHERE id = $2`, [code, next]),
        SQLSTATE.uniqueViolation,
        /projects_code_key/,
      );

      // the migration applies again on what the reverse left: six projects, six series
      await apply(dirs[at]!);
      expect(
        (
          await client.query(
            `SELECT count(*)::int AS n,
                    count(*) FILTER (WHERE p.series_id = p.id AND s.code = p.code AND s.program_id = p.program_id)::int AS own
               FROM projects p JOIN project_series s ON s.id = p.series_id`,
          )
        ).rows,
      ).toEqual([{ n: 6, own: 6 }]);
      expect(await stamps()).toEqual(stamped);
    } finally {
      await client.end();
    }
  });

  it('the draft channels migration keeps existing verified and submitted drafts (backfill)', async () => {
    const dirs = migrationDirs();
    const at = dirs.indexOf('20261013000000_registration_draft_channels');
    expect(at).toBeGreaterThan(0);
    const db = await freshDatabase('chan');
    const client = newClient(urlFor(db));
    await client.connect();
    try {
      const apply = (dir: string) =>
        client.query(readFileSync(join(MIGRATIONS_DIR, dir, 'migration.sql'), 'utf8'));
      for (const dir of dirs.slice(0, at)) await apply(dir);
      const user = (
        await client.query(
          `INSERT INTO users (id, kind, mobile, state, display_name) VALUES (gen_random_uuid(), 'volunteer', '01700009901', 'pending', 'নমুনা') RETURNING id`,
        )
      ).rows[0].id as string;
      // a draft verified the earlier way and a submitted one
      await client.query(
        `INSERT INTO registration_drafts (id, mobile, email, token_hash, verified_at, expires_at) VALUES (gen_random_uuid(), '01700009902', 'v@example.org', 'h', now(), now() + interval '1 day')`,
      );
      await client.query(
        `INSERT INTO registration_drafts (id, mobile, email, verified_at, expires_at, submitted_user_id, submitted_at) VALUES (gen_random_uuid(), '01700009901', 's@example.org', now(), now(), $1, now())`,
        [user],
      );
      await apply(dirs[at]!);
      const rows = (
        await client.query(
          'SELECT verified_at = mobile_verified_at AND verified_at = email_verified_at AS same FROM registration_drafts',
        )
      ).rows;
      expect(rows).toEqual([{ same: true }, { same: true }]);
    } finally {
      await client.end();
    }
  });

  it('the change requests of officials keep every earlier request with its person', async () => {
    const dirs = migrationDirs();
    const at = dirs.indexOf('20261102180000_change_requests_of_officials');
    expect(at).toBeGreaterThan(0);
    const db = await freshDatabase('chreq');
    const client = newClient(urlFor(db));
    await client.connect();
    try {
      const apply = (dir: string) =>
        client.query(readFileSync(join(MIGRATIONS_DIR, dir, 'migration.sql'), 'utf8'));
      for (const dir of dirs.slice(0, at)) await apply(dir);
      const person = await user(client, { kind: 'volunteer', email: null, mobile: '01700009911' });
      const volunteerId = await volunteer(client, await locationTree(client), person);
      await client.query(
        `INSERT INTO volunteer_change_requests (id, volunteer_id, kind, field, requested_by, status)
         VALUES (gen_random_uuid(), $1, 'profile_edit', 'education', $2, 'submitted')`,
        [volunteerId, person],
      );
      await apply(dirs[at]!);
      const rows = (
        await client.query('SELECT user_id, volunteer_id FROM volunteer_change_requests')
      ).rows;
      expect(rows).toEqual([{ user_id: person, volunteer_id: volunteerId }]);
    } finally {
      await client.end();
    }
  });

  it('retiring the Implementer ends its grants and project access with an audit, and down gives them back', async () => {
    const dirs = migrationDirs();
    const at = dirs.indexOf('20261108120000_retire_implementer_role');
    expect(at).toBeGreaterThan(0);
    const db = await freshDatabase('impl');
    const client = newClient(urlFor(db));
    await client.connect();
    const file = (dir: string, name: string) =>
      client.query(readFileSync(join(MIGRATIONS_DIR, dir, name), 'utf8'));
    try {
      for (const dir of dirs.slice(0, at)) await file(dir, 'migration.sql');
      for (const key of ['implementer', 'project_executive'])
        await client.query(
          `INSERT INTO roles (key, name_bn, name_en, kind, global_scope) VALUES ($1, $1, $1, 'official', false)`,
          [key],
        );
      const active = await user(client);
      const former = await user(client);
      const executive = await user(client);
      const grant = (userId: string, role: string, revoked: string | null) =>
        client.query(
          `INSERT INTO user_roles (id, user_id, role_key, granted_by, revoked_at)
           VALUES (gen_random_uuid(), $1, $2, $1, $3) RETURNING id`,
          [userId, role, revoked],
        );
      await grant(active, 'implementer', null);
      await grant(former, 'implementer', '2026-10-01T00:00:00Z');
      await grant(executive, 'project_executive', null);
      const { id: projectId } = await project(client);
      await client.query(
        `INSERT INTO project_staff (id, project_id, user_id, role_key, can_view, can_edit, can_delete, granted_by)
         VALUES (gen_random_uuid(), $1, $2, 'implementer', true, true, false, $2)`,
        [projectId, active],
      );
      const state = async () => ({
        roles: (
          await client.query(
            `SELECT user_id, role_key, revoked_at IS NULL AS active FROM user_roles ORDER BY user_id, role_key`,
          )
        ).rows,
        staff: (await client.query('SELECT ended_at IS NULL AS active FROM project_staff')).rows,
        versions: Object.fromEntries(
          (await client.query('SELECT id, permission_version FROM users')).rows.map((r) => [
            r.id,
            r.permission_version,
          ]),
        ),
        audit: (
          await client.query(
            `SELECT entity_id FROM audit_log WHERE action = 'permission_change' AND reason LIKE 'D-162:%'`,
          )
        ).rows,
      });
      const before = await state();

      await file(dirs[at]!, 'migration.sql');
      const after = await state();
      expect(after.roles.find((r) => r.user_id === active)?.active).toBe(false);
      expect(after.roles.find((r) => r.user_id === executive)?.active).toBe(true);
      expect(after.staff).toEqual([{ active: false }]);
      expect(after.versions[active]).toBe(before.versions[active] + 1);
      expect(after.versions[former]).toBe(before.versions[former]);
      expect(after.versions[executive]).toBe(before.versions[executive]);
      expect(after.audit).toEqual([{ entity_id: active }]);

      await file(dirs[at]!, 'down.sql');
      const back = await state();
      expect(back.roles).toEqual(before.roles);
      expect(back.staff).toEqual([{ active: true }]);
      expect(back.versions[active]).toBe(before.versions[active] + 2);
      // the audit log is append-only: the retirement stays on record beside its reversal
      expect(back.audit).toEqual([{ entity_id: active }]);
      const reverted = await client.query(
        `SELECT entity_id FROM audit_log WHERE reason LIKE 'Reverted D-162:%'`,
      );
      expect(reverted.rows).toEqual([{ entity_id: active }]);
    } finally {
      await client.end();
    }
  });

  describe('the optional identity migration and its down.sql', () => {
    const OPTIONAL_IDENTITY = '20261112160000_beneficiary_optional_identity';
    type Db = ReturnType<typeof newClient>;

    /** A database migrated up to the migration before it, with the warnings its scripts raise. */
    async function upToOptionalIdentity(prefix: string) {
      const dirs = migrationDirs();
      const at = dirs.indexOf(OPTIONAL_IDENTITY);
      expect(at).toBeGreaterThan(0);
      const client = newClient(urlFor(await freshDatabase(prefix)));
      await client.connect();
      const warnings: string[] = [];
      client.on('notice', (notice) => {
        if (notice.severity === 'WARNING') warnings.push(notice.message ?? '');
      });
      for (const dir of dirs.slice(0, at))
        await client.query(readFileSync(join(MIGRATIONS_DIR, dir, 'migration.sql'), 'utf8'));
      const apply = async (file: 'migration.sql' | 'down.sql') => {
        warnings.length = 0;
        await client.query(readFileSync(join(MIGRATIONS_DIR, OPTIONAL_IDENTITY, file), 'utf8'));
      };
      return { client, apply, warnings };
    }

    /** What the migration changes: the three rules and everything it adds for the number's owner. */
    async function schemaOf(client: Db) {
      const names = async (sql: string) =>
        (await client.query(sql)).rows.map((r) => r.v as string).sort();
      return {
        mobileNullable: (
          await client.query(
            `SELECT is_nullable FROM information_schema.columns
              WHERE table_name = 'beneficiaries' AND column_name = 'mobile'`,
          )
        ).rows[0].is_nullable as string,
        // each rule's constraint, and whether it holds for the rows already there
        checks: Object.fromEntries(
          (
            await client.query(
              `SELECT conname, convalidated FROM pg_constraint
                WHERE conname IN ('beneficiaries_identity_check', 'beneficiaries_mobile_required',
                                  'applications_identity_kind_check')`,
            )
          ).rows.map((r) => [r.conname as string, r.convalidated as boolean]),
        ),
        ownerColumns: await names(
          `SELECT column_name AS v FROM information_schema.columns
            WHERE table_name = 'beneficiaries' AND column_name LIKE 'mobile_owner%'`,
        ),
        ownerConstraints: await names(
          `SELECT conname AS v FROM pg_constraint
            WHERE conrelid = 'beneficiaries'::regclass AND conname LIKE 'beneficiaries_mobile_owner%'`,
        ),
        ownerIndexes: await names(
          `SELECT indexname AS v FROM pg_indexes
            WHERE tablename = 'beneficiaries' AND indexname LIKE 'beneficiaries_mobile_owner%'`,
        ),
      };
    }

    const NO_OWNER = { ownerColumns: [], ownerConstraints: [], ownerIndexes: [] };
    const BEFORE = {
      mobileNullable: 'NO',
      checks: { beneficiaries_identity_check: true, applications_identity_kind_check: true },
      ...NO_OWNER,
    };
    const AFTER = {
      mobileNullable: 'YES',
      checks: { applications_identity_kind_check: true },
      ownerColumns: ['mobile_owner_code', 'mobile_owner_list', 'mobile_owner_name'],
      ownerConstraints: [
        'beneficiaries_mobile_owner_list_mobile_owner_code_fkey',
        'beneficiaries_mobile_owner_name_check',
      ],
      ownerIndexes: ['beneficiaries_mobile_owner_code_idx'],
    };
    const BARE = { nid: null, birth_reg: null, mobile: null };
    const numbersOf = async (client: Db, id: string) =>
      (await client.query('SELECT nid, birth_reg, mobile FROM beneficiaries WHERE id = $1', [id]))
        .rows;

    it('keeps a profile without a document and a mobile, refuses a new one, and the migration applies again', async () => {
      const { client, apply, warnings } = await upToOptionalIdentity('light');
      try {
        expect(await schemaOf(client)).toEqual(BEFORE);
        await apply('migration.sql');
        expect(await schemaOf(client)).toEqual(AFTER);

        // while every profile has a document and a mobile, the reverse is exact and warns of nothing
        const loc = await locationTree(client);
        const full = await beneficiary(client, loc);
        await apply('down.sql');
        expect(await schemaOf(client)).toEqual(BEFORE);
        expect(warnings).toEqual([]);
        await expectSqlError(beneficiary(client, loc, BARE), SQLSTATE.notNullViolation);
        // a second run in a row changes nothing
        await apply('down.sql');
        expect(await schemaOf(client)).toEqual(BEFORE);
        expect(warnings).toEqual([]);
        await apply('migration.sql');
        expect(await schemaOf(client)).toEqual(AFTER);

        // with a profile that has neither, and its application, the reverse keeps both rows
        const light = await beneficiary(client, loc, BARE);
        const p = await project(client);
        const entry = await application(
          client,
          { project: p, loc },
          { beneficiary_id: light, identity_kind: 'none' },
        );
        const other = await application(
          client,
          { project: p, loc },
          { beneficiary_id: full, identity_kind: 'nid' },
        );
        await apply('down.sql');
        const KEPT = {
          mobileNullable: 'YES',
          checks: {
            beneficiaries_identity_check: false,
            beneficiaries_mobile_required: false,
            applications_identity_kind_check: false,
          },
          ...NO_OWNER,
        };
        expect(await schemaOf(client)).toEqual(KEPT);
        // the operator is told how many rows were kept, and which checks hold them
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain(
          '1 profiles without a mobile, 1 profiles without a document, 1 applications of the kind none',
        );
        for (const name of [
          'beneficiaries_mobile_required',
          'beneficiaries_identity_check',
          'applications_identity_kind_check',
        ])
          expect(warnings[0]).toContain(name);
        const kept = async () => ({
          people: (
            await client.query(
              'SELECT id, nid IS NULL AND birth_reg IS NULL AND mobile IS NULL AS bare FROM beneficiaries ORDER BY ben_no',
            )
          ).rows,
          withoutDocument: (
            await client.query(`SELECT id FROM applications WHERE identity_kind = 'none'`)
          ).rows,
        });
        const rows = {
          people: [
            { id: full, bare: false },
            { id: light, bare: true },
          ],
          withoutDocument: [{ id: entry }],
        };
        expect(await kept()).toEqual(rows);
        // a new row must have its document, its mobile and a kind of the earlier two again
        await expectSqlError(
          beneficiary(client, loc, { mobile: null }),
          SQLSTATE.checkViolation,
          /beneficiaries_mobile_required/,
        );
        await expectSqlError(
          beneficiary(client, loc, { nid: null, birth_reg: null }),
          SQLSTATE.checkViolation,
          /beneficiaries_identity_check/,
        );
        await expectSqlError(
          client.query(`UPDATE applications SET identity_kind = 'none' WHERE id = $1`, [other]),
          SQLSTATE.checkViolation,
          /applications_identity_kind_check/,
        );
        // the kept rows are frozen: any change that leaves them as they are is refused
        await expectSqlError(
          client.query(`UPDATE beneficiaries SET village = 'অন্য গ্রাম' WHERE id = $1`, [light]),
          SQLSTATE.checkViolation,
        );
        await expectSqlError(
          client.query(`UPDATE applications SET status = 'under_review' WHERE id = $1`, [entry]),
          SQLSTATE.checkViolation,
          /applications_identity_kind_check/,
        );
        expect(await kept()).toEqual(rows);
        const later = await beneficiary(client, loc);

        // a second run in a row leaves the same rules and the same rows, and warns again
        await apply('down.sql');
        expect(await schemaOf(client)).toEqual(KEPT);
        expect(warnings).toHaveLength(1);
        expect(await kept()).toEqual({
          ...rows,
          people: [...rows.people, { id: later, bare: false }],
        });

        // the migration applies again on what the reverse left
        await apply('migration.sql');
        expect(await schemaOf(client)).toEqual(AFTER);
        expect(await kept()).toEqual({
          ...rows,
          people: [...rows.people, { id: later, bare: false }],
        });
        expect(await numbersOf(client, await beneficiary(client, loc, BARE))).toEqual([BARE]);
      } finally {
        await client.end();
      }
    });

    it('brings each rule back on its own: only the rule a kept row breaks stays unvalidated', async () => {
      const { client, apply, warnings } = await upToOptionalIdentity('mixed');
      try {
        await apply('migration.sql');
        const loc = await locationTree(client);
        const p = await project(client);
        await beneficiary(client, loc);

        // a document and no mobile: only the stand-in for NOT NULL appears
        const person = await beneficiary(client, loc, { mobile: null });
        await apply('down.sql');
        expect(await schemaOf(client)).toEqual({
          mobileNullable: 'YES',
          checks: {
            beneficiaries_identity_check: true,
            beneficiaries_mobile_required: false,
            applications_identity_kind_check: true,
          },
          ...NO_OWNER,
        });
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain(
          '1 profiles without a mobile, 0 profiles without a document, 0 applications of the kind none',
        );
        // frozen until it is given its mobile; the same change then passes
        await expectSqlError(
          client.query(`UPDATE beneficiaries SET is_blocked = true WHERE id = $1`, [person]),
          SQLSTATE.checkViolation,
          /beneficiaries_mobile_required/,
        );
        const mobile = fakeMobile();
        await client.query(
          `UPDATE beneficiaries SET is_blocked = true, mobile = $2 WHERE id = $1`,
          [person, mobile],
        );
        expect(
          (
            await client.query('SELECT is_blocked, mobile FROM beneficiaries WHERE id = $1', [
              person,
            ])
          ).rows,
        ).toEqual([{ is_blocked: true, mobile }]);

        // a mobile and no document: the column is NOT NULL again, the identity check waits
        await apply('migration.sql');
        expect(await schemaOf(client)).toEqual(AFTER);
        const undocumented = await beneficiary(client, loc, { nid: null, birth_reg: null });
        await apply('down.sql');
        expect(await schemaOf(client)).toEqual({
          mobileNullable: 'NO',
          checks: { beneficiaries_identity_check: false, applications_identity_kind_check: true },
          ...NO_OWNER,
        });
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain(
          '0 profiles without a mobile, 1 profiles without a document, 0 applications of the kind none',
        );
        await expectSqlError(beneficiary(client, loc, { mobile: null }), SQLSTATE.notNullViolation);
        await expectSqlError(
          beneficiary(client, loc, { nid: null, birth_reg: null }),
          SQLSTATE.checkViolation,
          /beneficiaries_identity_check/,
        );
        // the other way out: the check dropped by hand frees the kept row
        await expectSqlError(
          client.query(`UPDATE beneficiaries SET village = 'অন্য গ্রাম' WHERE id = $1`, [
            undocumented,
          ]),
          SQLSTATE.checkViolation,
          /beneficiaries_identity_check/,
        );
        await client.query(
          `ALTER TABLE "beneficiaries" DROP CONSTRAINT "beneficiaries_identity_check"`,
        );
        await client.query(`UPDATE beneficiaries SET village = 'অন্য গ্রাম' WHERE id = $1`, [
          undocumented,
        ]);
        expect(
          (await client.query('SELECT village FROM beneficiaries WHERE id = $1', [undocumented]))
            .rows,
        ).toEqual([{ village: 'অন্য গ্রাম' }]);

        // the migration applies again without the checks an operator dropped
        await client.query(
          `ALTER TABLE "applications" DROP CONSTRAINT "applications_identity_kind_check"`,
        );
        await apply('migration.sql');
        expect(await schemaOf(client)).toEqual(AFTER);

        // only an application of the kind none, and every profile whole: the kind check waits
        await client.query('UPDATE beneficiaries SET nid = $2 WHERE id = $1', [
          undocumented,
          fakeNid(),
        ]);
        const entry = await application(
          client,
          { project: p, loc },
          { beneficiary_id: person, identity_kind: 'none' },
        );
        await apply('down.sql');
        expect(await schemaOf(client)).toEqual({
          mobileNullable: 'NO',
          checks: { beneficiaries_identity_check: true, applications_identity_kind_check: false },
          ...NO_OWNER,
        });
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain(
          '0 profiles without a mobile, 0 profiles without a document, 1 applications of the kind none',
        );
        // the application moves on once it names a kind of the earlier two
        await expectSqlError(
          client.query(`UPDATE applications SET status = 'under_review' WHERE id = $1`, [entry]),
          SQLSTATE.checkViolation,
          /applications_identity_kind_check/,
        );
        await client.query(
          `UPDATE applications SET status = 'under_review', identity_kind = 'nid' WHERE id = $1`,
          [entry],
        );
        expect(
          (
            await client.query('SELECT status, identity_kind FROM applications WHERE id = $1', [
              entry,
            ])
          ).rows,
        ).toEqual([{ status: 'under_review', identity_kind: 'nid' }]);

        // with every row whole again, the next run restores the earlier schema exactly
        await apply('down.sql');
        expect(await schemaOf(client)).toEqual(BEFORE);
        expect(warnings).toEqual([]);
      } finally {
        await client.end();
      }
    });
  });

  it('schema.prisma and the migrations do not drift apart', async () => {
    const shadow = await freshDatabase('shadow');
    const apiDir = join(import.meta.dirname, '../..');
    const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
    const result = spawnSync(
      process.execPath,
      [
        prismaCli,
        'migrate',
        'diff',
        '--from-migrations',
        'prisma/migrations',
        '--to-schema',
        'prisma/schema.prisma',
        '--exit-code',
      ],
      {
        cwd: apiDir,
        encoding: 'utf8',
        env: { ...process.env, DATABASE_URL: urlFor(shadow), SHADOW_DATABASE_URL: urlFor(shadow) },
      },
    );
    expect(result.stdout + result.stderr).toContain('No difference detected');
    expect(result.status).toBe(0);
  }, 180_000);
});
