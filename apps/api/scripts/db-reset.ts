// pnpm db:reset: drops and re-creates the development or test database from the migrations.
// Refuses to run against anything that is not css_erp_dev / css_erp_test, or when NODE_ENV is
// production (src/config/db-guard.ts).
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { checkDestructiveDbAccess } from '../src/config/db-guard.js';

const guard = checkDestructiveDbAccess(process.env);
if (!guard.allowed) {
  console.error(`db:reset refused: ${guard.reason}.`);
  process.exit(1);
}

console.warn(`db:reset: resetting database "${guard.database}" from the migrations.`);
const result = spawnSync('pnpm', ['exec', 'prisma', 'migrate', 'reset', '--force'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
