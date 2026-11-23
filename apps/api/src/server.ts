import { createServer } from 'node:http';
import { createApp } from './app.js';
import { otpStartupMessage } from './auth/otp.service.js';
import { loadEnv } from './config/env.js';
import { closeContainer, createContainer } from './container.js';
import { startInlineConsumers } from './jobs/consumers.js';
import { createShutdown } from './shutdown.js';

/**
 * In-flight requests and, in development, the inline job consumers (pg-boss drains for up to 30 s,
 * JobRunner.stop) get this long after SIGTERM before the process exits anyway. The
 * container's stop_grace_period (40 s) is longer than this plus the longest SHUTDOWN_DELAY_MS (5 s).
 */
const SHUTDOWN_GRACE_MS = 35_000;

const env = loadEnv(process.env);
const container = createContainer(env);
const { logger } = container;
const { app } = createApp(container);

const otpMode = otpStartupMessage(container.otpDelivery.dummy);
logger[otpMode.level](otpMode.text);

void startInlineConsumers(env, container.jobs, logger, {
  registrationCleanup: container.registrationCleanup,
  localKeyCleanup: container.localKeyCleanup,
  uploadSweep: container.uploadSweep,
  storageStats: container.storageStats,
  fileDimensions: container.fileDimensions,
  mergeCandidates: container.beneficiaryMergeCandidates,
  nameKeys: container.nameKeys,
  helpCounters: container.helpCounters,
  fileProcessor: container.fileProcessor,
  delivery: container.delivery,
  exportRunner: container.exportRunner,
  exportSweep: container.exportSweep,
});

const server = createServer(app);
server.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'api listening');
});

const shutdown = createShutdown({
  markUnready: () => container.health.markShuttingDown(),
  delayMs: env.SHUTDOWN_DELAY_MS,
  closeServer: () =>
    new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeIdleConnections();
    }),
  closeResources: () => closeContainer(container),
  graceMs: SHUTDOWN_GRACE_MS,
  exit: (code) => process.exit(code),
  log: logger,
});

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
