import { reasonRequestSchema, type ReasonRequest } from '@css/shared/auth';
import { Router } from 'express';
import { z } from 'zod';
import { principalOf } from '../auth/principal';
import type { Container } from '../container';
import { page } from '../http/send';
import { defineRoute, type RouteDeps } from '../openapi/define-route';

const uuid = z.uuid();
const sessionOp = { tag: 'sessions', idempotency: 'none' as const, rateLimit: 'default' as const };

/** Device lists and remote revocation (AUTH.md 8, openapi tag sessions). */
export function sessionsRouter(deps: RouteDeps, c: Pick<Container, 'deviceSessions'>): Router {
  const router = Router();
  const list = (rows: unknown[]) =>
    page(rows, { nextCursor: null, prevCursor: null, limit: rows.length });

  defineRoute(router, deps, {
    ...sessionOp,
    method: 'get',
    path: '/sessions',
    operationId: 'sessions.own.list',
    summary: 'List own device sessions',
    permission: 'session.revoke_own',
    scope: 'self',
    allowPending: true,
    audit: 'none',
    responses: { 200: null, 401: null },
    handler: async ({ req }) => list(await c.deviceSessions.listOwn(principalOf(req))),
  });

  defineRoute<unknown, unknown, { sessionId: string }>(router, deps, {
    ...sessionOp,
    method: 'post',
    path: '/sessions/:sessionId/revoke',
    status: 204,
    operationId: 'sessions.own.revoke',
    summary: 'Revoke one of own device sessions (not the current one; use logout)',
    permission: 'session.revoke_own',
    scope: 'self',
    allowPending: true,
    audit: 'auth.session_revoked',
    params: { sessionId: uuid },
    responses: { 204: null, 401: null, 404: null, 409: null },
    handler: ({ params, req }) => c.deviceSessions.revokeOwn(principalOf(req), params.sessionId),
  });

  defineRoute<unknown, unknown, { userId: string }>(router, deps, {
    ...sessionOp,
    method: 'get',
    path: '/users/:userId/sessions',
    operationId: 'sessions.user.list',
    summary: "List a user's device sessions (lost phone)",
    permission: 'session.revoke_user',
    scope: 'user',
    audit: 'none',
    params: { userId: uuid },
    responses: { 200: null, 401: null, 403: null, 404: null },
    handler: async ({ params, req }) =>
      list(await c.deviceSessions.listUser(principalOf(req), params.userId)),
  });

  defineRoute<ReasonRequest, unknown, { userId: string; sessionId: string }>(router, deps, {
    ...sessionOp,
    method: 'post',
    path: '/users/:userId/sessions/:sessionId/revoke',
    status: 204,
    operationId: 'sessions.user.revoke',
    summary: "Revoke a user's device session with a reason; the device wipes local data",
    permission: 'session.revoke_user',
    scope: 'user',
    audit: 'auth.session_revoked_by_official',
    params: { userId: uuid, sessionId: uuid },
    body: reasonRequestSchema,
    responses: { 204: null, 401: null, 403: null, 404: null, 409: null, 422: null },
    handler: ({ body, params, req }) =>
      c.deviceSessions.revokeUser(principalOf(req), params.userId, params.sessionId, body.reason),
  });

  return router;
}
