import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '../container.js';
import { ok, send } from '../http/send.js';
import { defineRoute, type RouteDeps } from '../openapi/define-route.js';

const listQuery = z.strictObject({ parentId: z.uuid().optional() });

/** Locations as reference data (openapi tag reference). */
export function locationsRouter(deps: RouteDeps, c: Pick<Container, 'locations'>): Router {
  const router = Router();

  // Public for the registration form before login; no personal data.
  defineRoute<unknown, z.infer<typeof listQuery>>(router, deps, {
    tag: 'reference',
    method: 'get',
    path: '/locations',
    operationId: 'reference.location.list',
    summary:
      'Active children of a location (divisions when parentId is omitted); public reference data for the registration form; not paginated',
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

  // The phone's offline copy of the whole master (docs/architecture/OFFLINE_SYNC.md "What is
  // cached on the device"): the route writes its answer itself so an unchanged master is a 304.
  defineRoute(router, deps, {
    tag: 'reference',
    method: 'get',
    path: '/locations/all',
    operationId: 'reference.location.listAll',
    summary:
      "Every active location of the four levels in one answer, with an ETag, for the phone's offline copy",
    permission: 'public',
    scope: 'system',
    audit: 'none',
    idempotency: 'none',
    rateLimit: 'reference-read',
    streams: true,
    responses: { 200: null, 304: null, 429: null },
    handler: async ({ req, res }) => {
      const etag = `"${await c.locations.version()}"`;
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'no-cache');
      const given = req.get('If-None-Match')?.trim().replace(/^W\//, '');
      if (given && given === etag) {
        res.status(304).end();
        return;
      }
      const rows = await c.locations.all();
      send(res, ok(rows, { limit: rows.length, nextCursor: null, prevCursor: null, etag }), 200);
    },
  });

  return router;
}
