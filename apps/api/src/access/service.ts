import type { Logger } from 'pino';
import type { Principal } from '../auth/principal';
import type { Clock } from '../core/clock';
import type { PrismaService, Tx } from '../core/prisma.service';
import { currentContext } from '../core/request-context';
import type { Prisma } from '../generated/prisma/client';
import { ApiError } from '../i18n/api-error';
import { type EffectiveAccess, effectiveAccess, loadAccessFacts } from './effective';
import { visibleFieldClasses } from './field-mask';
import type { AccessRegistry } from './registry';
import {
  applicationWhere,
  beneficiaryWhere,
  holdsPermission,
  makeScope,
  NO_INSTANCES,
  projectWhere,
  resolveInstances,
  type Scope,
  userWhere,
  volunteerWhere,
} from './scope';

const ACCOUNT_KINDS = { in: ['staff', 'volunteer'] };

/** The entities a per-record decision can be made for. */
export type RecordEntity = 'user' | 'volunteer' | 'beneficiary';

/** One record an access decision is about, by the id its entity uses. */
export interface RecordTarget {
  userId?: string;
  volunteerId?: string;
  beneficiaryId?: string;
  applicationId?: string;
}

export interface RequestAccess extends EffectiveAccess {
  fieldClasses: ReadonlySet<string>;
}

/**
 * The access decisions of a request (RBAC.md 8): the caller's effective access, the
 * scope of the route's permission for its entity, and the scoped data access of the entities that
 * exist so far. Every refusal is logged as a `permission_denied` event.
 */
