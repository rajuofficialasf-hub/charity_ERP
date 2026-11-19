import { z } from 'zod';

/**
 * Schemas of the `access` operations of docs/api/openapi.yaml (roles, permissions, effective
 * permissions, the permission panel and project grants; docs/security/RBAC.md, "Permission panel").
 * Request schemas match the contract field for field; the drift test compares them.
 */
export const SCOPE_TYPES = [
  'GLOBAL',
  'PROGRAM',
  'PROJECT',
  'REGION',
  'DISTRICT',
  'UPAZILA',
  'UNION',
  'ASSIGNED',
  'SELF',
] as const;
export type ScopeTypeName = (typeof SCOPE_TYPES)[number];

export const GRANT_SOURCES = [
  'global_role',
  'role_default',
  'permission_set',
  'project_grant',
  'panel_grant',
] as const;
export type GrantSourceName = (typeof GRANT_SOURCES)[number];

export const roleSchema = z.object({
  key: z.string(),
  name: z.object({ bn: z.string(), en: z.string() }),
  kind: z.enum(['official', 'volunteer']),
  globalScope: z.boolean(),
});
export type Role = z.infer<typeof roleSchema>;

export const permissionSchema = z.object({
  name: z.string(),
  module: z.string(),
  sensitive: z.boolean(),
  description: z.string(),
});
export type PermissionInfo = z.infer<typeof permissionSchema>;

export const effectivePermissionSchema = z.object({
  permission: z.string(),
  scopeType: z.enum(SCOPE_TYPES),
  scopeRef: z.uuid().nullable().optional(),
  condition: z.string().nullable().optional(),
  source: z.enum(GRANT_SOURCES),
  /** The panel override behind a `panel_grant` row, so the panel can end it. */
  grantId: z.uuid().optional(),
});
export type EffectivePermission = z.infer<typeof effectivePermissionSchema>;

export const permissionGrantRequestSchema = z.object({
  userId: z.uuid(),
  permission: z.string(),
  effect: z.enum(['grant', 'revoke']),
  scopeType: z.enum(SCOPE_TYPES),
  scopeRef: z.uuid().optional(),
  condition: z.string().optional(),
  reason: z.string().trim().min(3).max(1000),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
});
export type PermissionGrantRequest = z.infer<typeof permissionGrantRequestSchema>;

export const permissionGrantSchema = permissionGrantRequestSchema.extend({
  id: z.uuid(),
  grantedBy: z.uuid(),
  createdAt: z.string(),
  revokedAt: z.string().nullable().optional(),
  scopeRef: z.uuid().nullable().optional(),
  condition: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
});
export type PermissionGrant = z.infer<typeof permissionGrantSchema>;

/** A change of an official's role (docs/security/RBAC.md, "Roles"). */
export const roleChangeRequestSchema = z.strictObject({
  roleKey: z.string().min(1).max(64),
  reason: z.string().trim().min(3).max(1000),
});
export type RoleChangeRequest = z.infer<typeof roleChangeRequestSchema>;

const namedUserSchema = z.object({ id: z.uuid(), displayName: z.string() });

/** One role a person holds or held, with who gave it and who ended it. */
export const roleHistoryRowSchema = z.object({
  id: z.uuid(),
  roleKey: z.string(),
  name: z.object({ bn: z.string(), en: z.string() }),
  grantedAt: z.string(),
  grantedBy: namedUserSchema,
  revokedAt: z.string().nullable(),
  revokedBy: namedUserSchema.nullable(),
});
export type RoleHistoryRow = z.infer<typeof roleHistoryRowSchema>;

/** The Main Admin hands the flag to another Admin, confirming with the own password. */
export const ownerTransferRequestSchema = z.strictObject({
  toUserId: z.uuid(),
  password: z.string().min(1).max(200),
});
export type OwnerTransferRequest = z.infer<typeof ownerTransferRequestSchema>;

export const projectGrantRequestSchema = z.object({
  userId: z.uuid(),
  permissions: z.array(z.string()).max(50),
  reason: z.string().trim().min(3).max(1000),
});
export type ProjectGrantRequest = z.infer<typeof projectGrantRequestSchema>;
