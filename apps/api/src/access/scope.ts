import type { Tx } from '../core/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { PERMISSION_MARKERS } from '../openapi/drift';
import {
  type EffectiveGrant,
  type PanelOverride,
  WORKING_ASSIGNMENT,
  workingTeamProjects,
} from './effective';

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
  // `entity`: any active user passes here; the file service decides from the linked record.
  if (permission === 'authenticated' || permission === 'entity') return true;
  if (PERMISSION_MARKERS.includes(permission)) return false; // public is decided before; workflow later
  return grants.some((g) => g.permission === permission);
}

const AREA_SCOPES: readonly string[] = ['REGION', 'DISTRICT', 'UPAZILA', 'UNION'];
/** The workflow key of house construction (docs/architecture/workflow-templates, conditions.ts). */
const HOUSE_CONSTRUCTION_WORKFLOW = 'construction';
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
  const houseProjects: string[] = [];
  let ownHouseProjects = false;
  for (const g of grants) {
    if (g.condition !== null) {
      if (entity === 'user' && g.condition === 'own_region' && AREA_SCOPES.includes(g.scopeType)) {
        if (g.scopeRef)
          inst.volunteerAreas.push({ projectId: g.projectId, locationId: g.scopeRef });
        else volunteerRegionProjects.add(g.projectId);
      }
      // the Procurement Team reaches beneficiaries only through the house-construction projects
      // it is attached to (DECISION_LOG Q-46); the projects are checked below
      if (
        entity === 'beneficiary' &&
        g.condition === 'house_construction_project' &&
        g.scopeType === 'PROJECT'
      ) {
        const project = g.scopeRef ?? g.projectId;
        if (project) houseProjects.push(project);
        else ownHouseProjects = true;
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
    const [staff, volunteer, member] = await Promise.all([
      db.projectStaff.findMany({
        where: { userId: actorId, endedAt: null },
        select: { projectId: true },
      }),
      // a volunteer reaches a project only after accepting its current rules
      db.projectVolunteer.findMany({
        where: { ...WORKING_ASSIGNMENT, volunteer: { userId: actorId } },
        select: { projectId: true },
      }),
      db.volunteer.findUnique({ where: { userId: actorId }, select: { id: true } }),
    ]);
    const team = member ? await workingTeamProjects(db, member.id) : [];
    inst.projectIds.push(
      ...staff.map((s) => s.projectId),
      ...volunteer.map((v) => v.projectId),
      ...team,
    );
  }
  if (houseProjects.length || ownHouseProjects) {
    // a project counts only when it runs the house-construction workflow and the caller is on it
    const attached = await db.projectStaff.findMany({
      where: {
        userId: actorId,
        endedAt: null,
        ...(ownHouseProjects ? {} : { projectId: { in: houseProjects } }),
        project: { workflowDefinition: { key: HOUSE_CONSTRUCTION_WORKFLOW } },
      },
      select: { projectId: true },
    });
    inst.projectIds.push(...attached.map((s) => s.projectId));
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

const ADDRESS_COLUMNS = ['divisionId', 'districtId', 'upazilaId', 'unionId'] as const;
const ADDRESS_RELATIONS = ['division', 'district', 'upazila', 'union'] as const;

/**
 * The volunteers a scope reaches by their address (entity `volunteer`; DECISION_LOG D-084, RBAC.md
 * 4): everyone at GLOBAL; the own row for SELF; for an area (REGION, a split district or a smaller
 * area) the volunteers whose division, district, upazila or union is that location; for PROGRAM
 * and PROJECT the volunteers in the area locations of those projects. A pending or unassigned
 * volunteer is on no project, so the address decides.
 */
export function volunteerWhere(scope: Scope): Prisma.VolunteerWhereInput {
  const i = scope.instances;
  if (i.global) return {};
  const or: Prisma.VolunteerWhereInput[] = [];
  if (i.self) or.push({ userId: scope.actorId });
  const locations = [...new Set([...i.areas, ...i.volunteerAreas].map((a) => a.locationId))];
  if (locations.length)
    for (const column of ADDRESS_COLUMNS) or.push({ [column]: { in: locations } });
  const inAreasOf = (area: Prisma.ProjectAreaWhereInput) =>
    ADDRESS_RELATIONS.map((relation) => ({
      [relation]: { projectAreasLocation: { some: area } },
    }));
  if (i.programIds.length) or.push(...inAreasOf({ project: { programId: { in: i.programIds } } }));
  if (i.projectIds.length) or.push(...inAreasOf({ projectId: { in: i.projectIds } }));
  return or.length ? { OR: or } : { id: { in: [] } };
}

/**
 * The beneficiaries a scope reaches (entity `beneficiary`; DECISION_LOG D-094): everyone at GLOBAL;
 * for an area the beneficiaries whose division, district, upazila or union is that location; for
 * PROGRAM and PROJECT the beneficiaries with an application in those projects (the Procurement
 * Team's house-construction projects among them). A beneficiary has no account, so SELF reaches
 * nobody.
 */
export function beneficiaryWhere(scope: Scope): Prisma.BeneficiaryWhereInput {
  const i = scope.instances;
  if (i.global) return {};
  const or: Prisma.BeneficiaryWhereInput[] = [];
  const locations = [...new Set(i.areas.map((a) => a.locationId))];
  if (locations.length)
    for (const column of ADDRESS_COLUMNS) or.push({ [column]: { in: locations } });
  if (i.programIds.length)
    or.push({
      applicationsBeneficiary: { some: { project: { programId: { in: i.programIds } } } },
    });
  if (i.projectIds.length)
    or.push({ applicationsBeneficiary: { some: { projectId: { in: i.projectIds } } } });
  return or.length ? { OR: or } : { id: { in: [] } };
}

/**
 * The projects whose rows a caller sees inside one beneficiary's profile: no limit at GLOBAL or
 * for an area scope (the person is theirs), otherwise only the scope's projects, so a team
 * attached to a few projects never reads the person's other projects (DECISION_LOG D-094).
 */
export function beneficiaryRowsProjectWhere(scope: Scope): Prisma.ProjectWhereInput | null {
  const i = scope.instances;
  if (i.global || i.areas.length) return null;
  return projectWhere(scope);
}

/**
 * The projects a scope reaches (entity `project`): every project at GLOBAL; the projects of the
 * caller's programs; the caller's projects; the projects of the caller's areas (an area without a
 * project reaches the projects with an area in that location). No instance means no project.
 */
export function projectWhere(scope: Scope): Prisma.ProjectWhereInput {
  const i = scope.instances;
  if (i.global) return {};
  const or: Prisma.ProjectWhereInput[] = [];
  if (i.programIds.length) or.push({ programId: { in: i.programIds } });
  if (i.projectIds.length) or.push({ id: { in: i.projectIds } });
  for (const a of i.areas)
    or.push(
      a.projectId
        ? { id: a.projectId }
        : { projectAreasProject: { some: { locationId: a.locationId } } },
    );
  return or.length ? { OR: or } : { id: { in: [] } };
}

/**
 * The programs a scope reaches: every program for GLOBAL, the caller's own programs (PROGRAM, the
 * PM), and the programs of the projects the caller reaches through a project or an area.
 */
export function programWhere(scope: Scope): Prisma.ProgramWhereInput {
  const i = scope.instances;
  if (i.global) return {};
  const or: Prisma.ProgramWhereInput[] = [];
  if (i.programIds.length) or.push({ id: { in: i.programIds } });
  if (i.projectIds.length || i.areas.length)
    or.push({ projectsProgram: { some: projectWhere(scope) } });
  return or.length ? { OR: or } : { id: { in: [] } };
}
