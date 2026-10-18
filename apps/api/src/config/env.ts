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
    /** The release shown on the system health page. */
    APP_VERSION: z.string().max(64).default('0.0.0-dev'),
    /** Signs access tokens (D-070); JWT_PREVIOUS_SECRET is still accepted during a rotation. */
    JWT_SECRET: z.string().min(32),
    JWT_PREVIOUS_SECRET: z.string().min(32).optional(),
    /** Signs the double-submit CSRF token of the refresh endpoint (D-070). */
    AUTH_CSRF_SECRET: z.string().min(32),
    /** HMAC key of OTP code and address hashes (AUTH.md 2, D-070). */
    OTP_SECRET: z.string().min(32),
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
     * Browser origins allowed to call the API with credentials (NE-SEC-02), comma separated.
     * Empty by default: the PWA is served on the same origin (Caddy, the Vite proxy).
     */
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((v) =>
        v
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean),
      ),
    /**
     * The PWA's public origin, written into links sent by email (the set-password link,
     * DECISION_LOG D-097); https in production.
     */
    APP_ORIGIN: z.url().default('http://127.0.0.1:3000'),
    /** Multiplies every rate limit by 100 for the E2E run (one shared address); never production. */
    RATE_LIMITS_RELAXED: flag,
    /**
     * Multiplies the device limit of a user by 100 for the E2E run, whose specs sign in with the
     * same few demo accounts in parallel (D-102); never production.
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

export function loadEnv(source: Record<string, string | undefined>): Env {
  // An empty value (`HEALTH_TOKEN=` in .env.example) means "not set", as in dotenv.
  const present = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ''),
  );
  const result = envSchema.safeParse(present);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${problems}`);
  }
  return result.data;
}
