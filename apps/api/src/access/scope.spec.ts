import { describe, expect, it } from 'vitest';
import type { EffectiveGrant, PanelOverride } from './effective';
import {
  applicationWhere,
  applyInstanceRevokes,
  beneficiaryRowsProjectWhere,
  beneficiaryWhere,
  holdsPermission,
  makeScope,
  mediaReferralWhere,
  NO_INSTANCES,
  programWhere,
  projectWhere,
  type ScopeInstances,
  userWhere,
  volunteerWhere,
} from './scope';

const grant = (over: Partial<EffectiveGrant>): EffectiveGrant => ({
  permission: 'application.view',
  scopeType: 'REGION',
  scopeRef: null,
  condition: null,
  source: 'role_default',
  projectId: null,
  ...over,
});

const revoke = (over: Partial<PanelOverride>): PanelOverride => ({
  id: 'r1',
  permission: 'application.view',
  effect: 'revoke',
  scopeType: 'REGION',
  scopeRef: null,
  condition: null,
  expiresAt: null,
  ...over,
});

const P1 = '00000000-0000-7000-8000-0000000000a1';
const P2 = '00000000-0000-7000-8000-0000000000b2';
const DHAKA = '00000000-0000-7000-8000-0000000000d1';
const RANGPUR = '00000000-0000-7000-8000-0000000000d2';

// Scope resolution (RBAC.md 4 and 8).
describe('scope instances', () => {
  const instances = (): ScopeInstances => ({
    global: false,
    self: false,
    programIds: [P1, P2],
    projectIds: [P1, P2],
    areas: [
      { projectId: P1, locationId: DHAKA },
      { projectId: P1, locationId: RANGPUR },
      { projectId: P2, locationId: DHAKA },
    ],
    volunteerAreas: [{ projectId: P1, locationId: DHAKA }],
    revokedProjectIds: [],
    revokedProgramIds: [],
  });

  it('subtracts a revoked region, project and program from the resolved instances', () => {
    const region = applyInstanceRevokes(instances(), [revoke({ scopeRef: DHAKA })]);
    expect(region.areas).toEqual([{ projectId: P1, locationId: RANGPUR }]);
    const project = applyInstanceRevokes(instances(), [
      revoke({ scopeType: 'PROJECT', scopeRef: P1 }),
    ]);
    expect(project.projectIds).toEqual([P2]);
    expect(project.areas).toEqual([{ projectId: P2, locationId: DHAKA }]);
    const program = applyInstanceRevokes(instances(), [
      revoke({ scopeType: 'PROGRAM', scopeRef: P2 }),
    ]);
    expect(program.programIds).toEqual([P1]);
  });

  it('removes the projects and areas of a revoked program', () => {
    const program = applyInstanceRevokes(
      instances(),
      [revoke({ scopeType: 'PROGRAM', scopeRef: P2 })],
      [P1],
    );
    expect(program.projectIds).toEqual([P2]);
    expect(program.areas).toEqual([{ projectId: P2, locationId: DHAKA }]);
    expect(program.volunteerAreas).toEqual([]);
  });

  it('keeps the revoked projects and programs for the filters', () => {
    const revoked = applyInstanceRevokes(
      instances(),
      [
        revoke({ scopeType: 'PROJECT', scopeRef: P2 }),
        revoke({ scopeType: 'PROGRAM', scopeRef: P2 }),
        revoke({ scopeType: 'PROJECT', scopeRef: null }),
      ],
      [P1],
    );
    expect(revoked.revokedProjectIds).toEqual([P2, P1]);
    expect(revoked.revokedProgramIds).toEqual([P2]);
    // a PROJECT revoke does not touch the program of the project: the filters leave it out instead
    const project = applyInstanceRevokes(instances(), [
      revoke({ scopeType: 'PROJECT', scopeRef: P1 }),
    ]);
    expect(project.programIds).toEqual([P1, P2]);
    expect(project.revokedProjectIds).toEqual([P1]);
    expect(project.revokedProgramIds).toEqual([]);
  });
});

