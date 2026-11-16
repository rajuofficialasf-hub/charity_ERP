// pnpm --filter @css/api perf:lists [--runs 20] [--explain-over 100] [--only <text>]
// [--duplicates-job] [--help-counters-job]: measures
// the volunteer and beneficiary tabs on the large data set of perf:seed (docs/testing/PERFORMANCE.md,
// section "Method"). Each case calls the real service (the same code as the route, without HTTP and the rate
// limit) as the Department Head (GLOBAL) and as the Dhaka RPM, twice to warm up and then --runs
// times, and prints p50, p95 and the slowest SQL statement. For every case whose p95 is over
// --explain-over ms, the slowest statement is run again under EXPLAIN (ANALYZE, BUFFERS).
import { PrismaPg } from '@prisma/adapter-pg';
import type { Principal } from '../src/auth/principal.js';
import { loadEnv } from '../src/config/env.js';
import { createContainer } from '../src/container.js';
import type { PrismaService } from '../src/core/prisma.service.js';
import { Prisma, PrismaClient } from '../src/generated/prisma/client.js';
import type { BeneficiaryViewer } from '../src/services/beneficiaries.js';
import { SEARCH_TERMS } from '../seed/perf-data.js';
import { perfDatabase } from './perf-db.js';

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
};
/** The report goes to stdout (console.log is kept out of the code by the lint rules). */
const out = (line = '') =>
  process.stdout.write(`${line}
`);
const RUNS = arg('--runs', 20);
const EXPLAIN_OVER = arg('--explain-over', 100);
const TARGET_MS = 300;
/** --only <text>: measure only the cases whose name contains the text. */
const ONLY = process.argv.includes('--only')
  ? process.argv[process.argv.indexOf('--only') + 1]
  : undefined;

const { url } = perfDatabase('perf:lists');
const env = loadEnv({ ...process.env, DATABASE_URL: url, LOG_LEVEL: 'warn' });

interface Statement {
  query: string;
  params: string;
  duration: number;
}
let captured: Statement[] | null = null;
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
  log: [{ emit: 'event', level: 'query' }],
});
prisma.$on('query', (e) => {
  captured?.push({ query: e.query, params: e.params, duration: Number(e.duration) });
});
const c = createContainer(env, { overrides: { prisma: prisma as unknown as PrismaService } });

async function viewerOf(email: string, permission: string, entity: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    select: {
      id: true,
      kind: true,
      state: true,
      permissionVersion: true,
      isSystemOwner: true,
      userRolesUser: {
        where: { revokedAt: null },
        select: { roleKey: true, role: { select: { globalScope: true } } },
      },
    },
  });
  const principal: Principal = {
    userId: user.id,
    sessionId: 'perf',
    kind: user.kind,
    state: user.state,
    roles: user.userRolesUser.map((r) => r.roleKey).sort(),
    globalScope: user.userRolesUser.some((r) => r.role.globalScope),
    isSystemOwner: user.isSystemOwner,
    permissionVersion: user.permissionVersion,
  };
  const access = await c.access.load(user.id);
  const scope = await c.access.scopeFor(principal, access, permission, entity);
  return { principal, scope, fieldClasses: access.fieldClasses };
}

type VolunteerQuery = Parameters<typeof c.volunteerList.list>[0];
type BeneficiaryQuery = Parameters<typeof c.beneficiaries.list>[0];

const percentile = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;

interface Result {
  name: string;
  p50: number;
  p95: number;
  max: number;
  slowest: Statement;
}

async function measure(name: string, call: () => Promise<unknown>): Promise<Result> {
  if (ONLY && !name.includes(ONLY))
    return { name, p50: 0, p95: 0, max: 0, slowest: { query: '', params: '[]', duration: 0 } };
  await call();
  await call();
  const times: number[] = [];
  let slowest: Statement = { query: '', params: '[]', duration: -1 };
  for (let i = 0; i < RUNS; i += 1) {
    captured = [];
    const start = performance.now();
    await call();
    times.push(performance.now() - start);
    for (const s of captured)
      if (/^\s*SELECT/i.test(s.query) && s.duration > slowest.duration) slowest = s;
    captured = null;
  }
  times.sort((a, b) => a - b);
  const result = {
    name,
    p50: Math.round(percentile(times, 50)),
    p95: Math.round(percentile(times, 95)),
    max: Math.round(times.at(-1)!),
    slowest,
  };
  const flag = result.p95 > TARGET_MS ? '  OVER' : '';
  out(
    `${name.padEnd(58)} p50 ${String(result.p50).padStart(5)}  p95 ${String(result.p95).padStart(5)}  max ${String(result.max).padStart(5)}  slowest sql ${slowest.duration} ms${flag}`,
  );
  return result;
}

