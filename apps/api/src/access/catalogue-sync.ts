import type { Tx } from '../core/prisma.service.js';
import { readPermissionsFile } from './registry.js';

/**
 * Inserts the roles and permissions of docs/security/permissions.yaml that have no row yet (part of
 * `pnpm db:migrate`, docs/ops/DEPLOYMENT.md): the rows the grants, the project staff and the
 * workflow transitions point at. The defaults, scopes and conditions stay in the file, which the
 * access module reads at run time; a stored row is never changed and none is removed. Idempotent;
 * answers how many of each were inserted.
 */
export async function syncAccessCatalogue(db: Tx): Promise<{ roles: number; permissions: number }> {
  const file = readPermissionsFile();
  let roles = 0;
  let permissions = 0;
  for (const [key, role] of Object.entries(file.roles))
    roles += await db.$executeRaw`
      INSERT INTO roles (key, name_bn, name_en, kind, global_scope)
      VALUES (${key}, ${role.name_bn}, ${role.name_en}, ${role.kind}, ${role.global_scope})
      ON CONFLICT (key) DO NOTHING`;
  for (const p of file.permissions)
    permissions += await db.$executeRaw`
      INSERT INTO permissions (name, module, sensitive, description)
      VALUES (${p.name}, ${p.module}, ${p.sensitive}, ${p.description})
      ON CONFLICT (name) DO NOTHING`;
  return { roles, permissions };
}
