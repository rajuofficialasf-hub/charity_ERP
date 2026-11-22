import type { Tx } from '../core/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { PERMISSION_MARKERS } from '../openapi/drift.js';
import {
  type EffectiveGrant,
  type PanelOverride,
  WORKING_ASSIGNMENT,
  workingTeamProjects,
} from './effective.js';

/** A location, optionally inside one project (an area of a project or a panel-granted location). */
export interface Area {
  projectId: string | null;
  locationId: string;
  /**
   * For a district of a staff place: the area of that place. The people of a project are placed by
   * its areas, so the colleagues and the assignments of the place are read on this one.
   */
  within?: string;
}

/**
 * The scope instances a caller holds for one permission (docs/security/RBAC.md, "Data scopes and
 * their resolution"): GLOBAL, own records (SELF), programs, projects and areas. Several grants add
 * up.
 */
export interface ScopeInstances {
  global: boolean;
  self: boolean;
  programIds: string[];
  projectIds: string[];
  areas: Area[];
  /** Areas that reach volunteers only (condition `own_region` on the user entity). */
  volunteerAreas: Area[];
  /**
   * Projects a panel revoke took out (a revoked project, or every project of a revoked program):
   * every filter excludes them, whichever grant would reach them.
   */
  revokedProjectIds: string[];
  /** Programs a panel revoke took out; only GLOBAL needs them, the other instances drop them. */
  revokedProgramIds: string[];
  /**
   * Locations a panel revoke took out (a division, a district, an upazila or a union): every
   * filter of a record that has a place leaves out the records placed there, whichever grant
   * would reach them.
   */
  revokedLocationIds: string[];
  /**
   * With SELF on applications: the caller's active team places (project and lead), so the
   * applications they created stay theirs only while the owner is still their lead there.
   */
  teamLeads?: TeamLead[];
  /**
   * An ASSIGNED grant: the caller reaches the records they are assigned to by name, which each
   * entity's own filter resolves (a media work through its member rows).
   */
  assigned?: boolean;
}

/** A team member's place: the project and the lead volunteer they work under. */
export interface TeamLead {
  projectId: string;
  leadVolunteerId: string;
}

/** The caller's active team places, for the creator rule of the applications. */
export async function teamLeadsOf(db: Tx, userId: string): Promise<TeamLead[]> {
  return db.volunteerTeam.findMany({
    where: { removedAt: null, memberVolunteer: { userId } },
    select: { projectId: true, leadVolunteerId: true },
  });
}

/**
 * The applications a person reaches as their own: the ones their volunteer owns, and the ones
 * they created while the owner is still their team lead on that project (or nobody owns it). A
 * transfer moves the owner, so the old volunteer and their team, unless it moved too, lose the
 * application without its creator being rewritten.
 */
export function ownApplicationsWhere(
  actorId: string,
  teamLeads: readonly TeamLead[],
): Prisma.ApplicationWhereInput[] {
  return [
    { ownerVolunteer: { userId: actorId } },
    { createdByUserId: actorId, ownerVolunteerId: null },
    ...teamLeads.map((t) => ({
      createdByUserId: actorId,
      projectId: t.projectId,
      ownerVolunteerId: t.leadVolunteerId,
    })),
  ];
}

export const NO_INSTANCES: ScopeInstances = {
  global: false,
  self: false,
  programIds: [],
  projectIds: [],
  areas: [],
  volunteerAreas: [],
  revokedProjectIds: [],
  revokedProgramIds: [],
  revokedLocationIds: [],
};

declare const SCOPE_BRAND: unique symbol;

/**
 * The caller's scope for the route's permission and entity, made only by the access middleware:
 * data access of a scoped entity takes it as a required argument, so code without the
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
  // `workflow`: the engine decides per action from the project's snapshot (docs/architecture/WORKFLOW_ENGINE.md)
  if (permission === 'authenticated' || permission === 'entity' || permission === 'workflow')
    return true;
  if (PERMISSION_MARKERS.includes(permission)) return false; // public is decided before
  return grants.some((g) => g.permission === permission);
}

const AREA_SCOPES: readonly string[] = ['REGION', 'DISTRICT', 'UPAZILA', 'UNION'];
/** The workflow key of house construction (docs/architecture/workflow-templates, conditions.ts). */
const HOUSE_CONSTRUCTION_WORKFLOW = 'construction';
const areaKey = (a: Area) => `${a.projectId}|${a.locationId}`;

