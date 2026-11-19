import type { Affiliation, UserState, UserStateRequest } from '@css/shared/auth';
import { isTopRole } from '../access/effective.js';
import type { Scope } from '../access/scope.js';
import type { AccessService } from '../access/service.js';
import { type AuditWriter } from '../audit/audit-writer.js';
import { type PermissionVersionService } from '../auth/permission-version.service.js';
import type { Principal } from '../auth/principal.js';
import { type SessionService } from '../auth/session.service.js';
import type { Env } from '../config/env.js';
import type { Clock } from '../core/clock.js';
import { assertIfMatch } from '../core/etag.js';
import { type PrismaService } from '../core/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  buildPage,
  decodeCursor,
  keysetWhere,
  orderBy,
  type PageQuery,
  parseSort,
  searchWhere,
} from '../core/pagination.js';
import { pendingHandoverItems } from '../handover/providers.js';
import { ApiError } from '../i18n/api-error.js';
import { staffPhotos } from './staff-photos.js';

export interface UserListQuery extends Omit<PageQuery, 'sort'> {
  q?: string;
  role?: string;
  state?: UserState;
  /** Staff or volunteers; an affiliation implies staff. */
  kind?: 'staff' | 'volunteer';
  affiliation?: Affiliation;
  /** The official's home program. */
  programId?: string;
}

/** The place of an official in the organisation; null for a volunteer. */
const placeSelect = {
  jobId: true,
  affiliation: true,
  affiliationUnit: true,
  homeProgramId: true,
  homeDivisionId: true,
  supervisorUserId: true,
  // only to tell whether the official still waits for the set-password link; never returned
  passwordHash: true,
} as const;

/** An official the admin created who has not used the set-password link yet. */
const awaitingPassword = (u: { kind: string; state: string; passwordHash: string | null }) =>
  u.kind === 'staff' && u.state === 'pending' && u.passwordHash === null;

/**
 * Account transitions this endpoint performs (docs/architecture/AUTH.md, "Account states"): staff
 * suspension and its lift, deactivation after a completed handover, reactivation. Approval and
 * rejection of pending registrations and the volunteer blocklist (volunteer.block) have their own
 * flows.
 */
const TRANSITIONS: Record<string, readonly UserState[]> = {
  active: ['blocked', 'deactivated'],
  blocked: ['active', 'deactivated'],
  deactivated: ['active'],
  pending: [],
};

const userSelect = {
  id: true,
  displayName: true,
  kind: true,
  state: true,
  designation: true,
  mobile: true,
  email: true,
  isSystemOwner: true,
  lastLoginAt: true,
  lockedUntil: true,
  updatedAt: true,
  ...placeSelect,
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
    private readonly access: AccessService,
  ) {}

  async list(query: UserListQuery, actor: Principal, scope: Scope) {
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
      AND: [this.access.userFilter(scope)],
      ...(query.state ? { state: query.state } : {}),
      ...(query.role ? { userRolesUser: { some: { roleKey: query.role, revokedAt: null } } } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.affiliation ? { affiliation: query.affiliation } : {}),
      ...(query.programId ? { homeProgramId: query.programId } : {}),
      ...(searchWhere(query.q, ['displayName', 'mobile', 'email', 'jobId']) ?? {}),
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
        ...placeSelect,
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
    const photos = await staffPhotos(
      this.prisma,
      rows.map((u) => u.id),
    );
    return {
      rows: rows.map(({ userRolesUser, passwordHash, ...u }) => ({
        ...u,
        photoFileId: photos.get(u.id) ?? null,
        roles: userRolesUser.map((r) => r.roleKey).sort(),
        awaitingPassword: awaitingPassword({ ...u, passwordHash }),
      })),
      meta,
    };
  }

  /** The user and its ETag source (`updated_at`), inside the caller's scope (404 outside). */
  async get(scope: Scope, userId: string) {
    return this.view(await this.access.findUser(scope, userId, userSelect));
  }

  /**
   * The same view by the id alone, for the answer of a change the caller has just made on a user
   * found inside their scope: the change itself (a new role) may have moved the person out of it.
   */
  async afterChange(userId: string) {
    return this.view(
      await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: userSelect }),
    );
  }

  private async view(row: Prisma.UserGetPayload<{ select: typeof userSelect }>) {
    const { userRolesUser, lockedUntil: _locked, passwordHash, updatedAt, ...user } = row;
    const photos = await staffPhotos(this.prisma, [user.id]);
    return {
      user: {
        ...user,
        photoFileId: photos.get(user.id) ?? null,
        roles: userRolesUser.map((r) => r.roleKey).sort(),
        awaitingPassword: awaitingPassword({ ...user, passwordHash }),
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      },
      updatedAt,
    };
  }

  /**
   * Changes the account state with a reason (docs/architecture/AUTH.md, "Account states", "Staff
   * handover before deactivation" and "Main Admin protection"): the Main Admin cannot be blocked or
   * deactivated; deactivation needs a completed handover; the change bumps the permission version
   * and a block or deactivation revokes every device session.
   */
  async changeState(
    actor: Principal,
    scope: Scope,
    userId: string,
    body: UserStateRequest,
    ifMatch: string | undefined,
  ) {
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      const user = await this.access.findUser(
        scope,
        userId,
        { id: true, kind: true, state: true, isSystemOwner: true, updatedAt: true },
        tx,
      );
      assertIfMatch(ifMatch, user.updatedAt);
      if (user.isSystemOwner) throw new ApiError('user.system_owner_protected', 409);
      // Only an Admin or the Department Head blocks an account or lifts a block, whatever
      // permission the caller holds. Deactivation is not covered by this rule.
      const blockOrUnblock =
        body.state === 'blocked' || (user.state === 'blocked' && body.state === 'active');
      if (blockOrUnblock && !isTopRole(actor.roles)) {
        this.access.denied(actor.userId, scope.permission, scope.entity);
        throw new ApiError('permission.denied', 403);
      }
      const allowed = TRANSITIONS[user.state] ?? [];
      const volunteerBlock =
        user.kind === 'volunteer' && (body.state === 'blocked' || user.state === 'blocked');
      if (user.id === actor.userId || !allowed.includes(body.state) || volunteerBlock)
        throw new ApiError('user.transition_not_allowed', 409);
      if (body.state === 'deactivated') {
        // the latest handover must be completed, and no work may have reached the official since
        // (a reactivation or a new assignment after the completion)
        const handover = await tx.handover.findFirst({
          where: { fromUserId: user.id },
          orderBy: { createdAt: 'desc' },
          select: { completedAt: true },
        });
        if (!handover?.completedAt) throw new ApiError('user.handover_required', 409);
        if ((await pendingHandoverItems(tx, user.id)).length)
          throw new ApiError('handover.items_outstanding', 409);
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
    return this.get(scope, userId);
  }

  /**
   * Clears a login lock with a reason (docs/architecture/AUTH.md, "Lockout after failed attempts").
   */
  async unlock(actor: Principal, scope: Scope, userId: string, reason: string): Promise<void> {
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      const user = await this.access.findUser(scope, userId, { id: true, lockedUntil: true }, tx);
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
