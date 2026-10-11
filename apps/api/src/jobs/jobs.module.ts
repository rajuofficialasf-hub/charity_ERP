import { Inject, Injectable, Logger, Module, type OnApplicationBootstrap } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { JobRunner } from './job-runner';

/** The sample job of T1.6: proves enqueue, consume and scheduling end to end. */
export const HEARTBEAT_QUEUE = 'maintenance' as const;
/** Every five minutes: the scheduled job pattern (ADR-004). */
export const HEARTBEAT_CRON = '*/5 * * * *';

export interface HeartbeatData {
  kind: 'heartbeat';
}

/** Registers the consumers and schedules; runs in the worker, or in the api with JOBS_INLINE. */
@Injectable()
export class JobConsumers {
  private readonly logger = new Logger('JobConsumers');

  constructor(@Inject(JobRunner) private readonly jobs: JobRunner) {}

  async register(): Promise<void> {
    await this.jobs.work<HeartbeatData>(HEARTBEAT_QUEUE, async (job) => {
      this.logger.log(`heartbeat ${job.id}`);
      return { kind: job.data.kind, handledAt: new Date().toISOString() };
    });
    await this.jobs.schedule(HEARTBEAT_QUEUE, HEARTBEAT_CRON, { kind: 'heartbeat' });
  }
}

@Injectable()
class InlineConsumers implements OnApplicationBootstrap {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(JobConsumers) private readonly consumers: JobConsumers,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.env.JOBS_INLINE && this.env.NODE_ENV !== 'test') await this.consumers.register();
  }
}

@Module({
  providers: [JobRunner, JobConsumers, InlineConsumers],
  exports: [JobRunner, JobConsumers],
})
export class JobsModule {}
