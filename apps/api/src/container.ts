import type { DestinationStream, Logger } from 'pino';
import pino from 'pino';
import { AuditWriter } from './audit/audit-writer';
import type { Env } from './config/env';
import { type Clock, systemClock } from './core/clock';
import { REDACT_PATHS } from './core/logging';
import { PrismaService } from './core/prisma.service';
import { HealthService } from './health/service';
import { IdempotencyService } from './idempotency/idempotency.service';
import { JobRunner } from './jobs/job-runner';
import {
  type EmailAdapter,
  InAppAdapter,
  type SmsAdapter,
  SmtpEmailAdapter,
  StubSmsAdapter,
} from './notifications/adapters';
import type { StorageAdapter } from './storage/storage';
import { createStorage } from './storage/storage.module';

/**
 * The services of one process, built once from the validated configuration (no DI container,
 * ADR-014): the api, the worker and the tests construct the same objects; tests pass overrides.
 */
export interface Container {
  env: Env;
  logger: Logger;
  clock: Clock;
  prisma: PrismaService;
  audit: AuditWriter;
  idempotency: IdempotencyService;
  storage: StorageAdapter;
  email: EmailAdapter;
  sms: SmsAdapter;
  inApp: InAppAdapter;
  jobs: JobRunner;
  health: HealthService;
}

export interface ContainerOptions {
  /** Test hook: where log lines go (default stdout). */
  logStream?: DestinationStream;
  /** Test hook: replace services (a fake Prisma for the readiness test, a fixed clock). */
  overrides?: Partial<Container>;
}

export function createLogger(env: Env, stream?: DestinationStream): Logger {
  return pino(
    { level: env.LOG_LEVEL, redact: { paths: REDACT_PATHS, censor: '[redacted]' } },
    stream,
  );
}

export function createContainer(env: Env, options: ContainerOptions = {}): Container {
  const o = options.overrides ?? {};
  const logger = o.logger ?? createLogger(env, options.logStream);
  const clock = o.clock ?? systemClock;
  const prisma = o.prisma ?? new PrismaService(env);
  const storage = o.storage ?? createStorage(env);
  const jobs = o.jobs ?? new JobRunner(env);
  const health =
    o.health ??
    new HealthService(env, {
      database: async () => {
        await prisma.$queryRaw`SELECT 1`;
        return true;
      },
      storage: () => storage.ping(),
      queue: () => jobs.ping(),
    });
  return {
    env,
    logger,
    clock,
    prisma,
    audit: o.audit ?? new AuditWriter(),
    idempotency: o.idempotency ?? new IdempotencyService(prisma),
    storage,
    email:
      o.email ??
      new SmtpEmailAdapter({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        user: env.SMTP_USER,
        password: env.SMTP_PASSWORD,
        from: env.SMTP_FROM,
      }),
    sms: o.sms ?? new StubSmsAdapter(env.SMS_MODE),
    inApp: o.inApp ?? new InAppAdapter(),
    jobs,
    health,
  };
}

/** Closes what the container opened (Prisma, pg-boss); used by server.ts and the tests. */
export async function closeContainer(c: Container): Promise<void> {
  await c.jobs.onModuleDestroy();
  await c.prisma.$disconnect();
}
