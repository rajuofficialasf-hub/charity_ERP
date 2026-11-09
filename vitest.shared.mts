import { defaultClientConditions, defaultServerConditions } from 'vite';

// Inside tests, workspace packages resolve to their TypeScript sources through the export
// condition "@css/source" (see packages/*/package.json); builds and runtime use dist/ instead.
// Vite's default conditions are kept so that third-party packages resolve as usual, except that
// the Node projects drop "module": packages such as the AWS SDK list it before "node" and their
// ESM builds have extensionless imports that only a bundler resolves, so the Node projects pick
// the build Node itself would (the "node" condition, CommonJS).
export const sourceConditions = ['@css/source', ...defaultClientConditions];
export const nodeSourceConditions = [
  '@css/source',
  ...defaultServerConditions.filter((c) => c !== 'module'),
];

/** The first Node release whose libuv no longer breaks its stack cookie on Windows (D-164). */
export const MIN_WINDOWS_NODE = '24.16.0';

const versionNumber = (version: string) => {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map(Number);
  return major * 1_000_000 + minor * 1_000 + patch;
};

/**
 * Refuses a Node runtime that aborts test workers on Windows. Node 24.15.0 and older (libuv
 * 1.51.0) call RtlGetVersion with an uninitialized OSVERSIONINFOW on TCP connects and keep-alive
 * calls; now and then it overwrites the stack cookie and the process ends at once with
 * 0xC0000409, printing nothing (libuv issue 5106, fixed by libuv 5107, in Node 24.16.0). Vitest
 * reports it as "Worker exited unexpectedly" and leaves one file's tests unreported. Only the
 * API projects call this: they are the ones that open loopback connections (Supertest, pg).
 */
export function assertTestRuntime(): void {
  const version = process.versions.node;
  if (process.platform !== 'win32' || versionNumber(version) >= versionNumber(MIN_WINDOWS_NODE))
    return;
  throw new Error(
    `Node ${version} on Windows aborts Vitest workers at random ("Worker exited unexpectedly", ` +
      `exit code 0xC0000409, libuv issue 5106). Install Node ${MIN_WINDOWS_NODE} or a later ` +
      `24.x release (docs/testing/TEST_STRATEGY.md section 10).`,
  );
}
