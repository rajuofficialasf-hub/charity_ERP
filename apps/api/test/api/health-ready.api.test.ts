import { Writable } from 'node:stream';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Container } from '../../src/container';
import { buildTestApp, type TestApp } from '../support/app';

// Readiness: the database and the job queue are critical, the file store is not. The body is the
// status alone; which check failed goes only to the log. The dependencies are switchable stand-ins.
const state = { database: true, storage: true, queue: true };
let databaseCalls = 0;

function standIns(): NonNullable<Parameters<typeof buildTestApp>[0]>['overrides'] {
  return {
    prisma: {
      $queryRaw: async () => {
        databaseCalls += 1;
        if (!state.database) {
          throw new Error('connect ECONNREFUSED postgresql://css:secret-password@db:5432/css_erp');
        }
        return [{ '?column?': 1 }];
      },
      $disconnect: async () => {},
    } as unknown as Container['prisma'],
    storage: { ping: async () => state.storage } as unknown as Container['storage'],
    jobs: {
      ping: async () => state.queue,
      stop: async () => {},
    } as unknown as Container['jobs'],
  };
}

describe('GET /api/v1/readyz', () => {
  let t: TestApp;
  const lines: string[] = [];

  beforeAll(() => {
    t = buildTestApp({
      envOverrides: { LOG_LEVEL: 'info' },
      logStream: new Writable({
        write(chunk, _encoding, done) {
          lines.push(String(chunk));
          done();
        },
      }),
      overrides: standIns(),
    });
  });

  beforeEach(() => {
    Object.assign(state, { database: true, storage: true, queue: true });
    t.container.health.forget();
    databaseCalls = 0;
    lines.length = 0;
  });

  afterAll(async () => {
    await t.close();
  });

  it('answers pass when every dependency answers, in the health check format', async () => {
    const res = await request(t.app).get('/api/v1/readyz').expect(200);
    expect(res.headers['content-type']).toMatch(/^application\/health\+json/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(JSON.parse(res.text)).toEqual({ status: 'pass' });
  });

  it('answers HEAD with the status code and no body', async () => {
    state.database = false;
    const res = await request(t.app).head('/api/v1/readyz').expect(503);
    expect(res.text ?? '').toBe('');
  });

  it('answers warn with 200 when only the file store is down', async () => {
    state.storage = false;
    const res = await request(t.app).get('/api/v1/readyz').expect(200);
    expect(JSON.parse(res.text)).toEqual({ status: 'warn' });
  });

  it.each(['database', 'queue'] as const)(
    'answers fail with 503 when the %s is down',
    async (name) => {
      state[name] = false;
      const res = await request(t.app).get('/api/v1/readyz').expect(503);
      expect(JSON.parse(res.text)).toEqual({ status: 'fail' });
    },
  );

  it('never names a check in the body, whatever header the caller sends', async () => {
    state.database = false;
    const res = await request(t.app)
      .get('/api/v1/readyz')
      .set('Authorization', 'Bearer anything-at-all-0123456789')
      .expect(503);
    expect(JSON.parse(res.text)).toEqual({ status: 'fail' });
  });

  it('logs the failed check by name, without the connection password', async () => {
    state.database = false;
    await request(t.app).get('/api/v1/readyz').expect(503);
    const text = lines.join('\n');
    expect(text).toContain('database');
    expect(text).not.toContain('secret-password');
    expect(text).not.toContain('postgresql://');
  });

  it('reuses a finished result for a short while', async () => {
    await request(t.app).get('/api/v1/readyz').expect(200);
    await request(t.app).get('/api/v1/readyz').expect(200);
    expect(databaseCalls).toBe(1);
  });

  it('is not rate-limited', async () => {
    for (let i = 0; i < 25; i += 1) await request(t.app).get('/api/v1/readyz').expect(200);
  });

  it('answers fail once the API is shutting down, while liveness still passes', async () => {
    const own = buildTestApp({ overrides: standIns() });
    try {
      own.container.health.markShuttingDown();
      const ready = await request(own.app).get('/api/v1/readyz').expect(503);
      expect(JSON.parse(ready.text)).toEqual({ status: 'fail' });
      await request(own.app).get('/api/v1/healthz').expect(200);
    } finally {
      await own.close();
    }
  });

  it('shares one probe round between concurrent callers', async () => {
    let probes = 0;
    const slow = buildTestApp({
      overrides: {
        ...standIns(),
        prisma: {
          $queryRaw: async () => {
            probes += 1;
            await new Promise((r) => setTimeout(r, 50));
            return [{ '?column?': 1 }];
          },
          $disconnect: async () => {},
        } as unknown as Container['prisma'],
      },
    });
    try {
      await Promise.all(
        Array.from({ length: 5 }, () => request(slow.app).get('/api/v1/readyz').expect(200)),
      );
      expect(probes).toBe(1);
    } finally {
      await slow.close();
    }
  });
});
