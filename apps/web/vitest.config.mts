import { defineProject } from 'vitest/config';
import { nodeSourceConditions, sourceConditions } from '../../vitest.shared.mts';

export default defineProject({
  resolve: { conditions: sourceConditions },
  // the files that run in the node environment (`@vitest-environment node`) resolve through ssr
  ssr: { resolve: { conditions: nodeSourceConditions } },
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
  },
});
