import type { Logger } from 'pino';
import type { Env } from '../config/env';
import type { NotificationDelivery } from '../notifications/delivery';
import type { DeliveryJob } from '../notifications/service';
import type { JobRunner } from './job-runner';
import { REGISTRATION_CLEANUP_CRON, type RegistrationCleanup } from './registration-cleanup';

/** The sample heartbeat job: proves enqueue, consume and scheduling end to end (ADR-004). */
export const HEARTBEAT_QUEUE = 'maintenance' as const;
/** Every five minutes: the scheduled job pattern (ADR-004). */
export const HEARTBEAT_CRON = '*/5 * * * *';

export interface HeartbeatData {
  kind: 'heartbeat';
}

/** The daily purge of unsubmitted registration drafts (DECISION_LOG D-082). */
export interface RegistrationCleanupData {
  kind: 'registration-cleanup';
}

type MaintenanceData = HeartbeatData | RegistrationCleanupData;

/** The services the consumers call; a missing one leaves its queue unconsumed. */
export interface ConsumerServices {
  registrationCleanup?: RegistrationCleanup;
  delivery?: NotificationDelivery;
}

/** Registers the consumers and schedules; runs in the worker, or in the api with JOBS_INLINE. */
export class JobConsumers {
  constructor(
    private readonly jobs: JobRunner,
    private readonly logger: Logger,
    private readonly services: ConsumerServices = {},
  ) {}

  async register(): Promise<void> {
    await this.jobs.work<MaintenanceData>(HEARTBEAT_QUEUE, async (job) => {
      if (job.data.kind === 'registration-cleanup') {
        if (!this.services.registrationCleanup)
          throw new Error('registration cleanup not configured');
        return this.services.registrationCleanup.run();
      }
      this.logger.info({ jobId: job.id }, 'heartbeat');
      return { kind: job.data.kind, handledAt: new Date().toISOString() };
    });
    await this.jobs.schedule(HEARTBEAT_QUEUE, HEARTBEAT_CRON, { kind: 'heartbeat' });
    const { delivery } = this.services;
    // emails and SMS of the outbox, one at a time (the delivery throttles itself)
    if (delivery) await this.jobs.work<DeliveryJob>('notify', (job) => delivery.deliver(job.data));
    if (this.services.registrationCleanup)
      await this.jobs.schedule(
        HEARTBEAT_QUEUE,
        REGISTRATION_CLEANUP_CRON,
        { kind: 'registration-cleanup' },
        'registration-cleanup',
      );
  }
}

/**
 * Development runs the consumers inside the api process (JOBS_INLINE, ADR-004; production refuses
 * it, BR-024). Tests never start them: each test file owns its database. A failure to start is
 * logged and does not stop the api, which still enqueues.
 */
export async function startInlineConsumers(
  env: Pick<Env, 'JOBS_INLINE' | 'NODE_ENV'>,
  jobs: JobRunner,
  logger: Logger,
  services: ConsumerServices = {},
): Promise<boolean> {
  if (!env.JOBS_INLINE || env.NODE_ENV === 'test') return false;
  try {
    await new JobConsumers(jobs, logger, services).register();
    return true;
  } catch (error) {
    logger.error({ err: error }, 'inline job consumers failed to start');
    return false;
  }
}
