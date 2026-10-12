import {
  reasonRequestSchema,
  type ReasonRequest,
  USER_STATES,
  userStateRequestSchema,
  type UserStateRequest,
} from '@css/shared/auth';
import { Router } from 'express';
import { z } from 'zod';
import { principalOf, scopeOf } from '../auth/principal';
import type { Container } from '../container';
import { etagOf } from '../core/etag';
import { pageQuery } from '../core/pagination';
import { ok, page } from '../http/send';
import { defineRoute, type RouteDeps } from '../openapi/define-route';
import { HANDOVER_ITEM_TYPES } from '../handover/providers';
import type { HandoverAssign } from '../services/handover';
import type { UserListQuery } from '../services/users';

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
const listQuery = pageQuery.omit({ sort: true }).extend({
  q: z.string().min(2).max(100).optional(),
  role: z.string().max(64).optional(),
  state: z.enum(USER_STATES).optional(),
});

const userOp = {
  tag: 'users',
  scope: 'user',
  idempotency: 'none' as const,
  rateLimit: 'default' as const,
};

/** User administration (AUTH.md 6, 7, 11; O-59 item 1 and 2; openapi tag users). */
export function usersRouter(deps: RouteDeps, c: Pick<Container, 'users' | 'handover'>): Router {
  const router = Router();

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
    summary: 'Clear a login lock with a reason (O-59)',
    permission: 'user.lock.clear',
    audit: 'auth.lock_cleared',
    params: { userId: uuid },
    body: reasonRequestSchema,
    responses: { 204: null, 401: null, 403: null, 404: null, 409: null, 422: null },
    handler: ({ body, params, req }) =>
      c.users.unlock(principalOf(req), scopeOf(req), params.userId, body.reason),
  });

  // The staff handover (BD-08, BR-034): the Department Head and the Monitoring Team only.
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
    summary: 'Pending work of an official by category, and the handover state (BD-08, BR-034)',
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
