import { isoDateSchema } from '@css/shared/settings';
import { Router } from 'express';
import { z } from 'zod';
import { principalOf } from '../auth/principal';
import type { Container } from '../container';
import { pageQuery } from '../core/pagination';
import { page } from '../http/send';
import { defineRoute, type RouteDeps } from '../openapi/define-route';

const listQuery = pageQuery.omit({ sort: true, include: true }).extend({
  actorUserId: z.uuid().optional(),
  entityType: z
    .string()
    .regex(/^[a-z_]{2,64}$/)
    .optional(),
  entityId: z.uuid().optional(),
  action: z
    .string()
    .regex(/^[a-z_.]{2,100}$/)
    .optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

/**
 * The audit viewer (openapi tag audit; docs/DECISION_LOG.md, the admin and settings decision of
 * 2026-10-17): only the global roles for now, so the route asks for `audit.view` at global scope
 * and the program and region defaults of the PM and the RPM do not open it.
 */
export function auditRouter(deps: RouteDeps, c: Pick<Container, 'auditLog'>): Router {
  const router = Router();

  defineRoute<unknown, z.infer<typeof listQuery>>(router, deps, {
    tag: 'audit',
    method: 'get',
    path: '/audit-log',
    operationId: 'audit.entry.list',
    summary:
      'The audit log newest first, by actor, entity, action and a date range of at most a year',
    permission: 'audit.view',
    scope: 'global',
    audit: 'none',
    idempotency: 'none',
    rateLimit: 'default',
    query: listQuery,
    responses: { 200: null, 401: null, 403: null, 422: null, 503: null },
    handler: async ({ query, req }) => {
      const { rows, meta } = await c.auditLog.list(principalOf(req), query);
      return page(rows, meta);
    },
  });

  return router;
}
