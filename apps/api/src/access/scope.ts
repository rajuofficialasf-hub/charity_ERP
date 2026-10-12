import type { Tx } from '../core/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { PERMISSION_MARKERS } from '../openapi/drift';
import type { EffectiveGrant, PanelOverride } from './effective';

/** A location, optionally inside one project (an area of a project or a panel-granted location). */
export interface Area {
  projectId: string | null;
  locationId: string;
}

/**
 * The scope instances a caller holds for one permission (RBAC.md 4): GLOBAL, own records (SELF),
 * programs, projects and areas. Several grants add up.
 */
export interface ScopeInstances {
  global: boolean;
  self: boolean;
  programIds: string[];
  projectIds: string[];
  areas: Area[];
  /** Areas that reach volunteers only (condition `own_region` on the user entity, O-25). */
  volunteerAreas: Area[];
}

export const NO_INSTANCES: ScopeInstances = {
  global: false,
  self: false,
  programIds: [],
  projectIds: [],
  areas: [],
  volunteerAreas: [],
};

declare const SCOPE_BRAND: unique symbol;

/**
 * The caller's scope for the route's permission and entity, made only by the access middleware
 * (O-62): data access of a scoped entity takes it as a required argument, so code without the
 * caller's scope does not compile.
 */
export interface Scope {
  readonly [SCOPE_BRAND]: true;
  readonly actorId: string;
  readonly permission: string;
  readonly entity: string;
  readonly instances: ScopeInstances;
}

export function makeScope(
  actorId: string,
  permission: string,
  entity: string,
  instances: ScopeInstances,
): Scope {
  return { actorId, permission, entity, instances } as Scope;
}

/** True when the caller may call the operation at all; the scope then narrows the data. */
export function holdsPermission(permission: string, grants: EffectiveGrant[]): boolean {
  if (permission === 'authenticated') return true;
  if (PERMISSION_MARKERS.includes(permission)) return false; // public is decided before; workflow and entity later
  return grants.some((g) => g.permission === permission);
}

const AREA_SCOPES: readonly string[] = ['REGION', 'DISTRICT', 'UPAZILA', 'UNION'];
const areaKey = (a: Area) => `${a.projectId}|${a.locationId}`;

/**
 * Removes the instances a panel revoke names (RBAC.md 7: a revoke beats every grant source). A
 * revoked program also removes its projects and their areas (`projectsOfRevokedPrograms`).
 * Exported as a pure helper so its rules are tested without a database.
 */
export function applyInstanceRevokes(
  instances: ScopeInstances,
  revokes: PanelOverride[],
  projectsOfRevokedPrograms: string[] = [],
): ScopeInstances {
  const programs = new Set(revokes.filter((r) => r.scopeType === 'PROGRAM').map((r) => r.scopeRef));
  const projects = new Set([
    ...revokes.filter((r) => r.scopeType === 'PROJECT').map((r) => r.scopeRef),
    ...projectsOfRevokedPrograms,
  ]);
  const locations = new Set(
    revokes.filter((r) => AREA_SCOPES.includes(r.scopeType)).map((r) => r.scopeRef),
  );
  const keep = (a: Area) =>
    !locations.has(a.locationId) && !(a.projectId && projects.has(a.projectId));
  return {
    ...instances,
    programIds: instances.programIds.filter((id) => !programs.has(id)),
    projectIds: instances.projectIds.filter((id) => !projects.has(id)),
    areas: instances.areas.filter(keep),
    volunteerAreas: instances.volunteerAreas.filter(keep),
  };
}

const unique = <T>(values: T[], key: (v: T) => string) => [
  ...new Map(values.map((v) => [key(v), v])).values(),
];

/** The caller's own areas (RPM of a project area, or staff with an area) in the given projects. */
async function ownAreas(db: Tx, actorId: string, inProjects: Set<string | null>): Promise<Area[]> {
  const all = inProjects.has(null);
  const only = [...inProjects].filter((p): p is string => p !== null);
  const projectFilter = all ? {} : { projectId: { in: only } };
  const [areas, staff] = await Promise.all([
    db.projectArea.findMany({
      where: { rpmUserId: actorId, ...projectFilter },
      select: { projectId: true, locationId: true },
    }),
    db.projectStaff.findMany({
      where: { userId: actorId, endedAt: null, areaLocationId: { not: null }, ...projectFilter },
      select: { projectId: true, areaLocationId: true },
    }),
  ]);
  return [
    ...areas,
    ...staff.map((s) => ({ projectId: s.projectId, locationId: s.areaLocationId! })),
  ];
}

/**
 * Resolves the instances of the grants of one permission from the assignment tables (RBAC.md 4):
 * PROGRAM from `programs.pm_user_id`, PROJECT from the caller's project assignments, REGION and the
 * area scopes from `project_areas` (the caller as RPM) and the caller's `project_staff` area;
 * grants that name an instance (panel grants, project-bound grants) keep it. ASSIGNED resolves per
 * entity with the work assignments of later tasks; the user entity has none.
 *
 * Conditions (RBAC.md 3, R5) narrow a grant for the route's entity; a condition the entity has no
 * rule for drops the grant, so an unknown or not yet evaluated condition denies (fail closed).
 * For users, `own_region` limits an area grant to the volunteers of that area (O-25).
 */
