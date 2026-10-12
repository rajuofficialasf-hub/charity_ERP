import { describe, expect, it } from 'vitest';
import { createContainer } from '../container';
import { testEnv } from '../../test/support/env';
import { parsePermissionsFile, readPermissionsFile } from './registry';

// The API and the worker refuse to start when permissions.yaml names a condition the access
// module cannot check (RBAC.md 2).
describe('container start', () => {
  it('refuses a permissions file with a condition that has no check', () => {
    const raw = structuredClone(readPermissionsFile()) as { conditions: Record<string, string> };
    raw.conditions.on_full_moon = 'not implemented';
    expect(() =>
      createContainer(testEnv(), { overrides: { accessRegistry: parsePermissionsFile(raw) } }),
    ).toThrow(/on_full_moon/);
  });
});
