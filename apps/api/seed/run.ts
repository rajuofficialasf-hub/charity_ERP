// pnpm db:seed [--set base|demo|all|org] [--file <staff list>]: loads the deterministic development
// and test seed sets (docs/testing/TEST_STRATEGY.md, "Test data strategy"), or the department's own
// officials from a staff list kept outside the repository (the org set, development database only).
// Never for production: the guard refuses NODE_ENV=production and any database that is not
// css_erp_dev* / css_erp_test*; every run leaves a seed marker that the production start guard refuses.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkDestructiveDbAccess } from '../src/config/db-guard.js';
import { appOriginOf } from '../src/config/env.js';
import { prismaClientFor } from '../src/core/prisma.service.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { json, type TableCounts, SeedContext } from './context.js';
import { readPermissionsFile } from './sets/base/access.js';
import { seedBase } from './sets/base/index.js';
import { DEMO_PROGRAMS, seedDemo } from './sets/demo/index.js';
import { type OrgOptions, seedOrg } from './sets/org/index.js';
import { removeLinksFile, writeLinksFile } from './sets/org/links-file.js';
import { readStaffList, type StaffListRow } from './sets/org/staff-file.js';
import { checkOrgTarget, linksFileName } from './sets/org/target.js';
import { REPO_ROOT } from './sets/util.js';

export type SeedSet = 'base' | 'demo' | 'org';
export const SEED_SETS: Record<'base' | 'demo', { run: (ctx: SeedContext) => Promise<void> }> = {
  base: { run: seedBase },
  demo: { run: seedDemo },
};
const SET_VERSION = 1;

export interface SeedReport {
  database: string;
  sets: SeedSet[];
  totals: TableCounts;
  tables: Record<string, TableCounts>;
}

/** The sets to run (base always first) and the staff list of the org set. */
export function parseSeedArgs(args: string[]): { sets: SeedSet[]; file: string | null } {
  const i = args.indexOf('--set');
  const value = i >= 0 ? args[i + 1] : 'all';
  const f = args.indexOf('--file');
  const file = f >= 0 ? (args[f + 1] ?? null) : null;
  if (value === 'org') {
    if (!file) throw new Error('the org set reads a staff list: add --file <path>');
    return { sets: ['base', 'org'], file };
  }
  if (value === 'all' || value === 'demo') return { sets: ['base', 'demo'], file: null };
  if (value === 'base') return { sets: ['base'], file: null };
  throw new Error(`unknown seed set "${value}" (use base, demo, all or org)`);
}

/** Runs the seed sets on a Prisma client; each set is one transaction. */
export async function runSeed(
  prisma: PrismaClient,
  sets: SeedSet[],
  env: NodeJS.ProcessEnv,
  org?: { rows: StaffListRow[]; options: OrgOptions },
): Promise<SeedReport> {
  const guard = checkDestructiveDbAccess(env);
  if (!guard.allowed) throw new Error(`db:seed refused: ${guard.reason}`);
  // the demo accounts never join the department's own officials: their passwords are public and
  // they would take over the programs' PMs
  if (sets.includes('demo') && (await prisma.setting.count({ where: { key: 'seed.marker.org' } })))
    throw new Error(
      'db:seed refused: this database holds the department’s own officials; reset it before loading the demo set',
    );
  const ctx = new SeedContext(prisma);
  for (const set of sets) {
    if (set === 'org') {
      if (!org) throw new Error('db:seed refused: the org set needs a checked staff list');
      await seedOrg(ctx, org.rows, org.options);
    } else await SEED_SETS[set].run(ctx);
    await ctx.transaction(async () => {
      await ctx.upsert(
        'settings',
        {
          key: `seed.marker.${set}`,
          value: json({
            version: SET_VERSION,
            note: 'development and test seed; production refuses to start with this row',
          }),
        },
        { key: ['key'] },
      );
    });
  }
  return {
    database: guard.database,
    sets,
    totals: ctx.totals(),
    tables: Object.fromEntries(ctx.counts),
  };
}

/** The officials of the staff list, or the run stopped with every problem by line and column. */
export function staffListOf(file: string): StaffListRow[] {
  const permissions = readPermissionsFile();
  const { rows, problems } = readStaffList(readFileSync(file, 'utf8'), {
    roles: Object.entries(permissions.roles)
      .filter(([, r]) => r.kind === 'official')
      .map(([key, r]) => ({ key, names: [r.name_en, r.name_bn] })),
    programs: DEMO_PROGRAMS.map((p) => ({ code: p.code, names: [p.name_en, p.name_bn] })),
  });
  if (problems.length) {
    // line, column and reason only: a cell's value never reaches the terminal
    for (const p of problems) console.error(`  line ${p.line}, ${p.field}: ${p.reason}`);
    throw new Error(`the staff list has ${problems.length} problem(s); nothing was written`);
  }
  return rows;
}

async function main(): Promise<void> {
  const { sets, file } = parseSeedArgs(process.argv.slice(2));
  let org: { rows: StaffListRow[]; options: OrgOptions } | undefined;
  let linksPath: string | null = null;
  if (file) {
    const list = resolve(file);
    const refusal = checkOrgTarget(process.env, REPO_ROOT, list);
    if (refusal) throw new Error(`db:seed refused: ${refusal}`);
    // the address the API itself writes into its links, so the seed's links open the same page
    const appOrigin = appOriginOf(process.env.APP_ORIGIN);
    const now = new Date();
    const path = linksFileName(list, now);
    linksPath = path;
    org = {
      rows: staffListOf(list),
      options: { appOrigin, now, writeLinks: (links) => writeLinksFile(path, links) },
    };
  }
  // runSeed refuses a database outside the guard before the client opens a connection
  const prisma = prismaClientFor(process.env.DATABASE_URL ?? '');
  try {
    let report: SeedReport;
    try {
      report = await runSeed(prisma, sets, process.env, org);
    } catch (error) {
      // a run that failed after writing its links stored none of their tokens
      if (linksPath) removeLinksFile(linksPath);
      throw error;
    }
    console.warn(
      `db:seed (${report.database}) sets ${report.sets.join(', ')}: ${JSON.stringify(report.totals)}`,
    );
    for (const [table, c] of Object.entries(report.tables))
      console.warn(`  ${table}: ${JSON.stringify(c)}`);
    if (org && linksPath)
      console.warn(
        `  ${org.rows.length} officials; set-password links in ${linksPath} (hand each to its person; delete the file afterwards)`,
      );
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
