import type { UserState, UserStateRequest } from '@css/shared/auth';
import { type AuditWriter } from '../audit/audit-writer';
import { type PermissionVersionService } from '../auth/permission-version.service';
import type { Principal } from '../auth/principal';
import { type SessionService } from '../auth/session.service';
import type { Env } from '../config/env';
import type { Clock } from '../core/clock';
import { assertIfMatch } from '../core/etag';
import { type PrismaService } from '../core/prisma.service';
import {
  buildPage,
  decodeCursor,
  keysetWhere,
  orderBy,
  type PageQuery,
  parseSort,
  searchWhere,
} from '../core/pagination';
import { ApiError } from '../i18n/api-error';

export interface UserListQuery extends Omit<PageQuery, 'sort'> {
  q?: string;
  role?: string;
  state?: UserState;
}

/**
 * Account transitions this endpoint performs (AUTH.md 7, O-59): staff suspension and its lift,
 * deactivation after a completed handover, reactivation. Approval and rejection of pending
 * registrations (T1.9) and the volunteer blocklist (volunteer.block, T1.9) have their own flows.
 */
const TRANSITIONS: Record<string, readonly UserState[]> = {
  active: ['blocked', 'deactivated'],
  blocked: ['active', 'deactivated'],
  deactivated: ['active'],
  pending: [],
};

const ACCOUNT_KINDS = { in: ['staff', 'volunteer'] };

const userSelect = {
  id: true,
  displayName: true,
  kind: true,
  state: true,
  designation: true,
  mobile: true,
  email: true,
  homeProgramId: true,
  homeDivisionId: true,
  isSystemOwner: true,
  lastLoginAt: true,
  lockedUntil: true,
  updatedAt: true,
  userRolesUser: { where: { revokedAt: null }, select: { roleKey: true } },
} as const;

/** User administration (openapi tag users): list, view, state change, lock clearing. */
export class UsersService {
  constructor(
    private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly sessions: SessionService,
    private readonly versions: PermissionVersionService,
    private readonly clock: Clock,
  ) {}

  async list(query: UserListQuery, actor: Principal) {
    const sort = parseSort(
      undefined,
      ['displayName', 'id'],
      [{ field: 'displayName', direction: 'asc' }],
    );
    const binding = `users.list|${actor.userId}`;
    const cursor = query.cursor
      ? decodeCursor(this.env.CURSOR_SECRET, binding, query.cursor)
      : undefined;
    const direction = cursor?.d ?? 'next';
    const filter = {
      kind: ACCOUNT_KINDS,
      ...(query.state ? { state: query.state } : {}),
      ...(query.role ? { userRolesUser: { some: { roleKey: query.role, revokedAt: null } } } : {}),
      ...(searchWhere(query.q, ['displayName', 'mobile', 'email']) ?? {}),
    };
    const fetched = await this.prisma.user.findMany({
      where: cursor ? { AND: [filter, keysetWhere(sort, cursor)] } : filter,
      orderBy: orderBy(sort, direction),
      take: query.limit + 1,
      select: {
        id: true,
        displayName: true,
        kind: true,
        state: true,
        designation: true,
        userRolesUser: { where: { revokedAt: null }, select: { roleKey: true } },
      },
    });
    const total =
      query.include === 'total' ? await this.prisma.user.count({ where: filter }) : undefined;
    const { rows, meta } = buildPage(fetched, {
      limit: query.limit,
      sort,
      direction,
      hadCursor: Boolean(cursor),
      secret: this.env.CURSOR_SECRET,
      binding,
      total,
    });
    return {
      rows: rows.map(({ userRolesUser, ...u }) => ({
        ...u,
        roles: userRolesUser.map((r) => r.roleKey).sort(),
      })),
      meta,
    };
  }

  private async find(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, kind: ACCOUNT_KINDS },
      select: userSelect,
    });
    if (!user) throw new ApiError('permission.not_found', 404);
    return user;
  }

  /** The user and its ETag source (`updated_at`). */
  async get(userId: string) {
    const { userRolesUser, lockedUntil: _locked, updatedAt, ...user } = await this.find(userId);
    return {
      user: {
        ...user,
        roles: userRolesUser.map((r) => r.roleKey).sort(),
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      },
      updatedAt,
    };
  }

  /**
   * Changes the account state with a reason (AUTH.md 7, 10, 11): the Main Admin cannot be blocked
   * or deactivated; deactivation needs a completed handover; the change bumps the permission
   * version and a block or deactivation revokes every device session.
   */
  async changeState(
    actor: Principal,
    userId: string,
    body: UserStateRequest,
    ifMatch: string | undefined,
  ) {
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: { id: userId, kind: ACCOUNT_KINDS },
        select: { id: true, kind: true, state: true, isSystemOwner: true, updatedAt: true },
      });
      if (!user) throw new ApiError('permission.not_found', 404);
      assertIfMatch(ifMatch, user.updatedAt);
      if (user.isSystemOwner) throw new ApiError('user.system_owner_protected', 409);
      const allowed = TRANSITIONS[user.state] ?? [];
      const volunteerBlock =
        user.kind === 'volunteer' && (body.state === 'blocked' || user.state === 'blocked');
      if (user.id === actor.userId || !allowed.includes(body.state) || volunteerBlock)
        throw new ApiError('user.transition_not_allowed', 409);
      if (body.state === 'deactivated') {
        const handover = await tx.handover.findFirst({
          where: { fromUserId: user.id, completedAt: { not: null } },
          select: { id: true },
        });
        if (!handover) throw new ApiError('user.handover_required', 409);
      }
      await tx.user.update({
        where: { id: user.id },
        data: {
          state: body.state,
          deactivatedAt: body.state === 'deactivated' ? now : null,
          updatedBy: actor.userId,
        },
      });
      await this.versions.bump(tx, user.id, {
        action: 'auth.state_changed',
        old: { state: user.state },
        new: { state: body.state },
        reason: body.reason,
      });
      if (body.state !== 'active')
        await this.sessions.revokeAll(tx, user.id, {
          by: actor.userId,
          reason: `state_${body.state}`,
        });
    });
    this.sessions.evictUser(userId);
    return this.get(userId);
  }

  /** Clears a login lock with a reason (O-59 item 2, AUTH.md 6). */
  async unlock(actor: Principal, userId: string, reason: string): Promise<void> {
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: { id: userId, kind: ACCOUNT_KINDS },
        select: { id: true, lockedUntil: true },
      });
      if (!user) throw new ApiError('permission.not_found', 404);
      if (!user.lockedUntil || user.lockedUntil <= now) throw new ApiError('user.not_locked', 409);
      await tx.user.update({
        where: { id: user.id },
        data: { lockedUntil: null, failedLoginCount: 0, updatedBy: actor.userId },
      });
      await this.audit.record(tx, {
        action: 'auth.lock_cleared',
        entityType: 'user',
        entityId: user.id,
        old: { lockedUntil: user.lockedUntil.toISOString() },
        reason,
      });
    });
  }
}
