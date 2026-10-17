import { type Consent, consentSchema } from '@css/shared/projects';
import { Router } from 'express';
import { z } from 'zod';
import { principalOf } from '../auth/principal';
import type { Container } from '../container';
import { ok } from '../http/send';
import { defineRoute, type RouteDeps } from '../openapi/define-route';

const uuid = z.uuid();
const bilingual = z.object({ bn: z.string(), en: z.string() });
const myProject = z.object({
  projectId: uuid,
  code: z.string(),
  year: z.number().int(),
  name: bilingual,
  status: z.string(),
  applyFrom: z.string().nullable(),
  applyTo: z.string().nullable(),
  perVolunteerLimit: z.number().int().nullable(),
  dawahEnabled: z.boolean(),
  via: z.enum(['assignment', 'team']),
  permissionSet: z.string().nullable(),
  isPaid: z.boolean(),
  consentStatus: z.enum(['pending', 'accepted']),
  rulesVersion: z.number().int(),
  applicationsCounted: z.number().int(),
  applicationsLeft: z.number().int().nullable(),
});
const myProjectDetail = myProject.extend({
  rules: z.object({
    version: z.number().int(),
    parts: z.array(z.object({ part: z.string(), text: bilingual })),
  }),
});

/**
 * A volunteer's own projects and the consent to their rules (openapi tag volunteers; BR-039,
 * DECISION_LOG D-096). Everything is the caller's own: the project must be one they are assigned to
 * or on a team for.
 */
export function myProjectsRouter(deps: RouteDeps, c: Pick<Container, 'myProjects'>): Router {
  const router = Router();
  const own = {
    tag: 'volunteers',
    scope: 'self',
    permission: 'volunteer.consent.accept',
    idempotency: 'none' as const,
    rateLimit: 'default' as const,
  };

  defineRoute(router, deps, {
    ...own,
    method: 'get',
    path: '/me/projects',
    operationId: 'volunteers.myProject.list',
    summary: 'Own running projects with the consent state, permission set and application count',
    audit: 'none',
    responses: { 200: z.array(myProject), 401: null, 403: null },
    handler: async ({ req }) => ok(await c.myProjects.list(principalOf(req))),
  });

  defineRoute<unknown, unknown, { projectId: string }>(router, deps, {
    ...own,
    method: 'get',
    path: '/me/projects/:projectId',
    operationId: 'volunteers.myProject.get',
    summary: 'One own project with the rules parts to read before accepting',
    audit: 'none',
    params: { projectId: uuid },
    responses: { 200: myProjectDetail, 401: null, 403: null, 404: null },
    handler: async ({ params, req }) =>
      ok(await c.myProjects.get(principalOf(req), params.projectId)),
  });

  defineRoute<Consent, unknown, { projectId: string }>(router, deps, {
    ...own,
    method: 'post',
    path: '/me/projects/:projectId/consent',
    status: 200,
    operationId: 'volunteers.myProject.consent',
    summary: 'Accept every part of the current rules, or refuse them (the project stays pending)',
    audit: 'volunteer.consent',
    params: { projectId: uuid },
    body: consentSchema,
    responses: { 200: myProject, 401: null, 403: null, 404: null, 409: null, 422: null },
    handler: async ({ body, params, req }) =>
      ok(await c.myProjects.consent(principalOf(req), params.projectId, body)),
  });

  return router;
}
