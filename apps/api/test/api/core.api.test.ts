import { Writable } from 'node:stream';
import { Router } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { pageQuery } from '../../src/core/pagination.js';
import { ok, page } from '../../src/http/send.js';
import { defineRoute, type RouteDeps } from '../../src/openapi/define-route.js';
import { buildTestApp, type TestApp } from '../support/app.js';

const body = z.strictObject({
  name: z.string().min(1).max(10),
  nid: z.string().regex(/^\d{10}$/, { message: 'validation.nid_format' }),
});
const listQuery = pageQuery.extend({ status: z.string().optional() });

// Test probes outside the contract, declared like real routes.
function probes(deps: RouteDeps): Router {
  const router = Router();
  const base = {
    tag: 'probe',
    permission: 'public',
    scope: 'none',
    audit: 'none',
    idempotency: 'none' as const,
    rateLimit: 'default' as const,
    responses: { 200: null },
  };
  defineRoute(router, deps, {
    ...base,
    method: 'get',
    path: '/core-probe/one',
    operationId: 'probe.one',
    summary: 'one',
    handler: () => ok({ id: '1' }),
  });
  defineRoute(router, deps, {
    ...base,
    method: 'get',
    path: '/core-probe/plain',
    operationId: 'probe.plain',
    summary: 'plain',
    handler: () => ({ hello: 'world' }),
  });
  defineRoute<unknown, z.infer<typeof listQuery>>(router, deps, {
    ...base,
    method: 'get',
    path: '/core-probe/list',
    operationId: 'probe.list',
    summary: 'list',
    query: listQuery,
    handler: ({ query }) =>
      page([{ id: 'a' }], { nextCursor: null, prevCursor: null, limit: query.limit }),
  });
  defineRoute<z.infer<typeof body>>(router, deps, {
    ...base,
    method: 'post',
    path: '/core-probe/echo',
    operationId: 'probe.echo',
    summary: 'echo',
    body,
    handler: ({ body: input }) => ok({ name: input.name }),
  });
  defineRoute(router, deps, {
    ...base,
    method: 'post',
    path: '/core-probe/empty',
    operationId: 'probe.empty',
    summary: 'empty',
    status: 204,
    responses: { 204: null },
    handler: () => undefined,
  });
  return router;
}

const lines: string[] = [];
const logStream = new Writable({
  write(chunk, _enc, done) {
    lines.push(String(chunk));
    done();
  },
});

describe('API core: envelope, request id, validation, logging', () => {
  let t: TestApp;

  beforeAll(() => {
    t = buildTestApp({ envOverrides: { LOG_LEVEL: 'info' }, logStream, routers: [probes] });
  });

  afterAll(async () => {
    await t.close();
  });

  it('wraps results in { data, meta.requestId } and echoes X-Request-Id', async () => {
    const res = await request(t.app)
      .get('/api/v1/core-probe/one')
      .set('X-Request-Id', 'caddy-request-0001')
      .expect(200);
    expect(res.headers['x-request-id']).toBe('caddy-request-0001');
    expect(res.body).toEqual({ data: { id: '1' }, meta: { requestId: 'caddy-request-0001' } });
    const plain = await request(t.app).get('/api/v1/core-probe/plain').expect(200);
    expect(plain.body.data).toEqual({ hello: 'world' });
    expect(plain.body.meta.requestId).toMatch(/^req_[0-9a-f]{32}$/);
    await request(t.app).post('/api/v1/core-probe/empty').expect(204);
  });

  it('ignores a forwarded request id that could inject into logs', async () => {
    const res = await request(t.app)
      .get('/api/v1/core-probe/one')
      .set('X-Request-Id', 'bad id <script> with spaces')
      .expect(200);
    expect(res.headers['x-request-id']).toMatch(/^req_/);
  });

  it('returns list pages with pagination meta and rejects unknown query parameters', async () => {
    const res = await request(t.app).get('/api/v1/core-probe/list?limit=10').expect(200);
    expect(res.body.meta).toMatchObject({ limit: 10, nextCursor: null, prevCursor: null });
    const bad = await request(t.app).get('/api/v1/core-probe/list?limt=10').expect(400);
    expect(bad.body.error).toMatchObject({
      code: 'validation.unknown_parameter',
      details: [{ path: 'limt', code: 'validation.unknown_parameter' }],
    });
    expect(bad.body.error.requestId).toMatch(/^req_/);
  });

  it('reports field problems as 422 validation.failed with localized details', async () => {
    const en = await request(t.app)
      .post('/api/v1/core-probe/echo')
      .set('Accept-Language', 'en')
      .send({ name: '', nid: '12' })
      .expect(422);
    expect(en.body.error).toMatchObject({
      code: 'validation.failed',
      message: 'Some information is not valid.',
      details: [
        { path: 'name', code: 'validation.required', message: 'Fill in this field.' },
        {
          path: 'nid',
          code: 'validation.nid_format',
          message: 'The NID must have 10, 13 or 17 digits.',
        },
      ],
    });
    const bn = await request(t.app).post('/api/v1/core-probe/echo').send({ name: 'ক' }).expect(422);
    expect(bn.body.error.details[0]).toMatchObject({
      path: 'nid',
      code: 'validation.required',
      message: 'এই ঘরটি পূরণ করুন।',
    });
  });

  it('answers malformed JSON with 400 validation.malformed', async () => {
    const res = await request(t.app)
      .post('/api/v1/core-probe/echo')
      .set('Content-Type', 'application/json')
      .send('{"name": ')
      .expect(400);
    expect(res.body.error.code).toBe('validation.malformed');
  });

  it('logs one line per request without bodies, query strings or secrets', async () => {
    lines.length = 0;
    await request(t.app)
      .post('/api/v1/core-probe/echo?mobile=01700000001')
      .set('Authorization', 'Bearer secret-token-value')
      .set('Cookie', 'refresh=secret-cookie')
      .send({ name: 'x', nid: '1000000001', password: 'hunter2' });
    const log = lines.join('');
    expect(log).toContain('/api/v1/core-probe/echo');
    for (const secret of [
      '01700000001',
      'secret-token-value',
      'secret-cookie',
      '1000000001',
      'hunter2',
    ])
      expect(log).not.toContain(secret);
  });

  it('keeps health probes outside the envelope', async () => {
    const res = await request(t.app).get('/api/v1/healthz').expect(200);
    expect(JSON.parse(res.text)).toEqual({ status: 'pass' });
  });
});
