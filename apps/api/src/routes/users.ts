import {
  reasonRequestSchema,
  type ReasonRequest,
  USER_STATES,
  userStateRequestSchema,
  type UserStateRequest,
} from '@css/shared/auth';
import { Router } from 'express';
import { z } from 'zod';
import { principalOf } from '../auth/principal';
import type { Container } from '../container';
import { etagOf } from '../core/etag';
import { pageQuery } from '../core/pagination';
import { ok, page } from '../http/send';
import { defineRoute, type RouteDeps } from '../openapi/define-route';
import type { UserListQuery } from '../services/users';

const uuid = z.uuid();
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
export function usersRouter(deps: RouteDeps, c: Pick<Container, 'users'>): Router {
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
      const { rows, meta } = await c.users.list(query, principalOf(req));
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
    handler: async ({ params, res }) => {
      const { user, updatedAt } = await c.users.get(params.userId);
      res.setHeader('ETag', etagOf(updatedAt));
      return ok(user, { etag: etagOf(updatedAt) });
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
        params.userId,
        body,
        req.get('if-match'),
      );
      res.setHeader('ETag', etagOf(updatedAt));
      return ok(user, { etag: etagOf(updatedAt) });
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
      c.users.unlock(principalOf(req), params.userId, body.reason),
  });

  return router;
}
