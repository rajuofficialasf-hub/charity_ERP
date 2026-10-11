import { defineConfig } from 'vitest/config';

// One `pnpm test` runs every package (TEST_STRATEGY section 2). Each project keeps its own
// vitest.config.mts; the "@css/source" condition (vitest.shared.mts) makes workspace packages
// resolve to their TypeScript sources, so tests never need a prior build.
export default defineConfig({
  test: {
    projects: [
      'packages/shared',
      'packages/ui',
      'apps/api',
      'apps/api/vitest.db.config.mts',
      'apps/web',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html', 'json-summary'],
      include: ['packages/*/src/**', 'apps/*/src/**'],
      exclude: ['**/*.test.*', '**/*.spec.*', '**/src/generated/**', '**/test/**'],
    },
  },
});
