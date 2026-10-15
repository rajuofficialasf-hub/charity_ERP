// The measurement database css_erp_perf (docs/testing/PERFORMANCE.md): its address is
// PERF_DATABASE_URL, or DATABASE_URL with the database name replaced, so apps/api/.env needs no
// change. The guard of src/config/db-guard.ts still decides whether a script may touch it.
import { checkDestructiveDbAccess } from '../src/config/db-guard';

export const PERF_DATABASE = 'css_erp_perf';

/** The address of the measurement database; exits when the guard refuses it. */
export function perfDatabaseUrl(script: string): string {
  const base = process.env.PERF_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!base) {
    console.error(`${script} refused: neither PERF_DATABASE_URL nor DATABASE_URL is set.`);
    process.exit(1);
  }
  const url = new URL(base);
  if (!process.env.PERF_DATABASE_URL) url.pathname = `/${PERF_DATABASE}`;
  const guard = checkDestructiveDbAccess({
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: url.toString(),
  });
  // the large data set goes only into a css_erp_perf database, never into dev or test
  if (!guard.allowed || !guard.database.startsWith(PERF_DATABASE)) {
    console.error(
      `${script} refused: ${guard.allowed ? `"${guard.database}" is not a ${PERF_DATABASE} database` : guard.reason}.`,
    );
    process.exit(1);
  }
  return url.toString();
}
