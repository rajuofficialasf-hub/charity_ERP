import { defineProject } from 'vitest/config';
import { sourceConditions } from '../../vitest.shared.mts';

export default defineProject({
  resolve: { conditions: sourceConditions },
  test: {
    name: 'ui',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts'],
  },
});
