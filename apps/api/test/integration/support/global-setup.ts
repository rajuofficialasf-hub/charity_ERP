import type { TestProject } from 'vitest/node';
import { createDatabase, dropDatabase, runMigrations, uniqueName } from './db';

declare module 'vitest' {
  export interface ProvidedContext {
    templateDb: string;
  }
}

// Builds the migrated template database once per test run (O-46 item 1); every test file clones it.
export async function setup(project: TestProject): Promise<() => Promise<void>> {
  const template = uniqueName('tpl');
  await createDatabase(template);
  await runMigrations(template, 'up');
  project.provide('templateDb', template);
  return async () => {
    await dropDatabase(template);
  };
}