// A project revoke beats every grant source (RBAC.md 7).
describe('the revoked projects in every filter', () => {
  const R = '00000000-0000-7000-8000-0000000000c3';
  const outside = { id: { notIn: [R] } };
  const scope = (entity: string, i: Partial<ScopeInstances>) =>
    makeScope('actor', 'application.view_official_section', entity, {
      ...NO_INSTANCES,
      revokedProjectIds: [R],
      ...i,
    });

  it("leaves the revoked project out of the PM's program, an area and GLOBAL", () => {
    expect(projectWhere(scope('project', { programIds: [P1] }))).toEqual({
      AND: [{ OR: [{ programId: { in: [P1] } }] }, outside],
    });
    expect(
      projectWhere(scope('project', { areas: [{ projectId: null, locationId: DHAKA }] })),
    ).toEqual({
      AND: [{ OR: [{ projectAreasProject: { some: { locationId: DHAKA } } }] }, outside],
    });
    expect(projectWhere(scope('project', { global: true }))).toEqual(outside);
    // still nothing without an instance
    expect(projectWhere(scope('project', {}))).toEqual({ id: { in: [] } });
  });

  it('builds the program filter on the project filter and hides a revoked program at GLOBAL', () => {
    const w = programWhere(scope('program', { projectIds: [P2] })) as {
      OR: { projectsProgram: { some: unknown } }[];
    };
    expect(w.OR[0]!.projectsProgram.some).toEqual({
      AND: [{ OR: [{ id: { in: [P2] } }] }, outside],
    });
    expect(programWhere(scope('program', { global: true, revokedProgramIds: [P1] }))).toEqual({
      id: { notIn: [P1] },
    });
    expect(programWhere(scope('program', { global: true }))).toEqual({});
  });

  it('closes only the path through the revoked project for users', () => {
    const w = userWhere(
      scope('user', { programIds: [P1], areas: [{ projectId: null, locationId: DHAKA }] }),
    ) as { OR: unknown[] };
    // the home program and the home division are not reached through a project
    expect(w.OR).toContainEqual({ homeProgramId: { in: [P1] } });
    expect(w.OR).toContainEqual({ homeDivisionId: DHAKA });
    expect(w.OR).toContainEqual({
      projectStaffUser: {
        some: { endedAt: null, project: { programId: { in: [P1] }, ...outside } },
      },
    });
    expect(w.OR).toContainEqual({
      projectAreasRpmUser: { some: { locationId: DHAKA, projectId: { notIn: [R] } } },
    });
    // GLOBAL reaches every person directly, never through a project
    expect(userWhere(scope('user', { global: true }))).toEqual({});
  });

  it('leaves the revoked project out of the volunteer and beneficiary filters', () => {
    const v = volunteerWhere(scope('volunteer', { programIds: [P1] })) as { OR: unknown[] };
    expect(v.OR).toContainEqual({
      division: {
        projectAreasLocation: {
          some: { project: { programId: { in: [P1] } }, projectId: { notIn: [R] } },
        },
      },
    });
    expect(beneficiaryWhere(scope('beneficiary', { programIds: [P1] }))).toEqual({
      OR: [
        {
          applicationsBeneficiary: {
            some: { project: { programId: { in: [P1] } }, projectId: { notIn: [R] } },
          },
        },
      ],
    });
    // the rows inside a profile: no limit at GLOBAL or for an area, except the revoked project
    expect(beneficiaryRowsProjectWhere(scope('beneficiary', { global: true }))).toEqual(outside);
    expect(
      beneficiaryRowsProjectWhere(
        scope('beneficiary', { areas: [{ projectId: null, locationId: RANGPUR }] }),
      ),
    ).toEqual(outside);
  });
});

