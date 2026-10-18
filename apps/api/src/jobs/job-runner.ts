import { fromPrisma, type Job, PgBoss } from 'pg-boss';
import type { Logger } from 'pino';
import type { Env } from '../config/env';
import type { Tx } from '../core/prisma.service';
import { JOBS_SCHEMA, type QueueName } from './queues';

export type JobHandler<T> = (job: Job<T>) => Promise<unknown>;

/**
 * The pg-boss wrapper (ADR-004). The api only enqueues; consumers run in the worker process, or
 * inside the api when JOBS_INLINE is set (development and tests). Jobs are enqueued inside the
 * business transaction, so a job exists only if the write committed. The app never runs DDL: the
 * schema and the queues come from the install step (D-069).
 */
export class JobRunner {
  private boss: PgBoss | undefined;
  private starting: Promise<PgBoss> | undefined;

  constructor(
    private readonly env: Env,
    private readonly logger: Logger,
  ) {}

  /** Starts pg-boss on first use; `consumer` adds maintenance and cron scheduling (worker side). */
  async start(consumer = false): Promise<PgBoss> {
    if (this.boss) return this.boss;
    this.starting ??= (async () => {
      const boss = new PgBoss({
        connectionString: this.env.DATABASE_URL,
        schema: JOBS_SCHEMA,
        migrate: false,
        createSchema: false,
        supervise: consumer,
        schedule: consumer,
      });
      boss.on('error', (error) => this.logger.error({ err: error }, 'pg-boss'));
      await boss.start();
      this.boss = boss;
      return boss;
    })();
    return this.starting;
  }

  /** Enqueues a job; with `tx` the job is part of that Prisma transaction. */
  async enqueue<T extends object>(
    queue: QueueName,
    data: T,
    options: { tx?: Tx; singletonKey?: string; startAfter?: Date; priority?: number } = {},
  ): Promise<string | null> {
    const boss = await this.start();
    return boss.send(queue, data, {
      ...(options.singletonKey ? { singletonKey: options.singletonKey } : {}),
      ...(options.priority ? { priority: options.priority } : {}),
      ...(options.startAfter ? { startAfter: options.startAfter } : {}),
      ...(options.tx ? { db: fromPrisma(options.tx as never) } : {}),
    });
  }

  /** Registers a consumer; handlers must be idempotent (at-least-once delivery, ADR-004). */
  async work<T>(queue: QueueName, handler: JobHandler<T>): Promise<void> {
    const boss = await this.start(true);
    await boss.work<T>(queue, async (jobs) => {
      const results: unknown[] = [];
      for (const job of jobs) results.push(await handler(job));
      return results.length === 1 ? results[0] : results;
    });
  }

  /**
   * Scheduled job pattern: a cron expression in Asia/Dhaka time for a queue (ADR-004); `key`
   * keeps several schedules apart on one queue.
   */
  async schedule(queue: QueueName, cron: string, data: object = {}, key?: string): Promise<void> {
    const boss = await this.start(true);
    await boss.schedule(queue, cron, data, { tz: 'Asia/Dhaka', ...(key ? { key } : {}) });
  }

  /** Readiness check: the queue schema is reachable (SYSTEM_ARCHITECTURE 10). */
  async ping(): Promise<boolean> {
    const boss = await this.start();
    return boss.isInstalled();
  }

  /** The underlying instance, for tests and the admin job screen (later task). */
  async instance(): Promise<PgBoss> {
    return this.start();
  }

  /** Stops intake and lets running jobs finish within 30 seconds (SIGTERM, D-054). */
  async stop(): Promise<void> {
    await this.boss?.stop({ graceful: true, timeout: 30_000, close: true });
    this.boss = undefined;
    this.starting = undefined;
  }
}
