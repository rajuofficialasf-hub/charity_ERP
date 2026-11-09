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
    // TEST_LOG_LEVEL=error shows the API's error lines while hunting a 500 in a test
    LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? 'silent',
    STORAGE_DRIVER: 'filesystem',
    STORAGE_FS_ROOT: mkdtempSync(join(tmpdir(), 'css-storage-')),
    JOBS_INLINE: 'true',
    JWT_SECRET: 'test-only-jwt-secret-0123456789abcdef0123',
    AUTH_CSRF_SECRET: 'test-only-csrf-secret-0123456789abcdef01',
    OTP_SECRET: 'test-only-otp-secret-0123456789abcdef012',
    LOCAL_KEY_SECRET: 'test-only-local-key-secret-0123456789abcdef',
    OTP_DUMMY_ENABLED: 'true',
    OTP_DUMMY_CODE: '246810',
    AUTH_COOKIE_SECURE: 'false',
    ...overrides,
  });
}
