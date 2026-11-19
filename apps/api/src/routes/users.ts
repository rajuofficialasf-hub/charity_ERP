import {
  type OwnerTransferRequest,
  ownerTransferRequestSchema,
  type RoleChangeRequest,
  roleChangeRequestSchema,
  roleHistoryRowSchema,
} from '@css/shared/access';
import {
  reasonRequestSchema,
  type ReasonRequest,
  AFFILIATIONS,
  type InvitationRenewRequest,
  invitationRenewRequestSchema,
  type StaffCreateRequest,
  staffCreateRequestSchema,
  type StaffProfileRequest,
  staffProfileRequestSchema,
  USER_STATES,
  userStateRequestSchema,
  type UserStateRequest,
} from '@css/shared/auth';
import { Router } from 'express';
import { z } from 'zod';
import { principalOf, scopeOf } from '../auth/principal.js';
import type { Container } from '../container.js';
import { etagOf } from '../core/etag.js';
import { pageQuery } from '../core/pagination.js';
import { ok, page } from '../http/send.js';
import { defineRoute, type RouteDeps } from '../openapi/define-route.js';
import { HANDOVER_ITEM_TYPES } from '../handover/providers.js';
import type { HandoverAssign } from '../services/handover.js';
import type { UserListQuery } from '../services/users.js';

const uuid = z.uuid();

const handoverAssign = z.strictObject({
  toUserId: uuid,
  items: z
    .array(z.strictObject({ itemType: z.enum(HANDOVER_ITEM_TYPES), itemId: uuid }))
    .min(1)
    .max(500)
    .optional(),
});

const handoverView = z.object({
  id: uuid.nullable(),
  fromUserId: uuid,
  pending: z.array(
    z.object({
      category: z.enum(['reviews_approvals', 'projects', 'documents', 'issues', 'followups']),
      itemType: z.string(),
      itemId: uuid,
      projectId: uuid.nullable(),
      label: z.string(),
    }),
  ),
  scope: z.object({
    items: z.array(
      z.object({
        item_type: z.string(),
        item_id: uuid,
        project_id: uuid.optional(),
        new_owner_user_id: uuid,
        done_at: z.string().optional(),
      }),
    ),
    note: z.string().optional(),
  }),
  outstandingCount: z.number().int(),
  completedAt: z.string().nullable(),
});
/** The link of a new official, shown once so the admin can copy it. */
const invitationIssued = z.object({
  userId: uuid,
  link: z.string(),
  expiresAt: z.string(),
  emailed: z.boolean(),
});

const listQuery = pageQuery.omit({ sort: true }).extend({
  q: z.string().min(2).max(100).optional(),
  role: z.string().max(64).optional(),
  state: z.enum(USER_STATES).optional(),
  kind: z.enum(['staff', 'volunteer']).optional(),
  affiliation: z.enum(AFFILIATIONS).optional(),
  programId: uuid.optional(),
});

const userOp = {
  tag: 'users',
  scope: 'user',
  idempotency: 'none' as const,
  rateLimit: 'default' as const,
};

/**
 * User administration (docs/architecture/AUTH.md, "Lockout after failed attempts", "Account states"
 * and "Main Admin protection"; openapi tag users).
 */