/**
 * Removes the instances a panel revoke names (docs/security/RBAC.md, "Permission panel": a revoke
 * beats every grant source). A revoked program also removes its projects and their areas
 * (`projectsOfRevokedPrograms`). The revoked projects, programs and locations are kept, so the
 * filters exclude them where a broader grant still reaches them: a program, an area without a
 * project, a region around a revoked district, or GLOBAL. Exported as a pure helper so its rules
 * are tested without a database.
 */
export function applyInstanceRevokes(
  instances: ScopeInstances,
  revokes: PanelOverride[],
  projectsOfRevokedPrograms: string[] = [],
): ScopeInstances {
  const named = (type: string) =>
    revokes.flatMap((r) => (r.scopeType === type && r.scopeRef !== null ? [r.scopeRef] : []));
  const programs = new Set(named('PROGRAM'));
  const projects = new Set([...named('PROJECT'), ...projectsOfRevokedPrograms]);
  const locations = new Set(
    revokes.flatMap((r) =>
      AREA_SCOPES.includes(r.scopeType) && r.scopeRef !== null ? [r.scopeRef] : [],
    ),
  );
  const keep = (a: Area) =>
    !locations.has(a.locationId) && !(a.projectId && projects.has(a.projectId));
  return {
    ...instances,
    programIds: instances.programIds.filter((id) => !programs.has(id)),
    projectIds: instances.projectIds.filter((id) => !projects.has(id)),
    areas: instances.areas.filter(keep),
    volunteerAreas: instances.volunteerAreas.filter(keep),
    revokedProjectIds: [...new Set([...instances.revokedProjectIds, ...projects])],
    revokedProgramIds: [...new Set([...instances.revokedProgramIds, ...programs])],
    revokedLocationIds: [...new Set([...instances.revokedLocationIds, ...locations])],
  };
}

/** The project condition that leaves out the revoked projects, or null without a revoke. */
function notRevoked(i: ScopeInstances): { id: { notIn: string[] } } | null {
  return i.revokedProjectIds.length ? { id: { notIn: i.revokedProjectIds } } : null;
}

/** The same on a row that names its project in `projectId` (staff, volunteers, areas, applications). */
function projectNotRevoked(i: ScopeInstances): { projectId?: { notIn: string[] } } {
  return i.revokedProjectIds.length ? { projectId: { notIn: i.revokedProjectIds } } : {};
}

const unique = <T>(values: T[], key: (v: T) => string) => [
  ...new Map(values.map((v) => [key(v), v])).values(),
];

/**
 * The caller's own areas in the given projects: the areas an RPM holds, and for a staff place its
 * districts where it has any, else its whole area.
 */
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
      select: {
        projectId: true,
        areaLocationId: true,
        districts: { where: { endedAt: null }, select: { locationId: true } },
      },
    }),
  ]);
  return [
    ...areas,
    ...staff.flatMap((s) =>
      s.districts.length
        ? s.districts.map((d) => ({
            projectId: s.projectId,
            locationId: d.locationId,
            within: s.areaLocationId!,
          }))
        : [{ projectId: s.projectId, locationId: s.areaLocationId! }],
    ),
  ];
}

/** The entities a grant limited to the attached house-construction projects reaches. */
const HOUSE_PROJECT_ENTITIES: ReadonlySet<string> = new Set([
  'beneficiary',
  'application',
  'project',
]);

