import { describe, expect, it } from 'vitest';
import type { EffectiveGrant, PanelOverride } from './effective';
import {
  applyInstanceRevokes,
  holdsPermission,
  makeScope,
  NO_INSTANCES,
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

// Scope resolution (RBAC.md 4 and 8; plan docs/plans/2026-10-12-1100-feat-rbac-permission-panel-plan.md, U3).
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
});

describe('holding a permission', () => {
  it('passes authenticated callers and the entity marker, denies workflow and unheld names', () => {
    const grants = [grant({}), grant({ permission: 'session.revoke_own', scopeType: 'SELF' })];
    expect(holdsPermission('authenticated', grants)).toBe(true);
    expect(holdsPermission('application.view', grants)).toBe(true);
    expect(holdsPermission('session.revoke_own', grants)).toBe(true);
    expect(holdsPermission('permission.view', grants)).toBe(false);
    expect(holdsPermission('workflow', grants)).toBe(false);
    // the file service decides an `entity` route per file (DECISION_LOG D-087)
    expect(holdsPermission('entity', grants)).toBe(true);
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

describe('the volunteer filter by address (DECISION_LOG D-084)', () => {
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
