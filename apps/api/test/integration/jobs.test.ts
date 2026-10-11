import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { PrismaService } from '../../src/core/prisma.service';
import { installJobs } from '../../src/jobs/install';
import { JobRunner } from '../../src/jobs/job-runner';
import { HEARTBEAT_CRON, HEARTBEAT_QUEUE, JobConsumers } from '../../src/jobs/jobs.module';
import { QUEUE_NAMES } from '../../src/jobs/queues';
import { testEnv } from '../support/env';
import { cloneTemplate, dropDatabase } from './support/db';

// pg-boss (ADR-004, D-069): the install step creates the schema and the queues; the runner never
// runs DDL; jobs enqueued in a transaction exist only if it commits; the sample job runs and the
// scheduled pattern is registered.
let drop: () => Promise<void>;
let prisma: PrismaService;
let jobs: JobRunner;

beforeAll(async () => {
  const clone = await cloneTemplate(inject('templateDb'));
  await clone.client.end();
  drop = () => dropDatabase(clone.name);
  const env = testEnv({ DATABASE_URL: clone.url });
  await installJobs(clone.url);
  await installJobs(clone.url); // idempotent
  prisma = new PrismaService(env);
  jobs = new JobRunner(env);
});

afterAll(async () => {
  await jobs.onModuleDestroy();
  await prisma.$disconnect();
  await drop();
});

async function waitFor<T>(probe: () => Promise<T | undefined>, timeoutMs = 20_000): Promise<T> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== undefined) return value;
    if (Date.now() > until) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 250));
  }
}

describe('jobs (ADR-004)', () => {
  it('installs every registered queue', async () => {
    const boss = await jobs.instance();
    const names = (await boss.getQueues()).map((q) => q.name);
    for (const name of QUEUE_NAMES) expect(names).toContain(name);
    expect(await jobs.ping()).toBe(true);
  });

  it('keeps a job only when the business transaction commits', async () => {
    let rolledBackId: string | null = null;
    await expect(
      prisma.$transaction(async (tx) => {
        rolledBackId = await jobs.enqueue('exports', { probe: 'rollback' }, { tx });
        throw new Error('business guard failed');
      }),
    ).rejects.toThrow('business guard failed');
    const boss = await jobs.instance();
    expect(rolledBackId).not.toBeNull();
    expect(await boss.findJobs('exports', { id: rolledBackId! })).toHaveLength(0);

    const committedId = await prisma.$transaction((tx) =>
      jobs.enqueue('exports', { probe: 'commit' }, { tx }),
    );
    expect(await boss.findJobs('exports', { id: committedId! })).toHaveLength(1);
  });

  it('runs the sample heartbeat job and registers its schedule', async () => {
    await new JobConsumers(jobs).register();
    const id = await jobs.enqueue(HEARTBEAT_QUEUE, { kind: 'heartbeat' });
    const boss = await jobs.instance();
    const done = await waitFor(async () => {
      const [job] = await boss.findJobs<{ kind: string }>(HEARTBEAT_QUEUE, { id: id! });
      return job?.state === 'completed' ? job : undefined;
    });
    expect(done.output).toMatchObject({ kind: 'heartbeat' });
    const schedules = await boss.getSchedules(HEARTBEAT_QUEUE);
    expect(schedules.map((s) => s.cron)).toContain(HEARTBEAT_CRON);
  });
});
