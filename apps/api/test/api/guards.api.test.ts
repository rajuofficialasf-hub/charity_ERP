import { Router } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AuditWriter } from '../../src/audit/audit-writer';
import type { Tx } from '../../src/core/prisma.service';
import { defineRoute, type RouteDeps } from '../../src/openapi/define-route';
import { buildTestApp, type TestApp } from '../support/app';

// A transaction stand-in: the audit insert succeeds without a database.
const fakeTx = { auditLog: { create: async () => ({}) } } as unknown as Tx;

const base = {
  tag: 'probe',
  permission: 'public',
  scope: 'none',
  idempotency: 'none' as const,
  responses: { 200: null },
};

// Test probes outside the contract, declared like real routes.
function probes(deps: RouteDeps): Router {
  const router = Router();
  const audit = new AuditWriter();
  defineRoute(router, deps, {
    ...base,
    method: 'post',
    path: '/guard-probe/login',
    operationId: 'probe.login',
    summary: 'login',
    audit: 'none',
    rateLimit: 'login',
    handler: () => ({ ok: true }),
  });
  defineRoute(router, deps, {
    ...base,
    method: 'get',
    path: '/guard-probe/read',
    operationId: 'probe.read',
    summary: 'read',
    audit: 'none',
    rateLimit: 'default',
    handler: () => ({ ok: true }),
  });
  defineRoute(router, deps, {
    ...base,
    method: 'post',
    path: '/guard-probe/audited',
    operationId: 'probe.audited',
    summary: 'audited',
    audit: 'probe.write',
    rateLimit: 'default',
    handler: async () => {
      await audit.record(fakeTx, { action: 'probe.write', entityType: 'probe' });
      return { ok: true };
    },
  });
  defineRoute<{ note: string }>(router, deps, {
    ...base,
    method: 'post',
    path: '/guard-probe/audited-body',
    operationId: 'probe.auditedBody',
    summary: 'audited with a body',
    audit: 'probe.write',
    rateLimit: 'default',
    body: z.strictObject({ note: z.string() }),
    handler: async ({ body: input }) => {
      await audit.record(fakeTx, { action: 'probe.write', entityType: 'probe' });
      return { note: input.note };
    },
  });
  defineRoute(router, deps, {
    ...base,
    method: 'get',
    path: '/guard-probe/protected',
    operationId: 'probe.protected',
    summary: 'protected',
    permission: 'permission.view',
    audit: 'none',
    rateLimit: 'default',
    handler: () => ({ ok: true }),
  });
  defineRoute(router, deps, {
    ...base,
    method: 'post',
    path: '/guard-probe/forgot-audit',
    operationId: 'probe.forgot',
    summary: 'forgot',
    audit: 'probe.write',
    rateLimit: 'default',
    handler: () => ({ ok: true }),
  });
  return router;
}

