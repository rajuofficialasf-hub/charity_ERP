import { join } from 'node:path';
import { readPermissionsFile as readValidated } from '../../../src/access/registry';
import type { PermissionsFile } from '../../../src/access/schema';
import type { SeedContext } from '../../context';
import { REPO_ROOT } from '../util';

/**
 * Roles and permissions from docs/security/permissions.yaml, the single source of truth (RBAC.md),
 * validated by the access module's parser. Default grants, scopes and conditions stay in the YAML;
 * the access module reads them at run time (T1.8). Rows that are no longer in the YAML are
 * reported, never deleted.
 */
export type { PermissionsFile };

export function readPermissionsFile(): PermissionsFile {
  return readValidated(join(REPO_ROOT, 'docs/security/permissions.yaml'));
}

export async function seedAccess(ctx: SeedContext): Promise<void> {
  const file = readPermissionsFile();
  for (const [key, role] of Object.entries(file.roles)) {
    await ctx.upsert(
      'roles',
      {
        key,
        name_bn: role.name_bn,
        name_en: role.name_en,
        kind: role.kind,
        global_scope: role.global_scope,
      },
      { key: ['key'] },
    );
  }
  for (const p of file.permissions) {
    await ctx.upsert(
      'permissions',
      { name: p.name, module: p.module, sensitive: p.sensitive, description: p.description },
      { key: ['name'] },
    );
  }
  const extraRoles = await ctx.db.query<{ key: string }>(
    'SELECT key FROM roles WHERE NOT (key = ANY($1::text[]))',
    [Object.keys(file.roles)],
  );
  const extraPermissions = await ctx.db.query<{ name: string }>(
    'SELECT name FROM permissions WHERE NOT (name = ANY($1::text[]))',
    [file.permissions.map((p) => p.name)],
  );
  for (const r of extraRoles.rows)
    console.warn(`seed: role ${r.key} is not in permissions.yaml (kept, needs a decision)`);
  for (const p of extraPermissions.rows)
    console.warn(`seed: permission ${p.name} is not in permissions.yaml (kept, needs a decision)`);
}
