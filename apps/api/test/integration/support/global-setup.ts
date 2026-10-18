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
  project.provide('templateDb', template);
  return async () => {
    await dropDatabase(template);
  };
}
