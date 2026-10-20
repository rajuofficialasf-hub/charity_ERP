import { createServer } from 'node:http';
import { createApp } from './app';
import { otpStartupMessage } from './auth/otp.service';
import { loadEnv } from './config/env';
import { closeContainer, createContainer } from './container';
import { startInlineConsumers } from './jobs/consumers';

/**
 * In-flight requests and, in development, the inline job consumers (pg-boss drains for up to 30 s,
 * JobRunner.stop) get this long after SIGTERM before the process exits anyway (NE-ERR-04). The
 * container's stop_grace_period is longer than this.
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
  uploadSweep: container.uploadSweep,
  storageStats: container.storageStats,
  fileProcessor: container.fileProcessor,
  delivery: container.delivery,
});

const server = createServer(app);
server.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'api listening');
});

let stopping = false;
function shutdown(signal: NodeJS.Signals): void {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'shutting down');
  setTimeout(() => {
    logger.error('shutdown took too long, exiting');
    process.exit(1);
  }, SHUTDOWN_GRACE_MS).unref();
  server.close((error) => {
    closeContainer(container)
      .then(() => process.exit(error ? 1 : 0))
      .catch((closeError: unknown) => {
        logger.error({ err: closeError }, 'error while closing resources');
        process.exit(1);
      });
  });
  server.closeIdleConnections();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
