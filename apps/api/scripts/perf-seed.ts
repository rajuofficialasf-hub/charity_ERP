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
import { Client } from 'pg';
import {
  FIRST_NAMES,
  FORM_TITLE_BN,
  LAST_NAMES,
  PROJECT_NAME_BN,
  VILLAGE_BN,
} from '../seed/perf-data';
import { perfDatabase } from './perf-db';

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
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const db = new Client({ connectionString: admin.toString() });
  await db.connect();
  try {
    if (fresh) await db.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    const exists = await db.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
    if (exists.rowCount) return false;
    await db.query(`CREATE DATABASE ${database}`);
    return true;
  } finally {
    await db.end();
  }
}

/** A fixed SQL text literal (the values are this script's own constants). */
const lit = (value: string) => `'${value.replace(/'/g, "''")}'`;
const array = (values: readonly string[]) => `ARRAY[${values.map(lit).join(',')}]`;
const FIRST = array(FIRST_NAMES);
const LAST = array(LAST_NAMES);
/** A name of three parts chosen by the row number. */
const NAME_SQL = (n: string) => `
  (${FIRST})[1 + ${n} % ${FIRST_NAMES.length}]
  || ' ' || (${LAST})[1 + (${n} / ${FIRST_NAMES.length}) % ${LAST_NAMES.length}]
  || ' ' || (${LAST})[1 + (${n} / ${FIRST_NAMES.length * LAST_NAMES.length}) % ${LAST_NAMES.length}]`;

async function timed(db: Client, label: string, sql: string, params: unknown[] = []) {
  const start = Date.now();
  const result = await db.query(sql, params);
  console.warn(`perf:seed: ${label}: ${result.rowCount ?? 0} rows, ${Date.now() - start} ms`);
}

