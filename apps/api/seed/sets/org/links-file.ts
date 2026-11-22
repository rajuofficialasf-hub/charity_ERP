import { execFileSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import type { OrgLink } from './index.js';
import { linksFileName } from './target.js';

/**
 * The file that carries each official's set-password link to the owner, who hands each link to its
 * person. It holds live tokens, so it is created new (never over another file) and readable by the
 * person who ran the seed alone: on Windows the folder's inherited permissions are removed, since
 * Node's file mode does not apply there.
 */

export const LINKS_FILE_COLUMNS = ['job_id', 'name', 'role', 'link', 'expires_at'] as const;

/** The links as tab-separated text, one official per line after the header. */
export function linksFileText(links: OrgLink[]): string {
  const lines = [
    LINKS_FILE_COLUMNS.join('\t'),
    ...links.map((l) => [l.jobId, l.name, l.roleKey, l.link, l.expiresAt].join('\t')),
  ];
  return `${lines.join('\n')}\n`;
}

/** Writes the links to a new file that only the current user may read; an existing file is refused. */
export function writeLinksFile(path: string, links: OrgLink[]): void {
  writeFileSync(path, linksFileText(links), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  if (process.platform === 'win32')
    execFileSync('icacls', [path, '/inheritance:r', '/grant:r', `${userInfo().username}:F`], {
      stdio: 'ignore',
      windowsHide: true,
    });
}

/** Removes a links file whose tokens a failed run did not store. */
export function removeLinksFile(path: string): void {
  if (existsSync(path)) rmSync(path);
}

/**
 * Where a run's links go: a new file beside the list, or nowhere when the officials open with the
 * demo password, since then nobody gets a link and no file of tokens should exist.
 */
export function linksDestination(
  listPath: string,
  now: Date,
  demoPassword: boolean,
): { linksPath: string | null; writeLinks: (links: OrgLink[]) => void } {
  if (demoPassword) return { linksPath: null, writeLinks: () => undefined };
  const linksPath = linksFileName(listPath, now);
  return { linksPath, writeLinks: (links) => writeLinksFile(linksPath, links) };
}