describe('holding a permission', () => {
  it('passes authenticated callers and the entity and workflow markers, denies unheld names', () => {
    const grants = [grant({}), grant({ permission: 'session.revoke_own', scopeType: 'SELF' })];
    expect(holdsPermission('authenticated', grants)).toBe(true);
    expect(holdsPermission('application.view', grants)).toBe(true);
    expect(holdsPermission('session.revoke_own', grants)).toBe(true);
    expect(holdsPermission('permission.view', grants)).toBe(false);
    // the file service decides an `entity` route per file; the workflow
    // engine decides a `workflow` route per transition, with the permission the template names
    expect(holdsPermission('entity', grants)).toBe(true);
    expect(holdsPermission('workflow', grants)).toBe(true);
    expect(holdsPermission('public', grants)).toBe(false);
  });
});

describe('the application filter', () => {
  const where = (i: Partial<ScopeInstances>) =>
    applicationWhere(
      makeScope('actor', 'application.review', 'application', { ...NO_INSTANCES, ...i }),
    );
  const placedIn = (locationId: string) => ({
    OR: [
      { regionLocationId: locationId },
      { districtId: locationId },
      { unionId: locationId },
      { union: { parentId: locationId } },
    ],
  });

  it('reaches every application at GLOBAL but the revoked projects, and none without an instance', () => {
    expect(where({ global: true })).toEqual({});
    expect(where({ global: true, revokedProjectIds: [P2] })).toEqual({
      projectId: { notIn: [P2] },
    });
    expect(where({})).toEqual({ id: { in: [] } });
  });

  it('keeps an area inside its project, so a region held in one project reaches no other project', () => {
    const w = where({
      areas: [
        { projectId: P1, locationId: DHAKA },
        { projectId: null, locationId: RANGPUR },
      ],
    }) as { AND: [{ OR: unknown[] }, unknown] };
    expect(w.AND[0].OR).toEqual([{ AND: [{ projectId: P1 }, placedIn(DHAKA)] }, placedIn(RANGPUR)]);
  });

  it('adds up SELF, programs and projects into one OR', () => {
    const w = where({ self: true, programIds: [P1], projectIds: [P2] }) as {
      AND: [{ OR: unknown[] }, unknown];
    };
    expect(w.AND[0].OR).toEqual([
      { ownerVolunteer: { userId: 'actor' } },
      { createdByUserId: 'actor', ownerVolunteerId: null },
      { project: { programId: { in: [P1] } } },
      { projectId: { in: [P2] } },
    ]);
  });

  it('keeps a creator on an application only while its owner is their team lead on that project', () => {
    const w = where({
      self: true,
      teamLeads: [{ projectId: P1, leadVolunteerId: 'lead-a' }],
    }) as { AND: [{ OR: unknown[] }, unknown] };
    expect(w.AND[0].OR).toEqual([
      { ownerVolunteer: { userId: 'actor' } },
      { createdByUserId: 'actor', ownerVolunteerId: null },
      { createdByUserId: 'actor', projectId: P1, ownerVolunteerId: 'lead-a' },
    ]);
    // with no team place left, only what the caller's own volunteer owns stays
    const alone = where({ self: true }) as { AND: [{ OR: unknown[] }, unknown] };
    expect(alone.AND[0].OR).not.toContainEqual({ createdByUserId: 'actor' });
  });
});

