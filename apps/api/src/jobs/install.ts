import { PgBoss } from 'pg-boss';
import { JOBS_SCHEMA, QUEUE_NAMES, QUEUES } from './queues';

/**
 * Installs or upgrades the pg-boss schema and creates every registered queue. Runs as the
 * migrating role in `pnpm db:migrate`; the api and worker never run DDL. Idempotent.
 */
export async function installJobs(connectionString: string): Promise<void> {
  const boss = new PgBoss({
    connectionString,
    schema: JOBS_SCHEMA,
    migrate: true,
    createSchema: true,
    supervise: false,
    schedule: false,
  });
  boss.on('error', () => {});
  await boss.start();
  try {
    for (const name of QUEUE_NAMES) {
      // eslint-disable-next-line security/detect-object-injection -- registered queue names
      const policy = QUEUES[name];
      if (await boss.getQueue(name)) await boss.updateQueue(name, policy);
      else await boss.createQueue(name, policy);
    }
  } finally {
    await boss.stop({ graceful: false, close: true });
  }
}
