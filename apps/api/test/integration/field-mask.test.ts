import { Router } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { sensitive } from '../../src/access/field-mask';
import { defineRoute, type RouteDeps } from '../../src/openapi/define-route';
import { seedAccessCatalogue } from './support/access-fixtures';
import { account, type AuthHarness, authHarness, bearer, login } from './support/auth-app';

// The field mask on real responses (RBAC.md 6). Test values only.
const volunteerResponse = z.object({
  data: z.object({
    id: z.string(),
    displayName: z.string(),
    nid: sensitive(z.string(), 'volunteer.identity'),
    bankAccountNumber: sensitive(z.string(), 'volunteer.bank'),
  }),
  meta: z.object({ requestId: z.string().optional() }),
});

function maskProbe(deps: RouteDeps): Router {
  const router = Router();
  defineRoute(router, deps, {
    method: 'get',
    path: '/mask-probe/volunteer',
    operationId: 'probe.maskVolunteer',
    tag: 'probe',
    summary: 'volunteer with protected fields',
    permission: 'authenticated',
    scope: 'volunteer',
    audit: 'none',
    idempotency: 'none',
    rateLimit: 'default',
    sensitiveFields: ['volunteer.identity', 'volunteer.bank'],
    responses: { 200: volunteerResponse },
    // the handler returns everything it has; the route removes what the caller may not see
    handler: () => ({
      id: 'v1',
      displayName: 'Test Volunteer',
      nid: '0000000000',
      bankAccountNumber: '000000000000',
      internalNote: 'not in the response schema',
    }),
  });
  defineRoute(router, deps, {
    method: 'get',
    path: '/mask-probe/broken',
    operationId: 'probe.maskBroken',
    tag: 'probe',
    summary: 'handler result that breaks its schema',
    permission: 'authenticated',
    scope: 'volunteer',
    audit: 'none',
    idempotency: 'none',
    rateLimit: 'default',
    responses: { 200: z.object({ data: z.object({ count: z.number() }) }) },
    handler: () => ({ count: 'not a number' }),
  });
  return router;
}

let h: AuthHarness;
const api = () => request(h.server());

beforeAll(async () => {
  h = await authHarness({ extraRouters: [maskProbe] });
  await seedAccessCatalogue(h.db);
});

afterAll(async () => {
  await h.close();
});

const fetchAs = async (role: string, kind: 'staff' | 'volunteer' = 'staff') => {
  const s = await login(h, await account(h.db, { kind, role }));
  const res = await api().get('/api/v1/mask-probe/volunteer').set(bearer(s)).expect(200);
  return res.body.data as Record<string, unknown>;
};

describe('field mask on responses', () => {
  it('sends identity and bank fields to a global role', async () => {
    expect(await fetchAs('department_head')).toEqual({
      id: 'v1',
      displayName: 'Test Volunteer',
      nid: '0000000000',
      bankAccountNumber: '000000000000',
    });
  });

  it('sends the bank field but not the NID to the Finance Team', async () => {
    const data = await fetchAs('finance_team');
    expect(data).toEqual({
      id: 'v1',
      displayName: 'Test Volunteer',
      bankAccountNumber: '000000000000',
    });
  });

  it('omits both classes for a volunteer without the handler doing anything', async () => {
    const data = await fetchAs('volunteer_general', 'volunteer');
    expect(data).toEqual({ id: 'v1', displayName: 'Test Volunteer' });
    expect(Object.hasOwn(data, 'nid')).toBe(false);
  });

  it('never sends a key the response schema does not declare', async () => {
    expect(await fetchAs('monitoring_team')).not.toHaveProperty('internalNote');
  });

  it('answers server.internal instead of sending a result that breaks its schema', async () => {
    const s = await login(h, await account(h.db, { role: 'department_head' }));
    const res = await api().get('/api/v1/mask-probe/broken').set(bearer(s)).expect(500);
    expect(res.body.error.code).toBe('server.internal');
    expect(JSON.stringify(res.body)).not.toContain('not a number');
  });
});
