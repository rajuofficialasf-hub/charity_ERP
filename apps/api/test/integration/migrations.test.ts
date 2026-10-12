import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { runSeed } from '../../seed/run';
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

// Reversible migrations (ADR-003, NFR-55, TEST_STRATEGY section 3.9). The round trip runs on a
// database holding the base and demo seed (T1.3), so down.sql is proven to work with data.
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
  it('every migration folder has a migration.sql and a non-empty hand-written down.sql (ADR-003)', () => {
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

  it('NFR-55 up, down and up again leave the identical schema; down removes everything, also with seed data', async () => {
    const db = await freshDatabase('rt');
    const empty = await snapshot(db);
    await runMigrations(db, 'up');
    const first = await snapshot(db);
    expect((first.relations ?? []).length).toBeGreaterThan(91);
    const client = newClient(urlFor(db));
    await client.connect();
    try {
      const report = await runSeed(client, ['base', 'demo'], {
        NODE_ENV: 'test',
        DATABASE_URL: urlFor(db),
      });
      expect(report.totals.inserted).toBeGreaterThan(700);
    } finally {
      await client.end();
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
        expect(await snapshot(db), `${dir} changes the schema`).not.toEqual(before);
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
          `INSERT INTO files (id, bucket, object_key, kind, mime, size_bytes, sha256, source) VALUES (gen_random_uuid(), 'profiles', 'k/1.jpg', 'profile_photo', 'image/jpeg', 10, $1, 'gallery') RETURNING id`,
          ['a'.repeat(64)],
        )
      ).rows[0].id as string;
      for (const entity of ['user', 'volunteer'])
        await client.query(
          `INSERT INTO file_links (id, file_id, entity_type, entity_id, slot) VALUES (gen_random_uuid(), $1, $2, gen_random_uuid(), 'photo')`,
          [file, entity],
        );
      await client.query(
        readFileSync(
          join(MIGRATIONS_DIR, '20261012000000_registration_drafts', 'down.sql'),
          'utf8',
        ),
      );
      const rows = async (sql: string) => (await client.query(sql)).rows.map((r) => r.v as string);
      expect(await rows('SELECT purpose AS v FROM otp_codes')).toEqual(['registration']);
      expect(await rows('SELECT entity_type AS v FROM file_links')).toEqual(['volunteer']);
      expect(await rows('SELECT id AS v FROM files')).toEqual([file]);
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
