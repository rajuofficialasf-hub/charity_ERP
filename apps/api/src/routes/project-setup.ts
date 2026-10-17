import { type ReasonRequest, reasonRequestSchema } from '@css/shared/auth';
import {
  type AreaCreate,
  areaCreateSchema,
  type CandidateQuery,
  candidateQuerySchema,
  type ComponentPatch,
  componentPatchSchema,
  type FundSources,
  fundSourcesSchema,
  type ProjectRules,
  projectRulesSchema,
  type StaffCreate,
  staffCreateSchema,
  type Syllabus,
  syllabusSchema,
} from '@css/shared/projects';
import { Router } from 'express';
import { z } from 'zod';
import { type AuthedRequest, principalOf, scopeOf } from '../auth/principal';
import type { Container } from '../container';
import { ok } from '../http/send';
import { defineRoute, type RouteDeps } from '../openapi/define-route';

const uuid = z.uuid();
const bilingual = z.object({ bn: z.string(), en: z.string() });
const componentView = z.object({
  componentKey: z.string(),
  enabled: z.boolean(),
  settings: z.unknown().optional(),
  etag: z.string().optional(),
});
const fundSourceView = z.object({
  source: z.string(),
  label: z.string().nullable(),
  amount: z.string(),
});
const areaView = z.object({
  id: uuid,
  locationId: uuid,
  level: z.string(),
  locationName: bilingual,
  rpmUserId: uuid,
  rpmName: z.string(),
});
const staffView = z.object({
  id: uuid,
  userId: uuid,
  displayName: z.string(),
  roleKey: z.string(),
  areaLocationId: uuid.nullable(),
  canView: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
  extraPermissions: z.array(z.string()),
  endedAt: z.string().nullable(),
});
const topicView = z.object({ id: uuid, title: bilingual });
const rulesView = z.object({
  version: z.number().int(),
  rules: z.record(z.string(), bilingual),
});
const candidateView = z.object({
  id: uuid,
  displayName: z.string(),
  designation: z.string().nullable(),
});

const viewerOf = (req: AuthedRequest) => ({ principal: principalOf(req), scope: scopeOf(req) });
const projectParams = { projectId: uuid };

/**
 * The parts of a project's setup saved on their own (openapi tag projects; DECISION_LOG D-095):
 * components, fund sources, areas, staff access, the dawah syllabus and the rules texts.
 */
