// pnpm db:seed: loads the deterministic dev/test seed sets. The seed framework and the "base"
// and "demo" sets arrive in T1.3; this entry point already applies the same guard so that a
// seed can never reach a production database (BD-49, TEST_STRATEGY section 4).
import 'dotenv/config';
import { checkDestructiveDbAccess } from '../src/config/db-guard';

const guard = checkDestructiveDbAccess(process.env);
if (!guard.allowed) {
  console.error(`db:seed refused: ${guard.reason}.`);
  process.exit(1);
}

console.warn(`db:seed: database "${guard.database}" accepted; no seed sets exist yet (task T1.3).`);