describe('the user filter', () => {
  const none = NO_INSTANCES;
  const where = (i: Partial<ScopeInstances>) =>
    userWhere(makeScope('actor', 'permission.view', 'user', { ...none, ...i }));

  it('reaches everyone at GLOBAL and nobody without an instance', () => {
    expect(where({ global: true })).toEqual({});
    expect(where({})).toEqual({ id: { in: [] } });
  });

  it('adds up several scopes into one OR', () => {
    const self = where({ self: true }) as { OR: unknown[] };
    const both = where({
      self: true,
      programIds: [P1],
      areas: [{ projectId: null, locationId: DHAKA }],
    }) as {
      OR: unknown[];
    };
    expect(self.OR).toEqual([{ id: 'actor' }]);
    expect(both.OR).toContainEqual({ id: 'actor' });
    expect(both.OR).toContainEqual({ homeProgramId: { in: [P1] } });
    expect(both.OR).toContainEqual({ homeDivisionId: DHAKA });
  });

  it('keeps an area inside its project when the area names one', () => {
    const bound = where({ areas: [{ projectId: P1, locationId: DHAKA }] }) as { OR: unknown[] };
    expect(bound.OR).toContainEqual({
      projectAreasRpmUser: { some: { locationId: DHAKA, projectId: P1 } },
    });
    expect(bound.OR).not.toContainEqual({ homeDivisionId: DHAKA });
  });

  it('reaches only volunteers through a volunteer area', () => {
    const v = where({ volunteerAreas: [{ projectId: P1, locationId: DHAKA }] }) as {
      OR: unknown[];
    };
    expect(v.OR).toHaveLength(1);
    expect(JSON.stringify(v.OR[0])).toContain('volunteersUser');
  });
});

describe('the program filter', () => {
  const where = (i: Partial<ScopeInstances>) =>
    programWhere(makeScope('actor', 'program.view', 'program', { ...NO_INSTANCES, ...i }));

  it('reaches every program at GLOBAL and none without an instance', () => {
    expect(where({ global: true })).toEqual({});
    expect(where({})).toEqual({ id: { in: [] } });
  });

  it('reaches the own programs and the programs of the projects reached', () => {
    expect(where({ programIds: [P1] })).toEqual({ OR: [{ id: { in: [P1] } }] });
    const w = where({ projectIds: [P2], areas: [{ projectId: P1, locationId: DHAKA }] }) as {
      OR: { projectsProgram: { some: unknown } }[];
    };
    expect(w.OR).toHaveLength(1);
    expect(w.OR[0]!.projectsProgram.some).toEqual({
      OR: [{ id: { in: [P2] } }, { id: P1 }],
    });
  });
});

describe('the project filter', () => {
  const where = (i: Partial<ScopeInstances>) =>
    projectWhere(
      makeScope('actor', 'project.volunteer_grant.manage', 'project', { ...NO_INSTANCES, ...i }),
    );

  it('reaches every project at GLOBAL and none without an instance', () => {
    expect(where({ global: true })).toEqual({});
    expect(where({ self: true })).toEqual({ id: { in: [] } });
  });

  it('adds up programs, projects and areas', () => {
    const w = where({
      programIds: [P1],
      projectIds: [P2],
      areas: [
        { projectId: P1, locationId: DHAKA },
        { projectId: null, locationId: RANGPUR },
      ],
    }) as { OR: unknown[] };
    expect(w.OR).toEqual([
      { programId: { in: [P1] } },
      { id: { in: [P2] } },
      { id: P1 },
      { projectAreasProject: { some: { locationId: RANGPUR } } },
    ]);
  });
});

