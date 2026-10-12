import type { Tx } from '../core/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { PERMISSION_MARKERS } from '../openapi/drift';
import type { EffectiveGrant, PanelOverride } from './effective';

/**
 * The scope instances a caller holds for one permission (RBAC.md 4): GLOBAL, own records (SELF),
 * programs, projects and areas (a location, optionally inside one project). Several grants add up.
 */
export interface ScopeInstances {
  global: boolean;
  self: boolean;
  programIds: string[];
  projectIds: string[];
  areas: { projectId: string | null; locationId: string }[];
}

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

/** Removes the instances a panel revoke names (RBAC.md 7: a revoke beats every grant source). */
export function applyInstanceRevokes(
  instances: ScopeInstances,
  revokes: PanelOverride[],
): ScopeInstances {
  const programs = new Set(revokes.filter((r) => r.scopeType === 'PROGRAM').map((r) => r.scopeRef));
  const projects = new Set(revokes.filter((r) => r.scopeType === 'PROJECT').map((r) => r.scopeRef));
  const locations = new Set(
    revokes
      .filter((r) => ['REGION', 'DISTRICT', 'UPAZILA', 'UNION'].includes(r.scopeType))
      .map((r) => r.scopeRef),
  );
  return {
    ...instances,
    programIds: instances.programIds.filter((id) => !programs.has(id)),
    projectIds: instances.projectIds.filter((id) => !projects.has(id)),
    areas: instances.areas.filter(
      (a) => !locations.has(a.locationId) && !(a.projectId && projects.has(a.projectId)),
    ),
  };
}

const unique = <T>(values: T[], key: (v: T) => string) => [
  ...new Map(values.map((v) => [key(v), v])).values(),
];

/**
 * Resolves the instances of the grants of one permission from the assignment tables (RBAC.md 4):
 * PROGRAM from `programs.pm_user_id`, PROJECT from the caller's project assignments, REGION and the
 * area scopes from `project_areas` (the caller as RPM) and the caller's `project_staff` area;
 * grants that name an instance (panel grants, project-bound grants) keep it. ASSIGNED resolves per
 * entity with the work assignments of later tasks; the user entity has none.
 */
export async function resolveInstances(
  db: Tx,
  actorId: string,
  grants: EffectiveGrant[],
  revokes: PanelOverride[],
): Promise<ScopeInstances> {
  const inst: ScopeInstances = {
    global: false,
    self: false,
    programIds: [],
    projectIds: [],
    areas: [],
  };
  let ownPrograms = false;
  let ownProjects = false;
  const regionProjects = new Set<string | null>();
  for (const g of grants) {
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
  if (regionProjects.size) {
    const all = regionProjects.has(null);
    const only = [...regionProjects].filter((p): p is string => p !== null);
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
    inst.areas.push(
      ...areas,
      ...staff.map((s) => ({ projectId: s.projectId, locationId: s.areaLocationId! })),
    );
  }
  return applyInstanceRevokes(
    {
      ...inst,
      programIds: [...new Set(inst.programIds)],
      projectIds: [...new Set(inst.projectIds)],
      areas: unique(inst.areas, (a) => `${a.projectId}|${a.locationId}`),
    },
    revokes,
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

/**
 * The users a scope reaches (entity `user`): everyone at GLOBAL; the caller for SELF; the users of
 * the caller's programs and projects; for an area, the users working in that location (inside its
 * project when the area names one, by home division otherwise). No instance means no user.
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
      {
        volunteersUser: {
          is: {
            projectVolunteersVolunteer: {
              some: { endedAt: null, regionLocationId: a.locationId, ...project },
            },
          },
        },
      },
      { projectAreasRpmUser: { some: { locationId: a.locationId, ...project } } },
    );
    if (!a.projectId) or.push({ homeDivisionId: a.locationId });
  }
  return or.length ? { OR: or } : { id: { in: [] } };
}
