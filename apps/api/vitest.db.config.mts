import { defineProject } from 'vitest/config';
import { nodeSourceConditions } from '../../vitest.shared.mts';

// Integration tests against a real PostgreSQL 17 (O-46 item 1). Needs `docker compose up -d`
// locally (TEST_DATABASE_URL defaults to css_erp_test on port 5433); CI uses its service database.
export default defineProject({
  resolve: { conditions: nodeSourceConditions },
  ssr: { resolve: { conditions: nodeSourceConditions } },
  test: {
    name: 'api-db',
    environment: 'node',
    setupFiles: ['test/support/setup.ts'],
    // pg-boss's optional @opentelemetry/api ships an ESM build with extensionless imports that
    // only a bundler resolves; Vitest inlines it (the Node runtime loads its CommonJS build).
    server: { deps: { inline: ['pg-boss', '@opentelemetry/api'] } },
    include: ['test/integration/**/*.test.ts'],
    globalSetup: [
      'test/integration/support/global-setup.ts',
      'test/support/contract-global-setup.ts',
    ],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
