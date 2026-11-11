import {
  type TemplateSave,
  templateSaveSchema,
  type TemplateUpdate,
  templateUpdateSchema,
} from '@css/shared/projects';
import { Router } from 'express';
import { z } from 'zod';
import { principalOf } from '../auth/principal.js';
import type { Container } from '../container.js';
import { ok } from '../http/send.js';
import { defineRoute, type RouteDeps } from '../openapi/define-route.js';

const uuid = z.uuid();
const templateView = z.object({
  id: uuid,
  name: z.object({ bn: z.string(), en: z.string() }),
  description: z.string().nullable(),
  workflowKey: z.string(),
  active: z.boolean(),
  version: z.number().int(),
  sourceProjectId: uuid.nullable(),
  updatedAt: z.string(),
  updatedByName: z.string().nullable(),
});
const listQuery = z.strictObject({ include: z.enum(['inactive']).optional() });

/**
 * The master project templates (openapi tag templates): the
 * library for everyone who creates projects, saving a project as a template, and renaming,
 * describing, deactivating and activating a template. Starting a project from a template is the
 * project creation with `source.kind` template.
 */
export function templatesRouter(deps: RouteDeps, c: Pick<Container, 'templates'>): Router {
  const router = Router();
  const op = {
    tag: 'templates',
    idempotency: 'none' as const,
    rateLimit: 'default' as const,
  };
  const read = { ...op, permission: 'project.create', scope: 'program', audit: 'none' };

  defineRoute<unknown, z.infer<typeof listQuery>>(router, deps, {
    ...read,
    method: 'get',
    path: '/templates',
    operationId: 'templates.template.list',
    summary: 'Master project templates of the organisation; the inactive ones only when asked',
    query: listQuery,
    responses: { 200: z.array(templateView), 401: null, 403: null, 422: null },
    handler: async ({ query }) => ok(await c.templates.list(query.include === 'inactive')),
  });

  defineRoute<unknown, unknown, { templateId: string }>(router, deps, {
    ...read,
    method: 'get',
    path: '/templates/:templateId',
    operationId: 'templates.template.get',
    summary: 'A template with its definition',
    params: { templateId: uuid },
    responses: {
      200: templateView.extend({ definition: z.unknown() }),
      401: null,
      403: null,
      404: null,
    },
    handler: async ({ params }) => ok(await c.templates.get(params.templateId)),
  });

  defineRoute<TemplateUpdate, unknown, { templateId: string }>(router, deps, {
    ...op,
    method: 'patch',
    path: '/templates/:templateId',
    operationId: 'templates.template.update',
    summary: 'Rename, describe, deactivate or activate a template (never deleted)',
    permission: 'project.template.manage',
    scope: 'global',
    audit: 'template.update',
    params: { templateId: uuid },
    body: templateUpdateSchema,
    responses: { 200: templateView, 401: null, 403: null, 404: null, 422: null },
    handler: async ({ body, params, req }) =>
      ok(await c.templates.update(principalOf(req), params.templateId, body)),
  });

  defineRoute<TemplateSave, unknown, { projectId: string }>(router, deps, {
    ...op,
    method: 'post',
    path: '/projects/:projectId/save-as-template',
    operationId: 'templates.template.saveFromProject',
    summary:
      "Save a project's setup as a new template, or onto an existing one (its version goes up)",
    permission: 'project.template.manage',
    scope: 'project',
    audit: 'template.save',
    params: { projectId: uuid },
    body: templateSaveSchema,
    responses: { 200: templateView, 401: null, 403: null, 404: null, 422: null },
    handler: async ({ body, params, req }) =>
      ok(await c.templates.saveFromProject(principalOf(req), params.projectId, body)),
  });

  return router;
}
