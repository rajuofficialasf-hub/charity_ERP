import { type Consent, consentSchema, type TeamAdd, teamAddSchema } from '@css/shared/projects';
import { Router } from 'express';
import { z } from 'zod';
import { principalOf } from '../auth/principal.js';
import type { Container } from '../container.js';
import { ok } from '../http/send.js';
import { defineRoute, type RouteDeps } from '../openapi/define-route.js';

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
  leadsTeam: z.boolean(),
});
const teamView = z.object({
  members: z.array(
    z.object({
      volunteerId: uuid,
      displayName: z.string(),
      type: z.string(),
      consentStatus: z.enum(['pending', 'accepted']),
      addedAt: z.string(),
    }),
  ),
  candidates: z.array(z.object({ volunteerId: uuid, displayName: z.string(), type: z.string() })),
});
const myProjectDetail = myProject.extend({
  rules: z.object({
    version: z.number().int(),
    parts: z.array(z.object({ part: z.string(), text: bilingual })),
  }),
});

/**
 * A volunteer's own projects and the consent to their rules (openapi tag volunteers). Everything is
 * the caller's own: the project must be one they are assigned to or on a team for.
 */
export function myProjectsRouter(
  deps: RouteDeps,
  c: Pick<Container, 'myProjects' | 'volunteerTeams'>,
): Router {
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

  const team = { ...own, permission: 'volunteer.team.manage' };

  defineRoute<unknown, unknown, { projectId: string }>(router, deps, {
    ...team,
    method: 'get',
    path: '/me/projects/:projectId/team',
    operationId: 'volunteers.team.list',
    summary: 'Own team on the project and the volunteers registered with the caller as reference',
    audit: 'none',
    params: { projectId: uuid },
    responses: { 200: teamView, 401: null, 403: null, 404: null },
    handler: async ({ params, req }) =>
      ok(await c.volunteerTeams.get(principalOf(req), params.projectId)),
  });

  defineRoute<TeamAdd, unknown, { projectId: string }>(router, deps, {
    ...team,
    method: 'post',
    path: '/me/projects/:projectId/team',
    status: 201,
    operationId: 'volunteers.team.add',
    summary: 'Add volunteers registered with the caller as reference to own team on the project',
    audit: 'volunteer.team_added',
    params: { projectId: uuid },
    body: teamAddSchema,
    responses: { 201: teamView, 401: null, 403: null, 404: null, 409: null, 422: null },
    handler: async ({ body, params, req }) =>
      ok(await c.volunteerTeams.add(principalOf(req), params.projectId, body.memberVolunteerIds)),
  });

  defineRoute<unknown, unknown, { projectId: string; volunteerId: string }>(router, deps, {
    ...team,
    method: 'post',
    path: '/me/projects/:projectId/team/:volunteerId/remove',
    status: 204,
    operationId: 'volunteers.team.remove',
    summary: 'Remove a member from own team on the project',
    audit: 'volunteer.team_removed',
    params: { projectId: uuid, volunteerId: uuid },
    responses: { 204: null, 401: null, 403: null, 404: null },
    handler: ({ params, req }) =>
      c.volunteerTeams.remove(principalOf(req), params.projectId, params.volunteerId),
  });

  return router;
}
