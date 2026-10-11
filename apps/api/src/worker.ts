import { loadEnv } from './config/env';
import { closeContainer, createContainer } from './container';
import { JobConsumers } from './jobs/consumers';

/** The worker process (ADR-004, SYSTEM_ARCHITECTURE 2.1): job consumers, maintenance, schedules. */
async function main(): Promise<void> {
  const env = loadEnv(process.env);
  const container = createContainer(env);
  const { logger } = container;
  await new JobConsumers(container.jobs, logger).register();
  logger.info('worker started');

  let stopping = false;
  // SIGTERM stops intake and lets running jobs finish (JobRunner.onModuleDestroy, D-054).
  const shutdown = (signal: NodeJS.Signals): void => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, 'worker shutting down');
    closeContainer(container)
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        logger.error({ err: error }, 'error while closing resources');
        process.exit(1);
      });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exit(1);
});
