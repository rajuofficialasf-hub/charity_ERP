import { z } from 'zod';
import type { Tx } from '../core/prisma.service';
import type { AccessRegistry, DefaultGrant } from './registry';
import { SCOPES, type ScopeType } from './schema';

/** Where a grant comes from, the values of the contract's `EffectivePermission.source`. */
export type GrantSource =
  'global_role' | 'role_default' | 'permission_set' | 'project_grant' | 'panel_grant';

export interface EffectiveGrant {
  permission: string;
  scopeType: ScopeType;
  scopeRef: string | null;
  condition: string | null;
  source: GrantSource;
  /** The project the grant is bound to (permission sets, project extras, project defaults). */
  projectId: string | null;
  /** The panel override behind a `panel_grant`. */
  grantId?: string;
}

export interface PanelOverride {
  id: string;
  permission: string;
  effect: 'grant' | 'revoke';
  scopeType: ScopeType;
  scopeRef: string | null;
  condition: string | null;
  expiresAt: Date | null;
}

/** The rows of one user that decide the effective permissions (RBAC.md 1). */
export interface AccessFacts {
  roles: string[];
  volunteerType: string | null;
  projectStaff: { projectId: string; roleKey: string; extraPermissions: string[] }[];
  /** Assignments whose volunteer accepted the project's current rules. */
  projectVolunteers: { projectId: string; permissionSet: string; extraPermissions: string[] }[];
  /** Projects a team member works on through an accepted membership of a working team. */
  teamProjects: string[];
  overrides: PanelOverride[];
}

export const IF_RPM_GRANTS = 'if_rpm_grants';
const OWNER_TRANSFER = 'system.owner.transfer';

const sameGrant = (g: EffectiveGrant) =>
  [g.permission, g.scopeType, g.scopeRef, g.condition, g.source, g.projectId].join('|');

/**
 * What a revoke override removes from the grant list: at GLOBAL the permission everywhere; at
 * PROJECT with a project the grants bound to that project; a scope type without an instance every
 * grant of that type; a scope instance the panel grants of that instance. A revoke of one
 * instance (a region, a district, a program) of a broad grant cannot be applied to the list,
 * because the broad grant names no instance; it is returned in `instanceRevokes` and scope
 * resolution subtracts it.
 */
function revokes(r: PanelOverride, g: EffectiveGrant): boolean {
  if (r.permission !== g.permission) return false;
  if (r.scopeType === 'GLOBAL') return true;
  if (r.scopeType === 'PROJECT' && r.scopeRef !== null && g.projectId === r.scopeRef) return true;
  if (r.scopeRef === null) return r.scopeType === g.scopeType;
  return r.scopeType === g.scopeType && r.scopeRef === g.scopeRef;
}

/** The effective grants plus the instance revokes that scope resolution must subtract. */
export interface EffectiveAccess {
  grants: EffectiveGrant[];
  instanceRevokes: PanelOverride[];
}

/** The effective grants of one user, for display (the access decision uses `effectiveAccess`). */
export function effectivePermissions(
  registry: AccessRegistry,
  facts: AccessFacts,
  now: Date,
): EffectiveGrant[] {
  return effectiveAccess(registry, facts, now).grants;
}

/**
 * The effective grants of one user from the four sources of RBAC.md 1, in order: GLOBAL roles
 * (every permission at GLOBAL minus `global_roles_excluded`), role defaults, project permission
 * sets and project extras, panel overrides; a live revoke override beats every grant. Volunteers
 * hold the SELF defaults of their role directly and everything else only on their projects (RBAC.md
 * 6), and never a sensitive permission. Pure: the
 * loader below reads the rows.
 */
