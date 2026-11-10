import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { runSeed } from '../../seed/run';
import { prismaClientFor } from '../../src/core/prisma.service';
import { beneficiary, locationTree, project, user, volunteer } from './support/fixtures';
import {
  createDatabase,
  dropDatabase,
  migrationDirs,
  MIGRATIONS_DIR,
  newClient,
  runMigrations,
  uniqueName,
  urlFor,
} from './support/db';

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

  it('schema.prisma and the migrations do not drift apart', async () => {
    const shadow = await freshDatabase('shadow');
    const apiDir = join(__dirname, '../..');
    const prismaCli = createRequire(join(apiDir, 'package.json')).resolve('prisma/build/index.js');
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
