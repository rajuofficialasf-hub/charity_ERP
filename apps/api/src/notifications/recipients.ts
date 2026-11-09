import type { AccessRegistry } from '../access/registry';
import type { AccessService, RecordTarget } from '../access/service';
import type { Clock } from '../core/clock';
import type { Tx } from '../core/prisma.service';

/**
 * Who receives an event (docs/architecture/NOTIFICATIONS.md, recipient resolution), resolved at
 * event time inside the event's transaction:
 * - `user`: one person (the affected user, the owner, an assignee);
 * - `holders`: the officials holding a permission whose scope reaches the record, as the routes
 *   would decide it;
 * - `roles`: everyone holding a role (the Monitoring Team and the Department Head);
 * - `project`: the area RPMs, the staff with access and the volunteers working on a project.
 * Beneficiaries are not people of the system, so no rule can reach them.
 */
export type RecipientRule =
  | { user: string }
  | {
      holders: {
        permission: string;
        entity: 'user' | 'volunteer' | 'application';
        target: RecordTarget;
        /** The everyday work of the regions is not for the two global roles' inboxes. */
        withoutGlobalRoles?: boolean;
      };
    }
  | { roles: readonly string[] }
  | { project: ProjectRule };

/** The people working on a project: its RPMs, its staff, its volunteers. */
export interface ProjectRule {
  projectId: string;
  rpms?: boolean;
  /** Only the RPMs of this area of the project. */
  regionLocationId?: string;
  staff?: boolean;
  volunteers?: boolean;
}

export interface Recipient {
  id: string;
  kind: 'staff' | 'volunteer';
  language: string;
  email: string | null;
}

/** The roles of the Department Head and the Monitoring Team. */
export const MONITORING: readonly string[] = ['department_head', 'monitoring_team'];

const SELECT = { id: true, kind: true, language: true, email: true } as const;

export class RecipientResolver {
  constructor(
    private readonly access: AccessService,
    private readonly registry: AccessRegistry,
    private readonly clock: Clock,
  ) {}

  /** The people of every rule, once each; the actor never gets a copy of their own action. */
  async resolve(
    tx: Tx,
    rules: readonly RecipientRule[],
    actorId?: string | null,
  ): Promise<Recipient[]> {
    const found = new Map<string, Recipient>();
    for (const rule of rules) {
      for (const person of await this.one(tx, rule)) found.set(person.id, person);
    }
    if (actorId) found.delete(actorId);
    return [...found.values()];
  }

  private async one(tx: Tx, rule: RecipientRule): Promise<Recipient[]> {
    if ('user' in rule) {
      // the person concerned: also while the registration is pending or the account blocked
      const user = await tx.user.findFirst({
        where: {
          id: rule.user,
          kind: { in: ['staff', 'volunteer'] },
          state: { not: 'deactivated' },
        },
        select: SELECT,
      });
      return user ? [this.recipient(user)] : [];
    }
    if ('roles' in rule) return this.staffWithRoles(tx, rule.roles);
    if ('holders' in rule) return this.holders(tx, rule.holders);
    return this.projectPeople(tx, rule.project);
  }

  private async staffWithRoles(tx: Tx, roles: readonly string[]): Promise<Recipient[]> {
    const users = await tx.user.findMany({
      where: {
        kind: 'staff',
        state: 'active',
        userRolesUser: { some: { roleKey: { in: [...roles] }, revokedAt: null } },
      },
      select: SELECT,
    });
    return users.map((u) => this.recipient(u));
  }

  /**
   * The officials who hold the permission on the record: the candidates are the holders of a role
   * whose default carries it, the global roles and the people with a panel grant of it; each one is
   * kept only when their scope reaches the record.
   */
  private async holders(
    tx: Tx,
    rule: {
      permission: string;
      entity: 'user' | 'volunteer' | 'application';
      target: RecordTarget;
      /** The everyday work of the regions is not for the two global roles' inboxes. */
      withoutGlobalRoles?: boolean;
    },
  ): Promise<Recipient[]> {
    const permission = this.registry.permissions.get(rule.permission);
    if (!permission) throw new Error(`unknown permission ${rule.permission}`);
    const roles = new Set(permission.defaults.map((d) => d.role));
    // the two global roles hold every permission; a rule may leave them out of the readers of the
    // everyday work (every submission of the country is not for the Department Head's inbox)
    if (!rule.withoutGlobalRoles)
      for (const role of this.registry.roles.values())
        if (role.globalScope && !permission.globalRolesExcluded.includes(role.key))
          roles.add(role.key);
    const now = this.clock.now();
    const candidates = await tx.user.findMany({
      where: {
        kind: 'staff',
        state: 'active',
        OR: [
          { userRolesUser: { some: { roleKey: { in: [...roles] }, revokedAt: null } } },
          {
            userPermissionsUser: {
              some: {
                permissionName: rule.permission,
                effect: 'grant',
                revokedAt: null,
                OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
              },
            },
          },
        ],
      },
      select: SELECT,
    });
    // one after another on the event's own connection: the transaction sees its own writes, and a
    // publish never asks the pool for more connections while it holds one
    const kept: Recipient[] = [];
    for (const c of candidates) {
      const scope = await this.access.scopeOfUser(c.id, rule.permission, rule.entity, tx);
      if (await this.access.reaches(scope, rule.target, tx)) kept.push(this.recipient(c));
    }
    return kept;
  }

  private async projectPeople(tx: Tx, rule: ProjectRule): Promise<Recipient[]> {
    const ids = new Set<string>();
    if (rule.rpms)
      for (const a of await tx.projectArea.findMany({
        where: {
          projectId: rule.projectId,
          ...(rule.regionLocationId ? { locationId: rule.regionLocationId } : {}),
        },
        select: { rpmUserId: true },
      }))
        ids.add(a.rpmUserId);
    if (rule.staff)
      for (const s of await tx.projectStaff.findMany({
        where: { projectId: rule.projectId, endedAt: null },
        select: { userId: true },
      }))
        ids.add(s.userId);
    if (rule.volunteers)
      for (const v of await tx.projectVolunteer.findMany({
        where: { projectId: rule.projectId, endedAt: null },
        select: { volunteer: { select: { userId: true } } },
      }))
        if (v.volunteer.userId) ids.add(v.volunteer.userId);
    if (!ids.size) return [];
    const users = await tx.user.findMany({
      where: { id: { in: [...ids] }, kind: { in: ['staff', 'volunteer'] }, state: 'active' },
      select: SELECT,
    });
    return users.map((u) => this.recipient(u));
  }

  private recipient(u: {
    id: string;
    kind: string;
    language: string;
    email: string | null;
  }): Recipient {
    return {
      id: u.id,
      kind: u.kind === 'staff' ? 'staff' : 'volunteer',
      language: u.language,
      email: u.email,
    };
  }
}
