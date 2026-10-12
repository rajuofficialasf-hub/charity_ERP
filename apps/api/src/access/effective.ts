import type { Tx } from '../core/prisma.service';
import type { AccessRegistry, DefaultGrant } from './registry';
import type { ScopeType } from './schema';

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
  projectVolunteers: { projectId: string; permissionSet: string; extraPermissions: string[] }[];
  overrides: PanelOverride[];
}

export const IF_RPM_GRANTS = 'if_rpm_grants';

const sameGrant = (g: EffectiveGrant) =>
  [g.permission, g.scopeType, g.scopeRef, g.condition, g.source, g.projectId].join('|');

/** A revoke at GLOBAL removes the permission everywhere; otherwise at the same scope or project. */
function revokes(r: PanelOverride, g: EffectiveGrant): boolean {
  if (r.permission !== g.permission) return false;
  if (r.scopeType === 'GLOBAL') return true;
  if (r.scopeType === 'PROJECT' && g.projectId !== null && g.projectId === r.scopeRef) return true;
  return r.scopeType === g.scopeType && r.scopeRef === g.scopeRef;
}

/**
 * The effective grants of one user from the four sources of RBAC.md 1, in order: GLOBAL roles
 * (every permission at GLOBAL minus `global_roles_excluded`), role defaults, project permission
 * sets and project extras, panel overrides; a live revoke override beats every grant. Volunteers
 * hold the SELF defaults of their role directly and everything else only on their projects (RBAC.md
 * 6, Q-16). Pure: the loader below reads the rows.
 */
export function effectivePermissions(
  registry: AccessRegistry,
  facts: AccessFacts,
  now: Date,
): EffectiveGrant[] {
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

  // 2. Role defaults; a volunteer's non-SELF defaults count only on the projects it is assigned to
  const volunteerProjects = facts.projectVolunteers.map((pv) => pv.projectId);
  for (const p of registry.permissions.values())
    for (const d of p.defaults) {
      if (!facts.roles.includes(d.role) || d.condition === IF_RPM_GRANTS) continue;
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
    if (!set) continue;
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

  // 3b. Project extras ("if RPM grants"), at the scope of the default without its condition
  const extras = [
    ...facts.projectVolunteers.map((pv) => ({
      projectId: pv.projectId,
      roles: facts.roles,
      permissions: pv.extraPermissions,
      fallback: 'SELF' as const,
    })),
    ...facts.projectStaff.map((ps) => ({
      projectId: ps.projectId,
      roles: [ps.roleKey],
      permissions: ps.extraPermissions,
      fallback: 'PROJECT' as const,
    })),
  ];
  for (const e of extras)
    for (const permission of e.permissions) {
      if (!registry.permissions.has(permission)) continue;
      const defaults = defaultsOf(permission, e.roles);
      const scopes = defaults.length ? defaults.map((d) => d.scope) : [e.fallback];
      for (const scopeType of new Set(scopes))
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
      });
  const revocations = live.filter((o) => o.effect === 'revoke');
  return [...grants.values()].filter((g) => !revocations.some((r) => revokes(r, g)));
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
  const projectVolunteers = volunteer
    ? await db.projectVolunteer.findMany({
        where: { volunteerId: volunteer.id, endedAt: null },
        select: { projectId: true, permissionSet: true, extraPermissions: true },
      })
    : [];
  return {
    roles: roles.map((r) => r.roleKey),
    volunteerType: volunteer?.type ?? null,
    projectStaff,
    projectVolunteers,
    overrides: overrides.map((o) => ({
      id: o.id,
      permission: o.permissionName,
      effect: o.effect as PanelOverride['effect'],
      scopeType: o.scopeType as ScopeType,
      scopeRef: o.scopeRef,
      condition: o.condition,
      expiresAt: o.expiresAt,
    })),
  };
}
