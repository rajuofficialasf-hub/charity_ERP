import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildTestApp } from '../test/support/app.js';

// pnpm --filter @css/api contract:coverage: runs both API test projects with the contract
// recorder and then names every registered operation that no test answered with its success
// status (docs/testing/TEST_STRATEGY.md, section "API and contract"). `--no-run` only reads the
// coverage lines of an earlier run.
const api = join(import.meta.dirname, '..');
const coverageDir = process.env.CONTRACT_COVERAGE_DIR ?? join(api, 'test-results/contract');
const noRun = process.argv.includes('--no-run');

function runTests(): void {
  rmSync(coverageDir, { recursive: true, force: true });
  for (const config of ['vitest.config.mts', 'vitest.db.config.mts']) {
    const result = spawnSync('pnpm', ['exec', 'vitest', 'run', '--config', config], {
      cwd: api,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, CONTRACT_COVERAGE_DIR: coverageDir },
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

function seenStatuses(): Map<string, Set<number>> {
  const seen = new Map<string, Set<number>>();
  // one folder per Vitest project, each emptied by that project's global setup; a loose file in
  // the root is a leftover of an older layout and not read
  const files = existsSync(coverageDir)
    ? readdirSync(coverageDir, { recursive: true, encoding: 'utf8' }).filter(
        (f) => f.endsWith('.jsonl') && /[\\/]/.test(f),
      )
    : [];
  for (const file of files)
    for (const line of readFileSync(join(coverageDir, file), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const { operationId, status } = JSON.parse(line) as {
        operationId: string | null;
        status: number;
      };
      if (!operationId) continue;
      const set = seen.get(operationId) ?? new Set<number>();
      set.add(status);
      seen.set(operationId, set);
    }
  return seen;
}

async function main(): Promise<void> {
  if (!noRun) runTests();
  const seen = seenStatuses();
  if (seen.size === 0) {
    console.error(`no coverage lines in ${coverageDir}; run without --no-run`);
    process.exit(2);
  }
  const app = buildTestApp();
  const operations = app.registry.list();
  await app.close();
  const uncovered = operations.filter(
    (op) => ![...(seen.get(op.operationId) ?? [])].some((s) => s >= 200 && s < 300),
  );
  const covered = operations.length - uncovered.length;
  process.stdout.write(
    `contract coverage: ${covered} of ${operations.length} operations answered their success status in a test\n`,
  );
  for (const op of uncovered) {
    const statuses = [...(seen.get(op.operationId) ?? [])].sort().join(', ') || 'never called';
    process.stdout.write(
      `  missing ${op.method.toUpperCase()} ${op.path} (${op.operationId}): ${statuses}\n`,
    );
  }
  if (uncovered.length > 0) process.exit(1);
}

void main();
