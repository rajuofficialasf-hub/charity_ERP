import {
  loginRequestSchema,
  type LoginRequest,
  passwordChangeRequestSchema,
  type PasswordChangeRequest,
  passwordResetCompleteRequestSchema,
  type PasswordResetCompleteRequest,
  passwordResetStartRequestSchema,
  type PasswordResetStartRequest,
} from '@css/shared/auth';
import { Router, type Response } from 'express';
import {
  clearSessionCookies,
  CSRF_COOKIE,
  CSRF_HEADER,
  readCookies,
  REFRESH_COOKIE,
  setSessionCookies,
} from '../auth/cookies';
import { principalOf } from '../auth/principal';
import type { Container } from '../container';
import { currentContext } from '../core/request-context';
import { ApiError } from '../i18n/api-error';
import { defineRoute, type RouteDeps } from '../openapi/define-route';
import type { IssuedSession } from '../services/auth';

const authOp = { tag: 'auth', scope: 'self', idempotency: 'none' as const };

/** Login, refresh, logout, current user and passwords (AUTH.md 3 to 8, openapi tag auth). */
export function authRouter(deps: RouteDeps, c: Pick<Container, 'auth' | 'env'>): Router {
  const router = Router();
  const answer = (res: Response, issued: IssuedSession) => {
    setSessionCookies(res, c.env, issued.refreshToken, issued.csrfToken, issued.refreshExpiresAt);
    res.setHeader('Cache-Control', 'no-store');
    return issued.pair;
  };

  defineRoute<LoginRequest>(router, deps, {
    ...authOp,
    method: 'post',
    path: '/auth/login',
    operationId: 'auth.session.login',
    summary: 'Log in with mobile or email and password; no OTP at login (O-05)',
    permission: 'public',
    audit: 'auth.login',
    rateLimit: 'login',
    body: loginRequestSchema,
    headers: [{ name: 'X-Client-Version', required: false }],
    responses: { 200: null, 401: null, 403: null, 422: null, 423: null, 429: null },
    handler: async ({ body, req, res }) => answer(res, await c.auth.login(body, req.ip)),
  });

  defineRoute(router, deps, {
    ...authOp,
    method: 'post',
    path: '/auth/refresh',
    operationId: 'auth.session.refresh',
    summary: 'Rotate the refresh token and issue a new access token',
    permission: 'public',
    audit: 'none',
    rateLimit: 'refresh',
    cookieAuth: 'refreshCookie',
    headers: [{ name: 'X-CSRF-Token', required: true }],
    responses: { 200: null, 401: null, 403: null, 429: null },
    handler: async ({ req, res }) => {
      const cookies = readCookies(req);
      try {
        return answer(
          res,
          await c.auth.refresh(cookies.get(REFRESH_COOKIE), req.ip, {
            header: req.get(CSRF_HEADER),
            cookie: cookies.get(CSRF_COOKIE),
          }),
        );
      } catch (error) {
        // A dead session must not keep its cookies; a CSRF failure leaves them for a reload.
        if (error instanceof ApiError && error.code !== 'auth.csrf_failed')
          clearSessionCookies(res, c.env);
        throw error;
      }
    },
  });

  defineRoute(router, deps, {
    ...authOp,
    method: 'post',
    path: '/auth/logout',
    status: 204,
    operationId: 'auth.session.logout',
    summary: 'Revoke the current device session; the PWA wipes local data',
    permission: 'authenticated',
    allowPending: true,
    audit: 'auth.logout',
    rateLimit: 'default',
    responses: { 204: null, 401: null },
    handler: async ({ req, res }) => {
      await c.auth.logout(principalOf(req));
      clearSessionCookies(res, c.env);
    },
  });

  defineRoute(router, deps, {
    ...authOp,
    method: 'get',
    path: '/auth/me',
    operationId: 'auth.me.get',
    summary: 'Current user, roles, language and state (block message when blocked)',
    permission: 'authenticated',
    allowPending: true,
    audit: 'none',
    rateLimit: 'default',
    responses: { 200: null, 401: null },
    handler: ({ req }) => c.auth.me(principalOf(req).userId),
  });

  defineRoute<PasswordChangeRequest>(router, deps, {
    ...authOp,
    method: 'post',
    path: '/auth/password/change',
    status: 204,
    operationId: 'auth.password.change',
    summary: "Change own password; revokes the user's other device sessions",
    permission: 'authenticated',
    allowPending: true,
    audit: 'auth.password_changed',
    rateLimit: 'password-reset',
    body: passwordChangeRequestSchema,
    responses: { 204: null, 401: null, 422: null, 429: null },
    handler: ({ body, req }) => c.auth.changePassword(principalOf(req), body),
  });

  defineRoute<PasswordResetStartRequest>(router, deps, {
    ...authOp,
    method: 'post',
    path: '/auth/password/reset/start',
    status: 204,
    operationId: 'auth.password.resetStart',
    summary: 'Send a password-reset OTP; the response is the same whether or not the id exists',
    permission: 'public',
    audit: 'auth.password_reset_started',
    rateLimit: 'password-reset',
    body: passwordResetStartRequestSchema,
    responses: { 204: null, 422: null, 429: null },
    handler: ({ body }) => c.auth.resetStart(body.loginId, currentContext()?.locale ?? 'bn'),
  });

  defineRoute<PasswordResetCompleteRequest>(router, deps, {
    ...authOp,
    method: 'post',
    path: '/auth/password/reset/complete',
    status: 204,
    operationId: 'auth.password.resetComplete',
    summary: 'Set a new password with the OTP; revokes all device sessions',
    permission: 'public',
    audit: 'auth.password_reset_completed',
    rateLimit: 'otp-verify',
    body: passwordResetCompleteRequestSchema,
    responses: { 204: null, 422: null, 429: null },
    handler: ({ body }) => c.auth.resetComplete(body),
  });

  return router;
}