export class AccessService {
  constructor(
    readonly registry: AccessRegistry,
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  /**
   * The effective grants and instance revokes of a user, computed per request, and the protected
   * field classes the user's roles (account and project roles) may see.
   */
  async load(userId: string, db: Tx = this.prisma): Promise<RequestAccess> {
    const facts = await loadAccessFacts(db, userId);
    return {
      ...effectiveAccess(this.registry, facts, this.clock.now()),
      fieldClasses: visibleFieldClasses(this.registry, [
        ...facts.roles,
        ...facts.projectStaff.map((s) => s.roleKey),
      ]),
    };
  }

  /** The scope handle for the route's permission and entity (made only here). */
  async scopeFor(
    principal: Principal,
    access: EffectiveAccess,
    permission: string,
    entity: string,
    db: Tx = this.prisma,
  ): Promise<Scope> {
    // the markers carry no grants: the file service and the workflow engine decide per record
    if (
      entity === 'self' ||
      permission === 'authenticated' ||
      permission === 'entity' ||
      permission === 'workflow'
    )
      return makeScope(principal.userId, permission, entity, { ...NO_INSTANCES, self: true });
    const grants = access.grants.filter((g) => g.permission === permission);
    const revokes = access.instanceRevokes.filter((r) => r.permission === permission);
    const instances = await resolveInstances(db, principal.userId, entity, grants, revokes);
    return makeScope(principal.userId, permission, entity, instances);
  }

  /**
   * The caller's scope for a second, narrower permission than the route's (the protected details of
   * a nationwide list), or null when the caller does not hold it at all.
   */
  async sensitiveScope(
    principal: Principal,
    access: EffectiveAccess,
    permission: string,
    entity: RecordEntity,
  ): Promise<Scope | null> {
    if (!holdsPermission(permission, access.grants)) return null;
    return this.scopeFor(principal, access, permission, entity);
  }

  /** Whether a scope reaches one record, named by the id of the scope's entity (in `db` when given). */
  async reaches(scope: Scope, target: RecordTarget, db: Tx = this.prisma): Promise<boolean> {
    switch (scope.entity) {
      case 'user':
        return (
          !!target.userId &&
          (await db.user.count({
            where: { AND: [{ id: target.userId }, this.userFilter(scope)] },
          })) > 0
        );
      case 'volunteer':
        return (
          !!target.volunteerId &&
          (await db.volunteer.count({
            where: { AND: [{ id: target.volunteerId }, volunteerWhere(scope)] },
          })) > 0
        );
      case 'beneficiary':
        return (
          !!target.beneficiaryId &&
          (await db.beneficiary.count({
            where: { AND: [{ id: target.beneficiaryId }, beneficiaryWhere(scope)] },
          })) > 0
        );
      case 'application':
        return (
          !!target.applicationId &&
          (await db.application.count({
            where: { AND: [{ id: target.applicationId }, applicationWhere(scope)] },
          })) > 0
        );
      default:
        throw new Error(`reaches: no per-record rule for the entity ${scope.entity}`);
    }
  }

  /**
   * What the caller may do to one record, as the action routes would decide it: each flag is true
   * only when the caller holds the permission and its scope (for the route's entity) reaches the
   * record. The screen shows a button for a true flag; the routes still check on their own.
   */
  async allowedOn<K extends string>(
    principal: Principal,
    access: EffectiveAccess,
    actions: Record<K, { permission: string; entity: RecordEntity }>,
    target: RecordTarget,
  ): Promise<Record<K, boolean>> {
    const entries = await Promise.all(
      (Object.entries(actions) as [K, { permission: string; entity: RecordEntity }][]).map(
        async ([key, { permission, entity }]) => {
          const scope = await this.sensitiveScope(principal, access, permission, entity);
          return [key, scope ? await this.reaches(scope, target) : false] as const;
        },
      ),
    );
    return Object.fromEntries(entries) as Record<K, boolean>;
  }

  /**
   * The scope a user holds for a permission on another entity than the route's (one request); in
   * `db` when given, so a transaction sees its own writes.
   */
  async scopeOfUser(
    userId: string,
    permission: string,
    entity: string,
    db: Tx = this.prisma,
  ): Promise<Scope> {
    return this.scopeFor(
      { userId } as Principal,
      await this.load(userId, db),
      permission,
      entity,
      db,
    );
  }

  /** Logs a refusal without any record content (user, permission, entity, request id only). */
  denied(userId: string, permission: string, entity: string): void {
    this.logger.warn(
      {
        event: 'permission_denied',
        userId,
        permission,
        entity,
        requestId: currentContext()?.requestId,
      },
      'permission denied',
    );
  }

  /** The filter of the users the scope reaches (staff and volunteer accounts). */
  userFilter(scope: Scope): Prisma.UserWhereInput {
    return { AND: [{ kind: ACCOUNT_KINDS }, userWhere(scope)] };
  }

  /**
   * One user inside the scope, or 404 `permission.not_found` (no existence leak, RBAC.md 8.4).
   * Every update, delete or state change of a user loads it here first.
   */
  async findUser<S extends Prisma.UserSelect>(
    scope: Scope,
    userId: string,
    select: S,
    db: Tx = this.prisma,
  ): Promise<Prisma.UserGetPayload<{ select: S }>> {
    const user = await db.user.findFirst({
      where: { AND: [{ id: userId }, this.userFilter(scope)] },
      select,
    });
    if (!user) {
      this.denied(scope.actorId, scope.permission, scope.entity);
      throw new ApiError('permission.not_found', 404);
    }
    return user as Prisma.UserGetPayload<{ select: S }>;
  }

  /** One project inside the scope, or 404 `permission.not_found` (RBAC.md 8.4). */
  async findProject<S extends Prisma.ProjectSelect>(
    scope: Scope,
    projectId: string,
    select: S,
    db: Tx = this.prisma,
  ): Promise<Prisma.ProjectGetPayload<{ select: S }>> {
    const project = await db.project.findFirst({
      where: { AND: [{ id: projectId }, projectWhere(scope)] },
      select,
    });
    if (!project) {
      this.denied(scope.actorId, scope.permission, scope.entity);
      throw new ApiError('permission.not_found', 404);
    }
    return project as Prisma.ProjectGetPayload<{ select: S }>;
  }

  /** Whether a user holds a permission on one project (granter check of project grants, RBAC.md 7). */
  async holdsOnProject(
    userId: string,
    permission: string,
    projectId: string,
    db: Tx = this.prisma,
  ): Promise<boolean> {
    const access = await this.load(userId);
    const grants = access.grants.filter((g) => g.permission === permission);
    if (!grants.length) return false;
    const revokes = access.instanceRevokes.filter((r) => r.permission === permission);
    const instances = await resolveInstances(db, userId, 'project', grants, revokes);
    const scope = makeScope(userId, permission, 'project', instances);
    const found = await db.project.count({
      where: { AND: [{ id: projectId }, projectWhere(scope)] },
    });
    return found > 0;
  }
}
