import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/css_erp_dev',
  CURSOR_SECRET: 'x'.repeat(32),
  STORAGE_DRIVER: 's3',
  MINIO_ACCESS_KEY: 'placeholder',
  MINIO_SECRET_KEY: 'placeholder',
  JWT_SECRET: 'j'.repeat(32),
  AUTH_CSRF_SECRET: 'c'.repeat(32),
  OTP_SECRET: 'o'.repeat(32),
};

describe('loadEnv', () => {
  it('applies defaults and parses the port', () => {
    const env = loadEnv({ ...base, PORT: '4100' });
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4100,
      DATABASE_URL: 'postgresql://u:p@localhost:5432/css_erp_dev',
      STORAGE_DRIVER: 's3',
      JOBS_INLINE: false,
      SMS_MODE: 'logging',
    });
  });

  it('fails fast with the variable name when a value is missing', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it('has no default storage driver and refuses an unknown one (NS-34)', () => {
    expect(() => loadEnv({ ...base, STORAGE_DRIVER: undefined })).toThrow(/STORAGE_DRIVER/);
    expect(() => loadEnv({ ...base, STORAGE_DRIVER: 'minio' })).toThrow(/STORAGE_DRIVER/);
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
      loadEnv({ ...base, MINIO_ACCESS_KEY: undefined, MINIO_SECRET_KEY: undefined }),
    ).toThrow(/MINIO_ACCESS_KEY/);
    expect(() => loadEnv({ ...base, CURSOR_SECRET: 'short' })).toThrow(/CURSOR_SECRET/);
  });

  it('refuses the dummy OTP and insecure auth cookies in production (BD-49, BR-024, D-070)', () => {
    expect(() =>
      loadEnv({
        ...base,
        NODE_ENV: 'production',
        OTP_DUMMY_ENABLED: 'true',
        OTP_DUMMY_CODE: '123456',
      }),
    ).toThrow(/OTP_DUMMY_ENABLED/);
    expect(() => loadEnv({ ...base, NODE_ENV: 'production', AUTH_COOKIE_SECURE: 'false' })).toThrow(
      /AUTH_COOKIE_SECURE/,
    );
    expect(() => loadEnv({ ...base, NODE_ENV: 'production', RATE_LIMITS_RELAXED: 'true' })).toThrow(
      /RATE_LIMITS_RELAXED/,
    );
    expect(loadEnv({ ...base, NODE_ENV: 'production' })).toMatchObject({
      OTP_DUMMY_ENABLED: false,
      AUTH_COOKIE_SECURE: true,
      TRUST_PROXY: 'loopback',
      RATE_LIMITS_RELAXED: false,
    });
  });

  it('needs a six-digit dummy code when the dummy OTP is on, and long auth secrets', () => {
    expect(() => loadEnv({ ...base, OTP_DUMMY_ENABLED: 'true' })).toThrow(/OTP_DUMMY_CODE/);
    expect(() => loadEnv({ ...base, OTP_DUMMY_ENABLED: 'true', OTP_DUMMY_CODE: '12345' })).toThrow(
      /OTP_DUMMY_CODE/,
    );
    expect(() => loadEnv({ ...base, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
    expect(() => loadEnv({ ...base, OTP_SECRET: undefined })).toThrow(/OTP_SECRET/);
  });
});
