import swc from 'unplugin-swc';
import { defineProject } from 'vitest/config';
import { nodeSourceConditions } from '../../vitest.shared.mts';

export default defineProject({
  // NestJS dependency injection needs decorator metadata, which esbuild does not emit; SWC does.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: { conditions: nodeSourceConditions },
  ssr: { resolve: { conditions: nodeSourceConditions } },
  test: {
    name: 'api',
    environment: 'node',
    // pg-boss's optional @opentelemetry/api ships an ESM build with extensionless imports that
    // only a bundler resolves; Vitest inlines it (the Node runtime loads its CommonJS build).
    server: { deps: { inline: ['pg-boss', '@opentelemetry/api'] } },
    include: ['src/**/*.spec.ts', 'test/api/**/*.test.ts'],
  },
});
