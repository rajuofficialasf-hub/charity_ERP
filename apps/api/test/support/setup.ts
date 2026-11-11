import { afterAll, afterEach, expect, inject } from 'vitest';
import { contractRecorder } from './contract.js';

contractRecorder.coverageDir = inject('contractCoverageDir');

// Every test of the API fails when one of its responses broke docs/api/openapi.yaml (the contract
// recorder of test/support/contract.ts); the responses seen are kept as coverage lines for
// `pnpm --filter @css/api contract:coverage`.
afterEach(() => {
  const violations = contractRecorder.violations();
  contractRecorder.reset();
  expect(violations, 'responses outside docs/api/openapi.yaml').toEqual([]);
});

afterAll(() => {
  contractRecorder.flushCoverage();
});
