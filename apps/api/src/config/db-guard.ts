/**
 * Destructive database scripts (reset, seed) may only touch development or test databases
 * (BR-024, BD-49; seed rules in TEST_STRATEGY section 4). The database name must be css_erp_dev
 * or css_erp_test (optionally with a suffix such as css_erp_test_worker_3), and NODE_ENV must not
 * be production.
 */
const ALLOWED_PREFIXES = ['css_erp_dev', 'css_erp_test'];
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
      reason: `database "${database}" is not a css_erp_dev or css_erp_test database`,
    };
  }
  return { allowed: true, database };
}
