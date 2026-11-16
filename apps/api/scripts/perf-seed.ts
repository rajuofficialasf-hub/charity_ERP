// pnpm --filter @css/api perf:seed [--fresh]: builds the measurement database css_erp_perf
// (docs/testing/PERFORMANCE.md, section "Data set"): the migrations, the locations, the base and
// demo seed, then the large data set of the volunteer and beneficiary tabs at the size the owner
// set: 50,000 volunteers, 2,000,000 beneficiaries, 300 projects and 500,000 applications, spread
// over every union. The rows are made by SQL (generate_series), so the load takes minutes, not
// hours, and a settings row written last marks the data set complete. Only a css_erp_perf database
// on this machine, never under NODE_ENV=production (checkPerfDbAccess in src/config/db-guard.ts);
// the volunteers get no password, so none of these accounts can sign in. --fresh drops the
// database first.
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { prismaClientFor, type Tx } from '../src/core/prisma.service.js';
import { Prisma, type PrismaClient } from '../src/generated/prisma/client.js';
import {
  FIRST_NAMES,
  FORM_TITLE_BN,
  LAST_NAMES,
  PROJECT_NAME_BN,
  VILLAGE_BN,
} from '../seed/perf-data.js';
import { NameKeysJob } from '../src/jobs/name-keys.js';
import { MatchKeysService } from '../src/services/match-keys.js';
import { perfDatabase } from './perf-db.js';

const VOLUNTEERS = 50_000;
const BENEFICIARIES = 2_000_000;
const PROJECTS = 300;
/** Every fourth beneficiary has one application. */
const APPLICATION_EVERY = 4;
const BATCH = 250_000;

const { url, database } = perfDatabase('perf:seed');
/** The settings row written last: without it the data set is partial. */
const MARKER = 'perf.data_set';
const fresh = process.argv.includes('--fresh');
/** The volunteers and the projects are written in one transaction, as one step of the load. */
const SETUP_TRANSACTION = { maxWait: 10_000, timeout: 1_800_000 };

function run(label: string, command: string, args: string[]): void {
  console.warn(`perf:seed: ${label}`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, DATABASE_URL: url },
  });
  if (result.status !== 0) {
    console.error(`perf:seed: ${label} failed.`);
    process.exit(result.status ?? 1);
  }
}

async function createDatabase(): Promise<boolean> {
  // a database name cannot be a parameter; the guard of perfDatabase checked this one
  if (!/^css_erp_perf[a-z0-9_]*$/.test(database)) throw new Error(`refusing "${database}"`);
  const name = Prisma.raw(`"${database}"`);
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const prisma = prismaClientFor(admin.toString(), { max: 1 });
  try {
    if (fresh) await prisma.$executeRaw`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`;
    const exists = await prisma.$queryRaw<unknown[]>`
      SELECT 1 FROM pg_database WHERE datname = ${database}`;
    if (exists.length) return false;
    await prisma.$executeRaw`CREATE DATABASE ${name}`;
    return true;
  } finally {
    await prisma.$disconnect();
  }
}

/** A name of three parts chosen by the row number `n`. */
const nameSql = (n: Prisma.Sql) => Prisma.sql`
  (${FIRST_NAMES}::text[])[1 + ${n} % ${FIRST_NAMES.length}::int]
  || ' ' || (${LAST_NAMES}::text[])[1 + (${n} / ${FIRST_NAMES.length}::int) % ${LAST_NAMES.length}::int]
  || ' ' || (${LAST_NAMES}::text[])[1 + (${n} / ${FIRST_NAMES.length * LAST_NAMES.length}::int) % ${LAST_NAMES.length}::int]`;

async function timed(db: Tx, label: string, sql: Prisma.Sql): Promise<void> {
  const start = Date.now();
  const rows = await db.$executeRaw(sql);
  console.warn(`perf:seed: ${label}: ${rows} rows, ${Date.now() - start} ms`);
}

async function first<T>(db: Tx, sql: Prisma.Sql): Promise<T | undefined> {
  return (await db.$queryRaw<T[]>(sql))[0];
}

/**
 * The large data set. `prisma` holds a single connection, so the temporary function and tables
 * made here stay visible to every later statement, the transaction's included.
 */