export function usersRouter(
  deps: RouteDeps,
  c: Pick<
    Container,
    'users' | 'handover' | 'staffAccounts' | 'organogram' | 'projectsWork' | 'roleChanges'
  >,
): Router {
  const router = Router();

  // Officials are created by the admin with a set-password link.
  defineRoute<StaffCreateRequest>(router, deps, {
    ...userOp,
    method: 'post',
    path: '/users',
    status: 201,
    operationId: 'users.user.create',
    summary:
      'Create an official with job ID, role and place; the set-password link is emailed and returned once',
    permission: 'user.create',
    scope: 'global',
    audit: 'user.created',
    body: staffCreateRequestSchema,
    responses: { 201: invitationIssued, 401: null, 403: null, 409: null, 422: null },
    handler: ({ body, req, res }) => {
      res.setHeader('Cache-Control', 'no-store');
      return c.staffAccounts.create(principalOf(req), body);
    },
  });

  defineRoute<InvitationRenewRequest, unknown, { userId: string }>(router, deps, {
    ...userOp,
    method: 'post',
    path: '/users/:userId/invitation',
    status: 201,
    operationId: 'users.user.invite',
    summary:
      'A new set-password link for an official without a password, to a corrected email if given; the open link is revoked',
    permission: 'user.create',
    // held at GLOBAL scope only: a narrower grant never reaches another official's link
    scope: 'global',
    audit: 'user.invited',
    params: { userId: uuid },
    body: invitationRenewRequestSchema,
    responses: { 201: invitationIssued, 401: null, 403: null, 404: null, 409: null, 422: null },
    handler: ({ body, params, req, res }) => {
      res.setHeader('Cache-Control', 'no-store');
      return c.staffAccounts.reissue(principalOf(req), scopeOf(req), params.userId, body);
    },
  });

  defineRoute<unknown, UserListQuery>(router, deps, {
    ...userOp,
    method: 'get',
    path: '/users',
    operationId: 'users.user.list',
    summary: 'List users within scope (assignee pickers, permission panel)',
    permission: 'permission.view',
    audit: 'none',
    query: listQuery,
    responses: { 200: null, 401: null, 403: null, 422: null },
    handler: async ({ query, req }) => {
      const { rows, meta } = await c.users.list(query, principalOf(req), scopeOf(req));
      return page(rows, meta);
    },
  });

  // The department's organogram, computed from roles, programs and supervisors.
  defineRoute(router, deps, {
    ...userOp,
    method: 'get',
    path: '/organogram',
    operationId: 'users.organogram.get',
    summary:
      "The department's own staff by program and supervisor; other departments and partners are left out",
    permission: 'permission.view',
    audit: 'none',
    responses: { 200: null, 401: null, 403: null },
    handler: ({ req }) => c.organogram.build(scopeOf(req)),
  });

  defineRoute<unknown, unknown, { userId: string }>(router, deps, {
    ...userOp,
    method: 'get',
    path: '/users/:userId',
    operationId: 'users.user.get',
    summary: 'Get a user',
    permission: 'permission.view',
    audit: 'none',
    params: { userId: uuid },
    responses: { 200: null, 401: null, 403: null, 404: null },
    handler: async ({ params, req, res }) => {
      const { user, updatedAt } = await c.users.get(scopeOf(req), params.userId);
      const etag = etagOf(updatedAt);
      res.setHeader('ETag', etag);
      return ok(user, { etag });
    },
  });

  defineRoute<unknown, unknown, { userId: string }>(router, deps, {
    ...userOp,
    method: 'get',
    path: '/users/:userId/projects-work',
    operationId: 'users.user.projectsWork',
    summary: "An official's projects by year with the figures of their work there",
    permission: 'staff.work.view',
    audit: 'none',
    params: { userId: uuid },
    responses: { 200: null, 401: null, 403: null, 404: null, 503: null },
    handler: async ({ params, req }) =>
      ok(await c.projectsWork.ofOfficial(scopeOf(req), params.userId)),
  });

  defineRoute<StaffProfileRequest, unknown, { userId: string }>(router, deps, {
    ...userOp,
    method: 'put',
    path: '/users/:userId/profile',
    operationId: 'users.user.updateProfile',
    summary:
      "Replace an official's job ID, name, designation, affiliation, program, division and supervisor",
    permission: 'user.profile.manage',
    // held at GLOBAL scope only: the profile moves an official between programs and supervisors
    scope: 'global',
    audit: 'user.profile_changed',
    params: { userId: uuid },
    headers: [{ name: 'If-Match', required: true }],
    body: staffProfileRequestSchema,
    responses: { 200: null, 401: null, 403: null, 404: null, 409: null, 412: null, 422: null },
    handler: async ({ body, params, req, res }) => {
      await c.staffAccounts.updateProfile(
        principalOf(req),
        scopeOf(req),
        params.userId,
        body,
        req.get('if-match'),
      );
      const { user, updatedAt } = await c.users.get(scopeOf(req), params.userId);
      const etag = etagOf(updatedAt);
      res.setHeader('ETag', etag);
      return ok(user, { etag });
    },
  });

  defineRoute<UserStateRequest, unknown, { userId: string }>(router, deps, {
    ...userOp,
    method: 'post',
    path: '/users/:userId/state',
    operationId: 'users.user.changeState',
    summary: 'Change account state with a reason; deactivation needs a completed handover',
    permission: 'user.state.change',
    audit: 'auth.state_changed',
    params: { userId: uuid },
    headers: [{ name: 'If-Match', required: true }],
    body: userStateRequestSchema,
    responses: { 200: null, 401: null, 403: null, 404: null, 409: null, 412: null, 422: null },
    handler: async ({ body, params, req, res }) => {
      const { user, updatedAt } = await c.users.changeState(
        principalOf(req),
        scopeOf(req),
        params.userId,
        body,
        req.get('if-match'),
      );
      const etag = etagOf(updatedAt);
      res.setHeader('ETag', etag);
      return ok(user, { etag });
    },
  });

  defineRoute<ReasonRequest, unknown, { userId: string }>(router, deps, {
    ...userOp,
    method: 'post',
    path: '/users/:userId/unlock',
    status: 204,
    operationId: 'users.user.unlock',
    summary: 'Clear a login lock with a reason',
    permission: 'user.lock.clear',
    audit: 'auth.lock_cleared',
    params: { userId: uuid },
    body: reasonRequestSchema,
    responses: { 204: null, 401: null, 403: null, 404: null, 409: null, 422: null },
    handler: ({ body, params, req }) =>
      c.users.unlock(principalOf(req), scopeOf(req), params.userId, body.reason),
  });

  defineRoute<RoleChangeRequest, unknown, { userId: string }>(router, deps, {
    ...userOp,
    method: 'post',
    path: '/users/:userId/role',
    operationId: 'users.user.changeRole',
    summary:
      "Give an official another role in place of the present one, with a reason; the handover of the old role's work comes first",
    permission: 'user.role.change',
    audit: 'user.role_changed',
    params: { userId: uuid },
    headers: [{ name: 'If-Match', required: true }],
    body: roleChangeRequestSchema,
    responses: { 200: null, 401: null, 403: null, 404: null, 409: null, 412: null, 422: null },
    handler: async ({ body, params, req, res }) => {
      const { user, updatedAt } = await c.roleChanges.change(
        principalOf(req),
        scopeOf(req),
        params.userId,
        body,
        req.get('if-match'),
      );
      const etag = etagOf(updatedAt);
      res.setHeader('ETag', etag);
      return ok(user, { etag });
    },
  });

  defineRoute<unknown, unknown, { userId: string }>(router, deps, {
    ...userOp,
    method: 'get',
    path: '/users/:userId/roles',
    operationId: 'users.user.roleHistory',
    summary: 'The roles a user holds or held, the newest first, with who gave and who ended each',
    permission: 'permission.view',
    audit: 'none',
    params: { userId: uuid },
    responses: {
      200: z.object({ data: z.array(roleHistoryRowSchema), meta: z.object({}) }),
      401: null,
      403: null,
      404: null,
    },
    handler: async ({ params, req }) => {
      const rows = await c.roleChanges.history(scopeOf(req), params.userId);
      return page(rows, { nextCursor: null, prevCursor: null, limit: rows.length });
    },
  });

  defineRoute<OwnerTransferRequest>(router, deps, {
    tag: 'users',
    method: 'post',
    path: '/system-owner/transfer',
    status: 204,
    operationId: 'users.systemOwner.transfer',
    summary:
      'Hand the Main Admin flag to another active Admin; the Main Admin alone, confirming with the own password',
    permission: 'system.owner.transfer',
    scope: 'global',
    audit: 'auth.system_owner_transferred',
    idempotency: 'none',
    // counted per person, as a signed-in password change is
    rateLimit: 'password-reset',
    body: ownerTransferRequestSchema,
    responses: { 204: null, 401: null, 403: null, 422: null, 423: null, 429: null },
    handler: ({ body, req }) => c.roleChanges.transferOwner(principalOf(req), body),
  });

  // The staff handover: an Admin and the Department Head only.
  const handoverOp = {
    ...userOp,
    permission: 'user.handover',
    params: { userId: uuid },
  };

  defineRoute<unknown, unknown, { userId: string }>(router, deps, {
    ...handoverOp,
    method: 'get',
    path: '/users/:userId/handover',
    operationId: 'users.handover.get',
    summary: 'Pending work of an official by category, and the handover state',
    audit: 'none',
    responses: { 200: handoverView, 401: null, 403: null, 404: null },
    handler: ({ params, req }) => c.handover.get(scopeOf(req), params.userId),
  });

  defineRoute<HandoverAssign, unknown, { userId: string }>(router, deps, {
    ...handoverOp,
    method: 'post',
    path: '/users/:userId/handover',
    operationId: 'users.handover.assign',
    summary:
      'Reassign listed items to an active official of a fitting role (one by one or all); the first call starts the handover',
    audit: 'auth.handover_started',
    body: handoverAssign,
    responses: { 200: handoverView, 401: null, 403: null, 404: null, 409: null, 422: null },
    handler: ({ body, params, req }) =>
      c.handover.assign(principalOf(req), scopeOf(req), params.userId, body),
  });

  defineRoute<unknown, unknown, { userId: string }>(router, deps, {
    ...handoverOp,
    method: 'post',
    path: '/users/:userId/handover/complete',
    operationId: 'users.handover.complete',
    summary:
      'Complete the handover once every item is reassigned; deactivation stays the account-state change',
    audit: 'auth.handover_completed',
    responses: { 200: handoverView, 401: null, 403: null, 404: null, 409: null },
    handler: ({ params, req }) =>
      c.handover.complete(principalOf(req), scopeOf(req), params.userId),
  });

  return router;
}
