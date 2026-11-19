import type {
  EffectivePermission,
  PermissionGrantRequest,
  ProjectGrantRequest,
  ScopeTypeName,
} from '@css/shared/access';
import { uuidv7 } from '@css/shared';
import { type EffectiveGrant, effectiveAccess, loadAccessFacts } from '../access/effective.js';
import {
  type AccessChange,
  changeRefusal,
  endRefusal,
  type HardRule,
  type RuleActor,
  rpmGrantable,
} from '../access/hard-rules.js';
import type { Scope } from '../access/scope.js';
import type { AccessService } from '../access/service.js';
import type { AuditWriter } from '../audit/audit-writer.js';
import type { PermissionVersionService } from '../auth/permission-version.service.js';
import type { Principal } from '../auth/principal.js';
import type { Clock } from '../core/clock.js';
import type { PrismaService, Tx } from '../core/prisma.service.js';
import { ApiError, type ApiErrorDetail } from '../i18n/api-error.js';
import type { AccountEvents } from '../notifications/account-events.js';
import type { ProjectEvents } from '../notifications/project-events.js';

/**
 * Rules of `permission.grant_refused` (docs/security/RBAC.md, "Permission panel"): the hard rules,
 * and the two of the project extras.
 */
export type RefusalRule = HardRule | 'not_held_by_granter' | 'not_rpm_grantable';

/**
 * The location level a scope reference must have (the location levels of
 * docs/database/DATABASE_SCHEMA.md, "Fixed system codes").
 */
const AREA_LEVEL: Partial<Record<ScopeTypeName, string>> = {
  REGION: 'division',
  DISTRICT: 'district',
  UPAZILA: 'upazila',
  UNION: 'union',
};
const UNBOUND: ReadonlySet<ScopeTypeName> = new Set(['GLOBAL', 'SELF', 'ASSIGNED']);

interface Target {
  id: string;
  kind: string;
  isSystemOwner: boolean;
  roles: string[];
}

const toRow = (g: EffectiveGrant): EffectivePermission => ({
  permission: g.permission,
  scopeType: g.scopeType,
  scopeRef: g.scopeRef,
  condition: g.condition,
  source: g.source,
  ...(g.grantId ? { grantId: g.grantId } : {}),
});

const byName = (a: EffectivePermission, b: EffectivePermission) =>
  a.permission.localeCompare(b.permission) || a.scopeType.localeCompare(b.scopeType);

/**
 * The permission panel and project grants (docs/ui/SCREENS.md "Permission panel"): reads of the
 * catalogue and of a user's effective permissions, panel overrides by an Admin and the Department
 * Head, and the RPM's "if RPM grants" extras on a project. Every change is asked against the hard
 * rules (`access/hard-rules.ts`), runs in one transaction, writes a `permission_change` audit
 * entry with the old and new effective grants and bumps the target's permission version
 * (docs/architecture/AUTH.md, "Role or permission change forces a session refresh"). Refusals are
 * audited as `permission_change_refused`.
 */
