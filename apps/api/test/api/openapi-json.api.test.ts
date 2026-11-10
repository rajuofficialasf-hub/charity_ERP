import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openApiAccess } from '../../src/routes/openapi';
import { buildTestApp, type TestApp } from '../support/app';
import { testEnv } from '../support/env';

// The API's own description of its routes, for the web app's contract test: shapes only, never data.
describe('GET /api/v1/openapi.json', () => {
  let t: TestApp;

  beforeAll(() => {
    t = buildTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('describes every registered route without a session outside production', async () => {
    const res = await request(t.app).get('/api/v1/openapi.json').expect(200);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    const operationIds = Object.values(
      res.body.paths as Record<string, Record<string, { operationId: string }>>,
    ).flatMap((item) => Object.values(item).map((op) => op.operationId));
    // as many operations as the app registered, the ones the web app's journeys lean on among them
    expect(operationIds).toHaveLength(t.registry.list().length);
    expect(operationIds).toEqual(
      expect.arrayContaining([
        'reference.openapi.get',
        'reference.setting.public',
        'auth.session.login',
        'sync.batch.submit',
      ]),
    );
  });

  it('holds no data: no demo accounts, mobiles or ids of the seed', async () => {
    const res = await request(t.app).get('/api/v1/openapi.json').expect(200);
    expect(res.text).not.toMatch(/@example\.org|01[3-9]\d{8}/);
  });
});

describe('the description in production', () => {
  let prod: TestApp;

  beforeAll(() => {
    prod = buildTestApp({ env: { ...testEnv(), NODE_ENV: 'production' } });
  });

  afterAll(async () => {
    await prod.close();
  });

  it('refuses a caller without a session', async () => {
    await request(prod.app).get('/api/v1/openapi.json').expect(401);
  });
});

describe('who may read the description', () => {
  it('is everyone outside production, and a signed-in person in production', () => {
    expect(openApiAccess('development')).toBe('public');
    expect(openApiAccess('test')).toBe('public');
    expect(openApiAccess('production')).toBe('authenticated');
  });
});
