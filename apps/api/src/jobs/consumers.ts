import type { Logger } from 'pino';
import type { JobRunner } from './job-runner';

/** The sample job of T1.6: proves enqueue, consume and scheduling end to end. */
export const HEARTBEAT_QUEUE = 'maintenance' as const;
/** Every five minutes: the scheduled job pattern (ADR-004). */
export const HEARTBEAT_CRON = '*/5 * * * *';

export interface HeartbeatData {
  kind: 'heartbeat';
}

/** Registers the consumers and schedules; runs in the worker, or in the api with JOBS_INLINE. */
export class JobConsumers {
  constructor(
    private readonly jobs: JobRunner,
    private readonly logger: Logger,
  ) {}

  async register(): Promise<void> {
    await this.jobs.work<HeartbeatData>(HEARTBEAT_QUEUE, async (job) => {
      this.logger.info({ jobId: job.id }, 'heartbeat');
      return { kind: job.data.kind, handledAt: new Date().toISOString() };
    });
    await this.jobs.schedule(HEARTBEAT_QUEUE, HEARTBEAT_CRON, { kind: 'heartbeat' });
  }
}
