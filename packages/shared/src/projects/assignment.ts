import type { VolunteerType } from '../registration/index.js';

/**
 * Volunteers on a project: the permission set an assignment gives (BR-038), who may lead a team
 * (BR-040), what a team member may do with applications (BR-041), and the per-volunteer
 * application limit (BR-059).
 */

/** The three permission sets of an assignment (`project_volunteers.permission_set`). */
export const PERMISSION_SETS = [
  'application_distribution',
  'application_distribution_dawah',
  'work_progress',
] as const;
export type PermissionSet = (typeof PERMISSION_SETS)[number];

/** Volunteer types that teach dawah classes (Local দায়ী, and দাঈ-স্বেচ্ছাসেবক who does both). */
export const DAWAH_TYPES: readonly VolunteerType[] = ['local_daee', 'both'];

/**
 * The set an assignment starts with, from the volunteer's type: a paid volunteer posts work
 * progress, a dawah type also teaches, everyone else applies and distributes. A team member is
 * never assigned; they work through the main volunteer's team.
 */
export function defaultPermissionSet(type: VolunteerType, paid: boolean): PermissionSet | null {
  if (type === 'team_member') return null;
  if (paid || type === 'paid') return 'work_progress';
  return DAWAH_TYPES.includes(type) ? 'application_distribution_dawah' : 'application_distribution';
}

/** The dawah set goes only to a volunteer who teaches, or on a project that runs dawah classes. */
export function permissionSetAllowed(
  set: PermissionSet,
  volunteer: { type: VolunteerType; dawahEnabled: boolean },
): boolean {
  if (volunteer.type === 'team_member') return false;
  return (
    set !== 'application_distribution_dawah' ||
    DAWAH_TYPES.includes(volunteer.type) ||
    volunteer.dawahEnabled
  );
}

/** General and দাঈ-স্বেচ্ছাসেবক volunteers may add team members (BR-040). */
export const TEAM_LEAD_TYPES: readonly VolunteerType[] = ['general', 'both'];

/** What may be done with applications on a project, by the main volunteer or a team member. */
export const APPLICATION_CAPABILITIES = [
  'create',
  'edit_own_draft',
  'delete_draft',
  'submit',
  'edit_pending',
  'delete_pending',
  'view_approved_basic',
] as const;
export type ApplicationCapability = (typeof APPLICATION_CAPABILITIES)[number];

/**
 * The team table of A5 (BR-041): a team member creates applications, edits their own drafts and
 * sees the basic data of their approved ones, but never submits and never touches a submitted
 * application; the main volunteer does everything on the list. Phase 2's application routes read
 * this table.
 */
export function teamCapabilities(role: 'main' | 'member'): ReadonlySet<ApplicationCapability> {
  return new Set<ApplicationCapability>(
    role === 'main'
      ? APPLICATION_CAPABILITIES
      : ['create', 'edit_own_draft', 'view_approved_basic'],
  );
}

/**
 * How many more applications a volunteer may create on a project (BR-059): the main volunteer's
 * counter includes the applications of their team. Null when the project has no limit.
 */
export function applicationsLeft(limit: number | null, counted: number): number | null {
  return limit === null ? null : Math.max(0, limit - counted);
}
