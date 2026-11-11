import {
  effectivePermissionSchema,
  permissionGrantRequestSchema,
  type PermissionGrantRequest,
  permissionGrantSchema,
  permissionSchema,
  projectGrantRequestSchema,
  type ProjectGrantRequest,
  roleSchema,
} from '@css/shared/access';
import { reasonRequestSchema, type ReasonRequest } from '@css/shared/auth';
import { Router } from 'express';
import { z, type ZodType } from 'zod';
import { principalOf, scopeOf } from '../auth/principal.js';
import type { Container } from '../container.js';
import { ok, page } from '../http/send.js';
import { defineRoute, type RouteDeps } from '../openapi/define-route.js';

const uuid = z.uuid();
const accessOp = {
  tag: 'access',
  idempotency: 'none' as const,
  rateLimit: 'default' as const,
};
const listOf = (item: ZodType) => z.object({ data: z.array(item), meta: z.object({}) });
const one = (item: ZodType) => z.object({ data: item, meta: z.object({}) });
/**
 * A list that is not paginated: the whole list in one page (docs/api/API_STANDARDS.md, "Pagination:
 * keyset cursors").
 */
const whole = <T>(rows: T[]) =>
  page(rows, { nextCursor: null, prevCursor: null, limit: rows.length });

/**
 * The permission panel and project grants (docs/security/RBAC.md, "Permission panel";
 * docs/ui/SCREENS.md "Permission panel"; openapi tag access).
 */
export function accessRouter(deps: RouteDeps, c: Pick<Container, 'accessPanel'>): Router {
  const router = Router();

  defineRoute(router, deps, {
    ...accessOp,
    method: 'get',
    path: '/roles',
    operationId: 'access.role.list',
    summary: 'List roles (seeded from permissions.yaml); not paginated',
    permission: 'permission.view',
    scope: 'global',
    audit: 'none',
    responses: { 200: listOf(roleSchema), 403: null },
    handler: () => whole(c.accessPanel.roles()),
  });

  defineRoute(router, deps, {
    ...accessOp,
    method: 'get',
    path: '/permissions',
    operationId: 'access.permission.list',
    summary: 'List permission names (seeded from permissions.yaml); not paginated',
    permission: 'permission.view',
    scope: 'global',
    audit: 'none',
    responses: { 200: listOf(permissionSchema), 403: null },
    handler: () => whole(c.accessPanel.permissions()),
  });

  defineRoute<unknown, { projectId?: string }, { userId: string }>(router, deps, {
    ...accessOp,
    method: 'get',
    path: '/users/:userId/effective-permissions',
    operationId: 'access.effectivePermission.list',
    summary: 'Effective permissions of a user with their source and scope',
    permission: 'permission.view',
    scope: 'user',
    audit: 'none',
    params: { userId: uuid },
    query: z.strictObject({ projectId: uuid.optional() }),
    responses: { 200: listOf(effectivePermissionSchema), 404: null },
    handler: async ({ params, query, req }) =>
      whole(await c.accessPanel.effective(scopeOf(req), params.userId, query.projectId)),
  });

  defineRoute<PermissionGrantRequest>(router, deps, {
    ...accessOp,
    method: 'post',
    path: '/permission-grants',
    status: 201,
    operationId: 'access.grant.create',
    summary:
      'Permission panel - grant or revoke a permission at a scope (Department Head, Monitoring Team)',
    permission: 'permission.panel.manage',
    scope: 'global',
    audit: 'permission_change',
    body: permissionGrantRequestSchema,
    responses: { 201: one(permissionGrantSchema), 403: null, 404: null, 409: null, 422: null },
    handler: async ({ body, req }) => ok(await c.accessPanel.grant(principalOf(req), body)),
  });

  defineRoute<ReasonRequest, unknown, { grantId: string }>(router, deps, {
    ...accessOp,
    method: 'post',
    path: '/permission-grants/:grantId/revoke',
    status: 204,
    operationId: 'access.grant.revoke',
    summary: 'End a permission-panel override',
    permission: 'permission.panel.manage',
    scope: 'global',
    audit: 'permission_change',
    params: { grantId: uuid },
    body: reasonRequestSchema,
    responses: { 204: null, 404: null },
    handler: ({ body, params, req }) =>
      c.accessPanel.endGrant(principalOf(req), params.grantId, body.reason),
  });

  defineRoute<ProjectGrantRequest, unknown, { projectId: string }>(router, deps, {
    ...accessOp,
    method: 'post',
    path: '/projects/:projectId/grants',
    operationId: 'access.projectGrant.set',
    summary:
      'Grant or replace "if RPM grants" extras for a staff member or volunteer on the project',
    permission: 'project.volunteer_grant.manage',
    scope: 'project',
    audit: 'permission_change',
    params: { projectId: uuid },
    body: projectGrantRequestSchema,
    responses: {
      200: listOf(effectivePermissionSchema),
      403: null,
      404: null,
      409: null,
      422: null,
    },
    handler: async ({ body, params, req }) =>
      whole(
        await c.accessPanel.setProjectGrants(
          principalOf(req),
          scopeOf(req),
          params.projectId,
          body,
        ),
      ),
  });

  return router;
}
