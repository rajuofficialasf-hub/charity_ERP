import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { TestProject } from 'vitest/node';
import { installJobs } from '../../../src/jobs/install';
import { createDatabase, dropDatabase, runMigrations, uniqueName, urlFor } from './db';

declare module 'vitest' {
  export interface ProvidedContext {
    templateDb: string;
  }
}

// Builds the migrated template database once per test run; every test file clones it.
export async function setup(project: TestProject): Promise<() => Promise<void>> {
  const template = uniqueName('tpl');
  await createDatabase(template);
  await runMigrations(template, 'up');
  // the job queues too: an event writes its outbox row and enqueues its delivery in one transaction
  await installJobs(urlFor(template));
  // the templates, as `pnpm db:migrate` writes them: the delivery renders from them. The script runs
  // in its own process, because a global setup does not resolve workspace packages to their sources
  syncTemplates(urlFor(template));
  project.provide('templateDb', template);
  return async () => {
    await dropDatabase(template);
  };
}

function syncTemplates(url: string): void {
  const tsx = createRequire(__filename).resolve('tsx/cli');
  const api = join(__dirname, '..', '..', '..');
  const result = spawnSync(
    process.execPath,
    [tsx, '--conditions=@css/source', 'scripts/notifications-sync.ts'],
    { cwd: api, env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8' },
  );
  if (result.status !== 0)
    throw new Error(`notification templates not synced: ${result.stderr || result.stdout}`);
}
