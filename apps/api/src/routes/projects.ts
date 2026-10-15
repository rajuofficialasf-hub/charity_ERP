import { type ReasonRequest, reasonRequestSchema } from '@css/shared/auth';
import {
  type ProjectCreate,
  projectCreateSchema,
  type ProjectFilter,
  projectFilterSchema,
  PROJECT_STATUSES,
  type ProjectUpdate,
  projectUpdateSchema,
} from '@css/shared/projects';
import { Router } from 'express';
import { z } from 'zod';
import { type AuthedRequest, principalOf, scopeOf } from '../auth/principal';
import type { Container } from '../container';
import { etagOf } from '../core/etag';
import { type PageQuery, pageQuery } from '../core/pagination';
import { ok, page } from '../http/send';
import { defineRoute, type RouteDeps } from '../openapi/define-route';

const uuid = z.uuid();
const date = z.string().nullable();
/** A project as the caller sees it; the official fields are missing for a volunteer. */
export const projectView = z.object({
  id: uuid,
  code: z.string(),
  year: z.number().int(),
  name: z.object({ bn: z.string(), en: z.string() }),
  status: z.enum(PROJECT_STATUSES),
  workflowKey: z.string(),
  applyFrom: date,
  applyTo: date,
  perVolunteerLimit: z.number().int().nullable(),
  dawahEnabled: z.boolean(),
  programId: uuid.optional(),
  description: z.string().nullable().optional(),
  workflowVersion: z.number().int().optional(),
  costPerBeneficiary: z.string().nullable().optional(),
  targetBeneficiaries: z.number().int().nullable().optional(),
  budgetPlanned: z.string().nullable().optional(),
  activatedAt: z.string().nullable().optional(),
  closedAt: z.string().nullable().optional(),
  cancelledAt: z.string().nullable().optional(),
});

const listQuery = pageQuery.omit({ sort: true }).extend(projectFilterSchema.shape);
const viewerOf = (req: AuthedRequest) => ({ principal: principalOf(req), scope: scopeOf(req) });
const withEtag = (
  res: { setHeader: (k: string, v: string) => void },
  r: { project: unknown; updatedAt: Date },
) => {
  const etag = etagOf(r.updatedAt);
  res.setHeader('ETag', etag);
  return ok(r.project, { etag });
};

/**
 * Projects (openapi tag projects; DECISION_LOG D-095): the list and the project in the caller's
 * scope, a draft created from a workflow, setup changes as the project's state allows, and the
 * cancel of a draft that was never activated.
 */
export function projectsRouter(deps: RouteDeps, c: Pick<Container, 'projects'>): Router {
  const router = Router();
  const projectOp = {
    tag: 'projects',
    scope: 'project',
    idempotency: 'none' as const,
    rateLimit: 'default' as const,
  };

  defineRoute<unknown, Omit<PageQuery, 'sort'> & ProjectFilter>(router, deps, {
    ...projectOp,
    method: 'get',
    path: '/projects',
    operationId: 'projects.project.list',
    summary: 'Projects within scope (volunteers see only active projects they are assigned to)',
    permission: 'project.view',
    audit: 'none',
    query: listQuery,
    responses: { 200: z.array(projectView), 401: null, 403: null, 422: null },
    handler: async ({ query, req }) => {
      const { rows, meta } = await c.projects.list(query, viewerOf(req));
      return page(rows, meta);
    },
  });

  defineRoute<ProjectCreate>(router, deps, {
    ...projectOp,
    method: 'post',
    path: '/projects',
    status: 201,
    operationId: 'projects.project.create',
    summary: 'Create a draft project from a workflow in a program of the caller',
    permission: 'project.create',
    scope: 'program',
    audit: 'project.create',
    body: projectCreateSchema,
    responses: { 201: projectView, 401: null, 403: null, 409: null, 422: null },
    handler: async ({ body, req, res }) =>
      withEtag(res, await c.projects.create(viewerOf(req), body)),
  });

  defineRoute<unknown, unknown, { projectId: string }>(router, deps, {
    ...projectOp,
    method: 'get',
    path: '/projects/:projectId',
    operationId: 'projects.project.get',
    summary: 'Get a project',
    permission: 'project.view',
    audit: 'none',
    params: { projectId: uuid },
    responses: { 200: projectView, 401: null, 403: null, 404: null },
    handler: async ({ params, req, res }) =>
      withEtag(res, await c.projects.get(viewerOf(req), params.projectId)),
  });

  defineRoute<ProjectUpdate, unknown, { projectId: string }>(router, deps, {
    ...projectOp,
    method: 'patch',
    path: '/projects/:projectId',
    operationId: 'projects.project.update',
    summary: 'Update setup fields as the project state allows',
    permission: 'project.configure',
    audit: 'project.configure',
    params: { projectId: uuid },
    headers: [{ name: 'If-Match', required: true }],
    body: projectUpdateSchema,
    responses: {
      200: projectView,
      401: null,
      403: null,
      404: null,
      409: null,
      412: null,
      422: null,
    },
    handler: async ({ body, params, req, res }) =>
      withEtag(
        res,
        await c.projects.update(viewerOf(req), params.projectId, body, req.get('if-match')),
      ),
  });

  defineRoute<ReasonRequest, unknown, { projectId: string }>(router, deps, {
    ...projectOp,
    method: 'post',
    path: '/projects/:projectId/cancel',
    operationId: 'projects.project.cancel',
    summary: 'Cancel a draft that was never activated, with a reason',
    permission: 'project.cancel',
    audit: 'project.cancel',
    params: { projectId: uuid },
    body: reasonRequestSchema,
    responses: { 200: projectView, 401: null, 403: null, 404: null, 409: null, 422: null },
    handler: async ({ body, params, req, res }) =>
      withEtag(res, await c.projects.cancel(viewerOf(req), params.projectId, body.reason)),
  });

  return router;
}
