import { realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { checkDestructiveDbAccess } from '../../../src/config/db-guard.js';

/**
 * Where the department's own officials may be loaded: the development database on this computer
 * only, never a test or shared database, and from a list kept outside the repository, so that no
 * real name, email, mobile or set-password link ever lands next to the code.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** A path as the disk resolves it (a link or junction followed), or as written when it is absent. */
function onDisk(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/** Whether `path` lies inside `root`, the root itself included. */
export function isInside(root: string, path: string): boolean {
  const fromRoot = relative(onDisk(root), onDisk(path));
  return fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot);
}

/** The reason the org set may not run, or null when it may. */
export function checkOrgTarget(
  env: { NODE_ENV?: string | undefined; DATABASE_URL?: string | undefined },
  repoRoot: string,
  listPath: string,
  listLabel = 'staff list',
): string | null {
  const guard = checkDestructiveDbAccess(env);
  if (!guard.allowed) return guard.reason;
  if (guard.database !== 'css_erp_dev')
    return `the department's own data goes only into css_erp_dev, not "${guard.database}"`;
  const host = new URL(env.DATABASE_URL!).hostname;
  if (!LOCAL_HOSTS.has(host)) return 'the database is not on this computer';
  if (isInside(repoRoot, listPath)) return `the ${listLabel} must be kept outside the repository`;
  return null;
}

/** A new file beside the list for the run's links, named by the run's local date and time. */
export function linksFileName(listPath: string, now: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  const day = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}`;
  const time = `${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;
  return join(dirname(listPath), `invitations-${day}-${time}.tsv`);
}
