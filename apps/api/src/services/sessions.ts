import { type DeviceSession } from '@css/shared/auth';
import type { AuditWriter } from '../audit/audit-writer';
import type { Principal } from '../auth/principal';
import type { SessionService } from '../auth/session.service';
import type { PrismaService, Tx } from '../core/prisma.service';
import { ApiError } from '../i18n/api-error';

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
export class SessionsService {
  constructor(
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
  ) {}

  async listOwn(user: Principal): Promise<DeviceSession[]> {
    const rows = await this.sessions.list(user.userId);
    return rows.map((r) => view(r, user.sessionId));
  }

  /** One of the user's open sessions, or 404 (an unknown or already revoked id looks the same). */
  private async openSession(tx: Tx, userId: string, sessionId: string): Promise<{ id: string }> {
    const session = await tx.deviceSession.findFirst({
      where: { id: sessionId, userId, revokedAt: null },
      select: { id: true },
    });
    if (!session) throw new ApiError('permission.not_found', 404);
    return session;
  }

  async revokeOwn(user: Principal, sessionId: string): Promise<void> {
    if (sessionId === user.sessionId) throw new ApiError('session.use_logout', 409);
    await this.prisma.$transaction(async (tx) => {
      const session = await this.openSession(tx, user.userId, sessionId);
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

  async listUser(actor: Principal, userId: string): Promise<DeviceSession[]> {
    const user = await this.target(userId);
    const rows = await this.sessions.list(user.id);
    return rows.map((r) => view(r, user.id === actor.userId ? actor.sessionId : null));
  }

  async revokeUser(
    actor: Principal,
    userId: string,
    sessionId: string,
    reason: string,
  ): Promise<void> {
    const user = await this.target(userId);
    // The Main Admin's sessions are revoked only by the Main Admin (AUTH.md 11, BR-035).
    if (user.isSystemOwner && user.id !== actor.userId)
      throw new ApiError('user.system_owner_protected', 409);
    await this.prisma.$transaction(async (tx) => {
      const session = await this.openSession(tx, user.id, sessionId);
      await this.sessions.revoke(tx, session.id, { by: actor.userId, reason });
      await this.audit.record(tx, {
        action: 'auth.session_revoked_by_official',
        entityType: 'device_session',
        entityId: session.id,
        new: { userId: user.id },
        reason,
      });
    });
  }
}
