import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env';
import { CHECK_TIMEOUT_MS, HealthService } from './service';

const env = { HEALTH_TOKEN: undefined } as unknown as Env;
const up = async () => true;

describe('HealthService.readiness', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reports a probe that never answers as down after the time limit', async () => {
    const service = new HealthService(env, {
      database: () => new Promise<boolean>(() => {}),
      storage: up,
      queue: up,
    });
    const pending = service.readiness();
    await vi.advanceTimersByTimeAsync(CHECK_TIMEOUT_MS);
    expect(await pending).toEqual({
      ready: false,
      checks: { database: 'down', storage: 'up', queue: 'up' },
    });
  });

  it('reports a probe that throws as down', async () => {
    const service = new HealthService(env, {
      database: up,
      storage: async () => {
        throw new Error('bucket missing');
      },
      queue: up,
    });
    expect(await service.readiness()).toEqual({
      ready: false,
      checks: { database: 'up', storage: 'down', queue: 'up' },
    });
  });

  it('leaves no timer behind once every probe has settled', async () => {
    const service = new HealthService(env, { database: up, storage: up, queue: up });
    await service.readiness();
    expect(vi.getTimerCount()).toBe(0);
  });
});
