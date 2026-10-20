// The measurement database of docs/testing/PERFORMANCE.md (section "Data set"): the guard
// checkPerfDbAccess (src/config/db-guard.ts) decides which database a measurement script may use.
import { checkPerfDbAccess } from '../src/config/db-guard';

/** The address and name of the measurement database; exits when the guard refuses it. */
export function perfDatabase(script: string): { url: string; database: string } {
  const target = checkPerfDbAccess(process.env);
  if (!target.allowed) {
    console.error(`${script} refused: ${target.reason}.`);
    process.exit(1);
  }
  return target;
}
