import {
  checkPassword,
  type LoginRequest,
  type Me,
  minPasswordLength,
  type PasswordChangeRequest,
  type PasswordResetCompleteRequest,
  type TokenPair,
} from '@css/shared/auth';
import type { Locale } from '@css/shared/i18n';
import type { Logger } from 'pino';
import { type AuditWriter } from '../audit/audit-writer';
import type { Env } from '../config/env';
import type { Clock } from '../core/clock';
import { type PrismaService, type Tx } from '../core/prisma.service';
import { currentContext } from '../core/request-context';
import { ApiError } from '../i18n/api-error';
import { UserLanguageService } from '../i18n/user-language.service';
import { afterFailure, minutesLeft, UnknownIdLockout } from '../auth/lockout';
import { normalizeLoginId } from '../auth/login-id';
import { identifierHash, type OtpTarget, type OtpService } from '../auth/otp.service';
import { type PasswordHasher } from '../auth/password-hasher';
import type { Principal } from '../auth/principal';
import { type SessionService } from '../auth/session.service';
import { type TokenService } from '../auth/token.service';

/** What the controller needs to answer a login or refresh: the body and the cookie values. */
export interface IssuedSession {
  pair: TokenPair;
  refreshToken: string;
  csrfToken: string;
  refreshExpiresAt: Date;
}

const accountSelect = {
  id: true,
  kind: true,
  mobile: true,
  email: true,
  passwordHash: true,
  state: true,
  language: true,
  failedLoginCount: true,
  lockedUntil: true,
} as const;

/**
 * Login, refresh, logout, the current user, password change and reset (AUTH.md 3 to 8). Errors
 * never tell whether a login id exists: unknown ids and wrong passwords share the error, the
 * timing class and the lockout behaviour.
 */
export class AuthService {
  private readonly unknownIds = new UnknownIdLockout();

  constructor(
    private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
    private readonly otp: OtpService,
    private readonly audit: AuditWriter,
    private readonly logger: Logger,
  ) {}

  /**
   * Account for a login id: staff by job ID, email or mobile, volunteers by mobile (AUTH.md 1,
   * DECISION_LOG D-097).
   */
  private findAccount(raw: string) {
    const id = normalizeLoginId(raw);
    const where =
      id.kind === 'email'
        ? { email: id.value, kind: 'staff' }
        : id.kind === 'job_id'
          ? { jobId: id.value, kind: 'staff' }
          : { mobile: id.value, kind: { in: ['staff', 'volunteer'] } };
    return this.prisma.user
      .findFirst({ where, select: accountSelect })
      .then((user) => ({ user, key: identifierHash(this.env, `${id.kind}:${id.value}`) }));
  }

  private hasGlobalScope(tx: Tx, userId: string): Promise<boolean> {
    return tx.userRole
      .count({ where: { userId, revokedAt: null, role: { globalScope: true } } })
      .then((n) => n > 0);
  }

  /** Audit entry written on its own, for failures that end the request with an error. */
  private auditAlone(entry: Parameters<AuditWriter['record']>[1]): Promise<void> {
    return this.prisma.$transaction((tx) => this.audit.record(tx, entry)).then(() => undefined);
  }