async function load(prisma: PrismaClient): Promise<void> {
  // a UUID v7 for a given time, like uuidv7() of @css/shared (PostgreSQL 17 has no uuidv7())
  await prisma.$executeRaw`
    CREATE FUNCTION pg_temp.uuid7(ts timestamptz) RETURNS uuid LANGUAGE sql VOLATILE AS $$
      SELECT encode(set_bit(set_bit(overlay(uuid_send(gen_random_uuid())
        PLACING substring(int8send(floor(extract(epoch FROM ts) * 1000)::bigint) FROM 3)
        FROM 1 FOR 6), 52, 1), 53, 1), 'hex')::uuid
    $$`;
  await prisma.$executeRaw`
    CREATE TEMP TABLE perf_unions AS
    SELECT (row_number() OVER (ORDER BY un.code) - 1)::int AS i, un.id AS union_id,
           up.id AS upazila_id, d.id AS district_id, dv.id AS division_id
    FROM locations un
    JOIN locations up ON up.id = un.parent_id
    JOIN locations d ON d.id = up.parent_id
    JOIN locations dv ON dv.id = d.parent_id
    WHERE un.level = 'union' AND un.active`;
  const unions = (
    await first<{ c: number }>(prisma, Prisma.sql`SELECT count(*)::int AS c FROM perf_unions`)
  )?.c;
  if (!unions) throw new Error('no unions: the locations did not load');
  const head = (
    await first<{ id: string }>(
      prisma,
      Prisma.sql`SELECT id FROM users WHERE email = 'head@example.org'`,
    )
  )?.id;
  if (!head) throw new Error('the demo seed has no Department Head');
  const workflow = (
    await first<{ id: string }>(
      prisma,
      Prisma.sql`SELECT workflow_definition_id AS id FROM projects LIMIT 1`,
    )
  )?.id;
  if (!workflow) throw new Error('the demo seed has no project to take a workflow from');

  await prisma.$transaction(async (db) => {
    // volunteers: one every 30 minutes over the last three years
    await timed(
      db,
      'volunteer ids',
      Prisma.sql`CREATE TEMP TABLE perf_vol AS
       SELECT n, ts, pg_temp.uuid7(ts) AS user_id, pg_temp.uuid7(ts) AS volunteer_id
       FROM (SELECT n, now() - make_interval(secs => (${VOLUNTEERS}::int - n) * 1800.0) AS ts
             FROM generate_series(1, ${VOLUNTEERS}::int) n) s`,
    );
    await timed(
      db,
      'volunteer users',
      Prisma.sql`INSERT INTO users (id, kind, mobile, state, display_name, created_at, updated_at)
       SELECT user_id, 'volunteer', '016' || lpad(n::text, 8, '0'),
              CASE WHEN n % 20 = 0 THEN 'pending' WHEN n % 50 = 1 THEN 'deactivated' ELSE 'active' END,
              ${nameSql(Prisma.sql`n`)}, ts, ts
       FROM perf_vol`,
    );
    await timed(
      db,
      'volunteers',
      Prisma.sql`INSERT INTO volunteers (id, user_id, nid, type, father_name, mother_name, division_id,
         district_id, upazila_id, union_id, category, inactive_flag, approved_by, approved_at,
         created_at, updated_at)
       SELECT v.volunteer_id, v.user_id, '77' || lpad(v.n::text, 11, '0'),
              (ARRAY['general','general','general','local_daee','both','team_member','paid'])[1 + v.n % 7],
              ${nameSql(Prisma.sql`(v.n + 5)`)}, ${nameSql(Prisma.sql`(v.n + 7)`)},
              u.division_id, u.district_id, u.upazila_id, u.union_id,
              CASE WHEN v.n % 5 = 0 THEN NULL ELSE (ARRAY['A','B','C','D'])[1 + v.n % 4] END,
              v.n % 23 = 0,
              CASE WHEN v.n % 20 = 0 THEN NULL ELSE ${head}::uuid END,
              CASE WHEN v.n % 20 = 0 THEN NULL ELSE v.ts END, v.ts, v.ts
       FROM perf_vol v JOIN perf_unions u ON u.i = v.n % ${unions}::int`,
    );
    // the blocklist trigger turns these active accounts into blocked ones
    await timed(
      db,
      'volunteer blocklist',
      Prisma.sql`INSERT INTO blocklist (id, subject_type, subject_id, reason, blocked_by)
       SELECT gen_random_uuid(), 'volunteer', volunteer_id, 'perf data set', ${head}::uuid
       FROM perf_vol WHERE n % 40 = 3`,
    );

    // projects over five years, each with its form
    await timed(
      db,
      'projects',
      Prisma.sql`CREATE TEMP TABLE perf_projects AS
       SELECT i, pg_temp.uuid7(now()) AS id, pg_temp.uuid7(now()) AS series_id,
              gen_random_uuid() AS form_id, gen_random_uuid() AS form_version_id,
              (SELECT id FROM programs ORDER BY code OFFSET i % 3 LIMIT 1) AS program_id
       FROM generate_series(0, ${PROJECTS}::int - 1) i`,
    );
    // each project is the one session of a series of its own, running the whole of its year
    await timed(
      db,
      'project series',
      Prisma.sql`INSERT INTO project_series (id, program_id, code, name_bn, name_en)
       SELECT series_id, program_id, 'Q' || chr(65 + (i / 26) % 26) || chr(65 + i % 26),
              ${PROJECT_NAME_BN}::text || ' ' || i, 'Perf project ' || i
       FROM perf_projects`,
    );
    await timed(
      db,
      'project rows',
      Prisma.sql`INSERT INTO projects (id, program_id, series_id, code, year, period_from,
         period_to, name_bn, name_en, status, workflow_definition_id, workflow_version)
       SELECT id, program_id, series_id, 'Q' || chr(65 + (i / 26) % 26) || chr(65 + i % 26),
              2022 + i % 5, make_date(2022 + i % 5, 1, 1), make_date(2022 + i % 5, 12, 31),
              ${PROJECT_NAME_BN}::text || ' ' || i, 'Perf project ' || i, 'active',
              ${workflow}::uuid, 1
       FROM perf_projects`,
    );
    await db.$executeRaw`
      INSERT INTO forms (id, project_id, key, title_bn, title_en)
      SELECT form_id, id, 'default', ${FORM_TITLE_BN}::text, 'Form' FROM perf_projects`;
    await db.$executeRaw`
      INSERT INTO form_versions (id, form_id, version_no, status)
      SELECT form_version_id, form_id, 1, 'published' FROM perf_projects`;
    await timed(
      db,
      'project volunteers',
      Prisma.sql`INSERT INTO project_volunteers (id, project_id, volunteer_id, region_location_id,
         permission_set, assigned_by)
       SELECT gen_random_uuid(), p.id, v.id, v.division_id, 'application_distribution',
              ${head}::uuid
       FROM perf_vol pv
       JOIN volunteers v ON v.id = pv.volunteer_id
       JOIN perf_projects p ON p.i = pv.n % ${PROJECTS}::int
       WHERE pv.n % 20 <> 0`,
    );
  }, SETUP_TRANSACTION);

  // beneficiaries: one a minute over the last four years, in batches
  for (let from = 1; from <= BENEFICIARIES; from += BATCH) {
    const to = Math.min(from + BATCH - 1, BENEFICIARIES);
    await timed(
      prisma,
      `beneficiaries ${from}-${to}`,
      Prisma.sql`INSERT INTO beneficiaries (id, nid, birth_reg, name, father_or_husband_name, mobile,
         gender_code, age_years, class_code, division_id, district_id, upazila_id, union_id,
         village, status, created_at, updated_at)
       SELECT pg_temp.uuid7(ts),
              CASE WHEN n % 10 = 0 THEN NULL ELSE '1990' || lpad(n::text, 13, '0') END,
              CASE WHEN n % 10 = 0 THEN '2010' || lpad(n::text, 13, '0') END,
              ${nameSql(Prisma.sql`(n + 3)`)}, ${nameSql(Prisma.sql`(n + 11)`)},
              '01' || (3 + n % 7) || (10000000 + (n::bigint * 7919) % 90000000)::text,
              CASE WHEN n % 2 = 0 THEN 'female' ELSE 'male' END, 18 + n % 70,
              CASE WHEN n % 9 = 0 THEN NULL
                   ELSE (ARRAY['elderly','widow','orphan','disabled','ill','labourer','extreme_poor','other'])[1 + n % 8] END,
              u.division_id, u.district_id, u.upazila_id, u.union_id,
              ${VILLAGE_BN}::text || ' ' || (n % 40),
              CASE WHEN n % 500 = 0 THEN 'deceased' WHEN n % 700 = 0 THEN 'relocated' ELSE 'active' END,
              ts, ts
       FROM (SELECT n, now() - make_interval(secs => (${BENEFICIARIES}::int - n) * 60.0) AS ts
             FROM generate_series(${from}::int, ${to}::int) n) s
       JOIN perf_unions u ON u.i = s.n % ${unions}::int`,
    );
  }
  await timed(
    prisma,
    'beneficiary blocklist',
    Prisma.sql`INSERT INTO blocklist (id, subject_type, subject_id, reason, blocked_by)
     SELECT gen_random_uuid(), 'beneficiary', id, 'perf data set', ${head}::uuid
     FROM (SELECT id, row_number() OVER (ORDER BY id) AS n FROM beneficiaries) b
     WHERE n % 1000 = 7`,
  );

  // applications: every fourth beneficiary, to a project and a volunteer by turn
  await prisma.$executeRaw`
    CREATE TEMP TABLE perf_ben AS
    SELECT id, division_id, district_id, union_id, created_at,
           (row_number() OVER (ORDER BY id))::int AS n
    FROM beneficiaries`;
  await prisma.$executeRaw`CREATE INDEX ON perf_ben (n)`;
  await prisma.$executeRaw`CREATE INDEX ON perf_vol (n)`;
  for (let from = 1; from <= BENEFICIARIES; from += BATCH * 2) {
    const to = Math.min(from + BATCH * 2 - 1, BENEFICIARIES);
    await timed(
      prisma,
      `applications for beneficiaries ${from}-${to}`,
      Prisma.sql`INSERT INTO applications (id, project_id, form_version_id, beneficiary_id,
         owner_volunteer_id, created_by_user_id, status, region_location_id, district_id,
         union_id, submitted_at, approved_at, created_at, updated_at)
       SELECT pg_temp.uuid7(b.created_at), p.id, p.form_version_id, b.id, v.volunteer_id,
              v.user_id, st.status, b.division_id, b.district_id, b.union_id,
              b.created_at, CASE WHEN st.status IN ('approved','completed') THEN b.created_at END,
              b.created_at, b.created_at
       FROM perf_ben b
       JOIN perf_projects p ON p.i = (b.n / ${APPLICATION_EVERY}::int) % ${PROJECTS}::int
       JOIN perf_vol v ON v.n = 1 + (b.n / ${APPLICATION_EVERY}::int) % ${VOLUNTEERS}::int
       CROSS JOIN LATERAL (SELECT (ARRAY['submitted','under_review','reviewed','approved','approved',
         'rejected','completed','waitlisted'])[1 + (b.n / ${APPLICATION_EVERY}::int) % 8] AS status) st
       WHERE b.n BETWEEN ${from}::int AND ${to}::int AND b.n % ${APPLICATION_EVERY}::int = 0`,
    );
  }
  // the visibility map lets counts read the indexes alone, as autovacuum would on a live server
  await timed(prisma, 'vacuum and analyze', Prisma.sql`VACUUM ANALYZE`);
  await prisma.$executeRaw`
    INSERT INTO settings (key, value)
    VALUES (${MARKER}, ${JSON.stringify({ volunteers: VOLUNTEERS, beneficiaries: BENEFICIARIES, at: new Date() })}::jsonb)`;
}

