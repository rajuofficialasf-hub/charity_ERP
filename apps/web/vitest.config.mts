import { defineProject } from 'vitest/config';
import { sourceConditions } from '../../vitest.shared.mts';

export default defineProject({
  resolve: { conditions: sourceConditions },
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
  },
});
