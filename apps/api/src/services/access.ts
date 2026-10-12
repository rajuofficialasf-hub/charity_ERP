import type {
  EffectivePermission,
  PermissionGrantRequest,
  ProjectGrantRequest,
} from '@css/shared/access';
import { uuidv7 } from '@css/shared';
import { type EffectiveGrant, effectiveAccess, loadAccessFacts } from '../access/effective';
import type { Scope } from '../access/scope';
import type { AccessService } from '../access/service';
import type { AuditWriter } from '../audit/audit-writer';
import type { PermissionVersionService } from '../auth/permission-version.service';
import type { Principal } from '../auth/principal';
import type { Clock } from '../core/clock';
import type { PrismaService, Tx } from '../core/prisma.service';
import { ApiError, type ApiErrorDetail } from '../i18n/api-error';

/** Rules of `permission.grant_refused` (D-078, RBAC.md 7). */
export type RefusalRule =
  | 'owner_transfer_only_head'
  | 'global_scope_protected'
  | 'sensitive_to_volunteer'
  | 'not_held_by_granter'
  | 'not_rpm_grantable';

const OWNER_TRANSFER = 'system.owner.transfer';
const IF_RPM_GRANTS = 'if_rpm_grants';
/** The location level a scope reference must have (DATABASE_SCHEMA L-location-level). */
const AREA_LEVEL: Record<string, string> = {
  REGION: 'division',
  DISTRICT: 'district',
  UPAZILA: 'upazila',
  UNION: 'union',
};
const UNBOUND = new Set(['GLOBAL', 'SELF', 'ASSIGNED']);

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
 * The permission panel and project grants (RBAC.md 7, SCR-062): reads of the catalogue and of a
 * user's effective permissions, panel overrides by the Department Head and the Monitoring Team,
 * and the RPM's "if RPM grants" extras on a project. Every change runs in one transaction, writes
 * a `permission_change` audit entry with the old and new effective grants and bumps the target's
 * permission version (BR-180, AUTH.md 9). Refusals are audited as `permission_change_refused`.
 */
