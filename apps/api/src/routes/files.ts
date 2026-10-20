import {
  PHOTO_SLOTS,
  PHOTO_SOURCES,
  type PhotoSlot,
  type PhotoSource,
} from '@css/shared/registration';
import { Router } from 'express';
import { z } from 'zod';
import { type AuthedRequest, principalOf } from '../auth/principal';
import { sensitive } from '../access/field-mask';
import type { Container } from '../container';
import { photoBody } from '../files/photo-body';
import { defineRoute, type RouteDeps } from '../openapi/define-route';
import type { FileVariant } from '../services/files';

const fileInfoSchema = z.object({
  data: z.object({
    id: z.uuid(),
    kind: z.string(),
    mime: z.string(),
    sizeBytes: z.int(),
    capturedAt: z.string().nullable(),
    uploadedAt: z.string(),
    gps: sensitive(
      z.object({ lat: z.number(), lng: z.number(), accuracyM: z.number().nullable() }).nullable(),
      'file.location',
    ),
    virusScan: z.enum(['pending', 'clean', 'infected', 'failed', 'skipped']),
    flags: z.array(z.string()),
    duplicateOf: z.uuid().nullable(),
  }),
});

/**
 * Stored files: the stream of a file or its thumbnail, its metadata, and the volunteer's own photo
 * upload (the chunked uploads are in routes/uploads.ts).
 */
export function filesRouter(
  deps: RouteDeps,
  c: Pick<Container, 'files' | 'registrationPhotos'>,
): Router {
  const router = Router();

  defineRoute<unknown, { variant?: FileVariant }, { fileId: string }>(router, deps, {
    tag: 'files',
    method: 'get',
    path: '/files/:fileId/content',
    operationId: 'files.file.content',
    summary:
      'Stream a file or its thumbnail to its owner and to the officials whose scope reaches its record, once the scan cleared it; the NID photo only with the identity class (Cache-Control no-store, nosniff, the type from the stored bytes, inline only for images and PDF)',
    permission: 'entity',
    scope: 'file',
    allowPending: true,
    audit: 'none',
    idempotency: 'none',
    rateLimit: 'default',
    params: { fileId: z.uuid() },
    query: z.strictObject({ variant: z.enum(['small', 'medium']).optional() }),
    streams: true,
    responses: { 200: null, 401: null, 404: null, 410: null, 422: null, 423: null },
    handler: ({ params, query, req, res }) =>
      c.files.streamContent(principalOf(req), params.fileId, res, query.variant),
  });

  defineRoute<unknown, unknown, { fileId: string }>(router, deps, {
    tag: 'files',
    method: 'get',
    path: '/files/:fileId',
    operationId: 'files.file.get',
    summary:
      'File metadata, scan state and data-quality flags; the GPS position under file.location',
    permission: 'entity',
    scope: 'file',
    audit: 'none',
    idempotency: 'none',
    rateLimit: 'default',
    params: { fileId: z.uuid() },
    sensitiveFields: ['file.location'],
    responses: { 200: fileInfoSchema, 404: null },
    handler: async ({ params, req }) => {
      const { view, fieldClasses } = await c.files.info(principalOf(req), params.fileId);
      // the classes the service grants this caller on this file join the role's for the mask
      const authed = req as AuthedRequest;
      if (fieldClasses.length)
        authed.fieldClasses = new Set([...(authed.fieldClasses ?? []), ...fieldClasses]);
      return view;
    },
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
