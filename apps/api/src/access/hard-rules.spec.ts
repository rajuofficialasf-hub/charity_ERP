import { describe, expect, it } from 'vitest';
import {
  type AccessChange,
  changeRefusal,
  endRefusal,
  IF_RPM_GRANTS,
  KEY_PERMISSIONS,
  mayHold,
  overrideStands,
  revokesReach,
  roleChangeRefusal,
  roleRefusal,
  rpmGrantable,
} from './hard-rules.js';
import { loadAccessRegistry } from './registry.js';

const registry = loadAccessRegistry();
const party = (id: string, ...roles: string[]) => ({ id, kind: 'staff', roles });
const ADMIN = party('admin-1', 'admin');
const HEAD = party('head-1', 'department_head');
const MONITORING = party('monitoring-1', 'monitoring_team');
const PM = party('pm-1', 'program_manager');
const EXECUTIVE = party('executive-1', 'project_executive');
const VOLUNTEER = { id: 'volunteer-1', kind: 'volunteer', roles: ['volunteer_general'] };
const grant = (permission: string, scopeType = 'GLOBAL'): AccessChange => ({
  permission,
  effect: 'grant',
  scopeType,
});
const revoke = (permission: string, scopeType = 'GLOBAL'): AccessChange => ({
  permission,
  effect: 'revoke',
  scopeType,
});

// The hard rules of the panel and of the roles (docs/security/RBAC.md, "Permission panel").
describe('the key permissions', () => {
  it('lists every permission the catalogue keeps from the Monitoring Team, and only those', () => {
    const excluded = [...registry.permissions.values()]
      .filter((p) => p.globalRolesExcluded.includes('monitoring_team'))
      .map((p) => p.name)
      .sort();
    expect([...KEY_PERMISSIONS].sort()).toEqual(excluded);
  });

  it('are never an extra an RPM gives on a project', () => {
    for (const name of KEY_PERMISSIONS)
      expect(
        registry.permissions.get(name)!.defaults.some((d) => d.condition === IF_RPM_GRANTS),
        name,
      ).toBe(false);
  });
});

describe('a change of the panel', () => {
  it('lets the Head give an ordinary permission and take one away', () => {
    expect(changeRefusal(registry, HEAD, EXECUTIVE, grant('permission.view'))).toBeNull();
    expect(changeRefusal(registry, HEAD, EXECUTIVE, revoke('application.review'))).toBeNull();
    expect(changeRefusal(registry, ADMIN, HEAD, grant('form.library.manage'))).toBeNull();
  });

  it('refuses a change of the own access, a grant and a revoke alike', () => {
    for (const actor of [ADMIN, HEAD])
      for (const change of [grant('permission.view'), revoke('permission.view', 'PROJECT')])
        expect(changeRefusal(registry, actor, actor, change)).toBe('self_change');
  });

  it('refuses a revoke against an Admin or the Head at every scope', () => {
    for (const target of [party('admin-2', 'admin'), party('head-2', 'department_head')])
      for (const scopeType of ['GLOBAL', 'PROGRAM', 'PROJECT', 'REGION', 'SELF'])
        expect(
          changeRefusal(registry, ADMIN, target, revoke('application.view', scopeType)),
          scopeType,
        ).toBe('top_role_protected');
  });

  it('lets only an Admin grant a key permission; anyone with the panel may take one away', () => {
    for (const name of KEY_PERMISSIONS) {
      if (name === 'system.owner.transfer') continue;
      expect(changeRefusal(registry, HEAD, PM, grant(name)), name).toBe(
        'key_permission_admin_only',
      );
      expect(changeRefusal(registry, PM, EXECUTIVE, grant(name)), name).toBe(
        'key_permission_admin_only',
      );
      expect(changeRefusal(registry, ADMIN, PM, grant(name)), name).toBeNull();
      expect(changeRefusal(registry, HEAD, PM, revoke(name)), name).toBeNull();
    }
  });

  it('gives the owner transfer to an Admin only, from an Admin only', () => {
    const other = party('admin-2', 'admin');
    expect(changeRefusal(registry, ADMIN, other, grant('system.owner.transfer'))).toBeNull();
    expect(changeRefusal(registry, ADMIN, HEAD, grant('system.owner.transfer'))).toBe(
      'owner_transfer_only_admin',
    );
    expect(changeRefusal(registry, HEAD, other, grant('system.owner.transfer'))).toBe(
      'key_permission_admin_only',
    );
  });

  it('keeps the GLOBAL scope of the Monitoring Team, and lets a narrower revoke through', () => {
    expect(changeRefusal(registry, HEAD, MONITORING, revoke('application.view'))).toBe(
      'global_scope_protected',
    );
    expect(changeRefusal(registry, HEAD, MONITORING, revoke('application.view', 'REGION'))).toBe(
      null,
    );
  });

  it('never gives a sensitive permission to a volunteer', () => {
    expect(
      changeRefusal(registry, ADMIN, VOLUNTEER, grant('volunteer.view_sensitive', 'PROJECT')),
    ).toBe('sensitive_to_volunteer');
    expect(
      changeRefusal(registry, ADMIN, EXECUTIVE, grant('volunteer.view_sensitive', 'PROJECT')),
    ).toBeNull();
  });
});