/**
 * A statement Prisma logged, with its parameters, as a query to run again: the text is the one
 * Prisma generated for a service call, and each $n placeholder becomes its parameter again.
 */
function loggedStatement(query: string, params: unknown[]): Prisma.Sql {
  const parts = query.split(/\$(\d+)/);
  const strings = parts.filter((_, i) => i % 2 === 0);
  const values = parts.filter((_, i) => i % 2 === 1).map((n) => params[Number(n) - 1]);
  return new Prisma.Sql(strings, values);
}

async function main(): Promise<void> {
  const one = async <T>(sql: Prisma.Sql) => (await prisma.$queryRaw<T[]>(sql))[0]!;
  const counts = await one<Record<string, number>>(Prisma.sql`SELECT
    (SELECT count(*)::int FROM volunteers) AS volunteers,
    (SELECT count(*)::int FROM beneficiaries) AS beneficiaries,
    (SELECT count(*)::int FROM applications) AS applications,
    (SELECT count(*)::int FROM projects) AS projects`);
  out(`data set: ${JSON.stringify(counts)}; ${RUNS} runs per case\n`);
  const dhaka = await one<{ id: string }>(
    Prisma.sql`SELECT id FROM locations WHERE level = 'district' AND name_en = 'Dhaka'`,
  );
  const upazila = await one<{ id: string }>(
    Prisma.sql`SELECT upazila_id AS id FROM beneficiaries WHERE district_id = ${dhaka.id}::uuid LIMIT 1`,
  );
  const union = await one<{ id: string }>(
    Prisma.sql`SELECT union_id AS id FROM beneficiaries WHERE upazila_id = ${upazila.id}::uuid LIMIT 1`,
  );
  const project = await one<{ id: string; series_id: string; program_id: string }>(
    Prisma.sql`SELECT id, series_id, program_id FROM projects WHERE code = 'QAK'`,
  );
  const ben = await one<{ id: string; mobile: string; nid: string }>(
    Prisma.sql`SELECT b.id, b.mobile, b.nid FROM beneficiaries b JOIN applications a ON a.beneficiary_id = b.id
     WHERE b.nid IS NOT NULL ORDER BY b.id LIMIT 1 OFFSET 1000`,
  );
  const vol = await one<{ mobile: string; nid: string }>(
    Prisma.sql`SELECT u.mobile, v.nid FROM volunteers v JOIN users u ON u.id = v.user_id WHERE v.nid LIKE '77%'
     ORDER BY v.id LIMIT 1 OFFSET 777`,
  );

  // the kept times helped are repaired by a nightly job; its run is timed once here
  if (process.argv.includes('--help-counters-job')) {
    const started = performance.now();
    const { checked, repaired } = await c.helpCounters.run();
    out(`help counters nightly job: ${checked} profiles checked, ${repaired} repaired in ${Math.round(performance.now() - started)} ms
`);
  }
  // the suggested duplicate pairs are kept by a nightly job; its run is timed once here
  if (process.argv.includes('--duplicates-job')) {
    const started = performance.now();
    const { active } = await c.beneficiaryMergeCandidates.refreshAll();
    out(`duplicates nightly job: ${active} active pairs in ${Math.round(performance.now() - started)} ms
`);
  }
  const results: Result[] = [];
  const page = { limit: 25 } as const;
  for (const [who, email] of [
    ['head', 'head@example.org'],
    ['rpm', 'rpm.dhaka@example.org'],
  ] as const) {
    const vv = await viewerOf(email, 'volunteer.view_all', 'global');
    const bv: BeneficiaryViewer = await viewerOf(email, 'beneficiary.view_all', 'beneficiary');
    const mv = await viewerOf(email, 'beneficiary.merge.dismiss', 'beneficiary');
    const ov = await viewerOf(email, 'project.overview.view', 'program');
    const v = (name: string, filter: Record<string, string>) =>
      measure(`${who} volunteers.list ${name}`, () =>
        c.volunteerList.list({ ...page, ...filter } as VolunteerQuery, vv),
      );
    const b = (name: string, filter: Record<string, string | number>) =>
      measure(`${who} beneficiaries.list ${name}`, () =>
        c.beneficiaries.list({ ...page, ...filter } as BeneficiaryQuery, bv),
      );
    const firstVolunteers = await c.volunteerList.list({ ...page }, vv);
    const firstBeneficiaries = await c.beneficiaries.list({ ...page }, bv);
    const firstByHelp = await c.beneficiaries.list({ ...page, sort: '-helpCount' }, bv);
    results.push(
      await v('first page', {}),
      await measure(`${who} volunteers.list next page`, () =>
        c.volunteerList.list({ ...page, cursor: firstVolunteers.meta.nextCursor! }, vv),
      ),
      await v('with total', { include: 'total' }),
      await v('district', { districtId: dhaka.id }),
      await v('state pending', { state: 'pending' }),
      await v('type local_daee', { type: 'local_daee' }),
      await v('category A', { category: 'A' }),
      await v('blocked', { blocked: 'true' }),
      await v('not blocked + total', { blocked: 'false', include: 'total' }),
      await v('project', { projectId: project.id }),
      await v('name search', { q: SEARCH_TERMS.volunteerPart }),
      await v('name search + total', { q: SEARCH_TERMS.volunteerPair, include: 'total' }),
      await v('mobile search', { q: vol.mobile }),
      await v('NID search', { q: vol.nid }),
      await measure(`${who} volunteers.statistics all`, () => c.volunteerList.statistics({}, vv)),
      await measure(`${who} volunteers.statistics district`, () =>
        c.volunteerList.statistics({ districtId: dhaka.id }, vv),
      ),
      await b('first page', {}),
      await measure(`${who} beneficiaries.list next page`, () =>
        c.beneficiaries.list({ ...page, cursor: firstBeneficiaries.meta.nextCursor! }, bv),
      ),
      await b('with total', { include: 'total' }),
      await b('district', { districtId: dhaka.id }),
      await b('upazila', { upazilaId: upazila.id }),
      await b('union', { unionId: union.id }),
      await b('type widow', { type: 'widow' }),
      await b('blocked', { blocked: 'true' }),
      await b('project', { projectId: project.id }),
      await b('year 2025', { year: 2025 }),
      await b('district + year + total', { districtId: dhaka.id, year: 2025, include: 'total' }),
      await b('name search', { q: SEARCH_TERMS.beneficiaryPart }),
      await b('name search + total', { q: SEARCH_TERMS.beneficiaryPair, include: 'total' }),
      await b('mobile search', { q: ben.mobile }),
      await b('NID search', { q: ben.nid }),
      // the times helped (docs/testing/PERFORMANCE.md, "The times helped")
      await b('helped more than once in a year', { helpedMoreThanOnceInYear: 'true' }),
      await b('helped more than once + total', {
        helpedMoreThanOnceInYear: 'true',
        include: 'total',
      }),
      await b('by times helped', { sort: '-helpCount' }),
      await measure(`${who} beneficiaries.list by times helped next page`, () =>
        c.beneficiaries.list(
          { ...page, sort: '-helpCount', cursor: firstByHelp.meta.nextCursor! },
          bv,
        ),
      ),
      await b('by times helped, fewest first', { sort: 'helpCount' }),
      await b('district by times helped', { districtId: dhaka.id, sort: '-helpCount' }),
      await b('more than once by times helped', {
        helpedMoreThanOnceInYear: 'true',
        sort: '-helpCount',
      }),
      await measure(`${who} beneficiaries.mergeCandidates first page`, () =>
        c.beneficiaryMergeCandidates.list(mv.principal, mv.scope, page),
      ),
      await measure(`${who} beneficiaries.statistics all`, () =>
        c.beneficiaries.statistics({}, bv),
      ),
      await measure(`${who} beneficiaries.statistics district`, () =>
        c.beneficiaries.statistics({ districtId: dhaka.id }, bv),
      ),
      await measure(`${who} beneficiaries.profile`, () => c.beneficiaries.profile(bv, ben.id)),
      // the cards of programs and projects (docs/testing/PERFORMANCE.md, "The cards of programs
      // and projects")
      await measure(`${who} program cards`, () => c.programCards.list(ov)),
      await measure(`${who} series cards, every program`, () => c.projectSeries.list(ov, {})),
      await measure(`${who} series cards, one program`, () =>
        c.projectSeries.list(ov, { programId: project.program_id }),
      ),
      await measure(`${who} series with its sessions`, () =>
        c.projectSeries.get(ov, project.series_id),
      ),
    );
    out();
  }

  const over = results.filter((r) => r.p95 > EXPLAIN_OVER);
  out(
    `${results.filter((r) => r.p95 > TARGET_MS).length} of ${results.length} cases over ${TARGET_MS} ms at p95; plans of the ${over.length} cases over ${EXPLAIN_OVER} ms follow.\n`,
  );
  for (const r of over) {
    out(`=== ${r.name} (p95 ${r.p95} ms; slowest statement ${r.slowest.duration} ms)`);
    out(r.slowest.query.replace(/\s+/g, ' ').slice(0, 1500));
    const plan = await prisma.$queryRaw<
      Record<string, string>[]
    >`EXPLAIN (ANALYZE, BUFFERS) ${loggedStatement(
      r.slowest.query,
      JSON.parse(r.slowest.params) as unknown[],
    )}`;
    out(plan.map((row) => row['QUERY PLAN']).join('\n'));
    out();
  }
  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
