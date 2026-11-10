import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Env } from '../config/env';
import { createDriver, createStorage } from './index';

const env = {
  STORAGE_DRIVER: 'nas',
  STORAGE_ROOT: mkdtempSync(join(tmpdir(), 'css-index-')),
  S3_ENDPOINT: 'http://127.0.0.1:8333',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'test-only-access',
  S3_SECRET_ACCESS_KEY: 'test-only-secret-value',
} as Env;

describe('the storage entry point', () => {
  it('builds the driver the configuration names', () => {
    expect(createStorage(env).name).toBe('nas');
    expect(createStorage({ ...env, STORAGE_DRIVER: 's3' }).name).toBe('s3');
  });

  it('builds any driver by name, so the copy can hold both at once', () => {
    expect(createDriver('nas', env).name).toBe('nas');
    expect(createDriver('s3', env).name).toBe('s3');
  });

  it('builds the S3 driver only from the S3 settings', () => {
    expect(() => createDriver('s3', { ...env, S3_ENDPOINT: undefined } as unknown as Env)).toThrow(
      /S3_ENDPOINT/,
    );
    expect(() =>
      createDriver('s3', { ...env, S3_SECRET_ACCESS_KEY: undefined } as unknown as Env),
    ).toThrow(/S3_SECRET_ACCESS_KEY/);
  });
});