describe('the end of an override', () => {
  it('is refused on the own account', () => {
    expect(endRefusal(HEAD, HEAD, { permission: 'permission.view', effect: 'grant' })).toBe(
      'self_change',
    );
  });

  it('lets the Head end a grant of any permission and lift a revoke of an ordinary one', () => {
    expect(endRefusal(HEAD, PM, { permission: 'user.create', effect: 'grant' })).toBeNull();
    expect(endRefusal(HEAD, PM, { permission: 'application.view', effect: 'revoke' })).toBeNull();
  });

  it('leaves the lifting of a revoke of a key permission to an Admin', () => {
    const lifted = { permission: 'user.create', effect: 'revoke' };
    expect(endRefusal(HEAD, PM, lifted)).toBe('key_permission_admin_only');
    expect(endRefusal(ADMIN, PM, lifted)).toBeNull();
  });
});

describe('giving a role', () => {
  it('leaves an Admin and the Department Head to an Admin', () => {
    for (const role of ['admin', 'department_head']) {
      expect(roleRefusal(registry, ['admin'], role), role).toBeNull();
      expect(roleRefusal(registry, ['department_head'], role), role).toBe('role_admin_only');
      expect(roleRefusal(registry, ['program_manager'], role), role).toBe('role_admin_only');
    }
  });

  it('leaves the Monitoring Team to an Admin or the Head', () => {
    expect(roleRefusal(registry, ['admin'], 'monitoring_team')).toBeNull();
    expect(roleRefusal(registry, ['department_head'], 'monitoring_team')).toBeNull();
    expect(roleRefusal(registry, ['program_manager'], 'monitoring_team')).toBe('role_admin_only');
    expect(roleRefusal(registry, ['monitoring_team'], 'monitoring_team')).toBe('role_admin_only');
  });

  it('lets anyone who may give roles give every other one', () => {
    for (const role of registry.roles.values()) {
      if (role.globalScope) continue;
      expect(roleRefusal(registry, ['program_manager'], role.key), role.key).toBeNull();
    }
  });
});

