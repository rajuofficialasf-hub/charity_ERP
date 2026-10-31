import { Router } from 'express';
import { z } from 'zod';
import { maskData } from '../access/field-mask';
import { type AuthedRequest, principalOf } from '../auth/principal';
import type { Container } from '../container';
import { ok, send } from '../http/send';
import { defineRoute, type RouteDeps } from '../openapi/define-route';
import { snapshotEtag, snapshotView } from '../sync/snapshot';

const snapshotQuery = z.strictObject({ since: z.iso.datetime({ offset: true }).optional() });

/** Offline synchronisation (openapi tag sync): the data set a phone pulls. */
export function syncRouter(deps: RouteDeps, c: Pick<Container, 'snapshot'>): Router {
  const router = Router();

  // The route writes its answer itself so that an unchanged data set is a 304; the field mask
  // still runs on the body, with the caller's classes, as on every read.
  defineRoute<unknown, z.infer<typeof snapshotQuery>>(router, deps, {
    tag: 'sync',
    method: 'get',
    path: '/sync/snapshot',
    operationId: 'sync.snapshot.get',
    summary: 'Offline data set deltas since a timestamp, masked like every other read (O-07)',
    permission: 'sync.batch',
    scope: 'self',
    audit: 'none',
    idempotency: 'none',
    rateLimit: 'sync',
    headers: [{ name: 'X-Client-Version', required: false }],
    query: snapshotQuery,
    streams: true,
    responses: { 200: null, 304: null, 401: null, 422: null, 426: null, 429: null },
    handler: async ({ query, req, res }) => {
      const view = await c.snapshot.read(
        principalOf(req),
        (req as AuthedRequest).fieldClasses ?? new Set<string>(),
        query.since ? new Date(query.since) : undefined,
      );
      const etag = snapshotEtag(view);
      res.setHeader('ETag', etag);
      const given = req.get('If-None-Match')?.trim().replace(/^W\//, '');
      if (given && given === etag) {
        res.status(304).end();
        return;
      }
      const visible = (req as AuthedRequest).fieldClasses ?? new Set<string>();
      const masked = maskData(snapshotView, JSON.parse(JSON.stringify(view)), visible);
      send(res, ok(masked, { etag }), 200);
    },
  });

  return router;
}
