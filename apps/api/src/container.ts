import type { DestinationStream, Logger } from 'pino';
import pino from 'pino';
import { assertConditionsCovered } from './access/conditions';
import { type AccessRegistry, loadAccessRegistry } from './access/registry';
import { AccessService } from './access/service';
import { AuditWriter } from './audit/audit-writer';
import { OtpDeliveryService, OtpService } from './auth/otp.service';
import { PasswordHasher } from './auth/password-hasher';
import { PermissionVersionService } from './auth/permission-version.service';
import { SessionService } from './auth/session.service';
import { TokenService } from './auth/token.service';
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
import { AuthService } from './services/auth';
import { RegistrationCleanup } from './jobs/registration-cleanup';
import {
  LoggingRegistrationEvents,
  type RegistrationEvents,
} from './notifications/registration-events';
import { LocationsService } from './services/locations';
import { FilesService } from './services/files';
import { RegistrationService } from './services/registration';
import { RegistrationPhotosService } from './services/registration-photos';
import { SessionsService } from './services/sessions';
import { AccessPanelService } from './services/access';
import { UsersService } from './services/users';
import { createStorage, type StorageDriver } from './storage';

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
  storage: StorageDriver;
  email: EmailAdapter;
  sms: SmsAdapter;
  inApp: InAppAdapter;
  jobs: JobRunner;
  health: HealthService;
  accessRegistry: AccessRegistry;
  hasher: PasswordHasher;
  tokens: TokenService;
  sessions: SessionService;
  access: AccessService;
  permissionVersions: PermissionVersionService;
  otpDelivery: OtpDeliveryService;
  otp: OtpService;
  auth: AuthService;
  deviceSessions: SessionsService;
  users: UsersService;
  accessPanel: AccessPanelService;
  locations: LocationsService;
  registrationEvents: RegistrationEvents;
  registration: RegistrationService;
  registrationCleanup: RegistrationCleanup;
  registrationPhotos: RegistrationPhotosService;
  files: FilesService;
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
  const jobs = o.jobs ?? new JobRunner(env, logger);
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
  const audit = o.audit ?? new AuditWriter();
  const email =
    o.email ??
    new SmtpEmailAdapter({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
      from: env.SMTP_FROM,
    });
  const sms = o.sms ?? new StubSmsAdapter(env.SMS_MODE, logger);
  // Authentication (AUTH.md): built in dependency order, so each service gets its instances.
  const hasher = o.hasher ?? new PasswordHasher();
  const tokens = o.tokens ?? new TokenService(env, clock);
  const sessions = o.sessions ?? new SessionService(prisma, tokens, audit, clock);
  const permissionVersions = o.permissionVersions ?? new PermissionVersionService(audit, sessions);
  const otpDelivery = o.otpDelivery ?? new OtpDeliveryService(env, sms, email, logger);
  const otp = o.otp ?? new OtpService(env, prisma, clock, otpDelivery);
  // permissions.yaml must name only conditions the access module can check (RBAC.md 2).
  const accessRegistry = o.accessRegistry ?? loadAccessRegistry(env.PERMISSIONS_FILE);
  assertConditionsCovered(accessRegistry);
  const access = o.access ?? new AccessService(accessRegistry, prisma, clock, logger);
  const registrationEvents = o.registrationEvents ?? new LoggingRegistrationEvents(logger);
  const registration =
    o.registration ?? new RegistrationService(env, prisma, clock, otp, audit, registrationEvents);
  return {
    env,
    logger,
    clock,
    prisma,
    audit,
    idempotency: o.idempotency ?? new IdempotencyService(prisma),
    storage,
    email,
    sms,
    inApp: o.inApp ?? new InAppAdapter(),
    jobs,
    health,
    accessRegistry,
    hasher,
    tokens,
    sessions,
    access,
    permissionVersions,
    otpDelivery,
    otp,
    auth:
      o.auth ?? new AuthService(env, prisma, clock, hasher, tokens, sessions, otp, audit, logger),
    deviceSessions: o.deviceSessions ?? new SessionsService(sessions, prisma, audit, access),
    users:
      o.users ?? new UsersService(env, prisma, audit, sessions, permissionVersions, clock, access),
    accessPanel:
      o.accessPanel ?? new AccessPanelService(prisma, access, audit, permissionVersions, clock),
    locations: o.locations ?? new LocationsService(prisma),
    registrationEvents,
    registration,
    registrationPhotos:
      o.registrationPhotos ??
      new RegistrationPhotosService(prisma, storage, audit, registration, logger),
    files: o.files ?? new FilesService(prisma, storage, access),
    registrationCleanup: o.registrationCleanup ?? new RegistrationCleanup(prisma, storage, logger),
  };
}

/** Closes what the container opened (Prisma, pg-boss); used by server.ts and the tests. */
export async function closeContainer(c: Container): Promise<void> {
  await c.jobs.stop();
  await c.prisma.$disconnect();
}