describe('a change of a role', () => {
  it('is refused on the own account, whoever asks', () => {
    for (const actor of [ADMIN, HEAD])
      expect(roleChangeRefusal(registry, actor, actor, 'program_manager')).toBe('self_change');
  });

  it('leaves a change to or from an Admin or the Head to an Admin', () => {
    const otherAdmin = party('admin-2', 'admin');
    expect(roleChangeRefusal(registry, HEAD, EXECUTIVE, 'admin')).toBe('role_admin_only');
    expect(roleChangeRefusal(registry, HEAD, EXECUTIVE, 'department_head')).toBe('role_admin_only');
    expect(roleChangeRefusal(registry, HEAD, otherAdmin, 'program_manager')).toBe(
      'role_admin_only',
    );
    expect(roleChangeRefusal(registry, ADMIN, HEAD, 'program_manager')).toBeNull();
    expect(roleChangeRefusal(registry, ADMIN, EXECUTIVE, 'admin')).toBeNull();
    expect(roleChangeRefusal(registry, ADMIN, otherAdmin, 'department_head')).toBeNull();
  });

  it('leaves a change to or from the Monitoring Team to an Admin or the Head', () => {
    expect(roleChangeRefusal(registry, HEAD, EXECUTIVE, 'monitoring_team')).toBeNull();
    expect(roleChangeRefusal(registry, HEAD, MONITORING, 'official_daee')).toBeNull();
    expect(roleChangeRefusal(registry, PM, EXECUTIVE, 'monitoring_team')).toBe('role_admin_only');
    expect(roleChangeRefusal(registry, PM, MONITORING, 'official_daee')).toBe('role_admin_only');
  });

  it('lets a holder of the role change move a person between the other roles', () => {
    expect(roleChangeRefusal(registry, PM, EXECUTIVE, 'regional_program_manager')).toBeNull();
  });
});

describe('a stored override after a role change', () => {
  const as = (role: string) => party('target-1', role);

  it('does not stand as a revoke on a new Admin or Head, at any scope', () => {
    for (const role of ['admin', 'department_head'])
      for (const scopeType of ['GLOBAL', 'PROJECT', 'REGION'])
        expect(
          overrideStands(registry, as(role), revoke('application.view', scopeType)),
          `${role} ${scopeType}`,
        ).toBe(false);
    expect(overrideStands(registry, as('admin'), grant('form.library.manage'))).toBe(true);
  });

  it('does not stand as a GLOBAL revoke on a new member of the Monitoring Team; a narrower one does', () => {
    expect(overrideStands(registry, as('monitoring_team'), revoke('application.view'))).toBe(false);
    expect(
      overrideStands(registry, as('monitoring_team'), revoke('application.view', 'PROJECT')),
    ).toBe(true);
  });

  it('keeps the owner transfer for an Admin alone, and every other override for the other roles', () => {
    expect(overrideStands(registry, as('admin'), grant('system.owner.transfer'))).toBe(true);
    expect(overrideStands(registry, as('program_manager'), grant('system.owner.transfer'))).toBe(
      false,
    );
    expect(overrideStands(registry, as('program_manager'), grant('user.create'))).toBe(true);
    expect(overrideStands(registry, as('program_manager'), revoke('application.view'))).toBe(true);
  });
});

describe('what the evaluation keeps whatever rows exist', () => {
  it('holds the owner transfer for an Admin alone', () => {
    expect(mayHold(registry, ['admin'], 'system.owner.transfer')).toBe(true);
    expect(mayHold(registry, ['department_head'], 'system.owner.transfer')).toBe(false);
  });

  it('holds a sensitive permission for an official alone', () => {
    expect(mayHold(registry, ['project_executive'], 'volunteer.view_sensitive')).toBe(true);
    expect(mayHold(registry, ['volunteer_general'], 'volunteer.view_sensitive')).toBe(false);
    expect(mayHold(registry, ['volunteer_general'], 'application.view')).toBe(true);
  });

  it('lets no revoke reach an Admin or the Head', () => {
    expect(revokesReach(['admin'])).toBe(false);
    expect(revokesReach(['department_head'])).toBe(false);
    expect(revokesReach(['monitoring_team'])).toBe(true);
  });
});

describe('a project extra', () => {
  it('counts only for a role the catalogue gives the permission "if RPM grants"', () => {
    expect(rpmGrantable(registry, ['project_executive'], 'application.approve')).toBe(true);
    expect(rpmGrantable(registry, ['finance_team'], 'application.approve')).toBe(false);
    expect(rpmGrantable(registry, ['project_executive'], 'permission.panel.manage')).toBe(false);
    expect(rpmGrantable(registry, ['project_executive'], 'no.such.permission')).toBe(false);
  });
});
