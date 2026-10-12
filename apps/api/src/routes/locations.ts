import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '../container';
import { ok } from '../http/send';
import { defineRoute, type RouteDeps } from '../openapi/define-route';

const listQuery = z.strictObject({ parentId: z.uuid().optional() });

/** Locations as reference data (O-09; openapi tag reference). */
export function locationsRouter(deps: RouteDeps, c: Pick<Container, 'locations'>): Router {
  const router = Router();

  // Public for the registration form before login (DECISION_LOG D-083); no personal data.
  defineRoute<unknown, z.infer<typeof listQuery>>(router, deps, {
    tag: 'reference',
    method: 'get',
    path: '/locations',
    operationId: 'reference.location.list',
    summary:
      'Active children of a location (divisions when parentId is omitted); public reference data for the registration form (D-083); not paginated',
    permission: 'public',
    scope: 'system',
    audit: 'none',
    idempotency: 'none',
    rateLimit: 'reference-read',
    query: listQuery,
    responses: { 200: null, 422: null, 429: null },
    handler: async ({ query }) => {
      const rows = await c.locations.children(query.parentId);
      return ok(rows, { limit: rows.length, nextCursor: null, prevCursor: null });
    },
  });

  return router;
}
