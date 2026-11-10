import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env';
import { JobRunner } from './job-runner';

const starts = vi.hoisted(() => vi.fn<() => Promise<void>>());

vi.mock('pg-boss', () => ({
  fromPrisma: vi.fn(),
  PgBoss: class {
    on() {}
    start() {
      return starts();
    }
    isInstalled() {
      return Promise.resolve(true);
    }
  },
}));

const env = { DATABASE_URL: 'postgresql://db/css' } as Env;
const logger = { error: vi.fn() } as never;

describe('JobRunner start', () => {
  beforeEach(() => starts.mockReset());

  it('tries again after a start that failed, so a passing database outage is not permanent', async () => {
    starts.mockRejectedValueOnce(new Error('database unreachable')).mockResolvedValue(undefined);
    const jobs = new JobRunner(env, logger);
    await expect(jobs.ping()).rejects.toThrow('database unreachable');
    await expect(jobs.ping()).resolves.toBe(true);
    expect(starts).toHaveBeenCalledTimes(2);
  });

  it('starts once for callers that arrive together', async () => {
    starts.mockResolvedValue(undefined);
    const jobs = new JobRunner(env, logger);
    await Promise.all([jobs.ping(), jobs.ping(), jobs.ping()]);
    expect(starts).toHaveBeenCalledTimes(1);
  });
});
