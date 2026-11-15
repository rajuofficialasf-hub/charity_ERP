import { PgBoss, type Queue } from 'pg-boss';
import { JOBS_SCHEMA, QUEUE_NAMES, QUEUES } from './queues.js';

/**
 * Installs or upgrades the pg-boss schema and creates every registered queue. Runs as the
 * migrating role in `pnpm db:migrate`; the api and worker never run DDL. Idempotent.
 *
 * pg-boss fixes a queue's policy when the queue is created and refuses to change it later, so an
 * existing queue is updated without it. A queue whose stored policy differs from the registered
 * one is created again while it holds no waiting or running job; one that still holds work stops
 * the install with its name, to be run again once those jobs are done.
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
      const registered: Omit<Queue, 'name'> = QUEUES[name];
      const { policy = 'standard', ...options } = registered;
      const existing = await boss.getQueue(name);
      if (!existing) {
        await boss.createQueue(name, { ...options, policy });
        continue;
      }
      if ((existing.policy ?? 'standard') !== policy) {
        const [stats] = await boss.getQueueStats(name, { force: true });
        if ((stats?.queuedCount ?? 0) + (stats?.activeCount ?? 0) > 0)
          throw new Error(
            `queue ${name} has the policy ${existing.policy}, registered ${policy}, and still holds jobs; run the install again once they are done`,
          );
        await boss.deleteQueue(name);
        await boss.createQueue(name, { ...options, policy });
        continue;
      }
      await boss.updateQueue(name, options);
    }
  } finally {
    await boss.stop({ graceful: false, close: true });
  }
}
