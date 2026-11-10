import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/css_erp_dev',
  CURSOR_SECRET: 'x'.repeat(32),
  STORAGE_DRIVER: 's3',
  S3_ENDPOINT: 'https://s3.example.org',
  S3_ACCESS_KEY_ID: 'placeholder',
  S3_SECRET_ACCESS_KEY: 'placeholder',
  JWT_SECRET: 'j'.repeat(32),
  AUTH_CSRF_SECRET: 'c'.repeat(32),
  OTP_SECRET: 'o'.repeat(32),
  LOCAL_KEY_SECRET: 'l'.repeat(32),
};

describe('loadEnv', () => {
  it('needs the secret that seals the device keys, and refuses the example value in production', () => {
    expect(() => loadEnv({ ...base, LOCAL_KEY_SECRET: undefined as unknown as string })).toThrow(
      /LOCAL_KEY_SECRET/,
    );
    expect(() =>
      loadEnv({
        ...base,
        NODE_ENV: 'production',
        APP_ORIGIN: 'https://erp.example.org',
        LOCAL_KEY_SECRET: 'change-me-to-a-random-string-of-32-characters',
      }),
    ).toThrow(/LOCAL_KEY_SECRET/);
    expect(
      loadEnv({ ...base, LOCAL_KEY_PREVIOUS_SECRET: '' }).LOCAL_KEY_PREVIOUS_SECRET,
    ).toBeUndefined();
  });

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

  it('treats an empty value as unset, as in .env.example (JWT_PREVIOUS_SECRET=)', () => {
    const env = loadEnv({ ...base, JWT_PREVIOUS_SECRET: '' });
    expect(env.JWT_PREVIOUS_SECRET).toBeUndefined();
  });

  it('fails fast with the variable name when a value is missing', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it('has no default storage driver and refuses an unknown one', () => {
    expect(() => loadEnv({ ...base, STORAGE_DRIVER: undefined })).toThrow(/STORAGE_DRIVER/);
    expect(() => loadEnv({ ...base, STORAGE_DRIVER: 'minio' })).toThrow(/STORAGE_DRIVER/);
  });

  it('rejects a database URL that is not PostgreSQL', () => {
    expect(() => loadEnv({ ...base, DATABASE_URL: 'mysql://u:p@localhost/db' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('keeps the shutdown delay within what the container waits for', () => {
    expect(loadEnv({ ...base, SHUTDOWN_DELAY_MS: '5000' }).SHUTDOWN_DELAY_MS).toBe(5_000);
    expect(() => loadEnv({ ...base, SHUTDOWN_DELAY_MS: '5001' })).toThrow(/SHUTDOWN_DELAY_MS/);
  });

  it('refuses inline jobs in production', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'production', JOBS_INLINE: 'true' })).toThrow(
      /JOBS_INLINE/,
    );
  });

  it('stores on the NAS under an absolute root, also in production', () => {
    const root = process.platform === 'win32' ? 'D:\\nas\\css-erp' : '/mnt/nas/css-erp';
    const nas = { STORAGE_DRIVER: 'nas', STORAGE_ROOT: root };
    expect(loadEnv({ ...base, ...nas }).STORAGE_ROOT).toBe(root);
    const production = {
      ...base,
      ...nas,
      NODE_ENV: 'production',
      APP_ORIGIN: 'https://erp.example.org',
    };
    expect(() => loadEnv(production)).toThrow(
      /^Invalid configuration: FILE_SCANNER: a real virus scanner is required in production$/,
    );
    expect(() => loadEnv({ ...base, STORAGE_DRIVER: 'nas' })).toThrow(
      /STORAGE_ROOT: required when STORAGE_DRIVER=nas/,
    );
    expect(() => loadEnv({ ...base, ...nas, STORAGE_ROOT: 'nas/css-erp' })).toThrow(
      /STORAGE_ROOT: must be an absolute path/,
    );
  });

  it('refuses the test folder driver and its root under their earlier names', () => {
    expect(() => loadEnv({ ...base, STORAGE_DRIVER: 'filesystem' })).toThrow(
      /STORAGE_DRIVER: filesystem is now nas, set STORAGE_DRIVER=nas and STORAGE_ROOT/,
    );
    expect(() => loadEnv({ ...base, STORAGE_FS_ROOT: '/tmp' })).toThrow(
      /STORAGE_FS_ROOT: renamed, set STORAGE_ROOT instead/,
    );
  });

  it('needs the endpoint and the key pair for the S3 driver, and none of them for the NAS', () => {
    for (const key of ['S3_ENDPOINT', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'])
      expect(() => loadEnv({ ...base, [key]: undefined }), key).toThrow(
        new RegExp(`${key}: required when STORAGE_DRIVER=s3`),
      );
    const root = process.platform === 'win32' ? 'D:\\nas\\css-erp' : '/mnt/nas/css-erp';
    expect(
      loadEnv({
        ...base,
        STORAGE_DRIVER: 'nas',
        STORAGE_ROOT: root,
        S3_ENDPOINT: undefined,
        S3_ACCESS_KEY_ID: undefined,
        S3_SECRET_ACCESS_KEY: undefined,
      }).STORAGE_DRIVER,
    ).toBe('nas');
    expect(() => loadEnv({ ...base, CURSOR_SECRET: 'short' })).toThrow(/CURSOR_SECRET/);
  });

  it('reads the S3 endpoint as a whole http(s) URL and the region with its default', () => {
    expect(loadEnv(base)).toMatchObject({
      S3_ENDPOINT: 'https://s3.example.org',
      S3_REGION: 'us-east-1',
    });
    expect(
      loadEnv({ ...base, S3_ENDPOINT: 'http://seaweedfs:8333', S3_REGION: 'eu-central-1' }),
    ).toMatchObject({ S3_ENDPOINT: 'http://seaweedfs:8333', S3_REGION: 'eu-central-1' });
    for (const bad of [
      'seaweedfs:8333',
      '127.0.0.1',
      'ftp://s3.example.org:21',
      'http://s3.example.org:8333/documents',
      'http://s3.example.org:8333?bucket=documents',
    ])
      expect(() => loadEnv({ ...base, S3_ENDPOINT: bad }), bad).toThrow(/S3_ENDPOINT/);
  });

  it('refuses each earlier MinIO setting, naming the setting that replaces it', () => {
    const renamed = {
      MINIO_ENDPOINT: 'S3_ENDPOINT',
      MINIO_PORT: 'S3_ENDPOINT',
      MINIO_USE_SSL: 'S3_ENDPOINT',
      MINIO_ACCESS_KEY: 'S3_ACCESS_KEY_ID',
      MINIO_SECRET_KEY: 'S3_SECRET_ACCESS_KEY',
    };
    for (const [old, next] of Object.entries(renamed))
      expect(() => loadEnv({ ...base, [old]: 'x' }), old).toThrow(
        new RegExp(`${old}: renamed, set ${next} instead`),
      );
    // the refusal holds with the NAS driver too: a leftover name means a stale configuration
    const root = process.platform === 'win32' ? 'D:\\nas\\css-erp' : '/mnt/nas/css-erp';
    expect(() =>
      loadEnv({ ...base, STORAGE_DRIVER: 'nas', STORAGE_ROOT: root, MINIO_PORT: '9000' }),
    ).toThrow(/MINIO_PORT: renamed, set S3_ENDPOINT instead/);
    // an empty value is unset, as everywhere else
    expect(() => loadEnv({ ...base, MINIO_ENDPOINT: '' })).not.toThrow();
  });

  it('refuses the dummy OTP and insecure auth cookies in production', () => {
    const production = { ...base, NODE_ENV: 'production', APP_ORIGIN: 'https://erp.example.org' };
    expect(() =>
      loadEnv({
        ...production,
        OTP_DUMMY_ENABLED: 'true',
        OTP_DUMMY_CODE: '123456',
      }),
    ).toThrow(/OTP_DUMMY_ENABLED/);
    expect(() => loadEnv({ ...production, AUTH_COOKIE_SECURE: 'false' })).toThrow(
      /AUTH_COOKIE_SECURE/,
    );
    expect(() => loadEnv({ ...production, RATE_LIMITS_RELAXED: 'true' })).toThrow(
      /RATE_LIMITS_RELAXED/,
    );
    expect(() => loadEnv({ ...production, SESSION_DEVICE_LIMIT_RELAXED: 'true' })).toThrow(
      /SESSION_DEVICE_LIMIT_RELAXED/,
    );
    // the set-password link goes out by email, so it must point at the https origin
    expect(() => loadEnv({ ...base, NODE_ENV: 'production' })).toThrow(/APP_ORIGIN/);
    // production starts only with a real virus scanner, which joins with the first deployment;
    // until then the scanner is the one thing a production configuration lacks
    const refusal = (() => {
      try {
        loadEnv(production);
        return '';
      } catch (error) {
        return String(error);
      }
    })();
    // exactly one problem: every other production setting and default is valid
    expect(refusal).toBe(
      'Error: Invalid configuration: FILE_SCANNER: a real virus scanner is required in production',
    );
  });

  it('reads the allowed origins as exact origins and refuses anything else at startup', () => {
    expect(
      loadEnv({ ...base, ALLOWED_ORIGINS: 'https://erp.example.org, http://127.0.0.1:3000' })
        .ALLOWED_ORIGINS,
    ).toEqual(['https://erp.example.org', 'http://127.0.0.1:3000']);
    expect(loadEnv(base).ALLOWED_ORIGINS).toEqual([]);
    for (const bad of [
      '*',
      'https://erp.example.org/app',
      'https://erp.example.org/',
      'ftp://erp.example.org',
      'erp.example.org',
    ])
      expect(() => loadEnv({ ...base, ALLOWED_ORIGINS: bad }), bad).toThrow(/ALLOWED_ORIGINS/);
  });

  it('allows only https origins on a real host in production', () => {
    const production = { ...base, NODE_ENV: 'production', APP_ORIGIN: 'https://erp.example.org' };
    const refusal = (origins: string) => {
      try {
        loadEnv({ ...production, ALLOWED_ORIGINS: origins });
        return '';
      } catch (error) {
        return String(error);
      }
    };
    for (const local of [
      'http://erp.example.org',
      'https://127.0.0.1',
      'https://localhost:3000',
      'https://0.0.0.0',
      'https://10.0.0.5',
      'https://[::1]',
      'https://app.localhost',
      'https://localhost.',
    ])
      expect(refusal(local), local).toContain('ALLOWED_ORIGINS');
    // a wildcard is refused by the parsing, with its own message
    expect(refusal('*')).toContain('ALLOWED_ORIGINS: "*" is not an exact http(s) origin');
    // a real site, even one whose name starts with digits, leaves only the scanner missing
    const scannerOnly =
      'Error: Invalid configuration: FILE_SCANNER: a real virus scanner is required in production';
    expect(refusal('https://erp.example.org')).toBe(scannerOnly);
    expect(refusal('https://127.example.org')).toBe(scannerOnly);
  });

  it('refuses the allowlist under its earlier name instead of ignoring it', () => {
    expect(() => loadEnv({ ...base, CORS_ORIGINS: 'https://erp.example.org' })).toThrow(
      /CORS_ORIGINS: renamed, set ALLOWED_ORIGINS instead/,
    );
  });

  describe('the local example secrets in production', () => {
    // every secret value the two example files hand to a developer, read from the files themselves
    // so a new example value is checked as soon as it is written there
    const root = resolve(__dirname, '../../../..');
    const fromEnvExample = Object.fromEntries(
      readFileSync(resolve(root, 'apps/api/.env.example'), 'utf8')
        .split('\n')
        .map((line) => /^([A-Z][A-Z0-9_]*)=(.+)$/.exec(line.trim()))
        .filter((m): m is RegExpExecArray => m !== null)
        .map((m) => [m[1]!, m[2]!]),
    );
    const fromCompose = Object.fromEntries(
      readFileSync(resolve(root, 'infra/docker-compose.app.yml'), 'utf8')
        .split('\n')
        .map((line) => /^\s+([A-Z][A-Z0-9_]*): (.+)$/.exec(line))
        .filter((m): m is RegExpExecArray => m !== null)
        // a compose default `${NAME:-value}` is the value a developer gets
        .map((m) => [
          m[1]!,
          m[2]!.replace(/\$\{[A-Z][A-Z0-9_]*:-([^}]*)\}/g, '$1').replace(/^'|'$/g, ''),
        ]),
    );
    const secrets = [
      'JWT_SECRET',
      'JWT_PREVIOUS_SECRET',
      'AUTH_CSRF_SECRET',
      'OTP_SECRET',
      'CURSOR_SECRET',
      'LOCAL_KEY_SECRET',
      'LOCAL_KEY_PREVIOUS_SECRET',
      'SMTP_PASSWORD',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
      'DATABASE_URL',
    ];
    const cases = [
      ...Object.entries(fromEnvExample).map(([key, value]) => ['.env.example', key, value]),
      ...Object.entries(fromCompose).map(([key, value]) => ['the dev compose file', key, value]),
    ].filter(([, key]) => secrets.includes(key!)) as [string, string, string][];
    // a production configuration with real values; only the scanner is missing until deployment
    const production = { ...base, NODE_ENV: 'production', APP_ORIGIN: 'https://erp.example.org' };
    const scannerOnly =
      'Error: Invalid configuration: FILE_SCANNER: a real virus scanner is required in production';
    const refusalOf = (source: Record<string, string>) => {
      try {
        loadEnv(source);
        return '';
      } catch (error) {
        return String(error);
      }
    };

    it('reads a value for every secret the example files carry', () => {
      expect(cases.map(([file, key]) => `${file} ${key}`)).toEqual(
        expect.arrayContaining([
          '.env.example JWT_SECRET',
          '.env.example DATABASE_URL',
          '.env.example S3_ACCESS_KEY_ID',
          '.env.example S3_SECRET_ACCESS_KEY',
          'the dev compose file JWT_SECRET',
          'the dev compose file LOCAL_KEY_SECRET',
          'the dev compose file S3_ACCESS_KEY_ID',
          'the dev compose file S3_SECRET_ACCESS_KEY',
          'the dev compose file DATABASE_URL',
        ]),
      );
    });

    it('hands out one local S3 key pair: the example file, both compose files and the SeaweedFS identity', () => {
      const devCompose = readFileSync(resolve(root, 'infra/docker-compose.dev.yml'), 'utf8');
      const composeValue = (name: string) =>
        new RegExp(`^\\s+${name}: (\\S+)$`, 'm').exec(devCompose)?.[1];
      const identities = (
        JSON.parse(readFileSync(resolve(root, 'infra/seaweedfs/s3.json'), 'utf8')) as {
          identities: { credentials: { accessKey: string; secretKey: string }[] }[];
        }
      ).identities;
      const pair = [fromEnvExample['S3_ACCESS_KEY_ID'], fromEnvExample['S3_SECRET_ACCESS_KEY']];
      expect(pair.every((value) => value?.includes('css_dev_only'))).toBe(true);
      expect([fromCompose['S3_ACCESS_KEY_ID'], fromCompose['S3_SECRET_ACCESS_KEY']]).toEqual(pair);
      // the bucket bootstrap signs in with the same pair
      expect([composeValue('AWS_ACCESS_KEY_ID'), composeValue('AWS_SECRET_ACCESS_KEY')]).toEqual(
        pair,
      );
      // one identity only: no anonymous one, which would open the buckets to unsigned requests
      expect(identities).toHaveLength(1);
      expect(identities[0]!.credentials.map((c) => [c.accessKey, c.secretKey])).toEqual([pair]);
    });

    it.each(cases)(
      'refuses the value of %s for %s, naming the key without the value',
      (_, key, value) => {
        const refusal = refusalOf({ ...production, [key]: value });
        expect(refusal).toContain(key);
        expect(refusal).not.toContain(value);
      },
    );

    it('refuses the secrets of the test, E2E, OpenAPI and CI files too, and a database without a password', () => {
      for (const value of [
        'e2e-only-jwt-secret-0123456789abcdef0123',
        'test-only-jwt-secret-0123456789abcdef0123',
        'openapi-generation-only-jwt-secret-01234',
      ])
        expect(refusalOf({ ...production, JWT_SECRET: value })).toContain('JWT_SECRET');
      expect(refusalOf({ ...production, S3_SECRET_ACCESS_KEY: 'css_ci_only_secret' })).toContain(
        'S3_SECRET_ACCESS_KEY',
      );
      expect(
        refusalOf({ ...production, DATABASE_URL: 'postgresql://css@db.example.org:5432/css_erp' }),
      ).toContain('DATABASE_URL: needs a password in production');
      // a broken escape in the password is still checked, on its raw text: the example's
      // password with a lone % after it
      expect(
        refusalOf({
          ...production,
          DATABASE_URL: fromEnvExample['DATABASE_URL']!.replace('@', '%@'),
        }),
      ).toContain('DATABASE_URL: a local example value');
    });

    it('starts with real values and keeps the examples in development', () => {
      expect(refusalOf(production)).toBe(scannerOnly);
      expect(() =>
        loadEnv({
          ...base,
          JWT_SECRET: fromEnvExample['JWT_SECRET']!,
          DATABASE_URL: fromEnvExample['DATABASE_URL']!,
        }),
      ).not.toThrow();
    });
  });

  it('marks files skipped outside production and refuses that scanner in production', () => {
    expect(loadEnv(base).FILE_SCANNER).toBe('skip');
    expect(() => loadEnv({ ...base, FILE_SCANNER: 'none' })).toThrow(/FILE_SCANNER/);
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