/**
 * Resolves the instances of the grants of one permission from the assignment tables: PROGRAM from
 * `programs.pm_user_id`, PROJECT from the caller's project assignments, REGION and the area scopes
 * from `project_areas` (the caller as RPM) and the caller's `project_staff` area; grants that name
 * an instance (panel grants, project-bound grants) keep it. ASSIGNED resolves per entity with the
 * work assignments of later tasks; the user entity has none.
 *
 * Conditions (docs/security/RBAC.md, "Roles") narrow a grant for the route's entity; a condition
 * the entity has no rule for drops the grant, so an unknown or not yet evaluated condition denies
 * (fail closed). For users, `own_region` limits an area grant to the volunteers of that area.
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
    revokedProjectIds: [],
    revokedProgramIds: [],
    revokedLocationIds: [],
  };
  let ownPrograms = false;
  let ownProjects = false;
  const regionProjects = new Set<string | null>();
  const volunteerRegionProjects = new Set<string | null>();
  const houseProjects: string[] = [];
  let ownHouseProjects = false;
  const constructionPrograms: string[] = [];
  let ownConstructionPrograms = false;
  for (const g of grants) {
    if (g.condition !== null) {
      // the Program Manager decides on house construction only: the grant reaches the
      // construction projects of the program, checked below
      if (
        entity === 'application' &&
        g.condition === 'house_construction_only' &&
        g.scopeType === 'PROGRAM'
      ) {
        if (g.scopeRef) constructionPrograms.push(g.scopeRef);
        else ownConstructionPrograms = true;
      }
      // a team member reaches the applications they created themselves: the SELF filter of the
      // applications already stops at the caller's own and the ones they created
      if (entity === 'application' && g.condition === 'own_created' && g.scopeType === 'SELF')
        inst.self = true;
      if (entity === 'user' && g.condition === 'own_region' && AREA_SCOPES.includes(g.scopeType)) {
        if (g.scopeRef)
          inst.volunteerAreas.push({ projectId: g.projectId, locationId: g.scopeRef });
        else volunteerRegionProjects.add(g.projectId);
      }
      // the Procurement Team reaches the beneficiaries, the applications and the projects of the
      // house-construction projects it is attached to, and nothing else; the projects are
      // checked below
      if (
        HOUSE_PROJECT_ENTITIES.has(entity) &&
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
        inst.assigned = true;
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
  if (constructionPrograms.length || ownConstructionPrograms) {
    const projects = await db.project.findMany({
      where: {
        workflowDefinition: { key: HOUSE_CONSTRUCTION_WORKFLOW },
        program: {
          OR: [
            ...(ownConstructionPrograms ? [{ pmUserId: actorId }] : []),
            ...(constructionPrograms.length ? [{ id: { in: constructionPrograms } }] : []),
          ],
        },
      },
      select: { id: true },
    });
    inst.projectIds.push(...projects.map((p) => p.id));
  }
  if (entity === 'application' && inst.self) inst.teamLeads = await teamLeadsOf(db, actorId);
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

/**
 * The assignments of an area by the region stored at assignment. A district of a staff place also
 * reaches the assignments stored on the place's area whose volunteer lives in the district, since
 * an assignment names the project's area and never a district inside it.
 */
export function assignmentsIn(a: Area): Prisma.ProjectVolunteerWhereInput {
  const stored = { regionLocationId: a.locationId };
  if (!a.within) return stored;
  return {
    OR: [stored, { regionLocationId: a.within, volunteer: { districtId: a.locationId } }],
  };
}

/** Volunteers assigned to a project inside the area; `others` limits an area without a project. */
function volunteersIn(a: Area, others: { projectId?: { notIn: string[] } }): Prisma.UserWhereInput {
  const project = a.projectId ? { projectId: a.projectId } : others;
  return {
    volunteersUser: {
      is: {
        projectVolunteersVolunteer: {
          some: { AND: [{ endedAt: null, ...project }, assignmentsIn(a)] },
        },
      },
    },
  };
}

/**
 * The users a scope reaches (entity `user`): everyone at GLOBAL; the caller for SELF; the users of
 * the caller's programs and projects; for an area, the users working in that location (inside its
 * project when the area names one, by home division otherwise); for a volunteer area, only the
 * volunteers there. A revoked project reaches nobody; its people stay when another path reaches
 * them. A revoked location leaves out the people whose own place it is (`userOutsideRevoked`),
 * whichever grant reaches them. No instance means no user.
 */
