import { describe, expect, it } from 'vitest';
import type { EffectiveGrant, PanelOverride } from './effective';
import {
  applyInstanceRevokes,
  holdsPermission,
  makeScope,
  type ScopeInstances,
  userWhere,
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
});

describe('holding a permission', () => {
  it('passes authenticated callers, denies the workflow and entity markers and unheld names', () => {
    const grants = [grant({}), grant({ permission: 'session.revoke_own', scopeType: 'SELF' })];
    expect(holdsPermission('authenticated', grants)).toBe(true);
    expect(holdsPermission('application.view', grants)).toBe(true);
    expect(holdsPermission('session.revoke_own', grants)).toBe(true);
    expect(holdsPermission('permission.view', grants)).toBe(false);
    expect(holdsPermission('workflow', grants)).toBe(false);
    expect(holdsPermission('entity', grants)).toBe(false);
  });
});

describe('the user filter', () => {
  const none: ScopeInstances = {
    global: false,
    self: false,
    programIds: [],
    projectIds: [],
    areas: [],
  };
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
});
