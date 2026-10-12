import { describe, expect, it } from 'vitest';
import { assertConditionsCovered, checkCondition } from './conditions';
import {
  type AccessFacts,
  effectiveAccess,
  effectivePermissions,
  type EffectiveGrant,
} from './effective';
import { loadAccessRegistry, parsePermissionsFile, readPermissionsFile } from './registry';

const registry = loadAccessRegistry();
const NOW = new Date('2026-10-12T06:00:00Z');
const PROJECT_A = '00000000-0000-7000-8000-00000000000a';
const PROJECT_B = '00000000-0000-7000-8000-00000000000b';

const facts = (over: Partial<AccessFacts>): AccessFacts => ({
  roles: [],
  volunteerType: null,
  projectStaff: [],
  projectVolunteers: [],
  overrides: [],
  ...over,
});
const names = (grants: EffectiveGrant[]) => new Set(grants.map((g) => g.permission));
const on = (grants: EffectiveGrant[], projectId: string) =>
  new Set(grants.filter((g) => g.projectId === projectId).map((g) => g.permission));

// Effective permissions from the four sources of RBAC.md 1 (plan
// docs/plans/2026-10-12-1100-feat-rbac-permission-panel-plan.md, U2).
describe('effective permissions', () => {
  it('gives GLOBAL roles every permission at GLOBAL, except system.owner.transfer for the Monitoring Team', () => {
    const head = effectivePermissions(registry, facts({ roles: ['department_head'] }), NOW);
    const monitoring = effectivePermissions(registry, facts({ roles: ['monitoring_team'] }), NOW);
    expect(names(head).size).toBe(141);
    const globalOnes = head.filter((g) => g.scopeType === 'GLOBAL' && g.source === 'global_role');
    expect(new Set(globalOnes.map((g) => g.permission)).size).toBe(141);
    expect(names(head)).toContain('system.owner.transfer');
    expect(names(monitoring)).not.toContain('system.owner.transfer');
    expect(names(monitoring).size).toBe(140);
  });

  it('keeps role defaults with their scope and condition, and leaves out if_rpm_grants defaults', () => {
    const pm = effectivePermissions(registry, facts({ roles: ['program_manager'] }), NOW);
    expect(pm).toContainEqual(
      expect.objectContaining({
        permission: 'application.approve',
        scopeType: 'PROGRAM',
        condition: 'house_construction_only',
        source: 'role_default',
      }),
    );
    const executive = effectivePermissions(registry, facts({ roles: ['project_executive'] }), NOW);
    expect(names(executive)).toContain('application.view');
    expect(names(executive)).not.toContain('application.approve');
  });

  it('gives a volunteer without a project only its account permissions, nothing a set governs', () => {
    const grants = effectivePermissions(
      registry,
      facts({ roles: ['volunteer_general'], volunteerType: 'general' }),
      NOW,
    );
    expect(grants.every((g) => g.scopeType === 'SELF' && g.projectId === null)).toBe(true);
    expect(names(grants)).toContain('session.revoke_own');
    expect(names(grants)).toContain('edit_request.submit');
    for (const governed of [
      'application.create',
      'stock.receive',
      'distribution.update',
      'project.view',
    ])
      expect(names(grants)).not.toContain(governed);
  });

  it('keeps the defaults of a volunteer role that no permission set is meant for (team member)', () => {
    const grants = effectivePermissions(
      registry,
      facts({ roles: ['volunteer_team_member'], volunteerType: 'team_member' }),
      NOW,
    );
    expect(grants).toContainEqual(
      expect.objectContaining({
        permission: 'application.view',
        scopeType: 'SELF',
        condition: 'own_created',
      }),
    );
    expect(names(grants)).toContain('application.create');
  });

  it('ignores a permission set that is not meant for the role', () => {
    const grants = effectivePermissions(
      registry,
      facts({
        roles: ['volunteer_team_member'],
        volunteerType: 'team_member',
        projectVolunteers: [
          { projectId: PROJECT_A, permissionSet: 'application_distribution', extraPermissions: [] },
        ],
      }),
      NOW,
    );
    expect(on(grants, PROJECT_A)).not.toContain('stock.receive');
  });

  it('gives the owner transfer only to a Department Head and never strips a Department Head', () => {
    const transfer = {
      id: 'o5',
      permission: 'system.owner.transfer',
      effect: 'grant' as const,
      scopeType: 'GLOBAL' as const,
      scopeRef: null,
      condition: null,
      expiresAt: null,
    };
    const monitoring = effectivePermissions(
      registry,
      facts({ roles: ['monitoring_team'], overrides: [transfer] }),
      NOW,
    );
    expect(names(monitoring)).not.toContain('system.owner.transfer');
    const head = effectivePermissions(
      registry,
      facts({ roles: ['department_head'], overrides: [{ ...transfer, effect: 'revoke' }] }),
      NOW,
    );
    expect(names(head)).toContain('system.owner.transfer');
  });

  it('binds permission sets to their project, so two projects give different permissions', () => {
    const grants = effectivePermissions(
      registry,
      facts({
        roles: ['volunteer_both'],
        volunteerType: 'both',
        projectVolunteers: [
          { projectId: PROJECT_A, permissionSet: 'application_distribution', extraPermissions: [] },
          {
            projectId: PROJECT_B,
            permissionSet: 'application_distribution_dawah',
            extraPermissions: [],
          },
        ],
      }),
      NOW,
    );
    expect(on(grants, PROJECT_A)).toContain('stock.receive');
    expect(on(grants, PROJECT_A)).not.toContain('class.record');
    expect(on(grants, PROJECT_B)).toContain('class.record');
    // nothing a set governs is held without a project binding
    expect(grants.filter((g) => g.permission === 'stock.receive' && g.projectId === null)).toEqual(
      [],
    );
    // PROJECT defaults of the role (project.view) count only on assigned projects
    expect(on(grants, PROJECT_A)).toContain('project.view');
    expect(grants.filter((g) => g.permission === 'project.view' && g.projectId === null)).toEqual(
      [],
    );
  });

  it('grants an if_rpm_grants permission only through the project extras', () => {
    const base = {
      roles: ['volunteer_local_daee'],
      volunteerType: 'local_daee',
    };
    const withoutExtra = effectivePermissions(
      registry,
      facts({
        ...base,
        projectVolunteers: [
          {
            projectId: PROJECT_A,
            permissionSet: 'application_distribution_dawah',
            extraPermissions: [],
          },
        ],
      }),
      NOW,
    );
    expect(names(withoutExtra)).not.toContain('exam.record');
    const withExtra = effectivePermissions(
      registry,
      facts({
        ...base,
        projectVolunteers: [
          {
            projectId: PROJECT_A,
            permissionSet: 'application_distribution_dawah',
            extraPermissions: ['exam.record'],
          },
        ],
      }),
      NOW,
    );
    expect(withExtra).toContainEqual(
      expect.objectContaining({
        permission: 'exam.record',
        scopeType: 'ASSIGNED',
        source: 'project_grant',
        projectId: PROJECT_A,
      }),
    );
  });

  it('gives project staff their extras on that project at the scope of the default', () => {
    const grants = effectivePermissions(
      registry,
      facts({
        roles: ['project_executive'],
        projectStaff: [
          {
            projectId: PROJECT_A,
            roleKey: 'project_executive',
            extraPermissions: ['application.approve'],
          },
        ],
      }),
      NOW,
    );
    expect(grants).toContainEqual(
      expect.objectContaining({
        permission: 'application.approve',
        scopeType: 'REGION',
        condition: null,
        source: 'project_grant',
        projectId: PROJECT_A,
      }),
    );
  });

  it('lets a panel revoke beat every source and ignores expired overrides', () => {
    const override = (o: Partial<AccessFacts['overrides'][number]>) => ({
      id: 'o1',
      permission: 'application.view',
      effect: 'revoke' as const,
      scopeType: 'GLOBAL' as const,
      scopeRef: null,
      condition: null,
      expiresAt: null,
      ...o,
    });
    const revoked = effectivePermissions(
      registry,
      facts({ roles: ['project_executive'], overrides: [override({})] }),
      NOW,
    );
    expect(names(revoked)).not.toContain('application.view');
    const expiredRevoke = effectivePermissions(
      registry,
      facts({
        roles: ['project_executive'],
        overrides: [override({ expiresAt: new Date('2026-10-01T00:00:00Z') })],
      }),
      NOW,
    );
    expect(names(expiredRevoke)).toContain('application.view');
    const granted = effectivePermissions(
      registry,
      facts({
        roles: ['finance_team'],
        overrides: [override({ permission: 'permission.view', effect: 'grant' })],
      }),
      NOW,
    );
    expect(granted).toContainEqual(
      expect.objectContaining({ permission: 'permission.view', source: 'panel_grant' }),
    );
    const expiredGrant = effectivePermissions(
      registry,
      facts({
        roles: ['finance_team'],
        overrides: [
          override({
            permission: 'permission.view',
            effect: 'grant',
            expiresAt: new Date('2026-10-12T05:59:59Z'),
          }),
        ],
      }),
      NOW,
    );
    expect(names(expiredGrant)).not.toContain('permission.view');
  });

  it('a scope-type revoke removes the role default, an instance revoke is left to scope resolution', () => {
    const revoke = (scopeRef: string | null) => ({
      id: 'o3',
      permission: 'application.view',
      effect: 'revoke' as const,
      scopeType: 'REGION' as const,
      scopeRef,
      condition: null,
      expiresAt: null,
    });
    const typeWide = effectiveAccess(
      registry,
      facts({ roles: ['regional_program_manager'], overrides: [revoke(null)] }),
      NOW,
    );
    expect(typeWide.grants.filter((g) => g.permission === 'application.view')).toEqual([]);
    expect(typeWide.instanceRevokes).toEqual([]);
    const dhaka = '00000000-0000-7000-8000-0000000000d1';
    const oneRegion = effectiveAccess(
      registry,
      facts({ roles: ['regional_program_manager'], overrides: [revoke(dhaka)] }),
      NOW,
    );
    expect(names(oneRegion.grants)).toContain('application.view');
    expect(oneRegion.instanceRevokes).toEqual([expect.objectContaining({ scopeRef: dhaka })]);
  });

  it('ignores an extra that is not an "if RPM grants" permission of the role', () => {
    const grants = effectivePermissions(
      registry,
      facts({
        roles: ['project_executive'],
        volunteerType: null,
        projectStaff: [
          {
            projectId: PROJECT_A,
            roleKey: 'project_executive',
            extraPermissions: ['permission.panel.manage', 'system.owner.transfer'],
          },
        ],
      }),
      NOW,
    );
    expect(names(grants)).not.toContain('permission.panel.manage');
    expect(names(grants)).not.toContain('system.owner.transfer');
  });

  it('never gives a volunteer a sensitive permission, from any source', () => {
    const grants = effectivePermissions(
      registry,
      facts({
        roles: ['volunteer_general'],
        volunteerType: 'general',
        overrides: [
          {
            id: 'o4',
            permission: 'volunteer.view_sensitive',
            effect: 'grant',
            scopeType: 'GLOBAL',
            scopeRef: null,
            condition: null,
            expiresAt: null,
          },
        ],
      }),
      NOW,
    );
    expect(names(grants)).not.toContain('volunteer.view_sensitive');
  });

  it('a project-scoped revoke removes only the grants of that project', () => {
    const grants = effectivePermissions(
      registry,
      facts({
        roles: ['volunteer_general'],
        volunteerType: 'general',
        projectVolunteers: [
          { projectId: PROJECT_A, permissionSet: 'application_distribution', extraPermissions: [] },
          { projectId: PROJECT_B, permissionSet: 'application_distribution', extraPermissions: [] },
        ],
        overrides: [
          {
            id: 'o2',
            permission: 'stock.receive',
            effect: 'revoke',
            scopeType: 'PROJECT',
            scopeRef: PROJECT_A,
            condition: null,
            expiresAt: null,
          },
        ],
      }),
      NOW,
    );
    expect(on(grants, PROJECT_A)).not.toContain('stock.receive');
    expect(on(grants, PROJECT_B)).toContain('stock.receive');
  });
});

