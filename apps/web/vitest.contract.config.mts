import { fileURLToPath } from 'node:url';
import { BaseSequencer, type TestSpecification } from 'vitest/node';
import { defineConfig } from 'vitest/config';
import { nodeSourceConditions } from '../../vitest.shared.mts';

/** The suites one after another (they share one API and its data), the coverage check last. */
class CoverageLast extends BaseSequencer {
  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const sorted = [...files].sort((a, b) => a.moduleId.localeCompare(b.moduleId));
    return [
      ...sorted.filter((f) => !f.moduleId.includes('coverage.contract')),
      ...sorted.filter((f) => f.moduleId.includes('coverage.contract')),
    ];
  }
}

// The web app's contract test: real responses of a running API, read with the app's own schemas.
// It needs CONTRACT_API_URL (this machine only) and skips without it.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    conditions: nodeSourceConditions,
  },
  ssr: { resolve: { conditions: nodeSourceConditions } },
  test: {
    name: 'web-contract',
    environment: 'node',
    include: ['tests/contract/**/*.contract.test.ts'],
    fileParallelism: false,
    sequence: { sequencer: CoverageLast },
    testTimeout: 30_000,
    globalSetup: ['tests/contract/support/global-setup.ts'],
  },
});
