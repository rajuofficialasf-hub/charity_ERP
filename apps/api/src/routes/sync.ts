import { syncBatchRequestSchema, type SyncBatchRequest } from '@css/shared/sync';
import { Router } from 'express';
import { z } from 'zod';
import { maskData } from '../access/field-mask';
import { type AuthedRequest, principalOf } from '../auth/principal';
import type { Container } from '../container';
import { clientVersionGate } from '../http/client-version';
import { ok, send } from '../http/send';
import { defineRoute, type RouteDeps } from '../openapi/define-route';
import { snapshotEtag, snapshotView } from '../sync/snapshot';

const snapshotQuery = z.strictObject({
  since: z.iso.datetime({ offset: true }).optional(),
  afterId: z.uuid().optional(),
});

/** Offline synchronisation (openapi tag sync): the batch a phone sends and the data set it pulls. */
export function syncRouter(
  deps: RouteDeps,
  c: Pick<Container, 'snapshot' | 'sync' | 'idempotency' | 'env'>,
): Router {
  const router = Router();
  const versionGate = clientVersionGate(c.env.MIN_CLIENT_VERSION);

  defineRoute<SyncBatchRequest>(router, deps, {
    tag: 'sync',
    method: 'post',
    path: '/sync/batch',
    operationId: 'sync.batch.submit',
    summary:
      'Submit up to 50 offline text records; each is processed through its normal service with the originating user as actor; per-record results',
    permission: 'sync.batch',
    scope: 'self',
    audit: 'sync.batch',
    idempotency: 'header',
    rateLimit: 'sync',
    headers: [
      { name: 'Idempotency-Key', required: true },
      { name: 'X-Client-Version', required: false },
    ],
    before: [versionGate],
    body: syncBatchRequestSchema,
    responses: {
      200: null,
      401: null,
      403: null,
      409: null,
      413: null,
      422: null,
      426: null,
      429: null,
    },
    handler: async ({ body, req, res }) => {
      const outcome = await c.sync.submit(
        principalOf(req),
        (req as AuthedRequest).fieldClasses ?? new Set<string>(),
        req.get('idempotency-key'),
        body,
      );
      if (outcome.replay) c.idempotency.markReplay(res);
      return ok(outcome.response);
    },
  });

  // The route writes its answer itself so that an unchanged data set is a 304; the field mask
  // still runs on the body, with the caller's classes, as on every read.
  defineRoute<unknown, z.infer<typeof snapshotQuery>>(router, deps, {
    tag: 'sync',
    method: 'get',
    path: '/sync/snapshot',
    operationId: 'sync.snapshot.get',
    summary: 'Offline data set deltas since a timestamp, masked like every other read',
    permission: 'sync.batch',
    scope: 'self',
    audit: 'none',
    idempotency: 'none',
    rateLimit: 'sync',
    headers: [{ name: 'X-Client-Version', required: false }],
    before: [versionGate],
    query: snapshotQuery,
    streams: true,
    responses: { 200: null, 304: null, 401: null, 422: null, 426: null, 429: null },
    handler: async ({ query, req, res }) => {
      const visible = (req as AuthedRequest).fieldClasses ?? new Set<string>();
      const view = await c.snapshot.read(principalOf(req), visible, {
        since: query.since ? new Date(query.since) : undefined,
        afterId: query.afterId,
      });
      const masked = maskData(snapshotView, JSON.parse(JSON.stringify(view)), visible);
      const etag = snapshotEtag(masked);
      res.setHeader('ETag', etag);
      const given = req.get('If-None-Match')?.trim().replace(/^W\//, '');
      if (given && given === etag) {
        res.status(304).end();
        return;
      }
      send(res, ok(masked, { etag }), 200);
    },
  });

  return router;
}
