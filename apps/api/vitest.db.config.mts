import swc from 'unplugin-swc';
import { defineProject } from 'vitest/config';
import { nodeSourceConditions } from '../../vitest.shared.mts';

// Integration tests against a real PostgreSQL 16 (O-46 item 1). Needs `docker compose up -d`
// locally (TEST_DATABASE_URL defaults to css_erp_test on port 5433); CI uses its service database.
export default defineProject({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: { conditions: nodeSourceConditions },
  ssr: { resolve: { conditions: nodeSourceConditions } },
  test: {
    name: 'api-db',
    environment: 'node',
    include: ['test/integration/**/*.test.ts'],
    globalSetup: ['test/integration/support/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
