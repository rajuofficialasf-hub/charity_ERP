import { type PublicApplicationCreate, publicApplicationCreateSchema } from '@css/shared/forms';
import { identityRulesSchema } from '@css/shared/projects';
import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '../container.js';
import { formPhotoBody } from '../files/photo-body.js';
import { ok } from '../http/send.js';
import { defineRoute, type RouteDeps } from '../openapi/define-route.js';
import { versionView } from './forms.js';

const bilingual = z.object({ bn: z.string(), en: z.string() });
const publicFormView = z.object({
  project: z.object({
    name: bilingual,
    applyTo: z.string().nullable(),
    identityDocument: identityRulesSchema.shape.document,
  }),
  form: versionView,
});
const actionResult = z.object({
  id: z.uuid(),
  status: z.string(),
  stage: z.string().nullable(),
});
const tokenParams = { token: z.string().min(16) };

/**
 * The public application link (openapi tag public; docs/plans/2026-10-21-1135-feat-form-engine-plan.md,
 * "The public link"): no login, the `public-form` rate class per address, nothing about anyone revealed. The
 * token in the path is the whole access; the request log masks it.
 */
export function publicRouter(
  deps: RouteDeps,
  c: Pick<Container, 'publicForms' | 'publicPhotos' | 'idempotency'>,
): Router {
  const router = Router();
  const op = {
    tag: 'public',
    permission: 'public',
    scope: 'none',
    rateLimit: 'public-form' as const,
  };

  defineRoute<unknown, unknown, { token: string }>(router, deps, {
    ...op,
    method: 'get',
    path: '/public/forms/:token',
    operationId: 'public.form.get',
    summary:
      "The published volunteer-visible form behind a public link, with the project's name and closing date and whether its application must carry an identity document; a disabled link, an unpublished form, an inactive project or a passed closing date answer not found",
    audit: 'none',
    idempotency: 'none',
    params: tokenParams,
    responses: { 200: publicFormView, 404: null, 429: null },
    handler: async ({ params }) => ok(await c.publicForms.form(params.token)),
  });

  defineRoute<PublicApplicationCreate, unknown, { token: string }>(router, deps, {
    ...op,
    method: 'post',
    path: '/public/forms/:token/applications',
    status: 201,
    operationId: 'public.application.submit',
    summary:
      'Submit a public application; it waits for verification without a profile, and the applicant learns nothing about existing profiles',
    audit: 'application.public_submitted',
    idempotency: 'clientUuid',
    params: tokenParams,
    body: publicApplicationCreateSchema,
    responses: { 200: actionResult, 201: actionResult, 404: null, 422: null, 429: null },
    handler: async ({ params, body, res }) => {
      const result = await c.publicForms.submit(params.token, body);
      if (result.replay) c.idempotency.markReplay(res);
      return ok(result.value);
    },
  });

  defineRoute<unknown, { clientUuid: string; fieldKey: string }, { token: string }>(router, deps, {
    ...op,
    method: 'post',
    path: '/public/forms/:token/photos',
    status: 201,
    operationId: 'public.photo.upload',
    summary:
      'Upload one photo of a public application before it is submitted (JPEG or PNG, at most 5 MB, metadata stripped; five per submission, a bounded number per link; swept after a day unless a submission claims it)',
    audit: 'file.uploaded',
    idempotency: 'none',
    params: tokenParams,
    query: z.strictObject({ clientUuid: z.uuid(), fieldKey: z.string().min(1).max(60) }),
    before: [formPhotoBody],
    responses: {
      201: z.object({ fileId: z.uuid() }),
      404: null,
      413: null,
      415: null,
      422: null,
      429: null,
    },
    handler: ({ params, query, req }) =>
      c.publicPhotos.upload({
        token: params.token,
        clientUuid: query.clientUuid,
        fieldKey: query.fieldKey,
        body: req.body,
      }),
  });

  return router;
}
