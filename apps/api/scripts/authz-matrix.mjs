// Regenerates docs/security/AUTHORIZATION_MATRIX.md (T1.8 U6): runs the authorization-matrix test
// with CSS_WRITE_AUTHZ_MATRIX=1, which writes the report before comparing it. Needs the test
// database (`docker compose up -d`).
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const result = spawnSync(
  'pnpm',
  [
    'exec',
    'vitest',
    'run',
    '-c',
    'vitest.db.config.mts',
    'test/integration/authorization-matrix.test.ts',
  ],
  { stdio: 'inherit', shell: true, env: { ...process.env, CSS_WRITE_AUTHZ_MATRIX: '1' } },
);
process.exit(result.status ?? 1);
