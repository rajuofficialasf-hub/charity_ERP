import { describe, expect, it } from 'vitest';
import { PERMISSION_SET_TYPES, PERMISSION_SETS } from '@css/shared/projects';
import { assertConditionsCovered, checkCondition } from './conditions.js';
import {
  type AccessFacts,
  effectiveAccess,
  effectivePermissions,
  type EffectiveGrant,
} from './effective.js';
import { loadAccessRegistry, parsePermissionsFile, readPermissionsFile } from './registry.js';

const registry = loadAccessRegistry();
const NOW = new Date('2026-10-12T06:00:00Z');
const PROJECT_A = '00000000-0000-7000-8000-00000000000a';
const PROJECT_B = '00000000-0000-7000-8000-00000000000b';

const facts = (over: Partial<AccessFacts>): AccessFacts => ({
  roles: [],
  volunteerType: null,
  projectStaff: [],
  projectVolunteers: [],
  teamProjects: [],
  overrides: [],
  ...over,
});
const names = (grants: EffectiveGrant[]) => new Set(grants.map((g) => g.permission));
const on = (grants: EffectiveGrant[], projectId: string) =>
  new Set(grants.filter((g) => g.projectId === projectId).map((g) => g.permission));

// Effective permissions from their four sources (docs/security/RBAC.md, "Model").
describe('effective permissions', () => {
  it('gives an Admin every permission at GLOBAL, and the Department Head all but the owner transfer', () => {
    const admin = effectivePermissions(registry, facts({ roles: ['admin'] }), NOW);
    const head = effectivePermissions(registry, facts({ roles: ['department_head'] }), NOW);
    const all = registry.permissions.size;
    expect(names(admin).size).toBe(all);
    const globalOnes = admin.filter((g) => g.scopeType === 'GLOBAL' && g.source === 'global_role');
    expect(new Set(globalOnes.map((g) => g.permission)).size).toBe(all);
    expect(names(admin)).toContain('system.owner.transfer');
    expect(names(admin)).toContain('user.role.change');
    expect(names(head)).not.toContain('system.owner.transfer');
    expect(names(head).size).toBe(all - 1);
    expect(names(head)).toContain('user.role.change');
    expect(names(head)).toContain('permission.panel.manage');
  });

  it('leaves the Monitoring Team the oversight and none of the administration', () => {
    const monitoring = effectivePermissions(registry, facts({ roles: ['monitoring_team'] }), NOW);
    const moved = [
      'user.create',
      'user.profile.manage',
      'user.state.change',
      'user.lock.clear',
      'session.revoke_user',
      'user.handover',
      'permission.panel.manage',
      'user.role.change',
      'user.extra_area.manage',
      'system.owner.transfer',
      'staff.registration.approve',
      'staff_edit_request.approve',
      'settings.manage',
      'holiday.manage',
      'provider.settings.manage',
      'system.health.view',
      'notification.template.manage',
      'location.manage',
      'i18n.manage',
    ];
    for (const permission of moved) expect(names(monitoring), permission).not.toContain(permission);
    expect(names(monitoring).size).toBe(registry.permissions.size - moved.length);
    for (const kept of [
      'permission.view',
      'audit.view',
      'audit.export',
      'monitoring.view',
      'volunteer.block',
      'beneficiary.merge.revert',
      'registration.approve',
      'nisab.set',
      'application.approve',
      'beneficiary.view_all',
    ])
      expect(names(monitoring), kept).toContain(kept);
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

  it('lets the PM, RPM and executive edit beneficiary contacts, and only those who propose or merge mark a false pair', () => {
    const of = (role: string) => effectivePermissions(registry, facts({ roles: [role] }), NOW);
    const scopeOf = (grants: EffectiveGrant[], permission: string) =>
      grants.filter((g) => g.permission === permission).map((g) => g.scopeType);
    expect(scopeOf(of('program_manager'), 'beneficiary.contact.edit')).toEqual(['PROGRAM']);
    expect(scopeOf(of('regional_program_manager'), 'beneficiary.contact.edit')).toEqual(['REGION']);
    expect(scopeOf(of('project_executive'), 'beneficiary.contact.edit')).toEqual(['REGION']);
    expect(scopeOf(of('program_manager'), 'beneficiary.merge.dismiss')).toEqual(['PROGRAM']);
    expect(scopeOf(of('regional_program_manager'), 'beneficiary.merge.dismiss')).toEqual([
      'REGION',
    ]);
    expect(scopeOf(of('project_executive'), 'beneficiary.merge.dismiss')).toEqual([]);
    for (const role of ['media_team', 'procurement_team', 'volunteer_general'])
      expect(names(of(role)), role).not.toContain('beneficiary.contact.edit');
    // a merge is reverted by the two global roles only
    for (const role of ['program_manager', 'regional_program_manager'])
      expect(names(of(role)), role).not.toContain('beneficiary.merge.revert');
    expect(names(of('monitoring_team'))).toContain('beneficiary.merge.revert');
    expect(names(of('department_head'))).toContain('beneficiary.merge.revert');
  });

  it('lets the five project roles see every program and project as cards, and nobody else', () => {
    const of = (role: string) => effectivePermissions(registry, facts({ roles: [role] }), NOW);
    const overview = (role: string) =>
      of(role)
        .filter((g) => g.permission === 'project.overview.view')
        .map((g) => [g.scopeType, g.source, g.condition ?? null]);
    for (const role of ['program_manager', 'regional_program_manager', 'project_executive'])
      expect(overview(role), role).toEqual([['GLOBAL', 'role_default', null]]);
    for (const role of ['admin', 'department_head', 'monitoring_team'])
      expect(overview(role), role).toEqual([['GLOBAL', 'global_role', null]]);
    // default deny for every other role, official or volunteer
    for (const role of registry.roles.keys())
      if (
        ![
          'admin',
          'department_head',
          'monitoring_team',
          'program_manager',
          'regional_program_manager',
          'project_executive',
        ].includes(role)
      )
        expect(overview(role), role).toEqual([]);
    // seeing the cards opens no session: the RPM's and the Executive's own reach stays as it was
    const scopeOf = (role: string, permission: string) =>
      of(role)
        .filter((g) => g.permission === permission)
        .map((g) => g.scopeType);
    expect(scopeOf('regional_program_manager', 'project.view')).toEqual(['REGION']);
    expect(scopeOf('project_executive', 'project.view')).toEqual(['REGION']);
    expect(scopeOf('program_manager', 'project.view')).toEqual(['PROGRAM']);
    expect(scopeOf('regional_program_manager', 'project.create')).toEqual([]);
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

  it('gives a team member the project defaults of the role only on the projects of its team', () => {
    const grants = effectivePermissions(
      registry,
      facts({
        roles: ['volunteer_team_member'],
        volunteerType: 'team_member',
        teamProjects: [PROJECT_A],
      }),
      NOW,
    );
    expect(on(grants, PROJECT_A)).toContain('project.view');
    expect(on(grants, PROJECT_A)).toContain('beneficiary.lookup');
    expect(on(grants, PROJECT_B)).toEqual(new Set());
    // without a working team the member reaches no project
    const none = effectivePermissions(
      registry,
      facts({ roles: ['volunteer_team_member'], volunteerType: 'team_member' }),
      NOW,
    );
    expect(none.filter((g) => g.projectId !== null)).toEqual([]);
  });

  it('meets the shared table of which volunteer types each permission set is for', () => {
    for (const set of PERMISSION_SETS) {
      const roles = registry.permissionSets.get(set)?.forRoles ?? [];
      expect([...roles].sort(), set).toEqual(
        PERMISSION_SET_TYPES[set].map((type) => `volunteer_${type}`).sort(),
      );
    }
  });

  it('gives the owner transfer only to an Admin, and never strips an Admin or the Department Head', () => {
    const transfer = {
      id: 'o5',
      permission: 'system.owner.transfer',
      effect: 'grant' as const,
      scopeType: 'GLOBAL' as const,
      scopeRef: null,
      condition: null,
      expiresAt: null,
    };
    // a stray grant row gives the transfer to nobody but an Admin
    for (const role of ['monitoring_team', 'department_head']) {
      const granted = effectivePermissions(
        registry,
        facts({ roles: [role], overrides: [transfer] }),
        NOW,
      );
      expect(names(granted), role).not.toContain('system.owner.transfer');
    }
    // a stray revoke row strips neither an Admin nor the Head
    const revoke = (permission: string) => ({ ...transfer, permission, effect: 'revoke' as const });
    const admin = effectivePermissions(
      registry,
      facts({ roles: ['admin'], overrides: [revoke('system.owner.transfer')] }),
      NOW,
    );
    expect(names(admin)).toContain('system.owner.transfer');
    const head = effectivePermissions(
      registry,
      facts({ roles: ['department_head'], overrides: [revoke('permission.panel.manage')] }),
      NOW,
    );
    expect(names(head)).toContain('permission.panel.manage');
    // the Monitoring Team is no top role: a revoke takes effect
    const monitoring = effectivePermissions(
      registry,
      facts({ roles: ['monitoring_team'], overrides: [revoke('audit.view')] }),
      NOW,
    );
    expect(names(monitoring)).not.toContain('audit.view');
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
