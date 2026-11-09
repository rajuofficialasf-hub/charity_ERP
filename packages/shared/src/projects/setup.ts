import { z } from 'zod';
import { boundedLabel } from '../jsonb/common.js';
import { money } from './requests.js';

/**
 * The parts of a project's setup saved on their own: a component, the fund sources, an area with
 * its RPM, a staff member's access, the dawah syllabus. Each body is strict and every list bounded.
 */

/** Switch a component on or off and replace its settings (checked against the component's schema). */
export const componentPatchSchema = z
  .strictObject({
    enabled: z.boolean().optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((b) => b.enabled !== undefined || b.settings !== undefined, 'enabled or settings');
export type ComponentPatch = z.infer<typeof componentPatchSchema>;

export const FUND_SOURCES = ['zakat', 'sadaqah', 'general', 'donor'] as const;

/**
 * The fund sources with their amounts, and the budget when it changes with them: once a project is
 * active its fund sources always add up to its planned budget, so both are saved together
 *.
 */
export const fundSourcesSchema = z.strictObject({
  costPerBeneficiary: money.optional(),
  targetBeneficiaries: z.number().int().min(1).max(10_000_000).optional(),
  fundSources: z
    .array(
      z
        .strictObject({
          source: z.enum(FUND_SOURCES),
          label: z.string().trim().min(1).max(200).optional(),
          amount: money,
        })
        // a specific donor is named
        .refine((f) => f.source !== 'donor' || f.label !== undefined, {
          message: 'a donor needs a name',
          path: ['label'],
        }),
    )
    .max(10),
});
export type FundSources = z.infer<typeof fundSourcesSchema>;

export const areaCreateSchema = z.strictObject({ locationId: z.uuid(), rpmUserId: z.uuid() });
export type AreaCreate = z.infer<typeof areaCreateSchema>;

/**
 * The official roles that work under an RPM and may get project access (the Implementer role is
 * retired: a Project Executive does the implementation work).
 */
export const STAFF_ACCESS_ROLES = ['project_executive', 'official_daee'] as const;

/**
 * Officials a project may be given: an RPM for an area, or a field official for staff access. The
 * search needs at least two characters and returns names only.
 */
export const CANDIDATE_ROLES = ['regional_program_manager', ...STAFF_ACCESS_ROLES] as const;
export const candidateQuerySchema = z.strictObject({
  role: z.enum(CANDIDATE_ROLES),
  q: z.string().trim().min(2).max(100).optional(),
});
export type CandidateQuery = z.infer<typeof candidateQuerySchema>;

export const staffCreateSchema = z.strictObject({
  userId: z.uuid(),
  roleKey: z.enum(STAFF_ACCESS_ROLES),
  areaLocationId: z.uuid().optional(),
  canView: z.boolean().default(true),
  canEdit: z.boolean().default(false),
  canDelete: z.boolean().default(false),
});
export type StaffCreate = z.infer<typeof staffCreateSchema>;

export const syllabusSchema = z.strictObject({
  topics: z
    .array(z.strictObject({ id: z.uuid().optional(), title: boundedLabel }))
    .max(100)
    // a topic is kept once
    .refine((topics) => {
      const ids = topics.flatMap((t) => (t.id ? [t.id] : []));
      return new Set(ids).size === ids.length;
    }, 'a topic id appears twice'),
});
export type Syllabus = z.infer<typeof syllabusSchema>;

/**
 * The quota targets of a project, replacing the stored list: a district or a
 * union each, at most once; an empty list takes every quota away.
 */
export const quotaTargetsSchema = z.strictObject({
  quotas: z
    .array(
      z.strictObject({
        level: z.enum(['district', 'union']),
        locationId: z.uuid(),
        // a target of none means no quota, so a quota always has a target of one or more
        target: z.number().int().min(1).max(1_000_000),
      }),
    )
    .max(500)
    .refine((list) => new Set(list.map((q) => q.locationId)).size === list.length, {
      message: 'validation.duplicate',
    }),
});
export type QuotaTargets = z.infer<typeof quotaTargetsSchema>;
