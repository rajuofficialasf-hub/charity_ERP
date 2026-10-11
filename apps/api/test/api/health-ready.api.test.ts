import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Container } from '../../src/container';
import { buildTestApp, type TestApp } from '../support/app';

// Readiness (SYSTEM_ARCHITECTURE 10, D-057): database, storage and queue; details only with the
// HEALTH_TOKEN bearer token. The dependencies are replaced by switchable stand-ins.
const TOKEN = 'health-token-for-tests-0123456789';
const state = { database: true, storage: true, queue: true };

describe('GET /health/ready', () => {
  let t: TestApp;

  beforeAll(() => {
    t = buildTestApp({
      envOverrides: { HEALTH_TOKEN: TOKEN },
      overrides: {
        prisma: {
          $queryRaw: async () => {
            if (!state.database) throw new Error('connection refused');
            return [{ '?column?': 1 }];
          },
          $disconnect: async () => {},
        } as unknown as Container['prisma'],
        storage: { ping: async () => state.storage } as unknown as Container['storage'],
        jobs: {
          ping: async () => state.queue,
          onModuleDestroy: async () => {},
        } as unknown as Container['jobs'],
      },
    });
  });

  beforeEach(() => Object.assign(state, { database: true, storage: true, queue: true }));

  afterAll(async () => {
    await t.close();
  });

  it('is ready when every dependency answers, without details for anonymous callers', async () => {
    const res = await request(t.app).get('/health/ready').expect(200);
    expect(res.body).toEqual({ status: 'ready' });
  });

  it('shows the per-check detail only with the token', async () => {
    const ok = await request(t.app)
      .get('/health/ready')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(200);
    expect(ok.body).toEqual({
      status: 'ready',
      checks: { database: 'up', storage: 'up', queue: 'up' },
    });
    const wrong = await request(t.app)
      .get('/health/ready')
      .set('Authorization', 'Bearer not-the-token')
      .expect(200);
    expect(wrong.body).toEqual({ status: 'ready' });
  });

  it.each(['database', 'storage', 'queue'] as const)(
    'answers 503 when the %s is down',
    async (name) => {
      state[name] = false;
      const res = await request(t.app)
        .get('/health/ready')
        .set('Authorization', `Bearer ${TOKEN}`)
        .expect(503);
      expect(res.body.status).toBe('not_ready');
      expect(res.body.checks[name]).toBe('down');
    },
  );
});