export function effectiveAccess(
  registry: AccessRegistry,
  facts: AccessFacts,
  now: Date,
): EffectiveAccess {
  const grants = new Map<string, EffectiveGrant>();
  const add = (g: EffectiveGrant) => grants.set(sameGrant(g), g);
  const isVolunteerRole = (role: string) => registry.roles.get(role)?.kind === 'volunteer';
  const defaultsOf = (permission: string, roles: string[]): DefaultGrant[] =>
    registry.permissions.get(permission)?.defaults.filter((d) => roles.includes(d.role)) ?? [];

  // 1. GLOBAL roles
  const globalRoles = facts.roles.filter((r) => registry.roles.get(r)?.globalScope);
  if (globalRoles.length)
    for (const p of registry.permissions.values())
      if (globalRoles.some((r) => !p.globalRolesExcluded.includes(r)))
        add({
          permission: p.name,
          scopeType: 'GLOBAL',
          scopeRef: null,
          condition: null,
          source: 'global_role',
          projectId: null,
        });

  // 2. Role defaults. For a volunteer role, a permission that a permission set of that role
  // contains comes only through the set on a project
  // (docs/plans/2026-10-12-1100-feat-rbac-permission-panel-plan.md); account permissions (module
  // M01: own sessions) stay direct; other non-SELF defaults count only on assigned projects.
  const volunteerProjects = [
    ...new Set([...facts.projectVolunteers.map((pv) => pv.projectId), ...facts.teamProjects]),
  ];
  const governedBySet = (role: string, permission: string) =>
    registry.permissions.get(permission)?.module !== 'M01' &&
    [...registry.permissionSets.values()].some(
      (s) => s.forRoles.includes(role) && s.permissions.includes(permission),
    );
  for (const p of registry.permissions.values())
    for (const d of p.defaults) {
      if (!facts.roles.includes(d.role) || d.condition === IF_RPM_GRANTS) continue;
      if (isVolunteerRole(d.role) && governedBySet(d.role, p.name)) continue;
      const base = {
        permission: p.name,
        scopeType: d.scope,
        scopeRef: null,
        condition: d.condition ?? null,
        source: 'role_default' as const,
      };
      if (!isVolunteerRole(d.role) || d.scope === 'SELF') add({ ...base, projectId: null });
      else for (const projectId of volunteerProjects) add({ ...base, projectId });
    }

  // 3a. Permission sets, bound to their project, at the scope of the role's default (else SELF);
  // a permission whose defaults for these roles are all "if RPM grants" needs the extra (3b)
  for (const pv of facts.projectVolunteers) {
    const set = registry.permissionSets.get(pv.permissionSet);
    // A set counts only for the roles it is meant for (RBAC.md 6).
    if (!set || !set.forRoles.some((r) => facts.roles.includes(r))) continue;
    for (const permission of set.permissions) {
      const defaults = defaultsOf(permission, facts.roles);
      if (defaults.length && defaults.every((d) => d.condition === IF_RPM_GRANTS)) continue;
      const usable = defaults.filter((d) => d.condition !== IF_RPM_GRANTS);
      const scopes = usable.length ? usable : [{ scope: 'SELF' as const, condition: undefined }];
      for (const d of scopes)
        add({
          permission,
          scopeType: d.scope,
          scopeRef: null,
          condition: d.condition ?? null,
          source: 'permission_set',
          projectId: pv.projectId,
        });
    }
  }

  // 3b. Project extras: only permissions the role holds "if RPM grants" (RBAC.md 6), at the scope
  // of that default without its condition; anything else in the column is ignored
  const extras = [
    ...facts.projectVolunteers.map((pv) => ({
      projectId: pv.projectId,
      roles: facts.roles,
      permissions: pv.extraPermissions,
    })),
    ...facts.projectStaff.map((ps) => ({
      projectId: ps.projectId,
      roles: [ps.roleKey],
      permissions: ps.extraPermissions,
    })),
  ];
  for (const e of extras)
    for (const permission of e.permissions) {
      const rpmGrantable = defaultsOf(permission, e.roles).filter(
        (d) => d.condition === IF_RPM_GRANTS,
      );
      for (const scopeType of new Set(rpmGrantable.map((d) => d.scope)))
        add({
          permission,
          scopeType,
          scopeRef: null,
          condition: null,
          source: 'project_grant',
          projectId: e.projectId,
        });
    }

  // 4. Panel overrides that have not expired
  const live = facts.overrides.filter((o) => !o.expiresAt || o.expiresAt > now);
  for (const o of live)
    if (o.effect === 'grant' && registry.permissions.has(o.permission))
      add({
        permission: o.permission,
        scopeType: o.scopeType,
        scopeRef: o.scopeRef,
        condition: o.condition,
        source: 'panel_grant',
        projectId: o.scopeType === 'PROJECT' ? o.scopeRef : null,
        grantId: o.id,
      });
  // Hard rules of RBAC.md 7 and 9, kept here too so a stray row cannot break them: revokes never
  // strip the Department Head (Main Admin); only the Department Head holds the owner
  // transfer; volunteers never hold a sensitive permission.
  const head = facts.roles.includes('department_head');
  const revocations = head ? [] : live.filter((o) => o.effect === 'revoke');
  const official = facts.roles.some((r) => registry.roles.get(r)?.kind === 'official');
  return {
    grants: [...grants.values()].filter(
      (g) =>
        !revocations.some((r) => revokes(r, g)) &&
        (g.permission !== OWNER_TRANSFER || head) &&
        (official || !registry.permissions.get(g.permission)?.sensitive),
    ),
    instanceRevokes: revocations.filter((r) => r.scopeRef !== null && r.scopeType !== 'GLOBAL'),
  };
}

