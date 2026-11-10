import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHECK_TIMEOUT_MS, HealthService, RESULT_REUSE_MS, type ReadinessChecks } from './service';

const up = async () => true;
const log = { warn: vi.fn(), error: vi.fn() };

function service(checks: Partial<ReadinessChecks> = {}) {
  return new HealthService({ database: up, storage: up, queue: up, ...checks }, log);
}

describe('HealthService.readiness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    log.warn.mockReset();
    log.error.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('passes when every check answers', async () => {
    expect(await service().readiness()).toBe('pass');
  });

  it('warns when only the file store is down, and fails when the database or queue is', async () => {
    expect(await service({ storage: async () => false }).readiness()).toBe('warn');
    expect(await service({ database: async () => false }).readiness()).toBe('fail');
    expect(await service({ queue: async () => false }).readiness()).toBe('fail');
  });

  it('counts a check that never answers as down after the time limit', async () => {
    const pending = service({ database: () => new Promise<boolean>(() => {}) }).readiness();
    await vi.advanceTimersByTimeAsync(CHECK_TIMEOUT_MS);
    expect(await pending).toBe('fail');
  });

  it('runs the checks side by side, so a slow one does not add to another', async () => {
    const slow = () =>
      new Promise<boolean>((r) => setTimeout(() => r(true), CHECK_TIMEOUT_MS - 100));
    const pending = service({ database: slow, storage: slow, queue: slow }).readiness();
    await vi.advanceTimersByTimeAsync(CHECK_TIMEOUT_MS - 100);
    expect(await pending).toBe('pass');
  });

  it('logs a failed check by name and error kind, never the error text', async () => {
    const failing = service({
      storage: async () => {
        const error = new Error('could not reach s3://key:secret@minio:9000');
        (error as Error & { code: string }).code = 'ECONNREFUSED';
        throw error;
      },
    });
    expect(await failing.readiness()).toBe('warn');
    expect(log.warn).toHaveBeenCalledWith(
      { check: 'storage', reason: 'Error', code: 'ECONNREFUSED' },
      expect.any(String),
    );
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain('secret');
  });

  it('logs a critical check that is down as an error', async () => {
    await service({ database: async () => false }).readiness();
    expect(log.error).toHaveBeenCalledWith(
      { check: 'database', reason: 'unavailable' },
      expect.any(String),
    );
  });

  it('shares one run between callers that arrive together', async () => {
    const database = vi.fn(up);
    const s = service({ database });
    await Promise.all([s.readiness(), s.readiness(), s.readiness()]);
    expect(database).toHaveBeenCalledTimes(1);
  });

  it('reuses a finished result for a short while, then checks again', async () => {
    const database = vi.fn(up);
    const s = service({ database });
    await s.readiness();
    await s.readiness();
    expect(database).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(RESULT_REUSE_MS + 1);
    await s.readiness();
    expect(database).toHaveBeenCalledTimes(2);
  });

  it('fails at once when the API is shutting down, without running the checks', async () => {
    const database = vi.fn(up);
    const s = service({ database });
    s.markShuttingDown();
    expect(await s.readiness()).toBe('fail');
    expect(database).not.toHaveBeenCalled();
  });

  it('gives the system health page each check, also while the API is shutting down', async () => {
    const s = service({ storage: async () => false });
    s.markShuttingDown();
    expect(await s.detail()).toEqual({
      ready: false,
      checks: { database: 'up', queue: 'up', storage: 'down' },
    });
  });

  it('leaves no timer behind once every check has settled', async () => {
    await service().readiness();
    expect(vi.getTimerCount()).toBe(0);
  });
});
