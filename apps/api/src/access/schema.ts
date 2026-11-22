import { SCOPE_TYPES } from '@css/shared/access';
import { z } from 'zod';

/**
 * Data scopes from broad to narrow (docs/security/RBAC.md, "Data scopes and their resolution"),
 * shared with the API contract.
 */
export const SCOPES = SCOPE_TYPES;
export type ScopeType = (typeof SCOPES)[number];

const grant = z.strictObject({
  role: z.string(),
  scope: z.enum(SCOPES),
  condition: z.string().optional(),
});

/**
 * The structure of docs/security/permissions.yaml (docs/security/RBAC.md, "permissions.yaml schema
 * and loading"). Cross-references (roles, scopes, conditions and permissions named elsewhere in the
 * file) are checked by `parsePermissionsFile`.
 */
export const permissionsFileSchema = z.object({
  version: z.number().int(),
  scopes: z.array(z.enum(SCOPES)),
  conditions: z.record(z.string(), z.string()),
  roles: z.record(
    z.string(),
    z.strictObject({
      name_en: z.string(),
      name_bn: z.string(),
      kind: z.enum(['official', 'volunteer']),
      global_scope: z.boolean(),
    }),
  ),
  permission_sets: z.record(
    z.string(),
    z.strictObject({
      for: z.array(z.string()),
      extends: z.string().optional(),
      permissions: z.array(z.string()),
    }),
  ),
  sensitive_fields: z.array(
    z.strictObject({
      key: z.string(),
      fields: z.array(z.string()),
      visible_to: z.array(z.string()),
      source: z.string(),
    }),
  ),
  permissions: z.array(
    z.strictObject({
      name: z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/),
      /** The short names the permission panel shows; the Bengali one in Bengali letters. */
      name_en: z.string().trim().min(3),
      name_bn: z.string().regex(/[\u0980-\u09FF]/, 'a Bengali name in Bengali letters'),
      description: z.string(),
      module: z.string().regex(/^M\d{2}$/),
      sensitive: z.boolean(),
      default: z.array(grant),
      global_roles_excluded: z.array(z.string()).optional(),
    }),
  ),
});

export type PermissionsFile = z.infer<typeof permissionsFileSchema>;
