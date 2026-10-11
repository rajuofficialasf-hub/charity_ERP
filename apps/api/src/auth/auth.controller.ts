import { Controller, Get, HttpCode, Inject, Post, Put, Req, Res } from '@nestjs/common';
import {
  languageRequestSchema,
  type LanguageRequest,
  loginRequestSchema,
  type LoginRequest,
  passwordChangeRequestSchema,
  type PasswordChangeRequest,
  passwordResetCompleteRequestSchema,
  type PasswordResetCompleteRequest,
  passwordResetStartRequestSchema,
  type PasswordResetStartRequest,
} from '@css/shared/auth';
import type { Request, Response } from 'express';
import { ENV, type Env } from '../config/env';
import { currentContext } from '../core/request-context';
import { ZBody } from '../core/validation';
import { ApiError } from '../i18n/api-error';
import { ApiContract } from '../openapi/api-contract';
import { AuthService, type IssuedSession } from './auth.service';
import {
  clearSessionCookies,
  CSRF_COOKIE,
  CSRF_HEADER,
  readCookies,
  REFRESH_COOKIE,
  setSessionCookies,
} from './cookies';
import { CurrentUser, type Principal } from './principal';

const authOp = { tag: 'auth', scope: 'self', idempotency: 'none' as const };

/** Login, refresh, logout, current user and passwords (AUTH.md 3 to 8, openapi tag auth). */
@Controller()
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private answer(res: Response, issued: IssuedSession) {
    setSessionCookies(
      res,
      this.env,
      issued.refreshToken,
      issued.csrfToken,
      issued.refreshExpiresAt,
    );
    res.setHeader('Cache-Control', 'no-store');
    return issued.pair;
  }

  @Post('auth/login')
  @HttpCode(200)
  @ApiContract({
    ...authOp,
    operationId: 'auth.session.login',
    summary: 'Log in with mobile or email and password; no OTP at login (O-05)',
    permission: 'public',
    audit: 'auth.login',
    rateLimit: 'login',
    body: loginRequestSchema,
    headers: [{ name: 'X-Client-Version', required: false }],
    responses: { 200: null, 401: null, 403: null, 422: null, 423: null, 429: null },
  })
  async login(
    @ZBody(loginRequestSchema) body: LoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.answer(res, await this.auth.login(body, req.ip));
  }

  @Post('auth/refresh')
  @HttpCode(200)
  @ApiContract({
    ...authOp,
    operationId: 'auth.session.refresh',
    summary: 'Rotate the refresh token and issue a new access token',
    permission: 'public',
    audit: 'none',
    rateLimit: 'refresh',
    cookieAuth: 'refreshCookie',
    headers: [{ name: 'X-CSRF-Token', required: true }],
    responses: { 200: null, 401: null, 403: null, 429: null },
  })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookies = readCookies(req);
    try {
      return this.answer(
        res,
        await this.auth.refresh(cookies.get(REFRESH_COOKIE), req.ip, {
          header: req.get(CSRF_HEADER),
          cookie: cookies.get(CSRF_COOKIE),
        }),
      );
    } catch (error) {
      // A dead session must not keep its cookies; a CSRF failure leaves them for a reload.
      if (error instanceof ApiError && error.code !== 'auth.csrf_failed')
        clearSessionCookies(res, this.env);
      throw error;
    }
  }

  @Post('auth/logout')
  @HttpCode(204)
  @ApiContract({
    ...authOp,
    operationId: 'auth.session.logout',
    summary: 'Revoke the current device session; the PWA wipes local data',
    permission: 'authenticated',
    allowPending: true,
    audit: 'auth.logout',
    rateLimit: 'default',
    responses: { 204: null, 401: null },
  })
  async logout(@CurrentUser() user: Principal, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user);
    clearSessionCookies(res, this.env);
  }

  @Get('auth/me')
  @ApiContract({
    ...authOp,
    operationId: 'auth.me.get',
    summary: 'Current user, roles, language and state (block message when blocked)',
    permission: 'authenticated',
    allowPending: true,
    audit: 'none',
    rateLimit: 'default',
    responses: { 200: null, 401: null },
  })
  me(@CurrentUser() user: Principal) {
    return this.auth.me(user.userId);
  }

  @Post('auth/password/change')
  @HttpCode(204)
  @ApiContract({
    ...authOp,
    operationId: 'auth.password.change',
    summary: "Change own password; revokes the user's other device sessions",
    permission: 'authenticated',
    allowPending: true,
    audit: 'auth.password_changed',
    rateLimit: 'password-reset',
    body: passwordChangeRequestSchema,
    responses: { 204: null, 401: null, 422: null, 429: null },
  })
  async changePassword(
    @CurrentUser() user: Principal,
    @ZBody(passwordChangeRequestSchema) body: PasswordChangeRequest,
  ) {
    await this.auth.changePassword(user, body);
  }

  @Post('auth/password/reset/start')
  @HttpCode(204)
  @ApiContract({
    ...authOp,
    operationId: 'auth.password.resetStart',
    summary: 'Send a password-reset OTP; the response is the same whether or not the id exists',
    permission: 'public',
    audit: 'auth.password_reset_started',
    rateLimit: 'password-reset',
    body: passwordResetStartRequestSchema,
    responses: { 204: null, 422: null, 429: null },
  })
  async resetStart(@ZBody(passwordResetStartRequestSchema) body: PasswordResetStartRequest) {
    await this.auth.resetStart(body.loginId, currentContext()?.locale ?? 'bn');
  }

  @Post('auth/password/reset/complete')
  @HttpCode(204)
  @ApiContract({
    ...authOp,
    operationId: 'auth.password.resetComplete',
    summary: 'Set a new password with the OTP; revokes all device sessions',
    permission: 'public',
    audit: 'auth.password_reset_completed',
    rateLimit: 'otp-verify',
    body: passwordResetCompleteRequestSchema,
    responses: { 204: null, 422: null, 429: null },
  })
  async resetComplete(
    @ZBody(passwordResetCompleteRequestSchema) body: PasswordResetCompleteRequest,
  ) {
    await this.auth.resetComplete(body);
  }

  @Put('me/language')
  @HttpCode(204)
  @ApiContract({
    ...authOp,
    operationId: 'auth.me.language.set',
    summary: 'Set own interface language (users.language, I18N 2, O-56)',
    permission: 'authenticated',
    allowPending: true,
    audit: 'user.language_changed',
    rateLimit: 'default',
    body: languageRequestSchema,
    responses: { 204: null, 401: null, 422: null },
  })
  async setLanguage(
    @CurrentUser() user: Principal,
    @ZBody(languageRequestSchema) body: LanguageRequest,
  ) {
    await this.auth.setLanguage(user, body.language);
  }
}
