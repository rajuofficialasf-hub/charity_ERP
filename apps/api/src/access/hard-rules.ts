import type { AccessRegistry } from './registry.js';

/**
 * The hard rules of roles and of the permission panel (docs/security/RBAC.md, "Permission panel"
 * and "Special cases"): what no catalogue entry, panel row or project extra may give. The write
 * paths (the panel, the project extras, a new account, a registration's approval) ask here before
 * they write, and the evaluation of the effective grants asks here again, so a stray row cannot
 * break a rule.
 */

export const IF_RPM_GRANTS = 'if_rpm_grants';
export const OWNER_TRANSFER = 'system.owner.transfer';
/** The role that maintains the system; the Main Admin is one of its holders. */
export const ADMIN_ROLE = 'admin';
/** The head of the department, appointed by an Admin. */
export const HEAD_ROLE = 'department_head';
/** Whether the roles include one no panel revoke may strip: an Admin or the Department Head. */
export const isTopRole = (roles: readonly string[]) =>
  roles.includes(ADMIN_ROLE) || roles.includes(HEAD_ROLE);

/**
 * The key permissions: the administration of the system, which the Monitoring Team does not hold
 * and which only an Admin grants through the panel.
 */
export const KEY_PERMISSIONS: ReadonlySet<string> = new Set([
  // accounts and sessions
  'user.create',
  'user.profile.manage',
  'user.state.change',
  'user.lock.clear',
  'session.revoke_user',
  'user.handover',
  // roles and the panel
  'permission.panel.manage',
  'user.role.change',
  'user.extra_area.manage',
  OWNER_TRANSFER,
  // registrations of officials
  'staff.registration.approve',
  'staff_edit_request.approve',
  // the system
  'settings.manage',
  'holiday.manage',
  'provider.settings.manage',
  'system.health.view',
  'notification.template.manage',
  'location.manage',
  'i18n.manage',
]);

/** The rules a refused change names in `permission.grant_refused` (`params.rule`). */
export type HardRule =
  | 'self_change'
  | 'top_role_protected'
  | 'key_permission_admin_only'
  | 'owner_transfer_only_admin'
  | 'global_scope_protected'
  | 'sensitive_to_volunteer'
  | 'role_admin_only'
  | 'whole_country_top_roles_only'
  | 'outside_own_reach';

/** Who asks for the change. */
export interface RuleActor {
  id: string;
  roles: readonly string[];
}

/** Whose access the change is about. */
export interface RuleTarget {
  id: string;
  kind: string;
  roles: readonly string[];
}

export interface AccessChange {
  permission: string;
  effect: 'grant' | 'revoke';
  scopeType: string;
}

const isOfficial = (registry: AccessRegistry, roles: readonly string[]) =>
  roles.some((r) => registry.roles.get(r)?.kind === 'official');

/**
 * Whether these roles may hold the permission at all, whatever rows exist: the owner transfer is
 * an Admin's alone, and a sensitive permission is never a volunteer's.
 */
export function mayHold(
  registry: AccessRegistry,
  roles: readonly string[],
  permission: string,
): boolean {
  if (permission === OWNER_TRANSFER) return roles.includes(ADMIN_ROLE);
  return isOfficial(registry, roles) || registry.permissions.get(permission)?.sensitive !== true;
}

/** Whether a revoke may take anything from these roles: never from an Admin or the Head. */
export const revokesReach = (roles: readonly string[]) => !isTopRole(roles);

/**
 * The rule that refuses one grant or revoke of the panel or of the project extras, or null. In
 * order: nobody changes their own access; no revoke against an Admin or the Head; a key permission
 * comes from an Admin only; the owner transfer goes to an Admin only; the whole country is given by
 * an Admin or the Department Head only; the GLOBAL scope of a global role is not removed; a
 * sensitive permission never goes to a volunteer.
 */
export function changeRefusal(
  registry: AccessRegistry,
  actor: RuleActor,
  target: RuleTarget,
  change: AccessChange,
): HardRule | null {
  if (actor.id === target.id) return 'self_change';
  const grant = change.effect === 'grant';
  if (!grant && isTopRole(target.roles)) return 'top_role_protected';
  if (grant && KEY_PERMISSIONS.has(change.permission) && !actor.roles.includes(ADMIN_ROLE))
    return 'key_permission_admin_only';
  if (grant && change.permission === OWNER_TRANSFER && !target.roles.includes(ADMIN_ROLE))
    return 'owner_transfer_only_admin';
  if (grant && change.scopeType === 'GLOBAL' && !isTopRole(actor.roles))
    return 'whole_country_top_roles_only';
  const globalRole = target.roles.some((r) => registry.roles.get(r)?.globalScope);
  if (!grant && change.scopeType === 'GLOBAL' && globalRole) return 'global_scope_protected';
  const sensitive = registry.permissions.get(change.permission)?.sensitive === true;
  if (grant && sensitive && (target.kind === 'volunteer' || !isOfficial(registry, target.roles)))
    return 'sensitive_to_volunteer';
  return null;
}

