import { defineConfig } from 'vitest/config';

// One `pnpm test` runs every package (TEST_STRATEGY section 2). Each project keeps its own
// vitest.config.mts; the "@css/source" condition (vitest.shared.mts) makes workspace packages
// resolve to their TypeScript sources, so tests never need a prior build.
export default defineConfig({
  test: {
    projects: ['packages/shared', 'apps/api', 'apps/api/vitest.db.config.mts', 'apps/web'],
    // half the cores of a developer's machine: with a worker on every core, the database tests and
    // the web's page tests starve each other and the page tests run past their time limits
    maxWorkers: '50%',
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html', 'json-summary'],
      include: ['packages/*/src/**', 'apps/*/src/**'],
      exclude: ['**/*.test.*', '**/*.spec.*', '**/src/generated/**', '**/test/**'],
    },
  },
});
