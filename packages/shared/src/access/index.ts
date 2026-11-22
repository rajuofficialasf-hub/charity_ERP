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

const bilingual = z.object({ bn: z.string(), en: z.string() });

export const permissionSchema = z.object({
  name: z.string(),
  /** The short name the panel shows, in both languages (the code is `name`). */
  title: bilingual,
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
  /** The project the grant is bound to (a permission set, a project extra, a project grant). */
  projectId: z.uuid().nullable().optional(),
  /** The name of the program, project or place the scope names, so no id is shown. */
  scopeName: bilingual.nullable().optional(),
});
export type EffectivePermission = z.infer<typeof effectivePermissionSchema>;

/** The most permissions one panel request gives or takes away. */
export const PERMISSIONS_PER_REQUEST = 20;

/**
 * Several permissions given or taken away in one request, at one scope and under one reason
 * (docs/security/RBAC.md, "Permission panel"); the server refuses the whole request when one of
 * them is refused.
 */
export const permissionGrantRequestSchema = z.object({
  userId: z.uuid(),
  permissions: z
    .array(z.string().min(1))
    .min(1)
    .max(PERMISSIONS_PER_REQUEST)
    .refine((names) => new Set(names).size === names.length, 'a permission appears twice'),
  effect: z.enum(['grant', 'revoke']),
  scopeType: z.enum(SCOPE_TYPES),
  scopeRef: z.uuid().optional(),
  condition: z.string().optional(),
  reason: z.string().trim().min(3).max(1000),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
});
export type PermissionGrantRequest = z.infer<typeof permissionGrantRequestSchema>;

/** One panel override as written: a permission given or taken away at one scope. */
export const permissionGrantSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  permission: z.string(),
  effect: z.enum(['grant', 'revoke']),
  scopeType: z.enum(SCOPE_TYPES),
  scopeRef: z.uuid().nullable().optional(),
  condition: z.string().nullable().optional(),
  reason: z.string(),
  expiresAt: z.string().nullable().optional(),
  grantedBy: z.uuid(),
  createdAt: z.string(),
  revokedAt: z.string().nullable().optional(),
});
export type PermissionGrant = z.infer<typeof permissionGrantSchema>;

/**
 * A live panel override of a person as the panel lists it (`GET /users/{userId}/permission-overrides`):
 * what was given and what was taken away, with its scope by name, who did it, when and why.
 */
export const permissionOverrideSchema = z.object({
  id: z.uuid(),
  permission: z.string(),
  title: bilingual,
  effect: z.enum(['grant', 'revoke']),
  scopeType: z.enum(SCOPE_TYPES),
  scopeRef: z.uuid().nullable(),
  scopeName: bilingual.nullable(),
  condition: z.string().nullable(),
  /** Null to a reader below GLOBAL: a reason may concern the person's conduct. */
  reason: z.string().nullable(),
  expiresAt: z.string().nullable(),
  grantedAt: z.string(),
  /** Null to a reader below GLOBAL, as the reason. */
  grantedBy: z.object({ id: z.uuid(), displayName: z.string() }).nullable(),
});
export type PermissionOverride = z.infer<typeof permissionOverrideSchema>;

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

/**
 * An extra area for volunteers given to an official: one location (a division or a district) or
 * the whole country, never both, with a reason.
 */
export const extraAreaRequestSchema = z.strictObject({
  locationId: z.uuid().optional(),
  wholeCountry: z.boolean().default(false),
  reason: z.string().trim().min(3).max(1000),
});
export type ExtraAreaRequest = z.infer<typeof extraAreaRequestSchema>;

/** One extra area a person holds or held, with who gave it and who ended it. */
export const extraAreaRowSchema = z.object({
  id: z.uuid(),
  wholeCountry: z.boolean(),
  location: z
    .object({
      id: z.uuid(),
      level: z.string(),
      name: z.object({ bn: z.string(), en: z.string() }),
    })
    .nullable(),
  reason: z.string(),
  grantedAt: z.string(),
  grantedBy: namedUserSchema,
  endedAt: z.string().nullable(),
  endedBy: namedUserSchema.nullable(),
  endReason: z.string().nullable(),
});
export type ExtraAreaRow = z.infer<typeof extraAreaRowSchema>;

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