describe('rate limits and audit enforcement (API_STANDARDS 10, 15; D-068)', () => {
  let t: TestApp;

  beforeAll(() => {
    t = buildTestApp({ routers: [probes] });
  });

  afterAll(async () => {
    await t.close();
  });

  it('allows 10 logins per minute per login id and per IP, then answers 429 with Retry-After', async () => {
    for (let i = 1; i <= 10; i++) {
      const res = await request(t.app)
        .post('/api/v1/guard-probe/login')
        .send({ loginId: 'a@example.org' })
        .expect(200);
      expect(res.headers['ratelimit-limit']).toBe('10');
      expect(res.headers['ratelimit-remaining']).toBe(String(10 - i));
    }
    const blocked = await request(t.app)
      .post('/api/v1/guard-probe/login')
      .send({ loginId: 'a@example.org' })
      .expect(429);
    expect(blocked.body.error.code).toBe('rate_limit.exceeded');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    // login id and IP are counted separately (AUTH.md 12): the IP window is spent as well
    await request(t.app)
      .post('/api/v1/guard-probe/login')
      .send({ loginId: 'b@example.org' })
      .expect(429);
    // a user behind the trusted local proxy is counted by the forwarded address (D-072)
    await request(t.app)
      .post('/api/v1/guard-probe/login')
      .set('X-Forwarded-For', '203.0.113.9')
      .send({ loginId: 'c@example.org' })
      .expect(200);
  });

  it('ignores a spoofed X-Forwarded-For when no proxy is trusted (NE-SEC-10)', async () => {
    const direct = buildTestApp({ envOverrides: { TRUST_PROXY: 'false' }, routers: [probes] });
    try {
      for (let i = 1; i <= 10; i++)
        await request(direct.app)
          .post('/api/v1/guard-probe/login')
          .set('X-Forwarded-For', `198.51.100.${i}`)
          .send({ loginId: `u${i}@example.org` })
          .expect(200);
      await request(direct.app)
        .post('/api/v1/guard-probe/login')
        .set('X-Forwarded-For', '198.51.100.99')
        .send({ loginId: 'u99@example.org' })
        .expect(429);
    } finally {
      await direct.close();
    }
  });

  it('applies the declared default class', async () => {
    const res = await request(t.app).get('/api/v1/guard-probe/read').expect(200);
    expect(res.headers['ratelimit-limit']).toBe('600');
  });

  it('passes a write that records its audit entry', async () => {
    await request(t.app).post('/api/v1/guard-probe/audited').expect(200);
  });

  it('keeps the request context across a JSON body (audit count and request id)', async () => {
    const res = await request(t.app)
      .post('/api/v1/guard-probe/audited-body')
      .set('X-Request-Id', 'with-body-0001')
      .send({ note: 'x' })
      .expect(200);
    expect(res.body).toEqual({ data: { note: 'x' }, meta: { requestId: 'with-body-0001' } });
  });

  it('refuses an anonymous caller on a non-public route (default deny, NE-SEC-03)', async () => {
    const res = await request(t.app).get('/api/v1/guard-probe/protected').expect(401);
    expect(res.body.error.code).toBe('auth.token_missing');
    const forged = await request(t.app)
      .get('/api/v1/guard-probe/protected')
      .set('Authorization', 'Bearer not-a-token')
      .expect(401);
    expect(forged.body.error.code).toBe('auth.token_missing');
  });

  it('fails a write that declared an audit action but wrote no entry', async () => {
    const res = await request(t.app).post('/api/v1/guard-probe/forgot-audit').expect(500);
    expect(res.body.error.code).toBe('server.internal');
  });

  it('refuses to register a write route without an audit action (BR-179)', () => {
    expect(() =>
      buildTestApp({
        routers: [
          (deps) => {
            const router = Router();
            defineRoute(router, deps, {
              ...base,
              method: 'post',
              path: '/guard-probe/undeclared',
              operationId: 'probe.undeclared',
              summary: 'undeclared',
              rateLimit: 'default',
              handler: () => ({ ok: true }),
            } as never);
            return router;
          },
        ],
      }),
    ).toThrow(/must declare its audit action/);
  });

  it('refuses to register a route without a permission', () => {
    expect(() =>
      buildTestApp({
        routers: [
          (deps) => {
            const router = Router();
            defineRoute(router, deps, {
              ...base,
              permission: '',
              method: 'get',
              path: '/guard-probe/no-permission',
              operationId: 'probe.noPermission',
              summary: 'no permission',
              audit: 'none',
              rateLimit: 'default',
              handler: () => ({ ok: true }),
            });
            return router;
          },
        ],
      }),
    ).toThrow(/must declare its permission/);
  });

  it('refuses to register the same operationId twice', () => {
    expect(() =>
      buildTestApp({
        routers: [
          (deps) => {
            const router = Router();
            for (const path of ['/guard-probe/twice-a', '/guard-probe/twice-b'])
              defineRoute(router, deps, {
                ...base,
                method: 'get',
                path,
                operationId: 'probe.twice',
                summary: 'twice',
                audit: 'none',
                rateLimit: 'default',
                handler: () => ({ ok: true }),
              });
            return router;
          },
        ],
      }),
    ).toThrow(/registered twice/);
  });
});
