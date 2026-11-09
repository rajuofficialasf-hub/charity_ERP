import { z } from 'zod';

const flag = z
  .enum(['true', 'false', '1', '0'])
  .default('false')
  .transform((v) => v === 'true' || v === '1');

/**
 * Typed process configuration, validated once at start (SYSTEM_ARCHITECTURE section 9).
 * A missing or malformed value stops the process with a clear message. .env.example lists every
 * name with placeholder values only.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    /** Signs pagination cursors so they cannot be forged (API_STANDARDS 4). */
    CURSOR_SECRET: z.string().min(32),
    /** Bearer token that unlocks the detailed readiness payload (D-057); unset = never shown. */
    HEALTH_TOKEN: z.string().min(24).optional(),
    /** Runs job consumers inside the API process; development and tests only (ADR-004). */
    JOBS_INLINE: flag,
    /**
     * The storage driver (NS-34, no default): `s3` is MinIO through the S3 API (TEMP until the NAS
     * driver exists, D-074), `filesystem` the stand-in of automated tests.
     */
    STORAGE_DRIVER: z.enum(['s3', 'filesystem']),
    MINIO_ENDPOINT: z.string().default('127.0.0.1'),
    MINIO_PORT: z.coerce.number().int().min(1).max(65535).default(9000),
    MINIO_USE_SSL: flag,
    MINIO_ACCESS_KEY: z.string().optional(),
    MINIO_SECRET_KEY: z.string().optional(),
    /** Root folder of FilesystemStorage (automated tests). */
    STORAGE_FS_ROOT: z.string().optional(),
    SMTP_HOST: z.string().default('127.0.0.1'),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
    SMTP_SECURE: flag,
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_FROM: z.string().default('CSS ERP <no-reply@example.org>'),
    /** logging (dev/test: masked log line) or dry_run (staging until a provider exists, O-33). */
    SMS_MODE: z.enum(['logging', 'dry_run']).default('logging'),
    /** Emails sent per minute by the delivery worker (30 decided); the gap between two is 60 s divided by it. */
    EMAIL_PER_MINUTE: z.coerce.number().int().min(1).max(600).default(30),
    /** The SMS provider's key; only its presence is ever shown (the channels page). */
    SMS_API_KEY: z.string().optional(),
    /**
     * The virus scanner of uploaded files. `skip` marks files skipped and is for development and
     * test only; the organization's scanner (ClamAV on its own server) joins with the first
     * deployment, and production refuses to start without it.
     */
    FILE_SCANNER: z.enum(['skip']).default('skip'),
    /** The release shown on the system health page. */
    APP_VERSION: z.string().max(64).default('0.0.0-dev'),
    /** The oldest PWA build the sync routes still accept; an older one is answered 426 (docs/api/API_STANDARDS.md "Versioning and client compatibility"). */
    MIN_CLIENT_VERSION: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/)
      .default('0.0.0'),
    /** Signs access tokens (D-070); JWT_PREVIOUS_SECRET is still accepted during a rotation. */
    JWT_SECRET: z.string().min(32),
    JWT_PREVIOUS_SECRET: z.string().min(32).optional(),
    /** Signs the double-submit CSRF token of the refresh endpoint (D-070). */
    AUTH_CSRF_SECRET: z.string().min(32),
    /** HMAC key of OTP code and address hashes (AUTH.md 2, D-070). */
    OTP_SECRET: z.string().min(32),
    /**
     * Seals the device keys of sessions in the database (docs/architecture/AUTH.md "Tokens and
     * device sessions"); LOCAL_KEY_PREVIOUS_SECRET is
     * still accepted during a rotation, and a row is re-sealed under the current one at its next
     * refresh.
     */
    LOCAL_KEY_SECRET: z.string().min(32),
    LOCAL_KEY_PREVIOUS_SECRET: z.string().min(32).optional(),
    /** Fixed OTP code instead of SMS and email; development and test only (BD-44, BD-49). */
    OTP_DUMMY_ENABLED: flag,
    OTP_DUMMY_CODE: z
      .string()
      .regex(/^[0-9]{6}$/)
      .optional(),
    /**
     * Proxies trusted for X-Forwarded-For (Express `trust proxy`, D-072): `loopback` by default;
     * production names Caddy's address or network so per-IP limits and audit IPs see the user.
     */
    TRUST_PROXY: z.string().min(1).default('loopback'),
    /**
     * docs/security/permissions.yaml (RBAC.md 2); unset = the file of the repository, which the
     * production images of the api and the worker copy (T3.0).
     */
    PERMISSIONS_FILE: z.string().min(1).optional(),
    /**
     * Browser origins allowed to call the API with credentials, comma separated, each an exact
     * `scheme://host[:port]`; a wildcard, a path or another scheme stops the start. Empty by
     * default: the PWA is served on the same origin (Caddy, the Vite proxy).
     */
    ALLOWED_ORIGINS: z
      .string()
      .default('')
      .transform((v, ctx) => {
        const origins = v
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean);
        for (const entry of origins)
          if (!isExactOrigin(entry))
            ctx.addIssue({
              code: 'custom',
              message: `"${entry}" is not an exact http(s) origin (scheme://host[:port])`,
            });
        return origins;
      }),
    /**
     * The PWA's public origin, written into links sent by email (the set-password link,
     * DECISION_LOG D-097); https in production.
     */
    APP_ORIGIN: z.url().default('http://127.0.0.1:3000'),
    /** Multiplies every rate limit by 100 for the E2E run (one shared address); never production. */
    RATE_LIMITS_RELAXED: flag,
    /**
     * Multiplies the device limit of a user by 100 for the E2E run, whose specs sign in with the
     * same few demo accounts in parallel; never production.
     */
    SESSION_DEVICE_LIMIT_RELAXED: flag,
    /** Secure attribute of the auth cookies; false only for development over a LAN address. */
    AUTH_COOKIE_SECURE: z
      .enum(['true', 'false', '1', '0'])
      .default('true')
      .transform((v) => v === 'true' || v === '1'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.JOBS_INLINE)
      ctx.addIssue({
        code: 'custom',
        path: ['JOBS_INLINE'],
        message: 'must be false in production (BR-024)',
      });
    if (env.NODE_ENV === 'production' && env.STORAGE_DRIVER === 'filesystem')
      ctx.addIssue({
        code: 'custom',
        path: ['STORAGE_DRIVER'],
        message: 'the filesystem driver is for tests only',
      });
    if (env.NODE_ENV === 'production' && env.OTP_DUMMY_ENABLED)
      ctx.addIssue({
        code: 'custom',
        path: ['OTP_DUMMY_ENABLED'],
        message: 'must be false in production (BD-49, BR-024)',
      });
    if (env.OTP_DUMMY_ENABLED && !env.OTP_DUMMY_CODE)
      ctx.addIssue({
        code: 'custom',
        path: ['OTP_DUMMY_CODE'],
        message: 'required when OTP_DUMMY_ENABLED=true',
      });
    if (env.NODE_ENV === 'production' && !env.APP_ORIGIN.startsWith('https://'))
      ctx.addIssue({
        code: 'custom',
        path: ['APP_ORIGIN'],
        message: 'must be an https origin in production (links sent by email)',
      });
    // a secret copied from an example, test or CI file is public in the repository, so production
    // refuses it; the message names the key and never the value
    if (env.NODE_ENV === 'production' && !passwordOf(env.DATABASE_URL))
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'needs a password in production',
      });
    if (env.NODE_ENV === 'production')
      for (const key of LOCAL_SECRET_KEYS) {
        const value = key === 'DATABASE_URL' ? passwordOf(env.DATABASE_URL) : env[key];
        if (value !== undefined && isLocalExample(value))
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'a local example value is refused in production',
          });
      }
    // in production a credentialed caller is a real https site, never this machine
    for (const origin of env.ALLOWED_ORIGINS)
      if (env.NODE_ENV === 'production' && !isPublicHttps(origin))
        ctx.addIssue({
          code: 'custom',
          path: ['ALLOWED_ORIGINS'],
          message: `"${origin}" must be https on a real host in production`,
        });
    if (env.NODE_ENV === 'production' && env.FILE_SCANNER === 'skip')
      ctx.addIssue({
        code: 'custom',
        path: ['FILE_SCANNER'],
        message: 'a real virus scanner is required in production',
      });
    if (env.NODE_ENV === 'production' && env.RATE_LIMITS_RELAXED)
      ctx.addIssue({
        code: 'custom',
        path: ['RATE_LIMITS_RELAXED'],
        message: 'must be false in production (D-072)',
      });
    if (env.NODE_ENV === 'production' && env.SESSION_DEVICE_LIMIT_RELAXED)
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_DEVICE_LIMIT_RELAXED'],
        message: 'must be false in production (D-102)',
      });
    if (env.NODE_ENV === 'production' && !env.AUTH_COOKIE_SECURE)
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_COOKIE_SECURE'],
        message: 'must be true in production',
      });
    if (env.STORAGE_DRIVER === 's3' && (!env.MINIO_ACCESS_KEY || !env.MINIO_SECRET_KEY))
      ctx.addIssue({
        code: 'custom',
        path: ['MINIO_ACCESS_KEY'],
        message: 'required when STORAGE_DRIVER=s3',
      });
    if (env.STORAGE_DRIVER === 'filesystem' && !env.STORAGE_FS_ROOT)
      ctx.addIssue({
        code: 'custom',
        path: ['STORAGE_FS_ROOT'],
        message: 'required when STORAGE_DRIVER=filesystem',
      });
  });