export class AccessPanelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditWriter,
    private readonly versions: PermissionVersionService,
    private readonly clock: Clock,
    private readonly accountEvents: AccountEvents,
    private readonly projectEvents: ProjectEvents,
  ) {}

  private get registry() {
    return this.access.registry;
  }

  roles() {
    return [...this.registry.roles.values()].map((r) => ({
      key: r.key,
      name: { bn: r.nameBn, en: r.nameEn },
      kind: r.kind,
      globalScope: r.globalScope,
    }));
  }

  permissions() {
    return [...this.registry.permissions.values()].map((p) => ({
      name: p.name,
      module: p.module,
      sensitive: p.sensitive,
      description: p.description,
    }));
  }

  /** Effective grants of a user, optionally only those that apply on one project. */
  private async grantsOf(userId: string, db: Tx = this.prisma, projectId?: string) {
    const { grants } = effectiveAccess(
      this.registry,
      await loadAccessFacts(db, userId),
      this.clock.now(),
    );
    return grants
      .filter((g) => !projectId || g.projectId === null || g.projectId === projectId)
      .map(toRow)
      .sort(byName);
  }

  /** A user inside the caller's scope and the user's effective permissions. */
  async effective(scope: Scope, userId: string, projectId?: string) {
    await this.access.findUser(scope, userId, { id: true });
    return this.grantsOf(userId, this.prisma, projectId);
  }

  private async target(db: Tx, userId: string): Promise<Target | null> {
    const user = await db.user.findFirst({
      where: { id: userId, kind: { in: ['staff', 'volunteer'] } },
      select: {
        id: true,
        kind: true,
        isSystemOwner: true,
        userRolesUser: { where: { revokedAt: null }, select: { roleKey: true } },
      },
    });
    return user
      ? {
          id: user.id,
          kind: user.kind,
          isSystemOwner: user.isSystemOwner,
          roles: user.userRolesUser.map((r) => r.roleKey),
        }
      : null;
  }

  /**
   * The person who asks for a change, with the roles they hold now: read inside the transaction
   * of the change, so a role that ended a moment ago gives nothing.
   */
  private async actorOf(db: Tx, actor: Principal): Promise<RuleActor> {
    return { id: actor.userId, roles: await this.access.rolesOf(actor.userId, db) };
  }

  /** The hard rule that refuses one change of the panel or of the project extras, or null. */
  private refusal(actor: RuleActor, target: Target, change: AccessChange): RefusalRule | null {
    return changeRefusal(this.registry, actor, target, change);
  }

  /**
   * Audits a refused change in its own transaction (the change itself wrote nothing), then answers
   * 409 for the Main Admin or 403 with the rule.
   */
  private async refuse(
    targetId: string,
    rule: RefusalRule | 'system_owner_protected',
    attempted: Record<string, string | string[] | null>,
    reason: string,
  ): Promise<never> {
    await this.prisma.$transaction((tx) =>
      this.audit.record(tx, {
        action: 'permission_change_refused',
        entityType: 'user',
        entityId: targetId,
        new: { ...attempted, rule },
        reason,
      }),
    );
    if (rule === 'system_owner_protected') throw new ApiError('user.system_owner_protected', 409);
    throw new ApiError('permission.grant_refused', 403, { rule });
  }

  /** Serializes permission changes of one user: role changes and version bumps lock the same row. */
  private async lockUser(tx: Tx, userId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
  }

  /** 422 details for a scope reference, a condition or an expiry that does not fit. */
  private async invalid(db: Tx, body: PermissionGrantRequest): Promise<ApiErrorDetail[]> {
    const details: ApiErrorDetail[] = [];
    if (!this.registry.permissions.has(body.permission))
      details.push({ path: 'permission', code: 'validation.option_unknown' });
    // a revoke takes the permission away as it stands: a condition would leave part of it
    if (body.condition !== undefined && body.effect === 'revoke')
      details.push({ path: 'condition', code: 'validation.unknown_parameter' });
    else if (body.condition !== undefined && !this.registry.conditions.has(body.condition))
      details.push({ path: 'condition', code: 'validation.option_unknown' });
    if (body.expiresAt !== undefined && new Date(body.expiresAt) <= this.clock.now())
      details.push({ path: 'expiresAt', code: 'validation.out_of_range' });
    const ref = body.scopeRef;
    if (UNBOUND.has(body.scopeType)) {
      if (ref !== undefined)
        details.push({ path: 'scopeRef', code: 'validation.unknown_parameter' });
      return details;
    }
    if (ref === undefined) {
      details.push({ path: 'scopeRef', code: 'validation.required' });
      return details;
    }
    const level = AREA_LEVEL[body.scopeType];
    const exists =
      body.scopeType === 'PROGRAM'
        ? await db.program.count({ where: { id: ref } })
        : body.scopeType === 'PROJECT'
          ? await db.project.count({ where: { id: ref } })
          : level
            ? await db.location.count({ where: { id: ref, level } })
            : 0;
    if (!exists) details.push({ path: 'scopeRef', code: 'validation.option_unknown' });
    return details;
  }

  /** Creates a panel override (grant or revoke) for a user (an Admin, the Department Head). */
  async grant(actor: Principal, body: PermissionGrantRequest) {
    const attempted = {
      permission: body.permission,
      effect: body.effect,
      scopeType: body.scopeType,
      scopeRef: body.scopeRef ?? null,
    };
    const id = uuidv7();
    const outcome = await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, body.userId);
      const target = await this.target(tx, body.userId);
      if (!target) throw new ApiError('permission.not_found', 404);
      // the Main Admin cannot be changed at all, before every other rule
      if (target.isSystemOwner) return { refused: 'system_owner_protected' as const };
      const details = await this.invalid(tx, body);
      if (details.length) throw new ApiError('validation.failed', 422, undefined, details);
      const rule = this.refusal(await this.actorOf(tx, actor), target, body);
      if (rule) return { refused: rule };
      const old = await this.grantsOf(target.id, tx);
      const created = await tx.userPermission.create({
        data: {
          id,
          userId: target.id,
          permissionName: body.permission,
          effect: body.effect,
          scopeType: body.scopeType,
          scopeRef: body.scopeRef ?? null,
          condition: body.condition ?? null,
          reason: body.reason,
          grantedBy: actor.userId,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
      await this.versions.bump(tx, target.id, {
        action: 'permission_change',
        old: { grants: old },
        new: { grants: await this.grantsOf(target.id, tx), override: id },
        reason: body.reason,
      });
      await this.accountEvents.permissionChanged(
        tx,
        target.id,
        body.effect === 'revoke' ? 'denied' : 'granted',
        body.permission,
        actor.userId,
      );
      return { refused: null, created };
    });
    if (outcome.refused) return this.refuse(body.userId, outcome.refused, attempted, body.reason);
    this.versions.settled(body.userId);
    const row = outcome.created;
    return {
      id: row.id,
      userId: row.userId,
      permission: row.permissionName,
      effect: row.effect,
      scopeType: row.scopeType,
      scopeRef: row.scopeRef,
      condition: row.condition,
      reason: row.reason,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      grantedBy: row.grantedBy,
      createdAt: row.createdAt.toISOString(),
      revokedAt: null,
    };
  }

  /** Ends a live panel override with a reason; an ended or unknown one answers 404. */
  async endGrant(actor: Principal, grantId: string, reason: string): Promise<void> {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const grant = await tx.userPermission.findFirst({
        where: { id: grantId, revokedAt: null },
        select: { id: true, userId: true, permissionName: true, effect: true },
      });
      if (!grant) throw new ApiError('permission.not_found', 404);
      await this.lockUser(tx, grant.userId);
      const target = await this.target(tx, grant.userId);
      if (target?.isSystemOwner)
        return { refused: 'system_owner_protected' as const, userId: grant.userId };
      const rule = endRefusal(
        await this.actorOf(tx, actor),
        { id: grant.userId },
        { permission: grant.permissionName, effect: grant.effect },
      );
      if (rule) return { refused: rule, userId: grant.userId };
      const old = await this.grantsOf(grant.userId, tx);
      // conditional: of two concurrent requests only the first ends the override
      const ended = await tx.userPermission.updateMany({
        where: { id: grant.id, revokedAt: null },
        data: { revokedAt: this.clock.now(), revokedBy: actor.userId, updatedBy: actor.userId },
      });
      if (ended.count === 0) throw new ApiError('permission.not_found', 404);
      await this.versions.bump(tx, grant.userId, {
        action: 'permission_change',
        old: { grants: old, override: grant.id },
        new: { grants: await this.grantsOf(grant.userId, tx) },
        reason,
      });
      await this.accountEvents.permissionChanged(
        tx,
        grant.userId,
        'ended',
        grant.permissionName,
        actor.userId,
      );
      return { refused: null, userId: grant.userId };
    });
    if (outcome.refused)
      await this.refuse(outcome.userId, outcome.refused, { override: grantId }, reason);
    this.versions.settled(outcome.userId);
  }

  /**
   * Sets the "if RPM grants" extras of a staff member or volunteer on one project (replaces the
   * list). The project is found inside the caller's scope and the target must work on it. Each
   * newly added permission must be one the catalogue lets an RPM grant to the target's own role
   * (the role of the staff place, or the volunteer's roles) and one the caller holds there; extras
   * already on the target may stay or be removed without that check.
   */
  async setProjectGrants(
    actor: Principal,
    scope: Scope,
    projectId: string,
    body: ProjectGrantRequest,
  ) {
    await this.access.findProject(scope, projectId, { id: true });
    // the target must also be a user the caller reaches (a shared project spans other regions)
    const userScope = await this.access.scopeOfUser(actor.userId, scope.permission, 'user');
    const permissions = [...new Set(body.permissions)];
    const outcome = await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, body.userId);
      const target = await this.target(tx, body.userId);
      if (target?.isSystemOwner)
        return { refused: 'system_owner_protected' as const, permission: null };
      const [staff, volunteer] = target
        ? await Promise.all([
            tx.projectStaff.findFirst({
              where: { projectId, userId: target.id, endedAt: null },
              select: { id: true, roleKey: true, extraPermissions: true },
            }),
            tx.projectVolunteer.findFirst({
              where: { projectId, endedAt: null, volunteer: { userId: target.id } },
              select: { id: true, extraPermissions: true },
            }),
          ])
        : [null, null];
      const reachable =
        target &&
        (await tx.user.count({
          where: { AND: [{ id: target.id }, this.access.userFilter(userScope)] },
        })) > 0;
      if (!target || !reachable || (!staff && !volunteer)) {
        this.access.denied(actor.userId, scope.permission, 'user');
        throw new ApiError('permission.not_found', 404);
      }
      if (permissions.some((p) => !this.registry.permissions.has(p)))
        throw new ApiError('validation.failed', 422, undefined, [
          { path: 'permissions', code: 'validation.option_unknown' },
        ]);
      // nobody changes their own extras, added or taken away
      if (target.id === actor.userId) return { refused: 'self_change' as const, permission: null };
      const existing = new Set((staff ?? volunteer)!.extraPermissions);
      const granter = await this.actorOf(tx, actor);
      // an extra counts for the role the place is held in, as the evaluation reads it
      const holderRoles = staff ? [staff.roleKey] : target.roles;
      for (const permission of permissions.filter((p) => !existing.has(p))) {
        const grantable = rpmGrantable(this.registry, holderRoles, permission);
        const rule =
          this.refusal(granter, target, { permission, effect: 'grant', scopeType: 'PROJECT' }) ??
          (grantable ? null : 'not_rpm_grantable') ??
          ((await this.access.holdsOnProject(actor.userId, permission, projectId, tx))
            ? null
            : 'not_held_by_granter');
        if (rule) return { refused: rule, permission };
      }
      const old = await this.grantsOf(target.id, tx, projectId);
      if (staff)
        await tx.projectStaff.update({
          where: { id: staff.id },
          data: { extraPermissions: permissions, updatedBy: actor.userId },
        });
      else
        await tx.projectVolunteer.update({
          where: { id: volunteer!.id },
          data: { extraPermissions: permissions, updatedBy: actor.userId },
        });
      await this.versions.bump(tx, target.id, {
        action: 'permission_change',
        old: { projectId, grants: old },
        new: { projectId, grants: await this.grantsOf(target.id, tx, projectId) },
        reason: body.reason,
      });
      await this.projectEvents.grantsChanged(
        tx,
        projectId,
        target.id,
        permissions.length,
        actor.userId,
      );
      return { refused: null, permission: null };
    });
    if (outcome.refused)
      await this.refuse(
        body.userId,
        outcome.refused,
        { permission: outcome.permission, projectId, effect: 'grant' },
        body.reason,
      );
    this.versions.settled(body.userId);
    return this.grantsOf(body.userId, this.prisma, projectId);
  }
}
