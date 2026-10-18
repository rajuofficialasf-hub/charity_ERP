import { rmSync } from 'node:fs';
import { join } from 'node:path';
import type { TestProject } from 'vitest/node';
import { COVERAGE_ROOT } from './contract';

declare module 'vitest' {
  export interface ProvidedContext {
    contractCoverageDir: string;
  }
}

// Empties this project's folder of contract coverage lines once per run, so a later
// `contract:coverage --no-run` reads only the responses of the last run of each project.
export function setup(project: TestProject): void {
  const dir = join(COVERAGE_ROOT, project.name);
  rmSync(dir, { recursive: true, force: true });
  project.provide('contractCoverageDir', dir);
}