export function userWhere(scope: Scope): Prisma.UserWhereInput {
  const i = scope.instances;
  const outside = userOutsideRevoked(i);
  if (i.global) return outside ?? {};
  const or: Prisma.UserWhereInput[] = [];
  const others = projectNotRevoked(i);
  if (i.self) or.push({ id: scope.actorId });
  if (i.programIds.length)
    or.push(
      { homeProgramId: { in: i.programIds } },
      ...usersOnProjects({ programId: { in: i.programIds }, ...notRevoked(i) }),
    );
  if (i.projectIds.length) or.push(...usersOnProjects({ id: { in: i.projectIds } }));
  for (const a of i.areas) {
    const project = a.projectId ? { projectId: a.projectId } : others;
    // the staff and the RPM of a project are placed by its areas: a district of a place reads them
    // on the place's area
    const placed = a.within ?? a.locationId;
    or.push(
      { projectStaffUser: { some: { endedAt: null, areaLocationId: placed, ...project } } },
      volunteersIn(a, others),
      { projectAreasRpmUser: { some: { locationId: placed, ...project } } },
    );
    if (!a.projectId) or.push({ homeDivisionId: a.locationId });
  }
  for (const a of i.volunteerAreas) or.push(volunteersIn(a, others));
  if (!or.length) return { id: { in: [] } };
  return outside ? { AND: [{ OR: or }, outside] } : { OR: or };
}

const ADDRESS_COLUMNS = ['divisionId', 'districtId', 'upazilaId', 'unionId'] as const;
const ADDRESS_RELATIONS = ['division', 'district', 'upazila', 'union'] as const;

/** The address columns that name one of the locations, at any level. */
const addressIn = (locationIds: string[]) =>
  ADDRESS_COLUMNS.map((column) => ({ [column]: { in: locationIds } }));

/**
 * The condition that a record with an address (a volunteer, a beneficiary) lies in none of the
 * revoked locations, or null without such a revoke. A district names its unions too: each record
 * carries every level of its address.
 */
function addressOutsideRevoked(i: ScopeInstances) {
  return i.revokedLocationIds.length ? { NOT: { OR: addressIn(i.revokedLocationIds) } } : null;
}

/**
 * The same for a user: an official's place is the home division, a volunteer's the address. An
 * official without a home division is in no location, so no revoked location leaves them out.
 */
function userOutsideRevoked(i: ScopeInstances): Prisma.UserWhereInput | null {
  const ids = i.revokedLocationIds;
  if (!ids.length) return null;
  return {
    AND: [
      { OR: [{ homeDivisionId: null }, { homeDivisionId: { notIn: ids } }] },
      { NOT: { volunteersUser: { is: { OR: addressIn(ids) } } } },
    ],
  };
}

/**
 * The volunteers a scope reaches by their address (entity `volunteer`): everyone at GLOBAL; the own
 * row for SELF; for an area (REGION, a split district or a smaller area) the volunteers whose
 * division, district, upazila or union is that location; for PROGRAM and PROJECT the volunteers in
 * the area locations of those projects, never of a revoked one. A pending or unassigned volunteer
 * is on no project, so the address decides. A volunteer whose address lies in a revoked location is
 * left out, whichever grant reaches them.
 */
export function volunteerWhere(scope: Scope): Prisma.VolunteerWhereInput {
  const i = scope.instances;
  const outside = addressOutsideRevoked(i);
  if (i.global) return outside ?? {};
  const or: Prisma.VolunteerWhereInput[] = [];
  if (i.self) or.push({ userId: scope.actorId });
  const locations = [...new Set([...i.areas, ...i.volunteerAreas].map((a) => a.locationId))];
  if (locations.length)
    for (const column of ADDRESS_COLUMNS) or.push({ [column]: { in: locations } });
  const inAreasOf = (area: Prisma.ProjectAreaWhereInput) =>
    ADDRESS_RELATIONS.map((relation) => ({
      [relation]: { projectAreasLocation: { some: area } },
    }));
  if (i.programIds.length)
    or.push(
      ...inAreasOf({ project: { programId: { in: i.programIds } }, ...projectNotRevoked(i) }),
    );
  if (i.projectIds.length) or.push(...inAreasOf({ projectId: { in: i.projectIds } }));
  if (!or.length) return { id: { in: [] } };
  return outside ? { AND: [{ OR: or }, outside] } : { OR: or };
}

/**
 * The beneficiaries a scope reaches (entity `beneficiary`): everyone at GLOBAL;
 * for an area the beneficiaries whose division, district, upazila or union is that location; for
 * PROGRAM and PROJECT the beneficiaries with an application in those projects (the Procurement
 * Team's house-construction projects among them), never through a revoked project and never a
 * beneficiary whose address lies in a revoked location. A beneficiary has no account, so SELF
 * reaches nobody.
 */
