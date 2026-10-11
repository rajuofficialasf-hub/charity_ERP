import { defaultClientConditions, defaultServerConditions } from 'vite';

// Inside tests, workspace packages resolve to their TypeScript sources through the export
// condition "@css/source" (see packages/*/package.json); builds and runtime use dist/ instead.
// Vite's default conditions are kept so that third-party packages resolve as usual.
export const sourceConditions = ['@css/source', ...defaultClientConditions];
export const nodeSourceConditions = ['@css/source', ...defaultServerConditions];