async function load(db: Client): Promise<void> {
  // a UUID v7 for a given time, like uuidv7() of @css/shared (PostgreSQL 17 has no uuidv7())
  await db.query(`
    CREATE FUNCTION pg_temp.uuid7(ts timestamptz) RETURNS uuid LANGUAGE sql VOLATILE AS $$
      SELECT encode(set_bit(set_bit(overlay(uuid_send(gen_random_uuid())
        PLACING substring(int8send(floor(extract(epoch FROM ts) * 1000)::bigint) FROM 3)
        FROM 1 FOR 6), 52, 1), 53, 1), 'hex')::uuid
    $$`);
  await db.query(`
    CREATE TEMP TABLE perf_unions AS
    SELECT (row_number() OVER (ORDER BY un.code) - 1)::int AS i, un.id AS union_id,
           up.id AS upazila_id, d.id AS district_id, dv.id AS division_id
    FROM locations un
    JOIN locations up ON up.id = un.parent_id
    JOIN locations d ON d.id = up.parent_id
    JOIN locations dv ON dv.id = d.parent_id
    WHERE un.level = 'union' AND un.active`);
  const unions = Number((await db.query('SELECT count(*) AS c FROM perf_unions')).rows[0].c);
  if (!unions) throw new Error('no unions: the locations did not load');
  const head = (await db.query(`SELECT id FROM users WHERE email = 'head@example.org'`)).rows[0]
    ?.id as string | undefined;
  if (!head) throw new Error('the demo seed has no Department Head');
  const workflow = (await db.query(`SELECT workflow_definition_id AS id FROM projects LIMIT 1`))
    .rows[0]?.id as string | undefined;
  if (!workflow) throw new Error('the demo seed has no project to take a workflow from');

  await db.query('BEGIN');
  // volunteers: one every 30 minutes over the last three years
  await timed(
    db,
    'volunteer ids',
    `CREATE TEMP TABLE perf_vol AS
     SELECT n, ts, pg_temp.uuid7(ts) AS user_id, pg_temp.uuid7(ts) AS volunteer_id
     FROM (SELECT n, now() - make_interval(secs => ($1::int - n) * 1800.0) AS ts
           FROM generate_series(1, $1::int) n) s`,
    [VOLUNTEERS],
  );
  await timed(
    db,
    'volunteer users',
    `INSERT INTO users (id, kind, mobile, state, display_name, created_at, updated_at)
     SELECT user_id, 'volunteer', '016' || lpad(n::text, 8, '0'),
            CASE WHEN n % 20 = 0 THEN 'pending' WHEN n % 50 = 1 THEN 'deactivated' ELSE 'active' END,
            ${NAME_SQL('n')}, ts, ts
     FROM perf_vol`,
  );
  await timed(
    db,
    'volunteers',
    `INSERT INTO volunteers (id, user_id, nid, type, father_name, mother_name, division_id,
       district_id, upazila_id, union_id, category, inactive_flag, approved_by, approved_at,
       created_at, updated_at)
     SELECT v.volunteer_id, v.user_id, '77' || lpad(v.n::text, 11, '0'),
            (ARRAY['general','general','general','local_daee','both','team_member','paid'])[1 + v.n % 7],
            ${NAME_SQL('(v.n + 5)')}, ${NAME_SQL('(v.n + 7)')},
            u.division_id, u.district_id, u.upazila_id, u.union_id,
            CASE WHEN v.n % 5 = 0 THEN NULL ELSE (ARRAY['A','B','C','D'])[1 + v.n % 4] END,
            v.n % 23 = 0,
            CASE WHEN v.n % 20 = 0 THEN NULL ELSE $2::uuid END,
            CASE WHEN v.n % 20 = 0 THEN NULL ELSE v.ts END, v.ts, v.ts
     FROM perf_vol v JOIN perf_unions u ON u.i = v.n % $1::int`,
    [unions, head],
  );
  // the blocklist trigger turns these active accounts into blocked ones
  await timed(
    db,
    'volunteer blocklist',
    `INSERT INTO blocklist (id, subject_type, subject_id, reason, blocked_by)
     SELECT gen_random_uuid(), 'volunteer', volunteer_id, 'perf data set', $1::uuid
     FROM perf_vol WHERE n % 40 = 3`,
    [head],
  );

  // projects over five years, each with its form
  await timed(
    db,
    'projects',
    `CREATE TEMP TABLE perf_projects AS
     SELECT i, pg_temp.uuid7(now()) AS id, gen_random_uuid() AS form_id,
            gen_random_uuid() AS form_version_id,
            (SELECT id FROM programs ORDER BY code OFFSET i % 3 LIMIT 1) AS program_id
     FROM generate_series(0, $1::int - 1) i`,
    [PROJECTS],
  );
  await timed(
    db,
    'project rows',
    `INSERT INTO projects (id, program_id, code, year, name_bn, name_en, status,
       workflow_definition_id, workflow_version)
     SELECT id, program_id, 'Q' || chr(65 + (i / 26) % 26) || chr(65 + i % 26), 2022 + i % 5,
            ${lit(PROJECT_NAME_BN)} || ' ' || i, 'Perf project ' || i, 'active', $1::uuid, 1
     FROM perf_projects`,
    [workflow],
  );
  await db.query(`
    INSERT INTO forms (id, project_id, key, title_bn, title_en)
    SELECT form_id, id, 'default', ${lit(FORM_TITLE_BN)}, 'Form' FROM perf_projects;
    INSERT INTO form_versions (id, form_id, version_no, status)
    SELECT form_version_id, form_id, 1, 'published' FROM perf_projects;`);
  await timed(
    db,
    'project volunteers',
    `INSERT INTO project_volunteers (id, project_id, volunteer_id, region_location_id,
       permission_set, assigned_by)
     SELECT gen_random_uuid(), p.id, v.id, v.division_id, 'application_distribution', $2::uuid
     FROM perf_vol pv
     JOIN volunteers v ON v.id = pv.volunteer_id
     JOIN perf_projects p ON p.i = pv.n % $1::int
     WHERE pv.n % 20 <> 0`,
    [PROJECTS, head],
  );
  await db.query('COMMIT');

  // beneficiaries: one a minute over the last four years, in batches
  for (let from = 1; from <= BENEFICIARIES; from += BATCH) {
    const to = Math.min(from + BATCH - 1, BENEFICIARIES);
    await timed(
      db,
      `beneficiaries ${from}-${to}`,
      `INSERT INTO beneficiaries (id, nid, birth_reg, name, father_or_husband_name, mobile,
         gender_code, age_years, class_code, division_id, district_id, upazila_id, union_id,
         village, status, created_at, updated_at)
       SELECT pg_temp.uuid7(ts),
              CASE WHEN n % 10 = 0 THEN NULL ELSE '1990' || lpad(n::text, 13, '0') END,
              CASE WHEN n % 10 = 0 THEN '2010' || lpad(n::text, 13, '0') END,
              ${NAME_SQL('(n + 3)')}, ${NAME_SQL('(n + 11)')},
              '01' || (3 + n % 7) || (10000000 + (n::bigint * 7919) % 90000000)::text,
              CASE WHEN n % 2 = 0 THEN 'female' ELSE 'male' END, 18 + n % 70,
              CASE WHEN n % 9 = 0 THEN NULL
                   ELSE (ARRAY['elderly','widow','orphan','disabled','ill','labourer','extreme_poor','other'])[1 + n % 8] END,
              u.division_id, u.district_id, u.upazila_id, u.union_id, ${lit(VILLAGE_BN)} || ' ' || (n % 40),
              CASE WHEN n % 500 = 0 THEN 'deceased' WHEN n % 700 = 0 THEN 'relocated' ELSE 'active' END,
              ts, ts
       FROM (SELECT n, now() - make_interval(secs => ($3::int - n) * 60.0) AS ts
             FROM generate_series($1::int, $2::int) n) s
       JOIN perf_unions u ON u.i = s.n % $4::int`,
      [from, to, BENEFICIARIES, unions],
    );
  }
  await timed(
    db,
    'beneficiary blocklist',
    `INSERT INTO blocklist (id, subject_type, subject_id, reason, blocked_by)
     SELECT gen_random_uuid(), 'beneficiary', id, 'perf data set', $1::uuid
     FROM (SELECT id, row_number() OVER (ORDER BY id) AS n FROM beneficiaries) b
     WHERE n % 1000 = 7`,
    [head],
  );

  // applications: every fourth beneficiary, to a project and a volunteer by turn
  await db.query(`
    CREATE TEMP TABLE perf_ben AS
    SELECT id, division_id, district_id, union_id, created_at,
           (row_number() OVER (ORDER BY id))::int AS n
    FROM beneficiaries`);
  await db.query('CREATE INDEX ON perf_ben (n)');
  await db.query('CREATE INDEX ON perf_vol (n)');
  for (let from = 1; from <= BENEFICIARIES; from += BATCH * 2) {
    const to = Math.min(from + BATCH * 2 - 1, BENEFICIARIES);
    await timed(
      db,
      `applications for beneficiaries ${from}-${to}`,
      `INSERT INTO applications (id, project_id, form_version_id, beneficiary_id,
         owner_volunteer_id, created_by_user_id, status, region_location_id, district_id,
         union_id, submitted_at, approved_at, created_at, updated_at)
       SELECT pg_temp.uuid7(b.created_at), p.id, p.form_version_id, b.id, v.volunteer_id,
              v.user_id, st.status, b.division_id, b.district_id, b.union_id,
              b.created_at, CASE WHEN st.status IN ('approved','completed') THEN b.created_at END,
              b.created_at, b.created_at
       FROM perf_ben b
       JOIN perf_projects p ON p.i = (b.n / $3::int) % $4::int
       JOIN perf_vol v ON v.n = 1 + (b.n / $3::int) % $5::int
       CROSS JOIN LATERAL (SELECT (ARRAY['submitted','under_review','reviewed','approved','approved',
         'rejected','completed','waitlisted'])[1 + (b.n / $3::int) % 8] AS status) st
       WHERE b.n BETWEEN $1::int AND $2::int AND b.n % $3::int = 0`,
      [from, to, APPLICATION_EVERY, PROJECTS, VOLUNTEERS],
    );
  }
  // the visibility map lets counts read the indexes alone, as autovacuum would on a live server
  await timed(db, 'vacuum and analyze', 'VACUUM ANALYZE');
  await db.query('INSERT INTO settings (key, value) VALUES ($1, $2::jsonb)', [
    MARKER,
    JSON.stringify({ volunteers: VOLUNTEERS, beneficiaries: BENEFICIARIES, at: new Date() }),
  ]);
}

async function main(): Promise<void> {
  const created = await createDatabase();
  run('migrations', 'pnpm', ['exec', 'prisma', 'migrate', 'deploy']);
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    const marker = await db.query('SELECT value FROM settings WHERE key = $1', [MARKER]);
    if (!created && marker.rowCount) {
      console.warn(`perf:seed: ${database} already holds the data set (--fresh rebuilds it).`);
      return;
    }
    const volunteers = Number((await db.query('SELECT count(*) AS c FROM volunteers')).rows[0].c);
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
    await load(db);
    console.warn(`perf:seed: done in ${Math.round((Date.now() - start) / 1000)} s.`);
  } finally {
    await db.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
