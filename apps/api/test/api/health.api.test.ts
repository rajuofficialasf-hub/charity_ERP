import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, type TestApp } from '../support/app';

describe('GET /health/live', () => {
  let t: TestApp;

  beforeAll(() => {
    t = buildTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('reports the process as up', async () => {
    const res = await request(t.app).get('/health/live').expect(200);
    expect(res.body).toEqual({ status: 'up' });
  });

  it('is not served under the /api/v1 prefix', async () => {
    await request(t.app).get('/api/v1/health/live').expect(404);
  });

  it('returns 404 for unknown /api/v1 routes', async () => {
    await request(t.app).get('/api/v1/does-not-exist').expect(404);
  });

  it('sends no x-powered-by and the helmet headers', async () => {
    const res = await request(t.app).get('/health/live').expect(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
