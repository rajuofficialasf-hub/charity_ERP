import { createServer } from 'node:http';
import { createApp } from './app';
import { otpStartupMessage } from './auth/otp.service';
import { loadEnv } from './config/env';
import { closeContainer, createContainer } from './container';
import { JobConsumers } from './jobs/consumers';

/** In-flight requests get this long after SIGTERM before the process exits anyway (NE-ERR-04). */
const SHUTDOWN_GRACE_MS = 10_000;

const env = loadEnv(process.env);
const container = createContainer(env);
const { logger } = container;
const { app } = createApp(container);

const otpMode = otpStartupMessage(container.otpDelivery.dummy);
logger[otpMode.level](otpMode.text);

// Development runs the consumers inside the api (JOBS_INLINE, ADR-004); production refuses it.
if (env.JOBS_INLINE && env.NODE_ENV !== 'test')
  void new JobConsumers(container.jobs, logger).register().catch((error: unknown) => {
    logger.error({ err: error }, 'inline job consumers failed to start');
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
