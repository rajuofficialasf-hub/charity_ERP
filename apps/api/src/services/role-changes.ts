import { uuidv7 } from '@css/shared';
import type { OwnerTransferRequest, RoleChangeRequest, RoleHistoryRow } from '@css/shared/access';
import { SCOPES } from '../access/schema.js';
import {
  ADMIN_ROLE,
  type HardRule,
  overrideStands,
  roleChangeRefusal,
  rpmGrantable,
} from '../access/hard-rules.js';
import type { Scope } from '../access/scope.js';
import type { AccessService } from '../access/service.js';
import type { AuditWriter } from '../audit/audit-writer.js';
import type { PermissionVersionService } from '../auth/permission-version.service.js';
import type { Principal } from '../auth/principal.js';
import type { Clock } from '../core/clock.js';
import { assertIfMatch } from '../core/etag.js';
import type { PrismaService, Tx } from '../core/prisma.service.js';
import { pendingHandoverItems } from '../handover/providers.js';
import { ApiError } from '../i18n/api-error.js';
import type { AccountEvents } from '../notifications/account-events.js';
import type { AuthService } from './auth.js';
import { assertHeadSeatFree, headSeatError } from './department-head.js';
import type { UsersService } from './users.js';

const scopeTypes: readonly string[] = SCOPES;

const invalid = (path: string) =>
  new ApiError('validation.failed', 422, undefined, [{ path, code: 'validation.option_unknown' }]);

/**
 * The change of an official's role and the hand-over of the Main Admin flag
 * (docs/security/RBAC.md, "Roles"; docs/architecture/AUTH.md, "Main Admin protection"). An
 * official holds one role: the change ends the old one and starts the new one in one transaction,
 * after the handover of the work only the old role may hold. It is asked against the hard rules
 * (`access/hard-rules.ts`), audited with both roles, told to the person, and it raises the
 * person's permission version so every session refreshes.
 */
