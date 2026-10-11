import { installJobs } from '../src/jobs/install';

// Installs or upgrades the pg-boss schema and its queues as the migrating role (D-069).
// Part of `pnpm db:migrate`; the api and worker processes never run DDL.
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  await installJobs(url);
  process.stdout.write('pg-boss schema and queues installed\n');
}

void main();
