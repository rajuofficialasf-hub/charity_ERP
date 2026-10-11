import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Env, loadEnv } from '../../src/config/env';

/** Configuration for API and integration tests: test database, filesystem storage, quiet logs. */
export function testEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL:
      process.env.TEST_DATABASE_URL ?? 'postgresql://css:css_dev_only@127.0.0.1:5433/css_erp_test',
    CURSOR_SECRET: 'test-only-cursor-secret-0123456789abcdef',
    LOG_LEVEL: 'silent',
    STORAGE_DRIVER: 'filesystem',
    STORAGE_FS_ROOT: mkdtempSync(join(tmpdir(), 'css-storage-')),
    JOBS_INLINE: 'true',
    ...overrides,
  });
}
