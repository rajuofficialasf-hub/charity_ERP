import { Controller, Get, HttpCode, Inject, Post } from '@nestjs/common';
import { type DeviceSession, reasonRequestSchema, type ReasonRequest } from '@css/shared/auth';
import { z } from 'zod';
import { AuditWriter } from '../audit/audit-writer';
import { page } from '../core/envelope';
import { PrismaService } from '../core/prisma.service';
import { ZBody, ZParam } from '../core/validation';
import { ApiError } from '../i18n/api-error';
import { ApiContract } from '../openapi/api-contract';
import { CurrentUser, type Principal } from './principal';
import { SessionService } from './session.service';

const uuid = z.uuid();

type SessionRow = Awaited<ReturnType<SessionService['list']>>[number];

function view(row: SessionRow, currentId: string | null): DeviceSession {
  return {
    id: row.id,
    deviceName: row.deviceName,
    platform: row.platform,
    appVersion: row.appVersion,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    current: row.id === currentId,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

/** Device lists and remote revocation (AUTH.md 8, openapi tag sessions). */
@Controller()
export class SessionsController {
  constructor(
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
  ) {}

  @Get('sessions')
  @ApiContract({
    operationId: 'sessions.own.list',
    tag: 'sessions',
    summary: 'List own device sessions',
    permission: 'session.revoke_own',
    scope: 'self',
    allowPending: true,
    audit: 'none',
    idempotency: 'none',
    rateLimit: 'default',
    responses: { 200: null, 401: null },
  })
  async listOwn(@CurrentUser() user: Principal) {
    const rows = await this.sessions.list(user.userId);
    return page(
      rows.map((r) => view(r, user.sessionId)),
      { nextCursor: null, prevCursor: null, limit: rows.length },
    );
  }

  @Post('sessions/:sessionId/revoke')
  @HttpCode(204)
  @ApiContract({
    operationId: 'sessions.own.revoke',
    tag: 'sessions',
    summary: 'Revoke one of own device sessions (not the current one; use logout)',
    permission: 'session.revoke_own',
    scope: 'self',
    allowPending: true,
    audit: 'auth.session_revoked',
    idempotency: 'none',
    rateLimit: 'default',
    params: { sessionId: uuid },
    responses: { 204: null, 401: null, 404: null, 409: null },
  })
  async revokeOwn(@CurrentUser() user: Principal, @ZParam('sessionId', uuid) sessionId: string) {
    if (sessionId === user.sessionId) throw new ApiError('session.use_logout', 409);
    await this.prisma.$transaction(async (tx) => {
      const session = await tx.deviceSession.findFirst({
        where: { id: sessionId, userId: user.userId, revokedAt: null },
        select: { id: true },
      });
      if (!session) throw new ApiError('permission.not_found', 404);
      await this.sessions.revoke(tx, session.id, { by: user.userId, reason: 'revoked_by_user' });
      await this.audit.record(tx, {
        action: 'auth.session_revoked',
        entityType: 'device_session',
        entityId: session.id,
      });
    });
  }

  /** The target account, or 404 for unknown ids and the system actor (RBAC.md 8). */
  private async target(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, kind: { in: ['staff', 'volunteer'] } },
      select: { id: true, isSystemOwner: true },
    });
    if (!user) throw new ApiError('permission.not_found', 404);
    return user;
  }

  @Get('users/:userId/sessions')
  @ApiContract({
    operationId: 'sessions.user.list',
    tag: 'sessions',
    summary: "List a user's device sessions (lost phone)",
    permission: 'session.revoke_user',
    scope: 'user',
    audit: 'none',
    idempotency: 'none',
    rateLimit: 'default',
    params: { userId: uuid },
    responses: { 200: null, 401: null, 403: null, 404: null },
  })
  async listUser(@CurrentUser() actor: Principal, @ZParam('userId', uuid) userId: string) {
    const user = await this.target(userId);
    const rows = await this.sessions.list(user.id);
    return page(
      rows.map((r) => view(r, user.id === actor.userId ? actor.sessionId : null)),
      { nextCursor: null, prevCursor: null, limit: rows.length },
    );
  }

  @Post('users/:userId/sessions/:sessionId/revoke')
  @HttpCode(204)
  @ApiContract({
    operationId: 'sessions.user.revoke',
    tag: 'sessions',
    summary: "Revoke a user's device session with a reason; the device wipes local data",
    permission: 'session.revoke_user',
    scope: 'user',
    audit: 'auth.session_revoked_by_official',
    idempotency: 'none',
    rateLimit: 'default',
    params: { userId: uuid, sessionId: uuid },
    body: reasonRequestSchema,
    responses: { 204: null, 401: null, 403: null, 404: null, 409: null, 422: null },
  })
  async revokeUser(
    @CurrentUser() actor: Principal,
    @ZParam('userId', uuid) userId: string,
    @ZParam('sessionId', uuid) sessionId: string,
    @ZBody(reasonRequestSchema) body: ReasonRequest,
  ) {
    const user = await this.target(userId);
    // The Main Admin's sessions are revoked only by the Main Admin (AUTH.md 11, BR-035).
    if (user.isSystemOwner && user.id !== actor.userId)
      throw new ApiError('user.system_owner_protected', 409);
    await this.prisma.$transaction(async (tx) => {
      const session = await tx.deviceSession.findFirst({
        where: { id: sessionId, userId: user.id, revokedAt: null },
        select: { id: true },
      });
      if (!session) throw new ApiError('permission.not_found', 404);
      await this.sessions.revoke(tx, session.id, { by: actor.userId, reason: body.reason });
      await this.audit.record(tx, {
        action: 'auth.session_revoked_by_official',
        entityType: 'device_session',
        entityId: session.id,
        new: { userId: user.id },
        reason: body.reason,
      });
    });
  }
}
