import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/css_erp_dev',
  CURSOR_SECRET: 'x'.repeat(32),
  MINIO_ACCESS_KEY: 'placeholder',
  MINIO_SECRET_KEY: 'placeholder',
};

describe('loadEnv', () => {
  it('applies defaults and parses the port', () => {
    const env = loadEnv({ ...base, PORT: '4100' });
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4100,
      DATABASE_URL: 'postgresql://u:p@localhost:5432/css_erp_dev',
      STORAGE_DRIVER: 'minio',
      JOBS_INLINE: false,
      SMS_MODE: 'logging',
    });
  });

  it('fails fast with the variable name when a value is missing', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it('rejects a database URL that is not PostgreSQL', () => {
    expect(() => loadEnv({ ...base, DATABASE_URL: 'mysql://u:p@localhost/db' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('refuses inline jobs and filesystem storage in production (BR-024)', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'production', JOBS_INLINE: 'true' })).toThrow(
      /JOBS_INLINE/,
    );
    expect(() =>
      loadEnv({
        ...base,
        NODE_ENV: 'production',
        STORAGE_DRIVER: 'filesystem',
        STORAGE_FS_ROOT: '/tmp',
      }),
    ).toThrow(/STORAGE_DRIVER/);
  });

  it('needs MinIO keys for MinIO storage and a short cursor secret is refused', () => {
    expect(() =>
      loadEnv({ DATABASE_URL: base.DATABASE_URL, CURSOR_SECRET: base.CURSOR_SECRET }),
    ).toThrow(/MINIO_ACCESS_KEY/);
    expect(() => loadEnv({ ...base, CURSOR_SECRET: 'short' })).toThrow(/CURSOR_SECRET/);
  });
});
