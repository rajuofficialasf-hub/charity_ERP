import { z } from 'zod';
import type { VolunteerType } from '../registration/index.js';

/**
 * Volunteers on a project: the permission set an assignment gives, who may lead a team
 *, what a team member may do with applications, and the per-volunteer
 * application limit.
 */

/** The three permission sets of an assignment (`project_volunteers.permission_set`). */
export const PERMISSION_SETS = [
  'application_distribution',
  'application_distribution_dawah',
  'work_progress',
] as const;
export type PermissionSet = (typeof PERMISSION_SETS)[number];

/**
 * The volunteer types each set is meant for, as `permission_sets.<set>.for` in
 * docs/security/permissions.yaml says (a set gives nothing to a role outside that list; the API
 * checks this table against the registry): General and Both apply and distribute, Local দায়ী and
 * Both also teach, a paid volunteer posts work progress.
 */
export const PERMISSION_SET_TYPES: Record<PermissionSet, readonly VolunteerType[]> = {
  application_distribution: ['general', 'both'],
  application_distribution_dawah: ['local_daee', 'both'],
  work_progress: ['paid'],
};

/**
 * The set an assignment starts with, from the volunteer's type: a Local দায়ী and a দাঈ-স্বেচ্ছাসেবক
 * also teach, a paid volunteer posts work progress, a General volunteer applies and distributes. A
 * team member is never assigned; they work through the main volunteer's team.
 */
export function defaultPermissionSet(type: VolunteerType): PermissionSet | null {
  if (type === 'team_member') return null;
  if (type === 'paid') return 'work_progress';
  return type === 'general' ? 'application_distribution' : 'application_distribution_dawah';
}

/**
 * Whether a set may be given to a volunteer of this type: only a set meant for the type, so the
 * dawah set goes only to a volunteer who teaches. A দাঈ-স্বেচ্ছাসেবক is the one type with a choice.
 */
export function permissionSetAllowed(set: PermissionSet, type: VolunteerType): boolean {
  // eslint-disable-next-line security/detect-object-injection -- set is a PermissionSet
  return PERMISSION_SET_TYPES[set].includes(type);
}

/** General and দাঈ-স্বেচ্ছাসেবক volunteers may add team members. */
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
 * The team table of A5: a team member creates applications, edits their own drafts and
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
 * How many more applications a volunteer may create on a project: the main volunteer's
 * counter includes the applications of their team. Null when the project has no limit.
 */
export function applicationsLeft(limit: number | null, counted: number): number | null {
  return limit === null ? null : Math.max(0, limit - counted);
}

/** The most volunteers one assignment request takes; a larger group is sent in parts. */
export const ASSIGN_MAX = 100;

/**
 * Assigning volunteers to a project in one action: each with a set (else the type's default) and a
 * paid flag. Each volunteer once.
 */
export const assignmentCreateSchema = z.strictObject({
  volunteers: z
    .array(
      z.strictObject({
        volunteerId: z.uuid(),
        permissionSet: z.enum(PERMISSION_SETS).optional(),
        isPaid: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(ASSIGN_MAX)
    .refine(
      (list) => new Set(list.map((v) => v.volunteerId)).size === list.length,
      'a volunteer appears twice',
    ),
});
export type AssignmentCreate = z.infer<typeof assignmentCreateSchema>;

/** A change of an assignment's set or paid flag; at least one of them. */
export const assignmentUpdateSchema = z
  .strictObject({
    permissionSet: z.enum(PERMISSION_SETS).optional(),
    isPaid: z.boolean().optional(),
  })
  .refine((b) => b.permissionSet !== undefined || b.isPaid !== undefined, 'nothing to change');
export type AssignmentUpdate = z.infer<typeof assignmentUpdateSchema>;

/** The filters of the volunteers an official may assign: an area inside the caller's own, a name or mobile. */
export const candidateFilterSchema = z.strictObject({
  districtId: z.uuid().optional(),
  upazilaId: z.uuid().optional(),
  unionId: z.uuid().optional(),
  q: z.string().trim().min(2).max(100).optional(),
});
export type CandidateFilter = z.infer<typeof candidateFilterSchema>;

/** Members added to a main volunteer's team in one action, each once. */
export const teamAddSchema = z.strictObject({
  memberVolunteerIds: z
    .array(z.uuid())
    .min(1)
    .max(50)
    .refine((ids) => new Set(ids).size === ids.length, 'a volunteer appears twice'),
});
export type TeamAdd = z.infer<typeof teamAddSchema>;
