import {
  PHOTO_SLOTS,
  PHOTO_SOURCES,
  type PhotoSlot,
  type PhotoSource,
} from '@css/shared/registration';
import { Router } from 'express';
import { z } from 'zod';
import { principalOf } from '../auth/principal';
import type { Container } from '../container';
import { photoBody } from '../files/photo-body';
import { defineRoute, type RouteDeps } from '../openapi/define-route';

/**
 * Stored files: the photo stream and the volunteer's own photo upload (DECISION_LOG D-087; the
 * metadata, signed-URL-free download and upload sessions of the file service follow in T2.1).
 */
export function filesRouter(
  deps: RouteDeps,
  c: Pick<Container, 'files' | 'registrationPhotos'>,
): Router {
  const router = Router();

  defineRoute<unknown, unknown, { fileId: string }>(router, deps, {
    tag: 'files',
    method: 'get',
    path: '/files/:fileId/content',
    operationId: 'files.file.content',
    summary:
      'Stream a registration or profile photo to its owner and to allowed officials; the NID photo only to the volunteer.identity roles (Cache-Control no-store, nosniff; D-087)',
    permission: 'entity',
    scope: 'file',
    allowPending: true,
    audit: 'none',
    idempotency: 'none',
    rateLimit: 'default',
    params: { fileId: z.uuid() },
    streams: true,
    responses: { 200: null, 401: null, 404: null },
    handler: ({ params, req, res }) => c.files.streamContent(principalOf(req), params.fileId, res),
  });

  defineRoute<unknown, { requestId: string; source?: PhotoSource }, { slot: PhotoSlot }>(
    router,
    deps,
    {
      tag: 'registration',
      method: 'post',
      path: '/me/photos/:slot',
      status: 201,
      operationId: 'registration.ownPhoto.upload',
      summary:
        'Upload a photo for an own correction or edit request that names the photo field (same rules as the registration upload, D-087)',
      permission: 'authenticated',
      scope: 'self',
      allowPending: true,
      audit: 'file.uploaded',
      idempotency: 'none',
      rateLimit: 'public-form',
      sensitiveFields: ['volunteer.identity'],
      params: { slot: z.enum(PHOTO_SLOTS) },
      query: z.strictObject({ requestId: z.uuid(), source: z.enum(PHOTO_SOURCES).optional() }),
      before: [photoBody],
      responses: {
        201: z.object({ fileId: z.uuid() }),
        401: null,
        404: null,
        413: null,
        415: null,
        422: null,
        429: null,
      },
      handler: ({ params, query, req }) =>
        c.registrationPhotos.forOwnRequest(principalOf(req), {
          requestId: query.requestId,
          slot: params.slot,
          source: query.source ?? 'gallery',
          body: req.body,
        }),
    },
  );

  return router;
}
