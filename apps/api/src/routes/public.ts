import { type PublicApplicationCreate, publicApplicationCreateSchema } from '@css/shared/forms';
import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '../container';
import { ok } from '../http/send';
import { defineRoute, type RouteDeps } from '../openapi/define-route';
import { versionView } from './forms';

const bilingual = z.object({ bn: z.string(), en: z.string() });
const publicFormView = z.object({
  project: z.object({ name: bilingual, applyTo: z.string().nullable() }),
  form: versionView,
});
const actionResult = z.object({
  id: z.uuid(),
  status: z.string(),
  stage: z.string().nullable(),
});
const tokenParams = { token: z.string().min(16) };

/**
 * The public application link (openapi tag public; blueprint A8.5, DECISION_LOG O-08): no login,
 * the `public-form` rate class per address, nothing about anyone revealed. The token in the path
 * is the whole access; the request log masks it.
 */
export function publicRouter(
  deps: RouteDeps,
  c: Pick<Container, 'publicForms' | 'idempotency'>,
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
      "The published volunteer-visible form behind a public link, with the project's name and closing date; a disabled link, an unpublished form, an inactive project or a passed closing date answer not found",
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
      'Submit a public application; it waits for verification without a profile, and the applicant learns nothing about existing profiles (O-08)',
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

  return router;
}
