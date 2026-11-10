// pnpm db:load-locations: loads docs/source/data/bd-locations.csv into the locations table.
// Development and test databases only (src/config/db-guard.ts); never deletes.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkDestructiveDbAccess } from '../src/config/db-guard.js';
import { prismaClientFor } from '../src/core/prisma.service.js';
import { type LocationRow } from '../src/locations/convert.js';
import { parseCsvRecords } from '../src/locations/csv.js';
import { loadLocations } from '../src/locations/load.js';

async function main(): Promise<void> {
  const guard = checkDestructiveDbAccess(process.env);
  if (!guard.allowed) {
    console.error(`db:load-locations refused: ${guard.reason}.`);
    process.exit(1);
  }
  const csv = readFileSync(
    join(import.meta.dirname, '../../../docs/source/data/bd-locations.csv'),
    'utf8',
  );
  const rows = parseCsvRecords(csv) as LocationRow[];
  const prisma = prismaClientFor(process.env.DATABASE_URL ?? '');
  try {
    const result = await loadLocations(prisma, rows);
    console.warn(`db:load-locations (${guard.database}): ${JSON.stringify(result)}`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
