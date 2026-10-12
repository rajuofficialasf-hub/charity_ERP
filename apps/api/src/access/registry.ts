import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { PERMISSION_MARKERS } from '../openapi/drift';
import { type PermissionsFile, permissionsFileSchema, type ScopeType } from './schema';

/** docs/security/permissions.yaml from `src/access` and from `dist/access` alike. */
export const DEFAULT_PERMISSIONS_FILE = join(
  __dirname,
  '../../../../docs/security/permissions.yaml',
);

/**
 * The scope entity a route declares (the contract's `x-scope` values); `none` is for routes
 * outside the contract that need no scope (probes, health).
 */
export const SCOPE_ENTITIES = [
  'none',
  'global',
  'self',
  'user',
  'system',
  'program',
  'project',
  'application',
  'beneficiary',
  'volunteer',
  'file',
] as const;
export type ScopeEntity = (typeof SCOPE_ENTITIES)[number];

export interface RoleDef {
  key: string;
  nameEn: string;
  nameBn: string;
  kind: 'official' | 'volunteer';
  globalScope: boolean;
}

export interface DefaultGrant {
  role: string;
  scope: ScopeType;
  condition?: string;
}

export interface PermissionDef {
  name: string;
  description: string;
  module: string;
  sensitive: boolean;
  defaults: DefaultGrant[];
  globalRolesExcluded: string[];
}

export interface PermissionSetDef {
  key: string;
  forRoles: string[];
  /** Own permissions plus those of the set it extends. */
  permissions: string[];
}

export interface SensitiveFieldClass {
  key: string;
  fields: string[];
  visibleTo: string[];
}

/** The permission model of permissions.yaml, validated and indexed once per process (RBAC.md 2). */
export interface AccessRegistry {
  roles: ReadonlyMap<string, RoleDef>;
  permissions: ReadonlyMap<string, PermissionDef>;
  permissionSets: ReadonlyMap<string, PermissionSetDef>;
  sensitiveFields: readonly SensitiveFieldClass[];
  conditions: ReadonlySet<string>;
  /** A permission of the file or one of the contract markers (public, authenticated, …). */
  isKnownPermission(name: string): boolean;
}

/** Validates the parsed YAML and its cross-references; throws one error naming every problem. */
export function parsePermissionsFile(raw: unknown): AccessRegistry {
  const parsed = permissionsFileSchema.safeParse(raw, { reportInput: true });
  if (!parsed.success)
    throw new Error(
      `permissions.yaml is invalid: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message} (got ${JSON.stringify(i.input)})`)
        .join('; ')}`,
    );
  const file: PermissionsFile = parsed.data;
  const problems: string[] = [];
  const roleKeys = new Set(Object.keys(file.roles));
  const conditions = new Set(Object.keys(file.conditions));
  const names = new Set<string>();
  for (const p of file.permissions) {
    if (names.has(p.name)) problems.push(`duplicate permission ${p.name}`);
    names.add(p.name);
    for (const g of p.default) {
      if (!roleKeys.has(g.role)) problems.push(`${p.name}: unknown role ${g.role}`);
      if (g.condition && !conditions.has(g.condition))
        problems.push(`${p.name}: unknown condition ${g.condition}`);
    }
    for (const role of p.global_roles_excluded ?? [])
      if (!roleKeys.has(role)) problems.push(`${p.name}: unknown excluded role ${role}`);
  }
  for (const [key, set] of Object.entries(file.permission_sets)) {
    for (const role of set.for)
      if (!roleKeys.has(role)) problems.push(`${key}: unknown role ${role}`);
    for (const name of set.permissions)
      if (!names.has(name)) problems.push(`${key}: unknown permission ${name}`);
    if (set.extends && !(set.extends in file.permission_sets))
      problems.push(`${key}: unknown parent set ${set.extends}`);
  }
  for (const f of file.sensitive_fields)
    for (const role of f.visible_to)
      if (!roleKeys.has(role)) problems.push(`sensitive field ${f.key}: unknown role ${role}`);
  if (problems.length) throw new Error(`permissions.yaml is invalid: ${problems.join('; ')}`);

  const permissionSets = new Map<string, PermissionSetDef>();
  const resolveSet = (key: string): string[] => {
    const set = file.permission_sets[key]!;
    const inherited = set.extends ? resolveSet(set.extends) : [];
    return [...new Set([...inherited, ...set.permissions])];
  };
  for (const [key, set] of Object.entries(file.permission_sets))
    permissionSets.set(key, { key, forRoles: set.for, permissions: resolveSet(key) });

  const permissions = new Map(
    file.permissions.map((p) => [
      p.name,
      {
        name: p.name,
        description: p.description,
        module: p.module,
        sensitive: p.sensitive,
        defaults: p.default,
        globalRolesExcluded: p.global_roles_excluded ?? [],
      } satisfies PermissionDef,
    ]),
  );
  return {
    roles: new Map(
      Object.entries(file.roles).map(([key, r]) => [
        key,
        { key, nameEn: r.name_en, nameBn: r.name_bn, kind: r.kind, globalScope: r.global_scope },
      ]),
    ),
    permissions,
    permissionSets,
    sensitiveFields: file.sensitive_fields.map((f) => ({
      key: f.key,
      fields: f.fields,
      visibleTo: f.visible_to,
    })),
    conditions,
    isKnownPermission: (name) => PERMISSION_MARKERS.includes(name) || permissions.has(name),
  };
}

/** The raw file, validated (the seed writes roles and permissions from it, T1.3). */
export function readPermissionsFile(path = DEFAULT_PERMISSIONS_FILE): PermissionsFile {
  const raw = yaml.load(readFileSync(path, 'utf8'));
  parsePermissionsFile(raw);
  return permissionsFileSchema.parse(raw);
}

const loaded = new Map<string, AccessRegistry>();

/** Reads and validates the file once per path and process; a broken file stops the start. */
export function loadAccessRegistry(path = DEFAULT_PERMISSIONS_FILE): AccessRegistry {
  let registry = loaded.get(path);
  if (!registry) {
    registry = parsePermissionsFile(yaml.load(readFileSync(path, 'utf8')));
    loaded.set(path, registry);
  }
  return registry;
}
