import { defineProject } from 'vitest/config';
import { nodeSourceConditions } from '../../vitest.shared.mts';

export default defineProject({
  resolve: { conditions: nodeSourceConditions },
  ssr: { resolve: { conditions: nodeSourceConditions } },
  test: {
    name: 'shared',
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
