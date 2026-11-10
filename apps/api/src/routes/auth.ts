import {
  type InvitationAcceptRequest,
  invitationAcceptRequestSchema,
  invitationTokenSchema,
  loginRequestSchema,
  type LoginRequest,
  passwordChangeRequestSchema,
  type PasswordChangeRequest,
  passwordResetCompleteRequestSchema,
  type PasswordResetCompleteRequest,
  type LogoutRequest,
  logoutRequestSchema,
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
  passwordChangeRequired: z.boolean().optional(),
  blockMessage: z.string().nullable().optional(),
  volunteerId: z.uuid().nullable().optional(),
});

/** What the set-password page shows. */
const invitationView = z.object({
  displayName: z.string(),
  jobId: z.string(),
  minPasswordLength: z.number().int(),
  expiresAt: z.string(),
});

/**
 * Login, refresh, logout, current user and passwords (docs/architecture/AUTH.md, "Password rules"
 * to "Devices: listing, remote revocation and local-data wipe"; openapi tag auth).
 */
export function authRouter(
  deps: RouteDeps,
  c: Pick<Container, 'auth' | 'env' | 'registration' | 'registrationPhotos' | 'staffAccounts'>,
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
    summary: 'Log in with job ID, mobile or email and password; no OTP at login',
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

  defineRoute<LogoutRequest | undefined>(router, deps, {
    ...authOp,
    method: 'post',
    path: '/auth/logout',
    status: 204,
    operationId: 'auth.session.logout',
    summary: 'Revoke the current device session; the PWA wipes local data',
    permission: 'authenticated',
    allowPending: true,
    allowPasswordChange: true,
    audit: 'auth.logout',
    rateLimit: 'default',
    body: logoutRequestSchema.optional(),
    responses: { 204: null, 401: null, 422: null },
    handler: async ({ body, req, res }) => {
      await c.auth.logout(principalOf(req), body?.pendingCount);
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
    allowPasswordChange: true,
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
    allowPasswordChange: true,
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

  // The set-password link of an official created by the admin. The
  // token travels in the body, never in a URL, so no access log keeps it.
  defineRoute<{ token: string }>(router, deps, {
    ...authOp,
    method: 'post',
    path: '/auth/invitations/check',
    operationId: 'auth.invitation.check',
    summary: 'The name and job ID of an open set-password link (404 unknown, 410 used or expired)',
    permission: 'public',
    audit: 'none',
    rateLimit: 'public-form',
    body: z.strictObject({ token: invitationTokenSchema }),
    responses: { 200: invitationView, 404: null, 410: null, 422: null, 429: null },
    handler: ({ body, res }) => {
      res.setHeader('Cache-Control', 'no-store');
      return c.staffAccounts.inspect(body.token);
    },
  });

  defineRoute<InvitationAcceptRequest>(router, deps, {
    ...authOp,
    method: 'post',
    path: '/auth/invitations/accept',
    status: 204,
    operationId: 'auth.invitation.accept',
    summary:
      'Set the first password through the link; the account becomes active and logs in with the job ID',
    permission: 'public',
    audit: 'auth.invitation_accepted',
    rateLimit: 'public-form',
    body: invitationAcceptRequestSchema,
    responses: { 204: null, 404: null, 410: null, 422: null, 429: null },
    handler: ({ body }) => c.staffAccounts.accept(body),
  });

  // Registration before login (docs/architecture/AUTH.md, "Registration with two OTPs").
  defineRoute<RegistrationStartRequest>(router, deps, {
    ...authOp,
    method: 'post',
    path: '/auth/register/start',
    status: 201,
    operationId: 'auth.registration.start',
    summary:
      'Start a registration draft of a kind; nothing is sent, each contact is verified on its own',
    permission: 'public',
    audit: 'auth.register_started',
    rateLimit: 'registration',
    body: registrationStartRequestSchema,
    responses: { 201: null, 422: null, 429: null },
    handler: ({ body }) => c.registration.start(body),
  });

  defineRoute<OtpSendRequest>(router, deps, {
    ...authOp,
    method: 'post',
    path: '/auth/register/otp/send',
    status: 204,
    operationId: 'auth.registration.resendOtp',
    summary:
      'Send an OTP to one contact of the draft; a changed address clears that channel (dummy code in dev/test)',
    permission: 'public',
    audit: 'auth.otp_sent',
    rateLimit: 'otp-request',
    headers: [{ name: 'Accept-Language', required: false }],
    body: otpSendRequestSchema,
    responses: { 204: null, 404: null, 409: null, 410: null, 422: null, 429: null },
    handler: ({ body }) => c.registration.send(body, currentContext()?.locale ?? 'bn'),
  });

  defineRoute<OtpVerifyRequest>(router, deps, {
    ...authOp,
    method: 'post',
    path: '/auth/register/otp/verify',
    operationId: 'auth.registration.verifyOtp',
    summary:
      'Verify the OTP of one channel; once both are verified returns the draft token once; a contact of an existing account answers registration.account_exists only then',
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

  defineRoute<RegistrationSubmitRequest>(router, deps, {
    ...authOp,
    method: 'post',
    path: '/auth/register/submit',
    status: 201,
    operationId: 'auth.registration.submit',
    summary:
      "Submit the registration form of the draft's kind; the account is created in state pending, or a rejected never-approved account returns to pending",
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
        "Upload the photo or the NID photo of a verified draft (JPEG or PNG, at most 2 MB, metadata stripped, replaces the slot's earlier upload)",
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
