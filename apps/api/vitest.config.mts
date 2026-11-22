import { defineProject } from 'vitest/config';
import { assertTestRuntime, nodeSourceConditions } from '../../vitest.shared.mts';

assertTestRuntime();

export default defineProject({
  resolve: { conditions: nodeSourceConditions },
  ssr: { resolve: { conditions: nodeSourceConditions } },
  test: {
    name: 'api',
    environment: 'node',
    setupFiles: ['test/support/setup.ts'],
    globalSetup: ['test/support/contract-global-setup.ts'],
    // pg-boss's optional @opentelemetry/api ships an ESM build with extensionless imports that
    // only a bundler resolves; Vitest inlines it (the Node runtime loads its CommonJS build).
    server: { deps: { inline: ['pg-boss', '@opentelemetry/api'] } },
    include: ['src/**/*.spec.ts', 'seed/**/*.spec.ts', 'test/api/**/*.test.ts'],
  },
});
