import { loadEnv } from './config/env';
import { closeContainer, createContainer } from './container';
import { JobConsumers } from './jobs/consumers';
import { createShutdown } from './shutdown';

/** Running jobs get this long to finish after SIGTERM (pg-boss drains for up to 30 s). */
const SHUTDOWN_GRACE_MS = 35_000;

/**
 * The worker process (docs/architecture/SYSTEM_ARCHITECTURE.md, "Workers: a separate process
 * (decision)"): job consumers, maintenance, schedules.
 */
async function main(): Promise<void> {
  const env = loadEnv(process.env);
  const container = createContainer(env);
  const { logger } = container;
  await new JobConsumers(container.jobs, logger, {
    registrationCleanup: container.registrationCleanup,
    localKeyCleanup: container.localKeyCleanup,
    uploadSweep: container.uploadSweep,
    storageStats: container.storageStats,
    mergeCandidates: container.beneficiaryMergeCandidates,
    fileProcessor: container.fileProcessor,
    delivery: container.delivery,
    exportRunner: container.exportRunner,
    exportSweep: container.exportSweep,
  }).register();
  logger.info('worker started');

  // SIGTERM stops intake and lets running jobs finish (JobRunner.stop)
  const shutdown = createShutdown({
    closeResources: () => closeContainer(container),
    graceMs: SHUTDOWN_GRACE_MS,
    exit: (code) => process.exit(code),
    log: logger,
  });
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exit(1);
});
