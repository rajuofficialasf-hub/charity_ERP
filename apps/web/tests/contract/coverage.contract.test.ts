import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { callsIn } from './support/calls';
import { contractBase } from './support/session';

// Every call the app makes to its API has a contract case in this run. It runs after the suites
// (vitest.contract.config.mts), reading the calls they recorded.
const SRC = join(__dirname, '../../src');
const RECORD_DIR = join(__dirname, '../../test-results/contract');

/**
 * Folders whose calls the next steps of the plan cover; emptied when every response of the app has
 * its schema (docs/plans/2026-11-10-0925-migrate-ae-standards-code-only-plan.md, the last unit).
 */
const NOT_YET = [
  // the system administration
  'admin/audit/',
  'admin/nisab/',
  'admin/notifications/',
  'admin/settings/',
  'admin/system/',
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe.skipIf(!contractBase())('the contract run reaches every call of the app', () => {
  it('has a case for each call outside the folders still to come', () => {
    const reached = new Set(
      readdirSync(RECORD_DIR).flatMap((file) =>
        readFileSync(join(RECORD_DIR, file), 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((line) => (JSON.parse(line) as { call: string }).call),
      ),
    );
    const missing: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const name = relative(SRC, file).replace(/\\/g, '/');
      if (NOT_YET.some((prefix) => name.startsWith(prefix))) continue;
      const { calls, unread } = callsIn(readFileSync(file, 'utf8'));
      for (const c of calls) if (!reached.has(c)) missing.push(`${name}: ${c}`);
      // the client's own `api` takes its path as an argument and retries with it
      if (name !== 'api/client.ts')
        for (const line of unread) missing.push(`${name}:${line}: a path built elsewhere`);
    }
    expect(missing).toEqual([]);
  });
});