export function projectSetupRouter(
  deps: RouteDeps,
  c: Pick<Container, 'projectSetup' | 'projectRules'>,
): Router {
  const router = Router();
  const op = {
    tag: 'projects',
    scope: 'project',
    idempotency: 'none' as const,
    rateLimit: 'default' as const,
  };
  const read = { ...op, permission: 'project.view', audit: 'none', params: projectParams };

  defineRoute<unknown, unknown, { projectId: string }>(router, deps, {
    ...read,
    method: 'get',
    path: '/projects/:projectId/components',
    operationId: 'projects.component.list',
    summary: 'Project components and settings (a volunteer: the enabled ones and the photo rule)',
    responses: { 200: z.array(componentView), 401: null, 403: null, 404: null },
    handler: async ({ params, req }) =>
      ok(await c.projectSetup.components(viewerOf(req), params.projectId)),
  });

  defineRoute<ComponentPatch, unknown, { projectId: string; componentKey: string }>(router, deps, {
    ...op,
    method: 'patch',
    path: '/projects/:projectId/components/:componentKey',
    operationId: 'projects.component.update',
    summary: 'Switch a component on or off and replace its settings (checked against its schema)',
    permission: 'project.configure',
    audit: 'project.component_change',
    params: { projectId: uuid, componentKey: z.string().regex(/^[a-z_]{2,64}$/) },
    headers: [{ name: 'If-Match', required: true }],
    body: componentPatchSchema,
    responses: {
      200: componentView,
      401: null,
      403: null,
      404: null,
      409: null,
      412: null,
      422: null,
    },
    handler: async ({ body, params, req }) =>
      ok(
        await c.projectSetup.updateComponent(
          viewerOf(req),
          params.projectId,
          params.componentKey,
          body,
          req.get('if-match'),
        ),
      ),
  });

  defineRoute<unknown, unknown, { projectId: string }>(router, deps, {
    ...read,
    method: 'get',
    path: '/projects/:projectId/fund-sources',
    operationId: 'projects.fundSource.list',
    summary: 'Fund-source tags of the budget (officials only)',
    responses: { 200: z.array(fundSourceView), 401: null, 403: null, 404: null },
    handler: async ({ params, req }) =>
      ok(await c.projectSetup.fundSources(viewerOf(req), params.projectId)),
  });

  defineRoute<FundSources, unknown, { projectId: string }>(router, deps, {
    ...op,
    method: 'patch',
    path: '/projects/:projectId/fund-sources',
    operationId: 'projects.fundSource.replace',
    summary: 'Replace the fund-source tags with their amounts',
    permission: 'fund_source.manage',
    audit: 'project.fund_source_change',
    params: projectParams,
    body: fundSourcesSchema,
    responses: {
      200: z.array(fundSourceView),
      401: null,
      403: null,
      404: null,
      409: null,
      422: null,
    },
    handler: async ({ body, params, req }) =>
      ok(await c.projectSetup.replaceFundSources(viewerOf(req), params.projectId, body)),
  });

  defineRoute<unknown, unknown, { projectId: string }>(router, deps, {
    ...read,
    method: 'get',
    path: '/projects/:projectId/areas',
    operationId: 'projects.area.list',
    summary: 'Project areas and their RPMs (officials only)',
    responses: { 200: z.array(areaView), 401: null, 403: null, 404: null },
    handler: async ({ params, req }) =>
      ok(await c.projectSetup.areas(viewerOf(req), params.projectId)),
  });

  defineRoute<AreaCreate, unknown, { projectId: string }>(router, deps, {
    ...op,
    method: 'post',
    path: '/projects/:projectId/areas',
    status: 201,
    operationId: 'projects.area.add',
    summary: 'Add a division or a district with its RPM (a district split among RPMs)',
    permission: 'project.area.assign',
    audit: 'project.area_assign',
    params: projectParams,
    body: areaCreateSchema,
    responses: { 201: z.array(areaView), 401: null, 403: null, 404: null, 409: null, 422: null },
    handler: async ({ body, params, req }) =>
      ok(await c.projectSetup.addArea(viewerOf(req), params.projectId, body)),
  });

  defineRoute<unknown, unknown, { areaId: string }>(router, deps, {
    ...op,
    method: 'post',
    path: '/project-areas/:areaId/remove',
    status: 204,
    operationId: 'projects.area.remove',
    summary: 'Remove an area and its RPM from the project',
    permission: 'project.area.assign',
    audit: 'project.area_assign',
    params: { areaId: uuid },
    responses: { 204: null, 401: null, 403: null, 404: null, 409: null, 422: null },
    handler: ({ params, req }) => c.projectSetup.removeArea(viewerOf(req), params.areaId),
  });

  defineRoute<unknown, unknown, { projectId: string }>(router, deps, {
    ...read,
    method: 'get',
    path: '/projects/:projectId/staff',
    operationId: 'projects.staff.list',
    summary: 'Staff on the project with their access (officials only)',
    responses: { 200: z.array(staffView), 401: null, 403: null, 404: null },
    handler: async ({ params, req }) =>
      ok(await c.projectSetup.staff(viewerOf(req), params.projectId)),
  });

  defineRoute<StaffCreate, unknown, { projectId: string }>(router, deps, {
    ...op,
    method: 'post',
    path: '/projects/:projectId/staff',
    status: 201,
    operationId: 'projects.staff.add',
    summary: 'Give a field official view, edit or delete access on the project',
    permission: 'project.staff_access.manage',
    audit: 'permission_change',
    params: projectParams,
    body: staffCreateSchema,
    responses: { 201: z.array(staffView), 401: null, 403: null, 404: null, 409: null, 422: null },
    handler: async ({ body, params, req }) =>
      ok(await c.projectSetup.addStaff(viewerOf(req), params.projectId, body)),
  });

  defineRoute<ReasonRequest, unknown, { assignmentId: string }>(router, deps, {
    ...op,
    method: 'post',
    path: '/project-staff/:assignmentId/end',
    status: 204,
    operationId: 'projects.staff.end',
    summary: "End a staff member's project access, with a reason",
    permission: 'project.staff_access.manage',
    audit: 'permission_change',
    params: { assignmentId: uuid },
    body: reasonRequestSchema,
    responses: { 204: null, 401: null, 403: null, 404: null, 409: null, 422: null },
    handler: ({ body, params, req }) =>
      c.projectSetup.endStaff(viewerOf(req), params.assignmentId, body.reason),
  });

  defineRoute<unknown, CandidateQuery, { projectId: string }>(router, deps, {
    ...op,
    method: 'get',
    path: '/projects/:projectId/candidates',
    operationId: 'projects.candidate.list',
    summary: 'Officials with a role, by name, to assign to the project (an RPM or field staff)',
    permission: 'project.staff_access.manage',
    audit: 'none',
    params: projectParams,
    query: candidateQuerySchema,
    responses: { 200: z.array(candidateView), 401: null, 403: null, 404: null, 422: null },
    handler: async ({ params, query, req }) =>
      ok(await c.projectSetup.candidates(viewerOf(req), params.projectId, query)),
  });

  defineRoute<unknown, unknown, { projectId: string }>(router, deps, {
    ...read,
    method: 'get',
    path: '/projects/:projectId/syllabus',
    operationId: 'projects.syllabus.list',
    summary: 'The dawah syllabus topics in order',
    responses: { 200: z.array(topicView), 401: null, 403: null, 404: null },
    handler: async ({ params, req }) =>
      ok(await c.projectSetup.syllabus(viewerOf(req), params.projectId)),
  });

  defineRoute<Syllabus, unknown, { projectId: string }>(router, deps, {
    ...op,
    method: 'put',
    path: '/projects/:projectId/syllabus',
    operationId: 'projects.syllabus.replace',
    summary: 'Replace the dawah syllabus topics in their order',
    permission: 'project.configure',
    audit: 'project.configure',
    params: projectParams,
    body: syllabusSchema,
    responses: { 200: z.array(topicView), 401: null, 403: null, 404: null, 409: null, 422: null },
    handler: async ({ body, params, req }) =>
      ok(await c.projectSetup.replaceSyllabus(viewerOf(req), params.projectId, body)),
  });

  defineRoute<unknown, unknown, { projectId: string }>(router, deps, {
    ...read,
    method: 'get',
    path: '/projects/:projectId/rules',
    operationId: 'projects.rules.get',
    summary:
      'The four rules texts and their version (officials; volunteers read them as their own)',
    responses: { 200: rulesView, 401: null, 403: null, 404: null },
    handler: async ({ params, req }) =>
      ok(await c.projectRules.get(viewerOf(req), params.projectId)),
  });

  defineRoute<ProjectRules, unknown, { projectId: string }>(router, deps, {
    ...op,
    method: 'put',
    path: '/projects/:projectId/rules',
    operationId: 'projects.rules.replace',
    summary: 'Save the rules texts as a new version; every acceptance goes back to pending',
    permission: 'project.configure',
    audit: 'project.configure',
    params: projectParams,
    body: projectRulesSchema,
    responses: { 200: rulesView, 401: null, 403: null, 404: null, 409: null, 422: null },
    handler: async ({ body, params, req }) =>
      ok(await c.projectRules.replace(viewerOf(req), params.projectId, body)),
  });

  return router;
}
