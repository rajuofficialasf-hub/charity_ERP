import { type ReasonRequest, reasonRequestSchema } from '@css/shared/auth';
import {
  type ExtendDeadline,
  extendDeadlineSchema,
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
import { type AuthedRequest, principalOf, scopeOf } from '../auth/principal.js';
import type { Container } from '../container.js';
import { etagOf } from '../core/etag.js';
import { type PageQuery, pageQuery } from '../core/pagination.js';
import { ok, page } from '../http/send.js';
import { defineRoute, type RouteDeps } from '../openapi/define-route.js';

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
  periodFrom: z.string(),
  periodTo: z.string(),
  sessionLabel: z.string(),
  programId: uuid.optional(),
  seriesId: uuid.optional(),
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
 * Projects (openapi tag projects): the list and the project in the caller's
 * scope, a draft created from a workflow, setup changes as the project's state allows, and the
 * cancel of a draft that was never activated.
 */
export function projectsRouter(
  deps: RouteDeps,
  c: Pick<Container, 'projects' | 'projectLifecycle'>,
): Router {
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
    summary: 'Create a draft session of a project series in a program of the caller',
    permission: 'project.create',
    scope: 'program',
    audit: 'project.create',
    body: projectCreateSchema,
    responses: { 201: projectView, 401: null, 403: null, 404: null, 409: null, 422: null },
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

  // the lifecycle: each action takes the project's ETag and answers with the moved project
  const action = {
    ...projectOp,
    method: 'post' as const,
    params: { projectId: uuid },
    headers: [{ name: 'If-Match', required: true }],
  };
  const moved = { 200: projectView, 401: null, 403: null, 404: null, 409: null, 412: null };

  defineRoute<unknown, unknown, { projectId: string }>(router, deps, {
    ...action,
    path: '/projects/:projectId/activate',
    operationId: 'projects.project.activate',
    summary: 'Activate a complete draft (guard project.setup_complete; snapshots the workflow)',
    permission: 'project.activate',
    audit: 'project.activate',
    workflow: { scope: 'project', action: 'activate' },
    responses: moved,
    handler: async ({ params, req, res }) =>
      withEtag(
        res,
        await c.projectLifecycle.activate(viewerOf(req), params.projectId, req.get('if-match')),
      ),
  });

  defineRoute<ExtendDeadline, unknown, { projectId: string }>(router, deps, {
    ...action,
    path: '/projects/:projectId/extend-deadline',
    operationId: 'projects.project.extendDeadline',
    summary: 'Extend the application deadline of an active project with a reason',
    permission: 'project.deadline.extend',
    audit: 'project.deadline_extend',
    body: extendDeadlineSchema,
    responses: { ...moved, 422: null },
    handler: async ({ body, params, req, res }) =>
      withEtag(
        res,
        await c.projectLifecycle.extendDeadline(
          viewerOf(req),
          params.projectId,
          body,
          req.get('if-match'),
        ),
      ),
  });

  defineRoute<ReasonRequest, unknown, { projectId: string }>(router, deps, {
    ...action,
    path: '/projects/:projectId/start-closing',
    operationId: 'projects.project.startClosing',
    summary: 'Move an active project to closing with a reason (no new applications)',
    permission: 'project.close',
    audit: 'project.closing',
    workflow: { scope: 'project', action: 'start_closing' },
    body: reasonRequestSchema,
    responses: { ...moved, 422: null },
    handler: async ({ body, params, req, res }) =>
      withEtag(
        res,
        await c.projectLifecycle.startClosing(
          viewerOf(req),
          params.projectId,
          body.reason,
          req.get('if-match'),
        ),
      ),
  });

  defineRoute<ReasonRequest, unknown, { projectId: string }>(router, deps, {
    ...action,
    path: '/projects/:projectId/close',
    operationId: 'projects.project.close',
    summary: "Close a closing project with a reason, once the workflow's close guards pass",
    permission: 'project.close',
    audit: 'project.close',
    workflow: { scope: 'project', action: 'close' },
    body: reasonRequestSchema,
    responses: { ...moved, 422: null },
    handler: async ({ body, params, req, res }) =>
      withEtag(
        res,
        await c.projectLifecycle.close(
          viewerOf(req),
          params.projectId,
          body.reason,
          req.get('if-match'),
        ),
      ),
  });

  defineRoute<ReasonRequest, unknown, { projectId: string }>(router, deps, {
    ...action,
    path: '/projects/:projectId/reopen',
    operationId: 'projects.project.reopen',
    summary: 'Reopen a closing or closed project with a reason',
    permission: 'project.reopen',
    audit: 'project.reopen',
    workflow: { scope: 'project', action: 'reopen' },
    body: reasonRequestSchema,
    responses: { ...moved, 422: null },
    handler: async ({ body, params, req, res }) =>
      withEtag(
        res,
        await c.projectLifecycle.reopen(
          viewerOf(req),
          params.projectId,
          body.reason,
          req.get('if-match'),
        ),
      ),
  });

  return router;
}