describe('conditions', () => {
  it('has one check for every condition of permissions.yaml', () => {
    expect(() => assertConditionsCovered(registry)).not.toThrow();
  });

  it('refuses a registry with a condition that has no check', () => {
    const raw = structuredClone(readPermissionsFile()) as { conditions: Record<string, string> };
    raw.conditions.on_full_moon = 'not implemented';
    expect(() => assertConditionsCovered(parsePermissionsFile(raw))).toThrow(/on_full_moon/);
  });

  const actorBase = { userId: 'u1', roles: ['program_manager'], volunteerType: null };
  it.each([
    [
      'safe_water_only',
      { project: { workflowKey: 'advance_voucher' } },
      { project: { workflowKey: 'distribution' } },
    ],
    ['tree_planting_only', { project: { workflowKey: 'open_application_visit' } }, {}],
    [
      'house_construction_project',
      { project: { workflowKey: 'construction' }, attachedToProject: true },
      { project: { workflowKey: 'construction' }, attachedToProject: false },
    ],
    ['own_region', { inOwnRegion: true }, { inOwnRegion: false }],
    ['own_part', { record: { ownPart: true } }, { record: {} }],
    [
      'own_or_paid_volunteer_issues',
      { record: { createdBy: 'u1' } },
      { record: { createdBy: 'u2' } },
    ],
    [
      'own_or_paid_volunteer_issues',
      { record: { createdBy: 'u2', raisedByRoles: ['volunteer_paid'] } },
      { record: { createdBy: 'u2', raisedByRoles: ['volunteer_general'] } },
    ],
    [
      'no_open_applications',
      { target: { openApplications: 0 } },
      { target: { openApplications: 2 } },
    ],
    ['if_rpm_grants', null, {}],
  ])('%s allows with the facts and denies without them', (name, allow, deny) => {
    if (allow) expect(checkCondition(name, { actor: actorBase, ...allow })).toBe(true);
    expect(checkCondition(name, { actor: actorBase, ...deny })).toBe(false);
    expect(checkCondition(name, { actor: actorBase })).toBe(false);
  });

  it('decides from the context and denies when the context lacks the facts', () => {
    const actor = { userId: 'u1', roles: ['volunteer_local_daee'], volunteerType: 'both' };
    expect(checkCondition('type_both_only', { actor })).toBe(true);
    expect(
      checkCondition('type_both_only', { actor: { ...actor, volunteerType: 'local_daee' } }),
    ).toBe(false);
    expect(
      checkCondition('house_construction_only', {
        actor,
        project: { workflowKey: 'construction' },
      }),
    ).toBe(true);
    expect(checkCondition('house_construction_only', { actor })).toBe(false);
    expect(checkCondition('own_created', { actor, record: { createdBy: 'u1' } })).toBe(true);
    expect(checkCondition('own_created', { actor, record: { createdBy: 'u2' } })).toBe(false);
    expect(checkCondition('no_such_condition', { actor })).toBe(false);
  });
});
