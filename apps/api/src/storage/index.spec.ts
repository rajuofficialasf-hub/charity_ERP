import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Env } from '../config/env';
import { createDriver, createStorage } from './index';

const env = {
  STORAGE_DRIVER: 'nas',
  STORAGE_ROOT: mkdtempSync(join(tmpdir(), 'css-index-')),
  MINIO_ENDPOINT: '127.0.0.1',
  MINIO_PORT: 9000,
  MINIO_USE_SSL: false,
  MINIO_ACCESS_KEY: 'test-only-access',
  MINIO_SECRET_KEY: 'test-only-secret-value',
} as Env;

describe('the storage entry point', () => {
  it('builds the driver the configuration names', () => {
    expect(createStorage(env).name).toBe('nas');
  });

  it('builds any driver by name, so the copy can hold both at once', () => {
    expect(createDriver('nas', env).name).toBe('nas');
    expect(createDriver('s3', env).name).toBe('s3');
  });
});
