import { loadEnv } from '../src/config/env.js';
import { closeContainer, createContainer } from '../src/container.js';
import { JobConsumers } from '../src/jobs/consumers.js';

// The export jobs of the Playwright run: the E2E API starts no job consumers (its other journeys
// rely on files and messages staying as the API left them), so this process consumes the exports
// queue alone, with the same configuration as the E2E API. Development and test only.
async function main(): Promise<void> {
  const env = loadEnv(process.env);
  if (env.NODE_ENV === 'production')
    throw new Error('the E2E export worker never runs in production');
  const container = createContainer(env);
  await new JobConsumers(container.jobs, container.logger, {
    exportRunner: container.exportRunner,
  }).register();
  container.logger.info('e2e export worker started');
  const stop = (): void => {
    void closeContainer(container).then(() => process.exit(0));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exit(1);
});