export function beneficiaryWhere(scope: Scope): Prisma.BeneficiaryWhereInput {
  const i = scope.instances;
  const outside = addressOutsideRevoked(i);
  if (i.global) return outside ?? {};
  const or: Prisma.BeneficiaryWhereInput[] = [];
  const locations = [...new Set(i.areas.map((a) => a.locationId))];
  if (locations.length)
    for (const column of ADDRESS_COLUMNS) or.push({ [column]: { in: locations } });
  if (i.programIds.length)
    or.push({
      applicationsBeneficiary: {
        some: { project: { programId: { in: i.programIds } }, ...projectNotRevoked(i) },
      },
    });
  if (i.projectIds.length)
    or.push({ applicationsBeneficiary: { some: { projectId: { in: i.projectIds } } } });
  if (!or.length) return { id: { in: [] } };
  return outside ? { AND: [{ OR: or }, outside] } : { OR: or };
}

/**
 * The reach of `beneficiaryWhere` as an SQL condition on the beneficiary row named `alias`, for the
 * raw queries over many profiles (the duplicate suggestions); a test proves both select the same
 * profiles. The alias is one of a fixed few, never input.
 */
export function beneficiaryScopeSql(scope: Scope, alias: 'b' | 'x' | 'y'): Prisma.Sql {
  const i = scope.instances;
  const row = Prisma.raw(alias);
  const uuids = (ids: string[]) => Prisma.sql`ARRAY[${Prisma.join(ids)}]::uuid[]`;
  const placedIn = (locations: string[]) => {
    const ids = uuids(locations);
    return Prisma.sql`(${row}.division_id = ANY(${ids}) OR ${row}.district_id = ANY(${ids}) OR ${row}.upazila_id = ANY(${ids}) OR ${row}.union_id = ANY(${ids}))`;
  };
  const outside = i.revokedLocationIds.length
    ? Prisma.sql`NOT ${placedIn(i.revokedLocationIds)}`
    : null;
  if (i.global) return outside ?? Prisma.sql`TRUE`;
  const or: Prisma.Sql[] = [];
  const locations = [...new Set(i.areas.map((a) => a.locationId))];
  if (locations.length) or.push(placedIn(locations));
  const notRevokedSql = i.revokedProjectIds.length
    ? Prisma.sql` AND NOT (ap.project_id = ANY(${uuids(i.revokedProjectIds)}))`
    : Prisma.empty;
  if (i.programIds.length)
    or.push(
      Prisma.sql`EXISTS (SELECT 1 FROM applications ap JOIN projects pr ON pr.id = ap.project_id WHERE ap.beneficiary_id = ${row}.id AND pr.program_id = ANY(${uuids(i.programIds)})${notRevokedSql})`,
    );
  if (i.projectIds.length)
    or.push(
      Prisma.sql`EXISTS (SELECT 1 FROM applications ap WHERE ap.beneficiary_id = ${row}.id AND ap.project_id = ANY(${uuids(i.projectIds)}))`,
    );
  if (!or.length) return Prisma.sql`FALSE`;
  const reach = Prisma.sql`(${Prisma.join(or, ' OR ')})`;
  return outside ? Prisma.sql`(${reach} AND ${outside})` : reach;
}

/**
 * The SQL condition that every scope reaches the beneficiary row named `alias`; FALSE where no
 * scope is given, so a query that names only reachable profiles names nobody.
 */
export function beneficiaryReachedByAll(
  scopes: readonly Scope[] | null,
  alias: 'b' | 'x' | 'y',
): Prisma.Sql {
  if (!scopes?.length) return Prisma.sql`FALSE`;
  return Prisma.sql`(${Prisma.join(
    scopes.map((s) => beneficiaryScopeSql(s, alias)),
    ' AND ',
  )})`;
}

/**
 * The projects whose rows a caller sees inside one beneficiary's profile: no limit at GLOBAL or
 * for an area scope (the person is theirs) beyond the revoked projects, otherwise only the
 * scope's projects, so a team attached to a few projects never reads the person's other projects.
 */
export function beneficiaryRowsProjectWhere(scope: Scope): Prisma.ProjectWhereInput | null {
  const i = scope.instances;
  if (i.global || i.areas.length) return notRevoked(i);
  return projectWhere(scope);
}

