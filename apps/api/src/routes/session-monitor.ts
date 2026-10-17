import { Router } from 'express';
import { z } from 'zod';
import { principalOf } from '../auth/principal';
import type { Container } from '../container';
import { pageQuery } from '../core/pagination';
import { page } from '../http/send';
import { defineRoute, type RouteDeps } from '../openapi/define-route';

const listQuery = pageQuery.omit({ sort: true, include: true }).extend({
  q: z.string().min(2).max(100).optional(),
  kind: z.enum(['staff', 'volunteer']).optional(),
});

/**
 * Every active device session (openapi tag sessions; docs/DECISION_LOG.md, the admin and settings
 * decision of 2026-10-17) for the global roles: `session.revoke_user` at global scope, so the
 * RPM's own-region default keeps working only from the volunteer profile.
 */
export function sessionMonitorRouter(
  deps: RouteDeps,
  c: Pick<Container, 'sessionMonitor'>,
): Router {
  const router = Router();

  defineRoute<unknown, z.infer<typeof listQuery>>(router, deps, {
    tag: 'sessions',
    method: 'get',
    path: '/sessions/active',
    operationId: 'sessions.active.list',
    summary: 'Every active device session, most recently seen first, with a search by person',
    permission: 'session.revoke_user',
    scope: 'global',
    audit: 'none',
    idempotency: 'none',
    rateLimit: 'default',
    query: listQuery,
    responses: { 200: null, 401: null, 403: null, 422: null, 503: null },
    handler: async ({ query, req }) => {
      const { rows, meta } = await c.sessionMonitor.list(principalOf(req), query);
      return page(rows, meta);
    },
  });

  return router;
}