/**
 * The rule that refuses the end of a live override, or null: nobody ends an override on
 * themselves, and lifting a revoke of a key permission gives that permission back, so it is an
 * Admin's to do.
 */
export function endRefusal(
  actor: RuleActor,
  target: Pick<RuleTarget, 'id'>,
  override: { permission: string; effect: string },
): HardRule | null {
  if (actor.id === target.id) return 'self_change';
  if (
    override.effect === 'revoke' &&
    KEY_PERMISSIONS.has(override.permission) &&
    !actor.roles.includes(ADMIN_ROLE)
  )
    return 'key_permission_admin_only';
  return null;
}

/**
 * The rule that refuses giving a role, in a new account, a registration's approval and a role
 * change alike: an Admin and the Department Head are made by an Admin, and another role with the
 * GLOBAL scope (the Monitoring Team) by an Admin or the Head.
 */
export function roleRefusal(
  registry: AccessRegistry,
  actorRoles: readonly string[],
  roleKey: string,
): HardRule | null {
  if (roleKey === ADMIN_ROLE || roleKey === HEAD_ROLE)
    return actorRoles.includes(ADMIN_ROLE) ? null : 'role_admin_only';
  if (registry.roles.get(roleKey)?.globalScope && !isTopRole(actorRoles)) return 'role_admin_only';
  return null;
}

/**
 * The rule that refuses a change of a person's role, or null: nobody changes their own role, and
 * each role the change takes away or gives must be one the actor may give (to or from an Admin or
 * the Department Head: an Admin; to or from the Monitoring Team: an Admin or the Head).
 */
export function roleChangeRefusal(
  registry: AccessRegistry,
  actor: RuleActor,
  target: Pick<RuleTarget, 'id' | 'roles'>,
  roleKey: string,
): HardRule | null {
  if (actor.id === target.id) return 'self_change';
  for (const role of [...target.roles, roleKey]) {
    const rule = roleRefusal(registry, actor.roles, role);
    if (rule) return rule;
  }
  return null;
}

/** An Admin other than the person a stored override is about. */
const SOME_ADMIN: RuleActor = { id: '', roles: [ADMIN_ROLE] };

/**
 * Whether a stored panel override could have been written for a person who holds these roles, by
 * an Admin, who may give the most. A role change ends the overrides that could not: a revoke on a
 * person who becomes an Admin or the Head, a GLOBAL revoke on a new member of the Monitoring Team,
 * the owner transfer of someone who is no longer an Admin.
 */
export function overrideStands(
  registry: AccessRegistry,
  target: RuleTarget,
  override: AccessChange,
): boolean {
  return changeRefusal(registry, SOME_ADMIN, target, override) === null;
}

/**
 * Whether a project extra of this permission counts for these roles: only where the catalogue
 * gives one of them the permission "if RPM grants".
 */
export function rpmGrantable(
  registry: AccessRegistry,
  roles: readonly string[],
  permission: string,
): boolean {
  return (
    registry.permissions
      .get(permission)
      ?.defaults.some((d) => d.condition === IF_RPM_GRANTS && roles.includes(d.role)) ?? false
  );
}

/** Where a person reaches volunteers: everywhere, or in a set of locations. */
export interface VolunteerReach {
  everywhere: boolean;
  locationIds: ReadonlySet<string>;
}

/**
 * The rule that refuses the giving or the ending of an extra area, or null
 * (docs/BUSINESS_RULES.md, "An official may be given an extra area"): nobody changes the own; an
 * Admin and the Department Head give any place; the whole country is theirs alone to give; anyone
 * else gives only a place they reach for volunteers themselves, a location they hold or a
 * district of a division they hold.
 */
export function extraAreaRefusal(
  actor: { id: string; roles: readonly string[] },
  targetId: string,
  place: { wholeCountry: boolean; locationId: string | null; parentId: string | null },
  reach: VolunteerReach,
): HardRule | null {
  if (actor.id === targetId) return 'self_change';
  if (isTopRole(actor.roles)) return null;
  if (place.wholeCountry) return 'whole_country_top_roles_only';
  if (reach.everywhere) return null;
  const held = (id: string | null) => id !== null && reach.locationIds.has(id);
  return held(place.locationId) || held(place.parentId) ? null : 'outside_own_reach';
}