export type Env = z.infer<typeof envSchema>;

/** The secrets whose local example values production refuses; the optional ones when set. */
const LOCAL_SECRET_KEYS = [
  'JWT_SECRET',
  'JWT_PREVIOUS_SECRET',
  'AUTH_CSRF_SECRET',
  'OTP_SECRET',
  'CURSOR_SECRET',
  'LOCAL_KEY_SECRET',
  'LOCAL_KEY_PREVIOUS_SECRET',
  'HEALTH_TOKEN',
  'SMTP_PASSWORD',
  'MINIO_ACCESS_KEY',
  'MINIO_SECRET_KEY',
  'DATABASE_URL',
] as const;

/** An origin written exactly as the browser sends it: http(s), a host, a port at most. */
function isExactOrigin(entry: string): boolean {
  try {
    const url = new URL(entry);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.origin === entry;
  } catch {
    return false;
  }
}

/** https on a DNS name of a real site: no address literal, no name of this machine. */
function isPublicHttps(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  const ipv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  const ipv6 = host.startsWith('[');
  const local = host === 'localhost' || host === 'localhost.' || host.endsWith('.localhost');
  return url.protocol === 'https:' && !ipv4 && !ipv6 && !local;
}

/** The marks of the secrets the repository itself carries, which are therefore public. */
const PUBLIC_SECRET_PREFIXES = [
  'change-me', // .env.example
  'dev-only-', // the dev compose file
  'e2e-only-', // the E2E server
  'test-only-', // the API tests
  'openapi-generation-only-', // the OpenAPI generator
];
const PUBLIC_SECRET_PARTS = ['css_dev_only', 'css_ci_only']; // the dev and CI database and MinIO

function isLocalExample(value: string): boolean {
  return (
    PUBLIC_SECRET_PREFIXES.some((prefix) => value.startsWith(prefix)) ||
    PUBLIC_SECRET_PARTS.some((part) => value.includes(part))
  );
}

/** The password of a database URL, decoded; the raw text when it holds a broken escape. */
function passwordOf(url: string): string | undefined {
  let raw: string;
  try {
    raw = new URL(url).password;
  } catch {
    return undefined;
  }
  try {
    return decodeURIComponent(raw) || undefined;
  } catch {
    return raw || undefined;
  }
}

export function loadEnv(source: Record<string, string | undefined>): Env {
  // An empty value (`HEALTH_TOKEN=` in .env.example) means "not set", as in dotenv.
  const present = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ''),
  );
  // the allowlist's earlier name would otherwise be ignored and leave the allowlist empty
  if (present['CORS_ORIGINS'] !== undefined)
    throw new Error('Invalid configuration: CORS_ORIGINS: renamed, set ALLOWED_ORIGINS instead');
  const result = envSchema.safeParse(present);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${problems}`);
  }
  return result.data;
}