/**
 * The name keys of every profile, computed the way the key job does it after a migration: the
 * load writes the rows by SQL, and the keys are computed in TypeScript only. A data set that has
 * them already is walked once and nothing is written.
 */
async function nameKeys(prisma: PrismaClient): Promise<void> {
  const start = Date.now();
  const logger = { info: () => undefined };
  const result = await new NameKeysJob(prisma, new MatchKeysService(), logger).run();
  // the plans of the pair queries read the statistics of the new keys
  if (result.profiles || result.members)
    await prisma.$executeRaw`ANALYZE beneficiaries, beneficiary_family_members`;
  console.warn(
    `perf:seed: name keys: ${result.profiles} profiles, ${result.members} members, ${Date.now() - start} ms`,
  );
}

async function main(): Promise<void> {
  const created = await createDatabase();
  run('migrations', 'pnpm', ['exec', 'prisma', 'migrate', 'deploy']);
  // one connection that never closes while idle: the load keeps temporary tables in its session
  const prisma = prismaClientFor(url, { max: 1, idleTimeoutMillis: 0 });
  try {
    const marker = await prisma.$queryRaw<unknown[]>`
      SELECT value FROM settings WHERE key = ${MARKER}`;
    if (!created && marker.length) {
      console.warn(`perf:seed: ${database} already holds the data set (--fresh rebuilds it).`);
      await nameKeys(prisma);
      return;
    }
    const volunteers =
      (await first<{ c: number }>(prisma, Prisma.sql`SELECT count(*)::int AS c FROM volunteers`))
        ?.c ?? 0;
    if (!created && volunteers > 0)
      throw new Error(`${database} holds a partial data set; run with --fresh`);
    run('locations', 'pnpm', ['db:load-locations']);
    run('base and demo seed', 'pnpm', [
      'exec',
      'tsx',
      '--conditions=@css/source',
      'seed/run.ts',
      '--set',
      'all',
    ]);
    const start = Date.now();
    await load(prisma);
    await nameKeys(prisma);
    console.warn(`perf:seed: done in ${Math.round((Date.now() - start) / 1000)} s.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
