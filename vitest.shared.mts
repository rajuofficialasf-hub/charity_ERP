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