/**
 * The projects a scope reaches (entity `project`): every project at GLOBAL; the projects of the
 * caller's programs; the caller's projects; the projects of the caller's areas (an area without a
 * project reaches the projects with an area in that location). A revoked project is left out
 * whichever of these reaches it. No instance means no project.
 */
export function projectWhere(scope: Scope): Prisma.ProjectWhereInput {
  const i = scope.instances;
  const kept = notRevoked(i);
  if (i.global) return kept ?? {};
  const or: Prisma.ProjectWhereInput[] = [];
  if (i.programIds.length) or.push({ programId: { in: i.programIds } });
  if (i.projectIds.length) or.push({ id: { in: i.projectIds } });
  for (const a of i.areas)
    or.push(
      a.projectId
        ? { id: a.projectId }
        : { projectAreasProject: { some: { locationId: a.locationId } } },
    );
  if (!or.length) return { id: { in: [] } };
  return kept ? { AND: [{ OR: or }, kept] } : { OR: or };
}

/**
 * The programs a scope reaches: every program for GLOBAL, the caller's own programs (PROGRAM, the
 * PM), and the programs of the projects the caller reaches through a project or an area. A revoked
 * program is left out at GLOBAL too.
 */
export function programWhere(scope: Scope): Prisma.ProgramWhereInput {
  const i = scope.instances;
  if (i.global) return i.revokedProgramIds.length ? { id: { notIn: i.revokedProgramIds } } : {};
  const or: Prisma.ProgramWhereInput[] = [];
  if (i.programIds.length) or.push({ id: { in: i.programIds } });
  if (i.projectIds.length || i.areas.length)
    or.push({ projectsProgram: { some: projectWhere(scope) } });
  return or.length ? { OR: or } : { id: { in: [] } };
}

/** The applications placed in a location at any of its levels (region, district, upazila, union). */
const applicationsIn = (locationId: string): Prisma.ApplicationWhereInput => ({
  OR: [
    { regionLocationId: locationId },
    { districtId: locationId },
    { unionId: locationId },
    { union: { parentId: locationId } },
  ],
});

/**
 * The applications a scope reaches (entity `application`): everything at GLOBAL but the projects
 * revoked for the caller; for SELF the applications the caller's volunteer owns and the ones the
 * caller created (a team member's own records); for an area, the applications placed in that
 * location at any of its levels, inside the area's project when the area names one (an RPM holds
 * a region project by project); the applications of the caller's programs and projects. An
 * application placed in a revoked location is left out, whichever grant reaches it. No instance
 * means no application.
 */
export function applicationWhere(scope: Scope): Prisma.ApplicationWhereInput {
  const i = scope.instances;
  const notRevoked: Prisma.ApplicationWhereInput = i.revokedProjectIds.length
    ? { projectId: { notIn: i.revokedProjectIds } }
    : {};
  const outside = i.revokedLocationIds.map((id) => ({ NOT: applicationsIn(id) }));
  if (i.global) return outside.length ? { AND: [notRevoked, ...outside] } : notRevoked;
  const or: Prisma.ApplicationWhereInput[] = [];
  if (i.self) or.push(...ownApplicationsWhere(scope.actorId, i.teamLeads ?? []));
  for (const a of i.areas)
    or.push(
      a.projectId
        ? { AND: [{ projectId: a.projectId }, applicationsIn(a.locationId)] }
        : applicationsIn(a.locationId),
    );
  if (i.programIds.length) or.push({ project: { programId: { in: i.programIds } } });
  if (i.projectIds.length) or.push({ projectId: { in: i.projectIds } });
  if (!or.length) return { id: { in: [] } };
  return { AND: [{ OR: or }, notRevoked, ...outside] };
}

/**
 * The media referrals a scope reaches: those of the applications it reaches, and for an ASSIGNED
 * grant those whose work the caller is a member of (a Media Team member sees only their own
 * works). No instance means no referral.
 */
export function mediaReferralWhere(scope: Scope): Prisma.MediaReferralWhereInput {
  const byApplication: Prisma.MediaReferralWhereInput = { application: applicationWhere(scope) };
  if (!scope.instances.assigned) return byApplication;
  return {
    OR: [byApplication, { work: { members: { some: { userId: scope.actorId } } } }],
  };
}
