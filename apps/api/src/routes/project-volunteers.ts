import { type ReasonRequest, reasonRequestSchema } from '@css/shared/auth';
import {
  type AssignmentCreate,
  assignmentCreateSchema,
  type AssignmentUpdate,
  assignmentUpdateSchema,
  type CandidateFilter,
  candidateFilterSchema,
} from '@css/shared/projects';
import { Router } from 'express';
import { z } from 'zod';
import { type AuthedRequest, principalOf, scopeOf } from '../auth/principal.js';
import type { Container } from '../container.js';
import { pageQuery, type PageQuery } from '../core/pagination.js';
import { ok, page } from '../http/send.js';
import { defineRoute, type RouteDeps } from '../openapi/define-route.js';

const uuid = z.uuid();
const assignmentView = z.object({
  id: uuid,
  volunteerId: uuid,
  displayName: z.string(),
  type: z.string(),
  regionLocationId: uuid,
  permissionSet: z.string(),
  isPaid: z.boolean(),
  consentStatus: z.enum(['pending', 'accepted']),
  consentAt: z.string().nullable(),
  applicationsCounted: z.number().int(),
  assignedAt: z.string(),
});
const candidateView = z.object({
  volunteerId: uuid,
  displayName: z.string(),
  type: z.string(),
  divisionId: uuid,
  districtId: uuid,
  upazilaId: uuid,
  unionId: uuid,
  defaultPermissionSet: z.string().nullable(),
});
const listQuery = pageQuery.omit({ sort: true, include: true });

const viewerOf = (req: AuthedRequest) => ({ principal: principalOf(req), scope: scopeOf(req) });

/**
 * Volunteers on a project (openapi tag volunteers): the
 * volunteers the caller may assign, the assigned ones, assigning several at once, changing the set
 * or the paid flag, and ending an assignment with a reason.
 */
export function projectVolunteersRouter(
  deps: RouteDeps,
  c: Pick<Container, 'projectVolunteers'>,
): Router {
  const router = Router();
  const op = {
    tag: 'volunteers',
    scope: 'project',
    idempotency: 'none' as const,
    rateLimit: 'default' as const,
  };

  defineRoute<unknown, CandidateFilter & PageQuery, { projectId: string }>(router, deps, {
    ...op,
    method: 'get',
    path: '/projects/:projectId/volunteer-candidates',
    operationId: 'volunteers.assignment.candidates',
    summary: 'Approved, not blocked volunteers of the caller areas who are not on the project yet',
    permission: 'volunteer.assign_project',
    audit: 'none',
    params: { projectId: uuid },
    query: listQuery.extend(candidateFilterSchema.shape),
    responses: { 200: z.array(candidateView), 401: null, 403: null, 404: null, 422: null },
    handler: async ({ params, query, req }) => {
      const result = await c.projectVolunteers.candidates(viewerOf(req), params.projectId, query);
      return page(result.rows, result.meta);
    },
  });

  defineRoute<unknown, PageQuery, { projectId: string }>(router, deps, {
    ...op,
    method: 'get',
    path: '/projects/:projectId/volunteers',
    operationId: 'volunteers.assignment.list',
    summary:
      'Volunteers assigned to the project in the caller areas, with set, paid flag and consent',
    permission: 'project.view',
    audit: 'none',
    params: { projectId: uuid },
    query: listQuery,
    responses: { 200: z.array(assignmentView), 401: null, 403: null, 404: null, 422: null },
    handler: async ({ params, query, req }) => {
      const result = await c.projectVolunteers.list(viewerOf(req), params.projectId, query);
      return page(result.rows, result.meta);
    },
  });

  defineRoute<AssignmentCreate, unknown, { projectId: string }>(router, deps, {
    ...op,
    method: 'post',
    path: '/projects/:projectId/volunteers',
    status: 201,
    operationId: 'volunteers.assignment.create',
    summary:
      'Assign up to 100 volunteers of the caller areas with a permission set and a paid flag',
    permission: 'volunteer.assign_project',
    audit: 'volunteer.assigned',
    params: { projectId: uuid },
    body: assignmentCreateSchema,
    responses: {
      201: z.array(assignmentView),
      401: null,
      403: null,
      404: null,
      409: null,
      422: null,
    },
    handler: async ({ body, params, req }) =>
      ok(await c.projectVolunteers.assign(viewerOf(req), params.projectId, body)),
  });

  defineRoute<AssignmentUpdate, unknown, { assignmentId: string }>(router, deps, {
    ...op,
    method: 'patch',
    path: '/project-volunteers/:assignmentId',
    operationId: 'volunteers.assignment.update',
    summary: 'Change the permission set or the paid flag (the paid flag needs volunteer.mark_paid)',
    permission: 'volunteer.assign_project',
    audit: 'volunteer.assignment_changed',
    params: { assignmentId: uuid },
    body: assignmentUpdateSchema,
    responses: { 200: assignmentView, 401: null, 403: null, 404: null, 409: null, 422: null },
    handler: async ({ body, params, req }) =>
      ok(await c.projectVolunteers.update(viewerOf(req), params.assignmentId, body)),
  });

  defineRoute<ReasonRequest, unknown, { assignmentId: string }>(router, deps, {
    ...op,
    method: 'post',
    path: '/project-volunteers/:assignmentId/end',
    status: 204,
    operationId: 'volunteers.assignment.end',
    summary: 'End an assignment with a reason; the team of that volunteer on the project ends too',
    permission: 'volunteer.assign_project',
    audit: 'volunteer.assignment_ended',
    params: { assignmentId: uuid },
    body: reasonRequestSchema,
    responses: { 204: null, 401: null, 403: null, 404: null, 422: null },
    handler: ({ body, params, req }) =>
      c.projectVolunteers.end(viewerOf(req), params.assignmentId, body.reason),
  });

  return router;
}
