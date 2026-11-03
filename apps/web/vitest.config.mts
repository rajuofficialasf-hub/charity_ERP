import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';
import { nodeSourceConditions, sourceConditions } from '../../vitest.shared.mts';

export default defineProject({
  // the same `@/` alias as vite.config.ts (the asf UI system imports `@/ui`)
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    conditions: sourceConditions,
  },
  // the files that run in the node environment (`@vitest-environment node`) resolve through ssr
  ssr: { resolve: { conditions: nodeSourceConditions } },
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
  },
});