describe('the volunteer filter by address', () => {
  const none = NO_INSTANCES;
  const where = (i: Partial<ScopeInstances>) =>
    volunteerWhere(makeScope('actor', 'registration.approve', 'volunteer', { ...none, ...i }));
  const DISTRICT = '01890000-0000-7000-8000-0000000000d1';

  it('reaches every volunteer at GLOBAL and none without an instance', () => {
    expect(where({ global: true })).toEqual({});
    expect(where({})).toEqual({ id: { in: [] } });
  });

  it('REGION reaches volunteers whose division, district, upazila or union is a region of the caller', () => {
    const region = where({ areas: [{ projectId: P1, locationId: DHAKA }] }) as { OR: unknown[] };
    for (const column of ['divisionId', 'districtId', 'upazilaId', 'unionId'])
      expect(region.OR).toContainEqual({ [column]: { in: [DHAKA] } });
  });

  it('a split district reaches the volunteers of that district only', () => {
    const split = where({ areas: [{ projectId: P1, locationId: DISTRICT }] }) as { OR: unknown[] };
    expect(split.OR).toContainEqual({ districtId: { in: [DISTRICT] } });
    expect(JSON.stringify(split)).not.toContain(DHAKA);
  });

  it("PROGRAM reaches the volunteers in the area locations of the program's projects", () => {
    const program = where({ programIds: [P1] }) as { OR: unknown[] };
    const inProgram = { some: { project: { programId: { in: [P1] } } } };
    expect(program.OR).toContainEqual({ division: { projectAreasLocation: inProgram } });
    expect(program.OR).toContainEqual({ union: { projectAreasLocation: inProgram } });
  });

  it('SELF reaches the own volunteer row', () => {
    expect(where({ self: true })).toEqual({ OR: [{ userId: 'actor' }] });
  });
});

describe('beneficiaryWhere and the rows inside a profile', () => {
  const none: ScopeInstances = { ...NO_INSTANCES, programIds: [], projectIds: [], areas: [] };
  const scope = (i: Partial<ScopeInstances>) =>
    makeScope('actor', 'beneficiary.view_all', 'beneficiary', { ...none, ...i });

  it('reaches every beneficiary at GLOBAL and none without an instance or for SELF', () => {
    expect(beneficiaryWhere(scope({ global: true }))).toEqual({});
    expect(beneficiaryWhere(scope({}))).toEqual({ id: { in: [] } });
    expect(beneficiaryWhere(scope({ self: true }))).toEqual({ id: { in: [] } });
  });

  it('reaches by address for an area and by application for a project or a program', () => {
    const area = beneficiaryWhere(scope({ areas: [{ projectId: P1, locationId: DHAKA }] })) as {
      OR: unknown[];
    };
    for (const column of ['divisionId', 'districtId', 'upazilaId', 'unionId'])
      expect(area.OR).toContainEqual({ [column]: { in: [DHAKA] } });
    expect(beneficiaryWhere(scope({ projectIds: [P1] }))).toEqual({
      OR: [{ applicationsBeneficiary: { some: { projectId: { in: [P1] } } } }],
    });
    expect(beneficiaryWhere(scope({ programIds: [P2] }))).toEqual({
      OR: [{ applicationsBeneficiary: { some: { project: { programId: { in: [P2] } } } } }],
    });
  });

  it('limits the rows of a profile to the projects of a project scope only', () => {
    expect(beneficiaryRowsProjectWhere(scope({ global: true }))).toBeNull();
    expect(
      beneficiaryRowsProjectWhere(scope({ areas: [{ projectId: null, locationId: RANGPUR }] })),
    ).toBeNull();
    expect(beneficiaryRowsProjectWhere(scope({ projectIds: [P1] }))).toEqual({
      OR: [{ id: { in: [P1] } }],
    });
  });
});

describe('the media referral filter', () => {
  const where = (i: Partial<ScopeInstances>) =>
    mediaReferralWhere(
      makeScope('actor', 'media.work.view', 'application', { ...NO_INSTANCES, ...i }),
    );

  it('reaches the referrals of the applications the scope reaches', () => {
    expect(where({ global: true })).toEqual({ application: {} });
    expect(where({ programIds: [P1] })).toEqual({
      application: { AND: [{ OR: [{ project: { programId: { in: [P1] } } }] }, {}] },
    });
    expect(where({})).toEqual({ application: { id: { in: [] } } });
  });

  it('adds the works the caller is a member of for an ASSIGNED grant', () => {
    expect(where({ assigned: true })).toEqual({
      OR: [
        { application: { id: { in: [] } } },
        { work: { members: { some: { userId: 'actor' } } } },
      ],
    });
  });
});
