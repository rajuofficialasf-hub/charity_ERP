import {
  FILE_TYPES,
  UPLOAD_RULES,
  uploadSessionCreateSchema,
  type UploadSessionCreate,
} from '@css/shared/files';
import { type Response, Router } from 'express';
import { z } from 'zod';
import { principalOf, scopeOf } from '../auth/principal.js';
import type { Container } from '../container.js';
import { partBody } from '../files/photo-body.js';
import { defineRoute, type RouteDeps } from '../openapi/define-route.js';
import type { Replayable } from '../services/uploads.js';

const sessionSchema = z.object({
  data: z.object({
    id: z.uuid(),
    chunkSize: z.literal(UPLOAD_RULES.partSize),
    partCount: z.int().min(1),
    partsReceived: z.array(z.int().min(1)),
    bytesReceived: z.int().min(0),
    expiresAt: z.string(),
    fileId: z.uuid().nullable(),
  }),
});

const fileSchema = z.object({
  data: z.object({
    id: z.uuid(),
    kind: z.string(),
    mime: z.enum(FILE_TYPES),
    sizeBytes: z.int(),
    capturedAt: z.string().nullable(),
    uploadedAt: z.string(),
    virusScan: z.enum(['pending', 'clean', 'infected', 'failed', 'skipped']),
    flags: z.array(z.string()),
    duplicateOf: z.uuid().nullable(),
  }),
});

const sessionParams = { uploadSessionId: z.uuid() };

/**
 * Uploads in 256 KB parts through the API (docs/architecture/FILES_AND_DOCUMENTS.md, "Upload
 * pipeline"): start, status for resuming, one part, finalize. Start and finalize check the record
 * the file links to against the caller's upload scope; the session routes reach only the caller's
 * own sessions.
 */
export function uploadsRouter(
  deps: RouteDeps,
  c: Pick<Container, 'uploads' | 'idempotency'>,
): Router {
  /** Answers 200 with `Idempotent-Replay` when the request repeated an earlier one. */
  const answer = <T>(res: Response, result: Replayable<T>): T => {
    if (result.replay) c.idempotency.markReplay(res);
    return result.value;
  };
  const router = Router();

  defineRoute<UploadSessionCreate>(router, deps, {
    tag: 'files',
    method: 'post',
    path: '/upload-sessions',
    status: 201,
    operationId: 'files.uploadSession.create',
    summary:
      "Start a resumable upload in 256 KB parts; checks the record's scope, the kind, the declared size and type, and the open sessions (at most 20)",
    permission: 'file.upload',
    scope: 'project',
    audit: 'none',
    idempotency: 'clientUuid',
    rateLimit: 'default',
    body: uploadSessionCreateSchema,
    responses: {
      200: sessionSchema,
      201: sessionSchema,
      403: null,
      404: null,
      409: null,
      410: null,
      413: null,
      415: null,
      422: null,
      429: null,
    },
    handler: async ({ body, req, res }) =>
      answer(res, await c.uploads.create(principalOf(req), scopeOf(req), body)),
  });

  defineRoute<unknown, unknown, { uploadSessionId: string }>(router, deps, {
    tag: 'files',
    method: 'get',
    path: '/upload-sessions/:uploadSessionId',
    operationId: 'files.uploadSession.get',
    summary: 'Upload session status for resuming after a dropped connection',
    permission: 'file.upload',
    scope: 'self',
    audit: 'none',
    idempotency: 'none',
    rateLimit: 'default',
    params: sessionParams,
    responses: { 200: sessionSchema, 404: null, 410: null },
    handler: ({ params, req }) => c.uploads.get(principalOf(req), params.uploadSessionId),
  });

  defineRoute<unknown, unknown, { uploadSessionId: string; partNumber: number }>(router, deps, {
    tag: 'files',
    method: 'put',
    path: '/upload-sessions/:uploadSessionId/parts/:partNumber',
    operationId: 'files.uploadSession.putPart',
    summary:
      'Store one part of at most 256 KB as raw bytes; a part sent again replaces nothing and answers the same',
    permission: 'file.upload',
    scope: 'self',
    audit: 'none',
    idempotency: 'none',
    rateLimit: 'upload',
    params: {
      ...sessionParams,
      partNumber: z.coerce.number().int().min(1).max(UPLOAD_RULES.maxParts),
    },
    before: [partBody],
    responses: { 200: sessionSchema, 404: null, 410: null, 413: null, 422: null },
    handler: ({ params, req }) =>
      c.uploads.putPart(principalOf(req), params.uploadSessionId, params.partNumber, req.body),
  });

  defineRoute<unknown, unknown, { uploadSessionId: string }>(router, deps, {
    tag: 'files',
    method: 'post',
    path: '/upload-sessions/:uploadSessionId/finalize',
    status: 201,
    operationId: 'files.uploadSession.finalize',
    summary:
      "Complete the upload after the record's scope is checked again; the size, SHA-256 and the type by magic bytes are verified, an identical file in the project is refused; the file stays quarantined until the scan clears it",
    permission: 'file.upload',
    scope: 'project',
    audit: 'file.uploaded',
    idempotency: 'clientUuid',
    rateLimit: 'default',
    params: sessionParams,
    responses: {
      200: fileSchema,
      201: fileSchema,
      403: null,
      404: null,
      409: null,
      410: null,
      415: null,
      422: null,
      503: null,
    },
    handler: async ({ params, req, res }) =>
      answer(res, await c.uploads.finalize(principalOf(req), scopeOf(req), params.uploadSessionId)),
  });

  return router;
}