  async login(input: LoginRequest, ip: string | undefined): Promise<IssuedSession> {
    const now = this.clock.now();
    const { user, key } = await this.findAccount(input.loginId);
    const locked = user
      ? user.lockedUntil && user.lockedUntil > now
        ? user.lockedUntil
        : null
      : this.unknownIds.lockedUntil(key, now);
    if (locked) throw this.lockedError(locked, now);

    const ok = await this.hasher.verify(user?.passwordHash, input.password);
    if (!ok || !user) {
      let lockedUntil: Date | null;
      if (user) {
        const next = afterFailure(user.failedLoginCount, now);
        lockedUntil = next.lockedUntil;
        await this.prisma.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: user.id },
            data: { failedLoginCount: next.failedCount, lockedUntil: next.lockedUntil },
          });
          await this.audit.record(tx, {
            action: 'auth.login_failed',
            entityType: 'user',
            entityId: user.id,
            actorUserId: user.id,
            new: { loginIdHash: key },
          });
          if (next.lockedUntil)
            await this.audit.record(tx, {
              action: 'auth.locked',
              entityType: 'user',
              entityId: user.id,
              actorUserId: user.id,
              new: { lockedUntil: next.lockedUntil.toISOString() },
            });
        });
      } else {
        lockedUntil = this.unknownIds.fail(key, now);
        await this.auditAlone({
          action: 'auth.login_failed',
          entityType: 'user',
          entityId: null,
          new: { loginIdHash: key },
        });
      }
      if (lockedUntil) throw this.lockedError(lockedUntil, now);
      throw new ApiError('auth.invalid_credentials', 401);
    }

    if (user.state === 'blocked' || user.state === 'deactivated') {
      await this.auditAlone({
        action: 'auth.login_failed',
        entityType: 'user',
        entityId: user.id,
        actorUserId: user.id,
        reason: `account_${user.state}`,
      });
      throw new ApiError(
        user.state === 'blocked' ? 'auth.account_blocked' : 'auth.account_deactivated',
        403,
      );
    }

    const rehash =
      user.passwordHash && this.hasher.needsRehash(user.passwordHash)
        ? await this.hasher.hash(input.password)
        : undefined;
    const session = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: 0,
          lockedUntil: null,
          lastLoginAt: now,
          ...(rehash ? { passwordHash: rehash } : {}),
        },
      });
      const created = await this.sessions.create(tx, {
        userId: user.id,
        kind: user.kind,
        device: input.device,
        ip,
      });
      const ctx = currentContext();
      if (ctx) ctx.deviceSessionId = created.id;
      await this.audit.record(tx, {
        action: 'auth.login',
        entityType: 'device_session',
        entityId: created.id,
        actorUserId: user.id,
        new: {
          platform: input.device?.platform ?? null,
          appVersion: input.device?.appVersion ?? null,
        },
      });
      return created;
    });
    return this.issue(user.id, session.id, session.refreshToken, session.expiresAt);
  }

  private lockedError(until: Date, now: Date): ApiError {
    return new ApiError(
      'auth.account_locked',
      423,
      undefined,
      undefined,
      minutesLeft(until, now) * 60,
    );
  }

  /** Access token for a session plus the refresh and CSRF cookie values. */
  private async issue(
    userId: string,
    sessionId: string,
    refreshToken: string,
    refreshExpiresAt: Date,
  ): Promise<IssuedSession> {
    const me = await this.me(userId);
    const access = await this.tokens.signAccess({
      sub: userId,
      sid: sessionId,
      roles: me.roles,
      pv: me.permissionVersion,
    });
    return {
      pair: { accessToken: access.token, expiresAt: access.expiresAt.toISOString(), me },
      refreshToken,
      csrfToken: this.tokens.csrfToken(sessionId),
      refreshExpiresAt,
    };
  }

  async refresh(
    refreshToken: string | undefined,
    ip: string | undefined,
    csrf: { header?: string; cookie?: string },
  ): Promise<IssuedSession> {
    if (!refreshToken) throw new ApiError('auth.refresh_invalid', 401);
    const rotated = await this.sessions.rotate(refreshToken, ip, csrf);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: rotated.userId },
      select: { state: true },
    });
    if (user.state === 'deactivated') throw new ApiError('auth.session_revoked', 401);
    if (user.state === 'blocked') throw new ApiError('auth.account_blocked', 403);
    return this.issue(rotated.userId, rotated.sessionId, rotated.refreshToken, rotated.expiresAt);
  }

  async logout(principal: Principal): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.sessions.revoke(tx, principal.sessionId, {
        by: principal.userId,
        reason: 'logout',
      });
      await this.audit.record(tx, {
        action: 'auth.logout',
        entityType: 'device_session',
        entityId: principal.sessionId,
      });
    });
  }

  /** The signed-in user (openapi Me). */
  async me(userId: string): Promise<Me> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        kind: true,
        state: true,
        language: true,
        permissionVersion: true,
        passwordChangeRequired: true,
        userRolesUser: { where: { revokedAt: null }, select: { roleKey: true } },
        volunteersUser: { select: { id: true } },
      },
    });
    return {
      id: user.id,
      displayName: user.displayName,
      kind: user.kind as Me['kind'],
      state: user.state as Me['state'],
      roles: user.userRolesUser.map((r) => r.roleKey).sort(),
      language: user.language as Me['language'],
      permissionVersion: user.permissionVersion,
      passwordChangeRequired: user.passwordChangeRequired,
      blockMessage: null,
      volunteerId: user.volunteersUser?.id ?? null,
    };
  }

  private async assertPasswordRules(
    tx: Tx,
    user: { id: string },
    password: string,
    field: string,
  ): Promise<void> {
    const problems = checkPassword(password, {
      minLength: minPasswordLength(await this.hasGlobalScope(tx, user.id)),
    });
    if (problems.length)
      throw new ApiError(
        'validation.failed',
        422,
        undefined,
        problems.map((code) => ({ path: field, code })),
      );
  }

  /** Changes the own password; every other device session is revoked (AUTH.md 3). */
  async changePassword(principal: Principal, body: PasswordChangeRequest): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: principal.userId },
      select: { id: true, mobile: true, email: true, passwordHash: true },
    });
    if (!(await this.hasher.verify(user.passwordHash, body.currentPassword)))
      throw new ApiError('validation.failed', 422, undefined, [
        { path: 'currentPassword', code: 'auth.current_password_invalid' },
      ]);
    await this.assertPasswordRules(this.prisma, user, body.newPassword, 'newPassword');
    // the same password is no change: it would keep a short password that a new role asks to replace
    if (await this.hasher.verify(user.passwordHash, body.newPassword))
      throw new ApiError('validation.failed', 422, undefined, [
        { path: 'newPassword', code: 'auth.password_unchanged' },
      ]);
    const passwordHash = await this.hasher.hash(body.newPassword);
    await this.prisma.$transaction(async (tx) => {
      // the rules above hold the new password to the length of the role, so the flag ends here
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, passwordChangeRequired: false },
      });
      const revoked = await this.sessions.revokeAll(
        tx,
        user.id,
        { by: user.id, reason: 'password_changed' },
        principal.sessionId,
      );
      await this.audit.record(tx, {
        action: 'auth.password_changed',
        entityType: 'user',
        entityId: user.id,
        new: { otherSessionsRevoked: revoked.length },
      });
    });
    // the facts of the kept session still say "password due" until they are read again
    this.sessions.evictUser(user.id);
  }

  /**
   * A reset needs an account that is not deactivated and has a password: an official the admin
   * created sets the first password through the link (D-097).
   */
  private resettable<T extends { state: string; passwordHash: string | null }>(
    user: T | null,
  ): user is T {
    return Boolean(user && user.state !== 'deactivated' && user.passwordHash);
  }

  /** Where the reset code goes: volunteers by SMS, staff by email (SMS without email). */
  private resetTarget(user: {
    kind: string;
    mobile: string | null;
    email: string | null;
  }): OtpTarget | null {
    if (user.kind === 'staff' && user.email)
      return { purpose: 'password_reset', channel: 'email', address: user.email };
    if (user.mobile) return { purpose: 'password_reset', channel: 'sms', address: user.mobile };
    return null;
  }

  /**
   * Starts a password reset (AUTH.md 3): the same answer whether or not the login id exists;
   * a code is issued only for an account that is not deactivated.
   */
  async resetStart(loginId: string, locale: Locale): Promise<void> {
    const { user, key } = await this.findAccount(loginId);
    await this.auditAlone({
      action: 'auth.password_reset_started',
      entityType: 'user',
      entityId: user?.id ?? null,
      actorUserId: user?.id ?? null,
      new: { loginIdHash: key },
    });
    const target = this.resettable(user) ? this.resetTarget(user) : null;
    if (!user || !target) return;
    try {
      await this.otp.issue(target, {
        locale: (user.language as Locale | undefined) ?? locale,
        templateKey: 'otp_password_reset',
        createdBy: user.id,
      });
    } catch (error) {
      // The answer must not reveal the account: limits and delivery failures are only logged.
      this.logger.warn(
        { reason: error instanceof ApiError ? error.code : (error as Error).message },
        'password reset code not sent',
      );
    }
  }

  /** Completes a reset with the code; all device sessions are revoked and a lock is lifted. */
  async resetComplete(body: PasswordResetCompleteRequest): Promise<void> {
    const { user, key } = await this.findAccount(body.loginId);
    const target = this.resettable(user) ? this.resetTarget(user) : null;
    let otpId: string;
    try {
      if (!user || !target) throw new ApiError('otp.invalid', 422);
      otpId = await this.otp.check(target, body.code);
    } catch (error) {
      await this.auditAlone({
        action: 'auth.otp_failed',
        entityType: 'user',
        entityId: user?.id ?? null,
        actorUserId: user?.id ?? null,
        new: {
          loginIdHash: key,
          purpose: 'password_reset',
          code: error instanceof ApiError ? error.code : 'error',
        },
      });
      throw error;
    }
    await this.assertPasswordRules(this.prisma, user, body.newPassword, 'newPassword');
    const passwordHash = await this.hasher.hash(body.newPassword);
    await this.prisma.$transaction(async (tx) => {
      if (!(await this.otp.consume(tx, otpId))) throw new ApiError('otp.invalid', 422);
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          failedLoginCount: 0,
          lockedUntil: null,
          passwordChangeRequired: false,
        },
      });
      const revoked = await this.sessions.revokeAll(tx, user.id, {
        by: user.id,
        reason: 'password_reset',
      });
      await this.audit.record(tx, {
        action: 'auth.password_reset_completed',
        entityType: 'user',
        entityId: user.id,
        actorUserId: user.id,
        new: { sessionsRevoked: revoked.length },
      });
    });
  }

  /** Stores the own interface language (I18N 2, O-56) with its audit entry. */
  async setLanguage(principal: Principal, language: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findUniqueOrThrow({
        where: { id: principal.userId },
        select: { language: true },
      });
      const after = await new UserLanguageService(tx).setLanguage(principal.userId, language);
      await this.audit.record(tx, {
        action: 'user.language_changed',
        entityType: 'user',
        entityId: principal.userId,
        old: { language: before.language },
        new: { language: after },
      });
    });
  }
}
