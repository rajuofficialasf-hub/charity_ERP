/**
 * Destructive database scripts (reset, seed) may only touch development or test databases
 * (BR-024, BD-49; seed rules in docs/testing/TEST_STRATEGY.md section 4). The database name must
 * be css_erp_dev, css_erp_test or css_erp_perf (the measurement data set of
 * docs/testing/PERFORMANCE.md),
 * optionally with a suffix such as css_erp_test_worker_3, and NODE_ENV must not be production.
 */
const ALLOWED_PREFIXES = ['css_erp_dev', 'css_erp_test', 'css_erp_perf'];
const DATABASE_NAME = /^[a-z0-9_]+$/;

function isDevOrTestDatabase(name: string): boolean {
  return (
    DATABASE_NAME.test(name) &&
    ALLOWED_PREFIXES.some((prefix) => name === prefix || name.startsWith(`${prefix}_`))
  );
}

export type GuardResult = { allowed: true; database: string } | { allowed: false; reason: string };

export function checkDestructiveDbAccess(env: {
  NODE_ENV?: string | undefined;
  DATABASE_URL?: string | undefined;
}): GuardResult {
  if (env.NODE_ENV === 'production') {
    return { allowed: false, reason: 'NODE_ENV is production' };
  }
  if (!env.DATABASE_URL) {
    return { allowed: false, reason: 'DATABASE_URL is not set' };
  }
  let database: string;
  try {
    database = decodeURIComponent(new URL(env.DATABASE_URL).pathname.replace(/^\//, ''));
  } catch {
    return { allowed: false, reason: 'DATABASE_URL is not a valid URL' };
  }
  if (!isDevOrTestDatabase(database)) {
    return {
      allowed: false,
      reason: `database "${database}" is not a css_erp_dev, css_erp_test or css_erp_perf database`,
    };
  }
  return { allowed: true, database };
}

/** The measurement database of docs/testing/PERFORMANCE.md (section "Data set"). */
export const PERF_DATABASE = 'css_erp_perf';
/** The hosts a measurement script may build its database on: this machine or the compose service. */
const PERF_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', 'postgres']);

/**
 * The measurement scripts (perf:seed drops and rebuilds its database) take PERF_DATABASE_URL, or
 * DATABASE_URL with the database name replaced by css_erp_perf. They are allowed only on a
 * css_erp_perf database (never dev or test, which the large data set would bury), on this machine
 * or the compose database service, and never under NODE_ENV=production.
 */
export function checkPerfDbAccess(env: {
  NODE_ENV?: string | undefined;
  DATABASE_URL?: string | undefined;
  PERF_DATABASE_URL?: string | undefined;
}): { allowed: true; url: string; database: string } | { allowed: false; reason: string } {
  const base = env.PERF_DATABASE_URL ?? env.DATABASE_URL;
  if (!base) return { allowed: false, reason: 'neither PERF_DATABASE_URL nor DATABASE_URL is set' };
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return { allowed: false, reason: 'the database URL is not a valid URL' };
  }
  if (!env.PERF_DATABASE_URL) url.pathname = `/${PERF_DATABASE}`;
  const guard = checkDestructiveDbAccess({ NODE_ENV: env.NODE_ENV, DATABASE_URL: url.toString() });
  if (!guard.allowed) return guard;
  if (!guard.database.startsWith(PERF_DATABASE))
    return { allowed: false, reason: `"${guard.database}" is not a ${PERF_DATABASE} database` };
  if (!PERF_HOSTS.has(url.hostname))
    return { allowed: false, reason: `host "${url.hostname}" is not this machine` };
  return { allowed: true, url: url.toString(), database: guard.database };
}
