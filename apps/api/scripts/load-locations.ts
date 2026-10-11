// pnpm db:load-locations: loads docs/source/data/bd-locations.csv into the locations table.
// Development and test databases only (src/config/db-guard.ts); never deletes (BR-228).
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { checkDestructiveDbAccess } from '../src/config/db-guard';
import { type LocationRow } from '../src/locations/convert';
import { parseCsvRecords } from '../src/locations/csv';
import { loadLocations } from '../src/locations/load';

async function main(): Promise<void> {
  const guard = checkDestructiveDbAccess(process.env);
  if (!guard.allowed) {
    console.error(`db:load-locations refused: ${guard.reason}.`);
    process.exit(1);
  }
  const csv = readFileSync(join(__dirname, '../../../docs/source/data/bd-locations.csv'), 'utf8');
  const rows = parseCsvRecords(csv) as LocationRow[];
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const result = await loadLocations(db, rows);
    console.warn(`db:load-locations (${guard.database}): ${JSON.stringify(result)}`);
  } finally {
    await db.end();
  }
}

void main();
