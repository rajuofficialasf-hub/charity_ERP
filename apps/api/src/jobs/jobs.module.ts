import { Inject, Injectable, Module, type OnApplicationBootstrap } from '@nestjs/common';
import pino from 'pino';
import { ENV, type Env } from '../config/env';
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

/** Nest wiring of the job consumers (until U6 of the stack-adoption plan removes Nest). */
@Module({
  providers: [
    JobRunner,
    {
      provide: JobConsumers,
      inject: [JobRunner, ENV],
      useFactory: (jobs: JobRunner, env: Env) =>
        new JobConsumers(jobs, pino({ level: env.LOG_LEVEL })),
    },
    InlineConsumers,
  ],
  exports: [JobRunner, JobConsumers],
})
export class JobsModule {}
