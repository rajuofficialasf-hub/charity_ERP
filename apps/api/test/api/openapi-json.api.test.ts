import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from '../../src/openapi/build-document';
import { openApiAccess } from '../../src/routes/openapi';
import { buildTestApp, type TestApp } from '../support/app';

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
    const expected = buildOpenApiDocument(t.registry);
    expect(Object.keys(res.body.paths).sort()).toEqual(Object.keys(expected.paths).sort());
    expect(res.body.paths['/openapi.json']?.get?.operationId).toBe('reference.openapi.get');
    expect(res.body.paths['/public/settings']?.get).toBeDefined();
  });

  it('holds no data: no demo accounts, mobiles or ids of the seed', async () => {
    const res = await request(t.app).get('/api/v1/openapi.json').expect(200);
    expect(res.text).not.toMatch(/@example\.org|01[3-9]\d{8}/);
  });
});

describe('who may read the description', () => {
  it('is everyone outside production, and a signed-in person in production', () => {
    expect(openApiAccess('development')).toBe('public');
    expect(openApiAccess('test')).toBe('public');
    expect(openApiAccess('production')).toBe('authenticated');
  });
});
