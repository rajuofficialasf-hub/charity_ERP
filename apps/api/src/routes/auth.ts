import {
  loginRequestSchema,
  type LoginRequest,
  passwordChangeRequestSchema,
  type PasswordChangeRequest,
  passwordResetCompleteRequestSchema,
  type PasswordResetCompleteRequest,
  passwordResetStartRequestSchema,
  type PasswordResetStartRequest,
  USER_STATES,
} from '@css/shared/auth';
import {
  type OtpSendRequest,
  PHOTO_SLOTS,
  PHOTO_SOURCES,
  type PhotoSlot,
  type PhotoSource,
  otpSendRequestSchema,
  type OtpVerifyRequest,
  otpVerifyRequestSchema,
  type ReferenceLookupRequest,
  referenceLookupRequestSchema,
  REGISTRATION_TOKEN_HEADER,
  type RegistrationStartRequest,
  registrationStartRequestSchema,
  type RegistrationSubmitRequest,
  registrationSubmitRequestSchema,
} from '@css/shared/registration';
import { Router, type Response } from 'express';
import { z } from 'zod';
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
import { photoBody } from '../files/photo-body';
import { ApiError } from '../i18n/api-error';
import { defineRoute, type RouteDeps } from '../openapi/define-route';
import type { IssuedSession } from '../services/auth';

const authOp = { tag: 'auth', scope: 'self', idempotency: 'none' as const };

/** The contract's Me: the account as login and the registration submit return it. */
const meSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  kind: z.enum(['staff', 'volunteer']),
  state: z.enum(USER_STATES),
  roles: z.array(z.string()),
  language: z.enum(['bn', 'en']),
  permissionVersion: z.number().int(),
  blockMessage: z.string().nullable().optional(),
  volunteerId: z.uuid().nullable().optional(),
});

/** Login, refresh, logout, current user and passwords (AUTH.md 3 to 8, openapi tag auth). */
export function authRouter(
  deps: RouteDeps,
  c: Pick<Container, 'auth' | 'env' | 'registration' | 'registrationPhotos'>,
): Router {
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

  // Registration before login (AUTH.md 2; DECISION_LOG D-082, D-086, D-088).
  defineRoute<RegistrationStartRequest>(router, deps, {
    ...authOp,
    method: 'post',
    path: '/auth/register/start',
    status: 201,
    operationId: 'auth.registration.start',
    summary:
      'Start registration with mobile and email; sends two OTPs (dummy code in dev/test); an existing account is reported only after verification (D-086)',
    permission: 'public',
    audit: 'auth.register_started',
    rateLimit: 'registration',
    headers: [{ name: 'Accept-Language', required: false }],
    body: registrationStartRequestSchema,
    responses: { 201: null, 422: null, 429: null },
    handler: ({ body }) => c.registration.start(body, currentContext()?.locale ?? 'bn'),
  });

  defineRoute<OtpSendRequest>(router, deps, {
    ...authOp,
    method: 'post',
    path: '/auth/register/otp/send',
    status: 204,
    operationId: 'auth.registration.resendOtp',
    summary: 'Resend one OTP (mobile or email)',
    permission: 'public',
    audit: 'auth.otp_sent',
    rateLimit: 'otp-request',
    body: otpSendRequestSchema,
    responses: { 204: null, 404: null, 410: null, 422: null, 429: null },
    handler: ({ body }) => c.registration.resend(body, currentContext()?.locale ?? 'bn'),
  });

  defineRoute<OtpVerifyRequest>(router, deps, {
    ...authOp,
    method: 'post',
    path: '/auth/register/otp/verify',
    operationId: 'auth.registration.verifyOtp',
    summary:
      'Verify both OTPs; returns the draft token once and the form opens (BR-023, D-082); a contact of an existing account answers registration.account_exists (D-086)',
    permission: 'public',
    audit: 'auth.otp_verified',
    rateLimit: 'otp-verify',
    body: otpVerifyRequestSchema,
    responses: { 200: null, 404: null, 409: null, 410: null, 422: null, 429: null },
    handler: async ({ body, res }) => {
      res.setHeader('Cache-Control', 'no-store');
      return c.registration.verify(body);
    },
  });

  defineRoute<ReferenceLookupRequest>(router, deps, {
    ...authOp,
    method: 'post',
    path: '/auth/register/reference-lookup',
    operationId: 'auth.registration.referenceLookup',
    summary:
      'Name of the active volunteer whose NID a team member gives as reference (verified draft only; limited and audited, D-088)',
    permission: 'public',
    audit: 'auth.reference_lookup',
    rateLimit: 'reference-lookup',
    headers: [{ name: REGISTRATION_TOKEN_HEADER, required: true }],
    body: referenceLookupRequestSchema,
    responses: { 200: null, 401: null, 404: null, 410: null, 422: null, 429: null },
    handler: ({ body, req }) =>
      c.registration.referenceLookup(body, req.get(REGISTRATION_TOKEN_HEADER)),
  });

  defineRoute<RegistrationSubmitRequest>(router, deps, {
    ...authOp,
    method: 'post',
    path: '/auth/register/submit',
    status: 201,
    operationId: 'auth.registration.submit',
    summary:
      "Submit the registration form of the draft's kind; the account is created in state pending, or a rejected never-approved account returns to pending (D-086)",
    permission: 'public',
    audit: 'auth.registered',
    rateLimit: 'registration',
    sensitiveFields: ['volunteer.identity', 'volunteer.bank'],
    headers: [{ name: REGISTRATION_TOKEN_HEADER, required: true }],
    body: registrationSubmitRequestSchema,
    responses: { 201: meSchema, 401: null, 404: null, 409: null, 410: null, 422: null, 429: null },
    handler: async ({ body, req }) =>
      c.auth.me(await c.registration.submit(body, req.get(REGISTRATION_TOKEN_HEADER))),
  });

  defineRoute<unknown, { registrationId: string; source?: PhotoSource }, { slot: PhotoSlot }>(
    router,
    deps,
    {
      ...authOp,
      method: 'post',
      path: '/auth/register/photos/:slot',
      status: 201,
      operationId: 'auth.registration.uploadPhoto',
      summary:
        "Upload the photo or the NID photo of a verified draft (JPEG or PNG, at most 2 MB; metadata stripped; replaces the slot's earlier upload; D-087)",
      permission: 'public',
      audit: 'file.uploaded',
      rateLimit: 'public-form',
      sensitiveFields: ['volunteer.identity'],
      headers: [{ name: REGISTRATION_TOKEN_HEADER, required: true }],
      params: { slot: z.enum(PHOTO_SLOTS) },
      query: z.strictObject({
        registrationId: z.uuid(),
        source: z.enum(PHOTO_SOURCES).optional(),
      }),
      before: [photoBody],
      responses: {
        201: z.object({ fileId: z.uuid() }),
        401: null,
        404: null,
        410: null,
        413: null,
        415: null,
        422: null,
        429: null,
      },
      handler: ({ params, query, req }) =>
        c.registrationPhotos.forDraft(
          {
            registrationId: query.registrationId,
            slot: params.slot,
            source: query.source ?? 'gallery',
            body: req.body,
          },
          req.get(REGISTRATION_TOKEN_HEADER),
        ),
    },
  );

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
