import { Writable } from 'node:stream';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Container } from '../../src/container.js';
import { buildTestApp, type TestApp } from '../support/app.js';

// Liveness: the process answers, whatever its dependencies do, in the health check format.
const LIVENESS = ['/api/v1/healthz', '/api/v1/livez'] as const;

describe('liveness probes', () => {
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
      overrides: {
        // the database is down: liveness must not notice
        prisma: {
          $queryRaw: async () => {
            throw new Error('connection refused');
          },
          $disconnect: async () => {},
        } as unknown as Container['prisma'],
      },
    });
  });

  afterAll(async () => {
    await t.close();
  });

  it.each(LIVENESS)('answers pass at %s in the health check format', async (path) => {
    const res = await request(t.app).get(path).expect(200);
    expect(res.headers['content-type']).toMatch(/^application\/health\+json/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(JSON.parse(res.text)).toEqual({ status: 'pass' });
  });

  it.each(LIVENESS)('answers HEAD at %s with the same headers and no body', async (path) => {
    const res = await request(t.app).head(path).expect(200);
    expect(res.headers['content-type']).toMatch(/^application\/health\+json/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.text ?? '').toBe('');
  });

  it('no longer serves the old paths outside the prefix', async () => {
    await request(t.app).get('/health/live').expect(404);
    await request(t.app).get('/health/ready').expect(404);
  });

  it('leaves no request log line for a probe', async () => {
    lines.length = 0;
    await request(t.app).get('/api/v1/healthz').expect(200);
    await request(t.app).get('/api/v1/does-not-exist').expect(404);
    const logged = lines.map((l) => JSON.parse(l) as { req?: { path?: string } });
    expect(logged.some((l) => l.req?.path === '/api/v1/does-not-exist')).toBe(true);
    expect(logged.some((l) => l.req?.path === '/api/v1/healthz')).toBe(false);
  });

  it('leaves no log line for a probe written in another case or with a trailing slash', async () => {
    lines.length = 0;
    await request(t.app).get('/API/V1/healthz/').expect(200);
    expect(lines).toEqual([]);
  });

  it('returns 404 for unknown /api/v1 routes', async () => {
    await request(t.app).get('/api/v1/does-not-exist').expect(404);
  });

  it('sends no x-powered-by and the helmet headers', async () => {
    const res = await request(t.app).get('/api/v1/healthz').expect(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