const overrideRow = z.object({
  effect: z.enum(['grant', 'revoke']),
  scopeType: z.enum(SCOPES),
});

/**
 * An assignment the volunteer works under: not ended, and the project's current rules accepted. A
 * rules change sets every acceptance back to pending, so an older acceptance never counts
 *. Without it the volunteer holds no permission on the project.
 */
export const WORKING_ASSIGNMENT = { endedAt: null, consentStatus: 'accepted' } as const;

/**
 * The projects a team member works on: an accepted, not removed membership whose main volunteer's
 * assignment on that project is working too. A blocked account does not get
 * this far: authentication refuses it.
 */
export async function workingTeamProjects(db: Tx, memberVolunteerId: string): Promise<string[]> {
  const memberships = await db.volunteerTeam.findMany({
    where: { memberVolunteerId, removedAt: null, consentStatus: 'accepted' },
    select: { projectId: true, leadVolunteerId: true },
  });
  if (!memberships.length) return [];
  const leads = await db.projectVolunteer.findMany({
    where: {
      ...WORKING_ASSIGNMENT,
      OR: memberships.map((m) => ({ projectId: m.projectId, volunteerId: m.leadVolunteerId })),
    },
    select: { projectId: true },
  });
  return [...new Set(leads.map((l) => l.projectId))];
}

/** Reads the rows of `effectivePermissions` for one user (one query per table). */
export async function loadAccessFacts(db: Tx, userId: string): Promise<AccessFacts> {
  const [roles, volunteer, projectStaff, overrides] = await Promise.all([
    db.userRole.findMany({ where: { userId, revokedAt: null }, select: { roleKey: true } }),
    db.volunteer.findUnique({ where: { userId }, select: { id: true, type: true } }),
    db.projectStaff.findMany({
      where: { userId, endedAt: null },
      select: { projectId: true, roleKey: true, extraPermissions: true },
    }),
    db.userPermission.findMany({
      where: { userId, revokedAt: null },
      select: {
        id: true,
        permissionName: true,
        effect: true,
        scopeType: true,
        scopeRef: true,
        condition: true,
        expiresAt: true,
      },
    }),
  ]);
  const [projectVolunteers, teamProjects] = volunteer
    ? await Promise.all([
        db.projectVolunteer.findMany({
          where: { volunteerId: volunteer.id, ...WORKING_ASSIGNMENT },
          select: { projectId: true, permissionSet: true, extraPermissions: true },
        }),
        workingTeamProjects(db, volunteer.id),
      ])
    : [[], []];
  return {
    roles: roles.map((r) => r.roleKey),
    volunteerType: volunteer?.type ?? null,
    projectStaff,
    projectVolunteers,
    teamProjects,
    overrides: overrides.map((o) => ({
      id: o.id,
      permission: o.permissionName,
      ...overrideRow.parse({ effect: o.effect, scopeType: o.scopeType }),
      scopeRef: o.scopeRef,
      condition: o.condition,
      expiresAt: o.expiresAt,
    })),
  };
}