export async function resolveInstances(
  db: Tx,
  actorId: string,
  entity: string,
  grants: EffectiveGrant[],
  revokes: PanelOverride[],
): Promise<ScopeInstances> {
  const inst: ScopeInstances = {
    ...NO_INSTANCES,
    programIds: [],
    projectIds: [],
    areas: [],
    volunteerAreas: [],
  };
  let ownPrograms = false;
  let ownProjects = false;
  const regionProjects = new Set<string | null>();
  const volunteerRegionProjects = new Set<string | null>();
  for (const g of grants) {
    if (g.condition !== null) {
      if (entity === 'user' && g.condition === 'own_region' && AREA_SCOPES.includes(g.scopeType)) {
        if (g.scopeRef)
          inst.volunteerAreas.push({ projectId: g.projectId, locationId: g.scopeRef });
        else volunteerRegionProjects.add(g.projectId);
      }
      continue;
    }
    switch (g.scopeType) {
      case 'GLOBAL':
        inst.global = true;
        break;
      case 'SELF':
        inst.self = true;
        break;
      case 'PROGRAM':
        if (g.scopeRef) inst.programIds.push(g.scopeRef);
        else ownPrograms = true;
        break;
      case 'PROJECT': {
        const project = g.scopeRef ?? g.projectId;
        if (project) inst.projectIds.push(project);
        else ownProjects = true;
        break;
      }
      case 'REGION':
      case 'DISTRICT':
      case 'UPAZILA':
      case 'UNION':
        if (g.scopeRef) inst.areas.push({ projectId: g.projectId, locationId: g.scopeRef });
        else regionProjects.add(g.projectId);
        break;
      case 'ASSIGNED':
        break;
    }
  }
  if (ownPrograms) {
    const programs = await db.program.findMany({
      where: { pmUserId: actorId },
      select: { id: true },
    });
    inst.programIds.push(...programs.map((p) => p.id));
  }
  if (ownProjects) {
    const [staff, volunteer] = await Promise.all([
      db.projectStaff.findMany({
        where: { userId: actorId, endedAt: null },
        select: { projectId: true },
      }),
      db.projectVolunteer.findMany({
        where: { endedAt: null, volunteer: { userId: actorId } },
        select: { projectId: true },
      }),
    ]);
    inst.projectIds.push(...staff.map((s) => s.projectId), ...volunteer.map((v) => v.projectId));
  }
  if (regionProjects.size) inst.areas.push(...(await ownAreas(db, actorId, regionProjects)));
  if (volunteerRegionProjects.size)
    inst.volunteerAreas.push(...(await ownAreas(db, actorId, volunteerRegionProjects)));
  const revokedPrograms = revokes
    .filter((r) => r.scopeType === 'PROGRAM' && r.scopeRef !== null)
    .map((r) => r.scopeRef as string);
  const projectsOfRevokedPrograms = revokedPrograms.length
    ? (
        await db.project.findMany({
          where: { programId: { in: revokedPrograms } },
          select: { id: true },
        })
      ).map((p) => p.id)
    : [];
  return applyInstanceRevokes(
    {
      ...inst,
      programIds: [...new Set(inst.programIds)],
      projectIds: [...new Set(inst.projectIds)],
      areas: unique(inst.areas, areaKey),
      volunteerAreas: unique(inst.volunteerAreas, areaKey),
    },
    revokes,
    projectsOfRevokedPrograms,
  );
}

/** Users reachable through projects: staff, volunteers or RPMs of those projects. */
function usersOnProjects(projectWhere: Prisma.ProjectWhereInput): Prisma.UserWhereInput[] {
  return [
    { projectStaffUser: { some: { endedAt: null, project: projectWhere } } },
    {
      volunteersUser: {
        is: { projectVolunteersVolunteer: { some: { endedAt: null, project: projectWhere } } },
      },
    },
    { projectAreasRpmUser: { some: { project: projectWhere } } },
  ];
}

/** Volunteers assigned to a project inside the area. */
function volunteersIn(a: Area): Prisma.UserWhereInput {
  const project = a.projectId ? { projectId: a.projectId } : {};
  return {
    volunteersUser: {
      is: {
        projectVolunteersVolunteer: {
          some: { endedAt: null, regionLocationId: a.locationId, ...project },
        },
      },
    },
  };
}

/**
 * The users a scope reaches (entity `user`): everyone at GLOBAL; the caller for SELF; the users of
 * the caller's programs and projects; for an area, the users working in that location (inside its
 * project when the area names one, by home division otherwise); for a volunteer area, only the
 * volunteers there. No instance means no user.
 */
export function userWhere(scope: Scope): Prisma.UserWhereInput {
  const i = scope.instances;
  if (i.global) return {};
  const or: Prisma.UserWhereInput[] = [];
  if (i.self) or.push({ id: scope.actorId });
  if (i.programIds.length)
    or.push(
      { homeProgramId: { in: i.programIds } },
      ...usersOnProjects({ programId: { in: i.programIds } }),
    );
  if (i.projectIds.length) or.push(...usersOnProjects({ id: { in: i.projectIds } }));
  for (const a of i.areas) {
    const project = a.projectId ? { projectId: a.projectId } : {};
    or.push(
      { projectStaffUser: { some: { endedAt: null, areaLocationId: a.locationId, ...project } } },
      volunteersIn(a),
      { projectAreasRpmUser: { some: { locationId: a.locationId, ...project } } },
    );
    if (!a.projectId) or.push({ homeDivisionId: a.locationId });
  }
  for (const a of i.volunteerAreas) or.push(volunteersIn(a));
  return or.length ? { OR: or } : { id: { in: [] } };
}
