import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { HEARTBEAT_CRON, HEARTBEAT_QUEUE, JobConsumers, startInlineConsumers } from './consumers';
import type { NotificationDelivery } from '../notifications/delivery';
import type { JobRunner } from './job-runner';
import type { FileProcessor } from './file-process';
import { REGISTRATION_CLEANUP_CRON, type RegistrationCleanup } from './registration-cleanup';
import { STORAGE_STATS_CRON, STORAGE_STATS_QUEUE, type StorageStats } from './storage-stats';
import type { UploadSweep } from './upload-sweep';

function fakeRunner(failWith?: Error) {
  const work = vi.fn(async () => {
    if (failWith) throw failWith;
  });
  const schedule = vi.fn(async () => undefined);
  return { runner: { work, schedule } as unknown as JobRunner, work, schedule };
}

const dev = { JOBS_INLINE: true, NODE_ENV: 'development' as const };
const quiet = pino({ level: 'silent' });

describe('startInlineConsumers (ADR-004)', () => {
  it('registers the consumers and the heartbeat schedule when JOBS_INLINE is set', async () => {
    const { runner, work, schedule } = fakeRunner();
    expect(await startInlineConsumers(dev, runner, quiet)).toBe(true);
    expect(work).toHaveBeenCalledWith(HEARTBEAT_QUEUE, expect.any(Function));
    expect(schedule).toHaveBeenCalledWith(HEARTBEAT_QUEUE, HEARTBEAT_CRON, { kind: 'heartbeat' });
  });

  it('does nothing without JOBS_INLINE or under NODE_ENV=test', async () => {
    const { runner, work } = fakeRunner();
    expect(await startInlineConsumers({ ...dev, JOBS_INLINE: false }, runner, quiet)).toBe(false);
    expect(await startInlineConsumers({ ...dev, NODE_ENV: 'test' }, runner, quiet)).toBe(false);
    expect(work).not.toHaveBeenCalled();
  });

  it('logs and returns false when the registration fails, instead of stopping the api', async () => {
    const lines: string[] = [];
    const logger = pino({ level: 'error' }, { write: (line: string) => void lines.push(line) });
    const { runner } = fakeRunner(new Error('pg-boss is not installed'));
    expect(await startInlineConsumers(dev, runner, logger)).toBe(false);
    expect(lines.join('')).toContain('inline job consumers failed to start');
  });
});

describe('the delivery consumer', () => {
  it('hands each notify job to the delivery', async () => {
    const { runner, work } = fakeRunner();
    const deliver = vi.fn(async () => 'sent' as const);
    await new JobConsumers(runner, quiet, {
      delivery: { deliver } as unknown as NotificationDelivery,
    }).register();
    const call = work.mock.calls.find((c) => (c as unknown[])[0] === 'notify') as unknown as [
      string,
      (job: { data: { messageId: string } }) => Promise<unknown>,
    ];
    expect(call).toBeDefined();
    await call[1]({ data: { messageId: 'm-1' } });
    expect(deliver).toHaveBeenCalledWith({ messageId: 'm-1' });
  });

  it('is not registered without a delivery', async () => {
    const { runner, work } = fakeRunner();
    await new JobConsumers(runner, quiet).register();
    expect(work.mock.calls.some((c) => (c as unknown[])[0] === 'notify')).toBe(false);
  });
});

describe('the registration cleanup on the maintenance queue (DECISION_LOG D-082)', () => {
  it('is scheduled under its own key and dispatched by kind', async () => {
    const { runner, work, schedule } = fakeRunner();
    const run = vi.fn(async () => ({ files: 2 }));
    await new JobConsumers(runner, quiet, {
      registrationCleanup: { run } as unknown as RegistrationCleanup,
    }).register();
    expect(schedule).toHaveBeenCalledWith(
      HEARTBEAT_QUEUE,
      REGISTRATION_CLEANUP_CRON,
      { kind: 'registration-cleanup' },
      'registration-cleanup',
    );
    const handler = (
      work.mock.calls as unknown as [string, (job: unknown) => Promise<unknown>][]
    )[0]![1];
    expect(await handler({ id: 'j1', data: { kind: 'registration-cleanup' } })).toEqual({
      files: 2,
    });
    expect(await handler({ id: 'j2', data: { kind: 'heartbeat' } })).toMatchObject({
      kind: 'heartbeat',
    });
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('the processing of uploaded files', () => {
  it('works the photos queue, schedules first, and survives a failing catch-up of uncleared files', async () => {
    const { runner, work, schedule } = fakeRunner();
    const order: string[] = [];
    schedule.mockImplementation(async () => {
      order.push('schedule');
    });
    const queuePending = vi.fn(async () => {
      order.push('catch-up');
      throw new Error('database away');
    });
    await expect(
      new JobConsumers(runner, quiet, {
        fileProcessor: { queuePending, process: vi.fn() } as unknown as FileProcessor,
        uploadSweep: { run: vi.fn() } as unknown as UploadSweep,
      }).register(),
    ).resolves.toBeUndefined();
    expect(work.mock.calls.some((c) => (c as unknown[])[0] === 'photos')).toBe(true);
    expect(queuePending).toHaveBeenCalledTimes(1);
    expect(order.at(-1)).toBe('catch-up');
    expect(order.filter((o) => o === 'schedule')).toHaveLength(2);
  });
});

describe('the nightly storage figures', () => {
  it('works and schedules the storage-stats queue, and neither without the service', async () => {
    const { runner, work, schedule } = fakeRunner();
    const run = vi.fn(async () => ({ rows: 3 }));
    await new JobConsumers(runner, quiet, {
      storageStats: { run } as unknown as StorageStats,
    }).register();
    const call = (work.mock.calls as unknown as [string, () => Promise<unknown>][]).find(
      (c) => c[0] === STORAGE_STATS_QUEUE,
    );
    expect(call).toBeDefined();
    expect(await call![1]()).toEqual({ rows: 3 });
    expect(schedule).toHaveBeenCalledWith(
      STORAGE_STATS_QUEUE,
      STORAGE_STATS_CRON,
      {},
      'storage-stats',
    );
    const bare = fakeRunner();
    await new JobConsumers(bare.runner, quiet).register();
    expect(bare.work.mock.calls.some((c) => (c as unknown[])[0] === STORAGE_STATS_QUEUE)).toBe(
      false,
    );
  });
});
