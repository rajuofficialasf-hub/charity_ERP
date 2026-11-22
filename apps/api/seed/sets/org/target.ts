import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { checkDestructiveDbAccess } from '../../../src/config/db-guard.js';

/**
 * Where the department's own officials may be loaded: the development database on this computer
 * only, never a test or shared database, and from a list kept outside the repository, so that no
 * real name, email, mobile or set-password link ever lands next to the code.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** The reason the org set may not run, or null when it may. */
export function checkOrgTarget(
  env: { NODE_ENV?: string | undefined; DATABASE_URL?: string | undefined },
  repoRoot: string,
  listPath: string,
): string | null {
  const guard = checkDestructiveDbAccess(env);
  if (!guard.allowed) return guard.reason;
  if (guard.database !== 'css_erp_dev')
    return `the department's own data goes only into css_erp_dev, not "${guard.database}"`;
  const host = new URL(env.DATABASE_URL!).hostname;
  if (!LOCAL_HOSTS.has(host)) return 'the database is not on this computer';
  const fromRepo = relative(resolve(repoRoot), resolve(listPath));
  if (!fromRepo.startsWith('..') && !isAbsolute(fromRepo))
    return 'the staff list must be kept outside the repository';
  return null;
}

/** A new file beside the list for the run's links, named by the run's local date and time. */
export function linksFileName(listPath: string, now: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}`;
  return join(dirname(listPath), `invitations-${stamp}.tsv`);
}
