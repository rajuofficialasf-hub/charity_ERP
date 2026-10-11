// pnpm db:seed [--set base|demo|all]: loads the deterministic development and test seed sets
// (T1.3, TEST_STRATEGY section 4). Never for production: the guard refuses NODE_ENV=production and
// any database that is not css_erp_dev* / css_erp_test*; every run leaves a seed marker that the
// production start guard refuses (O-46 item 8).
import 'dotenv/config';
import { Client } from 'pg';
import { checkDestructiveDbAccess } from '../src/config/db-guard';
import { json, type TableCounts, SeedContext } from './context';
import { seedBase } from './sets/base';
import { seedDemo } from './sets/demo';

export type SeedSet = 'base' | 'demo';
export const SEED_SETS: Record<
  SeedSet,
  { version: number; run: (ctx: SeedContext) => Promise<void> }
> = {
  base: { version: 1, run: seedBase },
  demo: { version: 1, run: seedDemo },
};

export interface SeedReport {
  database: string;
  sets: SeedSet[];
  totals: TableCounts;
  tables: Record<string, TableCounts>;
}

export function parseSets(args: string[]): SeedSet[] {
  const i = args.indexOf('--set');
  const value = i >= 0 ? args[i + 1] : 'all';
  if (value === 'all') return ['base', 'demo'];
  if (value === 'base' || value === 'demo') return value === 'demo' ? ['base', 'demo'] : ['base'];
  throw new Error(`unknown seed set "${value}" (use base, demo or all)`);
}

/** Runs the seed sets on a connected client; each set is one transaction. */
export async function runSeed(
  db: Client,
  sets: SeedSet[],
  env: NodeJS.ProcessEnv,
): Promise<SeedReport> {
  const guard = checkDestructiveDbAccess(env);
  if (!guard.allowed) throw new Error(`db:seed refused: ${guard.reason}`);
  const ctx = new SeedContext(db);
  for (const set of sets) {
    await SEED_SETS[set].run(ctx);
    await db.query('BEGIN');
    try {
      await ctx.upsert(
        'settings',
        {
          key: `seed.marker.${set}`,
          value: json({
            version: SEED_SETS[set].version,
            note: 'development and test seed; production refuses to start with this row',
          }),
        },
        { key: ['key'] },
      );
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  }
  return {
    database: guard.database,
    sets,
    totals: ctx.totals(),
    tables: Object.fromEntries(ctx.counts),
  };
}

async function main(): Promise<void> {
  const sets = parseSets(process.argv.slice(2));
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const report = await runSeed(db, sets, process.env);
    console.warn(
      `db:seed (${report.database}) sets ${report.sets.join(', ')}: ${JSON.stringify(report.totals)}`,
    );
    for (const [table, c] of Object.entries(report.tables))
      console.warn(`  ${table}: ${JSON.stringify(c)}`);
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