export class RoleChangesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly audit: AuditWriter,
    private readonly access: AccessService,
    private readonly versions: PermissionVersionService,
    private readonly events: AccountEvents,
    private readonly users: UsersService,
    private readonly auth: AuthService,
  ) {}

  private get registry() {
    return this.access.registry;
  }

  /** Audits a refused change in a transaction of its own, then answers 403 with the rule. */
  private async refuse(
    userId: string,
    rule: HardRule,
    roleKey: string,
    reason: string,
  ): Promise<never> {
    await this.prisma.$transaction((tx) =>
      this.audit.record(tx, {
        action: 'permission_change_refused',
        entityType: 'user',
        entityId: userId,
        new: { role: roleKey, rule },
        reason,
      }),
    );
    throw new ApiError('permission.grant_refused', 403, { rule });
  }

  /** Gives an official another role in place of the present one, with a reason. */
  async change(
    actor: Principal,
    scope: Scope,
    userId: string,
    body: RoleChangeRequest,
    ifMatch: string | undefined,
  ) {
    const role = this.registry.roles.get(body.roleKey);
    if (!role || role.kind !== 'official') throw invalid('roleKey');
    const now = this.clock.now();
    let refused: HardRule | null;
    try {
      refused = await this.prisma.$transaction(async (tx) => {
        // serializes the changes of one person: the panel and the version bump lock the same row
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
        const user = await this.access.findUser(
          scope,
          userId,
          { id: true, kind: true, state: true, isSystemOwner: true, updatedAt: true },
          tx,
        );
        // a role is an official's; a volunteer's type is no role to change here
        if (user.kind !== 'staff') {
          this.access.denied(actor.userId, scope.permission, scope.entity);
          throw new ApiError('permission.not_found', 404);
        }
        assertIfMatch(ifMatch, user.updatedAt);
        if (user.isSystemOwner) throw new ApiError('user.system_owner_protected', 409);
        // a registration that waits is given its role by the approval, and a blocked or closed
        // account takes no new role: the change is for an official at work
        if (user.state !== 'active') throw new ApiError('user.role_change_inactive', 409);
        const held = await this.access.rolesOf(user.id, tx);
        const rule = roleChangeRefusal(
          this.registry,
          { id: actor.userId, roles: await this.access.rolesOf(actor.userId, tx) },
          { id: user.id, roles: held },
          role.key,
        );
        if (rule) return rule;
        if (held.length === 1 && held[0] === role.key)
          throw new ApiError('user.role_unchanged', 409);
        // the work only the old role may hold is handed over first, as before a deactivation
        const pending = await pendingHandoverItems(tx, user.id);
        if (pending.some((item) => item.requiredRole !== null && item.requiredRole !== role.key))
          throw new ApiError('handover.items_outstanding', 409);
        await assertHeadSeatFree(tx, role.key, user.id);

        await tx.userRole.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: now, revokedBy: actor.userId },
        });
        await tx.userRole.create({
          data: { id: uuidv7(), userId: user.id, roleKey: role.key, grantedBy: actor.userId },
        });
        const ended = await this.endWhatTheRoleMayNotHold(tx, actor, user.id, role.key, now);
        // a role with the whole reach asks for the longer password: the person chooses one at the
        // next sign-in (as the approval of an official's registration does)
        const wasGlobal = held.some((key) => this.registry.roles.get(key)?.globalScope);
        await tx.user.update({
          where: { id: user.id },
          data: {
            updatedBy: actor.userId,
            ...(role.globalScope && !wasGlobal ? { passwordChangeRequired: true } : {}),
          },
        });
        await this.versions.bump(tx, user.id, {
          action: 'user.role_changed',
          old: { roles: [...held].sort() },
          new: { role: role.key, ...ended },
          reason: body.reason,
        });
        await this.events.roleChanged(tx, user.id, role, actor.userId);
        return null;
      });
    } catch (error) {
      throw headSeatError(error);
    }
    if (refused) return this.refuse(userId, refused, role.key, body.reason);
    this.versions.settled(userId);
    return this.users.afterChange(userId);
  }

  /**
   * Ends what the new role could not have been given: the panel overrides the hard rules would
   * refuse for it (a revoke on a new Admin or Head, a GLOBAL revoke on a new member of the
   * Monitoring Team, the owner transfer of someone who is no Admin), and the project extras the
   * role of the place may not hold. Nothing is left to become live later.
   */
  private async endWhatTheRoleMayNotHold(
    tx: Tx,
    actor: Principal,
    userId: string,
    roleKey: string,
    now: Date,
  ): Promise<{ endedOverrides: string[]; endedExtras: number }> {
    const target = { id: userId, kind: 'staff', roles: [roleKey] };
    const overrides = await tx.userPermission.findMany({
      where: { userId, revokedAt: null },
      select: { id: true, permissionName: true, effect: true, scopeType: true },
    });
    const gone = overrides
      .filter(
        (o) =>
          (o.effect !== 'grant' && o.effect !== 'revoke') ||
          !scopeTypes.includes(o.scopeType) ||
          !overrideStands(this.registry, target, {
            permission: o.permissionName,
            effect: o.effect,
            scopeType: o.scopeType,
          }),
      )
      .map((o) => o.id);
    if (gone.length)
      await tx.userPermission.updateMany({
        where: { id: { in: gone }, revokedAt: null },
        data: { revokedAt: now, revokedBy: actor.userId, updatedBy: actor.userId },
      });
    const places = await tx.projectStaff.findMany({
      where: { userId, endedAt: null },
      select: { id: true, roleKey: true, extraPermissions: true },
    });
    let endedExtras = 0;
    for (const place of places) {
      const kept = place.extraPermissions.filter((permission) =>
        rpmGrantable(this.registry, [place.roleKey], permission),
      );
      if (kept.length === place.extraPermissions.length) continue;
      endedExtras += place.extraPermissions.length - kept.length;
      await tx.projectStaff.update({
        where: { id: place.id },
        data: { extraPermissions: kept, updatedBy: actor.userId },
      });
    }
    return { endedOverrides: gone, endedExtras };
  }

  /** Every role the person holds or held, the newest first, with who gave and who ended it. */
  async history(scope: Scope, userId: string): Promise<RoleHistoryRow[]> {
    await this.access.findUser(scope, userId, { id: true });
    const rows = await this.prisma.userRole.findMany({
      where: { userId },
      orderBy: [{ grantedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        roleKey: true,
        grantedAt: true,
        revokedAt: true,
        role: { select: { nameBn: true, nameEn: true } },
        grantedByRef: { select: { id: true, displayName: true, kind: true } },
        revokedByRef: { select: { id: true, displayName: true, kind: true } },
      },
    });
    // a role the seed or a job gave has no person behind it: the screen names the system itself
    const person = (u: { id: string; displayName: string; kind: string } | null) =>
      u && u.kind !== 'system' ? { id: u.id, displayName: u.displayName } : null;
    return rows.map((r) => ({
      id: r.id,
      roleKey: r.roleKey,
      name: { bn: r.role.nameBn, en: r.role.nameEn },
      grantedAt: r.grantedAt.toISOString(),
      grantedBy: person(r.grantedByRef),
      revokedAt: r.revokedAt?.toISOString() ?? null,
      revokedBy: person(r.revokedByRef),
    }));
  }

  /**
   * Hands the Main Admin flag to another active Admin. It is the Main Admin's own act, whatever
   * permission the caller holds: another Admin is refused, and the Main Admin confirms with the
   * own password, counted as a login is. Afterwards the earlier holder is an ordinary Admin.
   */
  async transferOwner(actor: Principal, body: OwnerTransferRequest): Promise<void> {
    const refuse = async (): Promise<never> => {
      await this.prisma.$transaction((tx) =>
        this.audit.record(tx, {
          action: 'permission_change_refused',
          entityType: 'user',
          entityId: actor.userId,
          new: { rule: 'system_owner_only', toUserId: body.toUserId },
        }),
      );
      this.access.denied(actor.userId, 'system.owner.transfer', 'global');
      throw new ApiError('permission.denied', 403);
    };
    const holder = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { isSystemOwner: true },
    });
    if (!holder?.isSystemOwner) await refuse();
    await this.auth.confirmPassword(actor.userId, body.password, 'system_owner_transfer');
    if (body.toUserId === actor.userId) throw invalid('toUserId');

    const moved = await this.prisma.$transaction(async (tx) => {
      // both rows in one order, so two transfers never wait on each other
      for (const id of [actor.userId, body.toUserId].sort())
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
      const from = await tx.user.findUnique({
        where: { id: actor.userId },
        select: { displayName: true, isSystemOwner: true },
      });
      if (!from?.isSystemOwner) return false;
      const to = await tx.user.findFirst({
        where: {
          id: body.toUserId,
          kind: 'staff',
          state: 'active',
          userRolesUser: { some: { roleKey: ADMIN_ROLE, revokedAt: null } },
        },
        select: { id: true, displayName: true },
      });
      if (!to) throw invalid('toUserId');
      // the flag leaves before it lands: one row holds it at a time, and the database refuses a
      // commit without a holder
      await tx.user.update({
        where: { id: actor.userId },
        data: { isSystemOwner: false, updatedBy: actor.userId },
      });
      await tx.user.update({
        where: { id: to.id },
        data: { isSystemOwner: true, updatedBy: actor.userId },
      });
      await this.versions.bump(tx, actor.userId, {
        action: 'auth.system_owner_transferred',
        new: { toUserId: to.id },
      });
      await this.versions.bump(tx, to.id, {
        action: 'auth.system_owner_received',
        new: { fromUserId: actor.userId },
      });
      await this.events.ownerTransferred(
        tx,
        { id: actor.userId, name: from.displayName },
        { id: to.id, name: to.displayName },
      );
      return true;
    });
    if (!moved) await refuse();
    this.versions.settled(actor.userId, body.toUserId);
  }
}
