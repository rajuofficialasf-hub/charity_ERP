// pnpm db:seed [--set base|demo|all]: loads the deterministic development and test seed sets
// (docs/testing/TEST_STRATEGY.md, "Test data strategy"). Never for production: the guard refuses
// NODE_ENV=production and any database that is not css_erp_dev* / css_erp_test*; every run leaves a
// seed marker that the production start guard refuses.
import 'dotenv/config';
import { checkDestructiveDbAccess } from '../src/config/db-guard';
import { prismaClientFor } from '../src/core/prisma.service';
import type { PrismaClient } from '../src/generated/prisma/client';
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

/** Runs the seed sets on a Prisma client; each set is one transaction. */
export async function runSeed(
  prisma: PrismaClient,
  sets: SeedSet[],
  env: NodeJS.ProcessEnv,
): Promise<SeedReport> {
  const guard = checkDestructiveDbAccess(env);
  if (!guard.allowed) throw new Error(`db:seed refused: ${guard.reason}`);
  const ctx = new SeedContext(prisma);
  for (const set of sets) {
    await SEED_SETS[set].run(ctx);
    await ctx.transaction(async () => {
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
    });
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
  // runSeed refuses a database outside the guard before the client opens a connection
  const prisma = prismaClientFor(process.env.DATABASE_URL ?? '');
  try {
    const report = await runSeed(prisma, sets, process.env);
    console.warn(
      `db:seed (${report.database}) sets ${report.sets.join(', ')}: ${JSON.stringify(report.totals)}`,
    );
    for (const [table, c] of Object.entries(report.tables))
      console.warn(`  ${table}: ${JSON.stringify(c)}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
