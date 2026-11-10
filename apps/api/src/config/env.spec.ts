import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

  it('needs MinIO keys for MinIO storage and a short cursor secret is refused', () => {
    expect(() =>
      loadEnv({ ...base, MINIO_ACCESS_KEY: undefined, MINIO_SECRET_KEY: undefined }),
    ).toThrow(/MINIO_ACCESS_KEY/);
    expect(() => loadEnv({ ...base, CURSOR_SECRET: 'short' })).toThrow(/CURSOR_SECRET/);
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
        .map((line) => /^([A-Z_]+)=(.+)$/.exec(line.trim()))
        .filter((m): m is RegExpExecArray => m !== null)
        .map((m) => [m[1]!, m[2]!]),
    );
    const fromCompose = Object.fromEntries(
      readFileSync(resolve(root, 'infra/docker-compose.app.yml'), 'utf8')
        .split('\n')
        .map((line) => /^\s+([A-Z_]+): (.+)$/.exec(line))
        .filter((m): m is RegExpExecArray => m !== null)
        // a compose default `${NAME:-value}` is the value a developer gets
        .map((m) => [m[1]!, m[2]!.replace(/\$\{[A-Z_]+:-([^}]*)\}/g, '$1').replace(/^'|'$/g, '')]),
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
      'MINIO_ACCESS_KEY',
      'MINIO_SECRET_KEY',
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
          '.env.example MINIO_SECRET_KEY',
          'the dev compose file JWT_SECRET',
          'the dev compose file LOCAL_KEY_SECRET',
          'the dev compose file MINIO_ACCESS_KEY',
          'the dev compose file DATABASE_URL',
        ]),
      );
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
      expect(refusalOf({ ...production, MINIO_SECRET_KEY: 'css_ci_only_secret' })).toContain(
        'MINIO_SECRET_KEY',
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