export class AccessPanelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditWriter,
    private readonly versions: PermissionVersionService,
    private readonly clock: Clock,
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
   * The hard rules shared by the panel and project grants (RBAC.md 7): the owner transfer only
   * for the Department Head, no removal of the GLOBAL scope of a global role, and no sensitive
   * permission for a volunteer, whatever the catalogue says (BR-046, BR-183).
   */
  private refusal(
    target: Target,
    change: { permission: string; effect: 'grant' | 'revoke'; scopeType: string },
  ): RefusalRule | null {
    if (
      change.effect === 'grant' &&
      change.permission === OWNER_TRANSFER &&
      !target.roles.includes('department_head')
    )
      return 'owner_transfer_only_head';
    const globalRole = target.roles.some((r) => this.registry.roles.get(r)?.globalScope);
    if (change.effect === 'revoke' && change.scopeType === 'GLOBAL' && globalRole)
      return 'global_scope_protected';
    const official = target.roles.some((r) => this.registry.roles.get(r)?.kind === 'official');
    const sensitive = this.registry.permissions.get(change.permission)?.sensitive === true;
    if (change.effect === 'grant' && sensitive && (target.kind === 'volunteer' || !official))
      return 'sensitive_to_volunteer';
    return null;
  }

  /** Audits the refused change in its own transaction, then answers 403 with the rule. */
  private async refuse(
    targetId: string,
    rule: RefusalRule,
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
    throw new ApiError('permission.grant_refused', 403, { rule });
  }

  /** 422 details for a scope reference, a condition or an expiry that does not fit (RBAC.md 7). */
  private async invalid(db: Tx, body: PermissionGrantRequest): Promise<ApiErrorDetail[]> {
    const details: ApiErrorDetail[] = [];
    if (!this.registry.permissions.has(body.permission))
      details.push({ path: 'permission', code: 'validation.option_unknown' });
    if (body.condition !== undefined && !this.registry.conditions.has(body.condition))
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
    const exists =
      body.scopeType === 'PROGRAM'
        ? await db.program.count({ where: { id: ref } })
        : body.scopeType === 'PROJECT'
          ? await db.project.count({ where: { id: ref } })
          : await db.location.count({ where: { id: ref, level: AREA_LEVEL[body.scopeType] } });
    if (!exists) details.push({ path: 'scopeRef', code: 'validation.option_unknown' });
    return details;
  }

  /** Creates a panel override (grant or revoke) for any user (Department Head, Monitoring Team). */
  async grant(actor: Principal, body: PermissionGrantRequest) {
    const target = await this.target(this.prisma, body.userId);
    if (!target) throw new ApiError('permission.not_found', 404);
    // the Main Admin cannot be changed at all, before every other rule (BR-035, D-078)
    if (target.isSystemOwner) throw new ApiError('user.system_owner_protected', 409);
    const details = await this.invalid(this.prisma, body);
    if (details.length) throw new ApiError('validation.failed', 422, undefined, details);
    const rule = this.refusal(target, body);
    if (rule)
      await this.refuse(
        target.id,
        rule,
        {
          permission: body.permission,
          effect: body.effect,
          scopeType: body.scopeType,
          scopeRef: body.scopeRef ?? null,
        },
        body.reason,
      );
    const id = uuidv7();
    const row = await this.prisma.$transaction(async (tx) => {
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
      return created;
    });
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
    await this.prisma.$transaction(async (tx) => {
      const grant = await tx.userPermission.findFirst({
        where: { id: grantId, revokedAt: null },
        select: { id: true, userId: true, user: { select: { isSystemOwner: true } } },
      });
      if (!grant) throw new ApiError('permission.not_found', 404);
      if (grant.user.isSystemOwner) throw new ApiError('user.system_owner_protected', 409);
      const old = await this.grantsOf(grant.userId, tx);
      await tx.userPermission.update({
        where: { id: grant.id },
        data: { revokedAt: this.clock.now(), revokedBy: actor.userId, updatedBy: actor.userId },
      });
      await this.versions.bump(tx, grant.userId, {
        action: 'permission_change',
        old: { grants: old, override: grant.id },
        new: { grants: await this.grantsOf(grant.userId, tx) },
        reason,
      });
    });
  }

  /**
   * Sets the "if RPM grants" extras of a staff member or volunteer on one project (replaces the
   * list). The project is found inside the caller's scope, the target must work on it, and every
   * permission must be one the caller holds there and one the catalogue lets an RPM grant.
   */
  async setProjectGrants(
    actor: Principal,
    scope: Scope,
    projectId: string,
    body: ProjectGrantRequest,
  ) {
    await this.access.findProject(scope, projectId, { id: true });
    const target = await this.target(this.prisma, body.userId);
    const [staff, volunteer] = target
      ? await Promise.all([
          this.prisma.projectStaff.findFirst({
            where: { projectId, userId: target.id, endedAt: null },
            select: { id: true, extraPermissions: true },
          }),
          this.prisma.projectVolunteer.findFirst({
            where: { projectId, endedAt: null, volunteer: { userId: target.id } },
            select: { id: true, extraPermissions: true },
          }),
        ])
      : [null, null];
    if (!target || (!staff && !volunteer)) {
      this.access.denied(actor.userId, scope.permission, 'user');
      throw new ApiError('permission.not_found', 404);
    }
    if (target.isSystemOwner) throw new ApiError('user.system_owner_protected', 409);
    const unknown = body.permissions.filter((p) => !this.registry.permissions.has(p));
    if (unknown.length)
      throw new ApiError('validation.failed', 422, undefined, [
        { path: 'permissions', code: 'validation.option_unknown' },
      ]);
    const permissions = [...new Set(body.permissions)];
    const attempted = (permission: string) => ({ permission, projectId, effect: 'grant' });
    for (const permission of permissions) {
      const rule =
        this.refusal(target, { permission, effect: 'grant', scopeType: 'PROJECT' }) ??
        (this.registry.permissions
          .get(permission)!
          .defaults.some((d) => d.condition === IF_RPM_GRANTS)
          ? null
          : 'not_rpm_grantable') ??
        ((await this.access.holdsOnProject(actor.userId, permission, projectId))
          ? null
          : 'not_held_by_granter');
      if (rule) await this.refuse(target.id, rule, attempted(permission), body.reason);
    }
    await this.prisma.$transaction(async (tx) => {
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
    });
    return this.grantsOf(target.id, this.prisma, projectId);
  }
}
