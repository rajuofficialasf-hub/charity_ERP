import { Inject, Injectable, Module, type OnApplicationBootstrap } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { createLogger } from '../container';
import { JobConsumers } from './consumers';
import { JobRunner } from './job-runner';

export { HEARTBEAT_CRON, HEARTBEAT_QUEUE, type HeartbeatData, JobConsumers } from './consumers';

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

/** Nest wiring of the job consumers; removed with Nest in docs/plans/2026-10-11-1742-chore-stack-adoption-admin-minimal-plan.md (U6). */
@Module({
  providers: [
    JobRunner,
    {
      provide: JobConsumers,
      inject: [JobRunner, ENV],
      useFactory: (jobs: JobRunner, env: Env) => new JobConsumers(jobs, createLogger(env)),
    },
    InlineConsumers,
  ],
  exports: [JobRunner, JobConsumers],
})
export class JobsModule {}
