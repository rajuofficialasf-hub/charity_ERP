import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PERMISSIONS_FILE, loadAccessRegistry, parsePermissionsFile } from './registry';

const realText = readFileSync(DEFAULT_PERMISSIONS_FILE, 'utf8');

/** The real file with one change, to prove each validation names the offending entry. */
function variant(change: (file: Record<string, unknown>) => void): unknown {
  const file = yaml.load(realText) as Record<string, unknown>;
  change(file);
  return file;
}

type Perm = { name: string; default: { role: string; scope: string; condition?: string }[] };
const perms = (file: Record<string, unknown>) => file.permissions as Perm[];

// permissions.yaml is the single source of truth of RBAC.md section 2; the API refuses to start
// on a broken file (docs/plans/2026-10-12-1100-feat-rbac-permission-panel-plan.md, U1).
describe('access registry', () => {
  it('loads the real permissions.yaml with its roles, permissions, sets and field classes', () => {
    const registry = loadAccessRegistry(DEFAULT_PERMISSIONS_FILE);
    // the Implementer is retired (D-162)
    expect(registry.roles.size).toBe(16);
    expect(registry.roles.has('implementer')).toBe(false);
    expect(registry.permissions.size).toBe(157);
    expect(registry.roles.get('department_head')?.globalScope).toBe(true);
    expect(registry.permissions.get('system.owner.transfer')?.globalRolesExcluded).toEqual([
      'monitoring_team',
    ]);
    expect(registry.sensitiveFields.map((f) => f.key)).toContain('volunteer.identity');
    expect(registry.isKnownPermission('session.revoke_own')).toBe(true);
    expect(registry.isKnownPermission('authenticated')).toBe(true);
    expect(registry.isKnownPermission('no.such_permission')).toBe(false);
  });

  it('gives a permission set the permissions of the set it extends', () => {
    const registry = loadAccessRegistry(DEFAULT_PERMISSIONS_FILE);
    const dawah = registry.permissionSets.get('application_distribution_dawah');
    const base = registry.permissionSets.get('application_distribution');
    expect(dawah?.permissions).toEqual(expect.arrayContaining([...(base?.permissions ?? [])]));
    expect(dawah?.permissions).toContain('class.record');
    expect(base?.permissions).not.toContain('class.record');
  });

  it('refuses a file that breaks the schema, naming the path and the value', () => {
    const file = variant((f) => {
      (f.roles as Record<string, { kind: string }>).finance_team!.kind = 'contractor';
    });
    expect(() => parsePermissionsFile(file)).toThrow(/roles\.finance_team\.kind.*contractor/);
  });

  it('refuses unknown roles in exclusions, permission sets and sensitive field classes', () => {
    const file = variant((f) => {
      perms(f)[0]!.default = [];
      (perms(f)[0] as { global_roles_excluded?: string[] }).global_roles_excluded = ['ghost_a'];
      (f.permission_sets as Record<string, { for: string[] }>).work_progress!.for.push('ghost_b');
      (f.sensitive_fields as { visible_to: string[] }[])[0]!.visible_to.push('ghost_c');
    });
    expect(() => parsePermissionsFile(file)).toThrow(
      /session\.revoke_own: unknown excluded role ghost_a/,
    );
    expect(() => parsePermissionsFile(file)).toThrow(/work_progress: unknown role ghost_b/);
    expect(() => parsePermissionsFile(file)).toThrow(
      /sensitive field beneficiary\.nid: unknown role ghost_c/,
    );
  });

  it('refuses a duplicate permission', () => {
    const file = variant((f) => perms(f).push({ ...perms(f)[0]!, default: [] }));
    expect(() => parsePermissionsFile(file)).toThrow(/duplicate permission session\.revoke_own/);
  });

  it('refuses a default grant for an unknown role, scope or condition', () => {
    const role = variant((f) => perms(f)[0]!.default.push({ role: 'ghost', scope: 'SELF' }));
    expect(() => parsePermissionsFile(role)).toThrow(/session\.revoke_own: unknown role ghost/);
    const scope = variant((f) =>
      perms(f)[0]!.default.push({ role: 'project_executive', scope: 'PLANET' }),
    );
    expect(() => parsePermissionsFile(scope)).toThrow(/PLANET/);
    const condition = variant((f) =>
      perms(f)[0]!.default.push({
        role: 'project_executive',
        scope: 'SELF',
        condition: 'on_tuesdays',
      }),
    );
    expect(() => parsePermissionsFile(condition)).toThrow(
      /session\.revoke_own: unknown condition on_tuesdays/,
    );
  });

  it('names an extends cycle and an inherited key as problems instead of crashing', () => {
    const cycle = variant((f) => {
      const sets = f.permission_sets as Record<string, { extends?: string }>;
      sets.application_distribution!.extends = 'application_distribution_dawah';
    });
    expect(() => parsePermissionsFile(cycle)).toThrow(
      /extends cycle application_distribution -> application_distribution_dawah -> application_distribution/,
    );
    const inherited = variant((f) => {
      const sets = f.permission_sets as Record<string, { extends?: string }>;
      sets.work_progress!.extends = 'constructor';
    });
    expect(() => parsePermissionsFile(inherited)).toThrow(
      /work_progress: unknown parent set constructor/,
    );
  });

  it('refuses a permission set that names an unknown permission or parent', () => {
    const file = variant((f) => {
      const sets = f.permission_sets as Record<string, { permissions: string[]; extends?: string }>;
      sets.work_progress!.permissions.push('no.such_permission');
      sets.application_distribution_dawah!.extends = 'no_such_set';
    });
    expect(() => parsePermissionsFile(file)).toThrow(
      /work_progress: unknown permission no\.such_permission/,
    );
    expect(() => parsePermissionsFile(file)).toThrow(
      /application_distribution_dawah: unknown parent set no_such_set/,
    );
  });
});
