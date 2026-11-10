import { MEDIA_PRIORITIES, REFERRAL_STATES } from '@css/shared/media';
import { z } from 'zod';
import { applicationSchema, applicationSummarySchema } from './applications';
import { bilingual, dateTime, recordOf } from './common';

/** The office's decisions on an application. */
export const officeActionSchema = z.enum([
  'review',
  'send_for_approval',
  'approve',
  'waitlist',
  'pull_from_waitlist',
  'reject',
  'return_to_review',
  'verify_link',
  'verify_create',
  'reject_unverified',
  'delete',
]);
export type OfficeAction = z.infer<typeof officeActionSchema>;

/**
 * Why a decision asks for a comment: it goes against the score order, the quota area is full, or
 * the person has a family match in the project.
 */
export const commentReasonSchema = z.enum(['against_score', 'quota_full', 'family_match']);
export type CommentReason = z.infer<typeof commentReasonSchema>;

/** One part of the priority score, frozen with the score at the decision. */
export const scoreItemSchema = z.object({
  key: z.string(),
  label: bilingual.optional(),
  input: z.unknown(),
  max_points: z.number(),
  points: z.number(),
});
export type ScoreItem = z.infer<typeof scoreItemSchema>;

/** The record as an official reads it: the volunteer's view plus the office's own fields. */
export const officeApplicationSchema = applicationSchema.extend({
  decisionComment: z.string().nullable().optional(),
  totalScore: z.number().nullable().optional(),
  scoreItems: z.array(scoreItemSchema).nullable().optional(),
  /** The comments each decision would ask for now, by action. */
  decisionHints: z.partialRecord(officeActionSchema, z.array(commentReasonSchema)),
  zakat: z
    .object({
      nisabValue: z.string(),
      decision: z.enum(['eligible', 'not_eligible']).nullable(),
    })
    .nullable()
    .optional(),
  /** Its referral to the Media Team, for the referrer's scope and the directors. */
  media: z
    .object({
      referralId: z.uuid(),
      state: z.enum(REFERRAL_STATES),
      priority: z.enum(MEDIA_PRIORITIES),
      decisionComment: z.string().nullable(),
      decidedAt: dateTime.nullable(),
      workStageCode: z.string().nullable(),
    })
    .nullable()
    .optional(),
  /** Whether the caller may send it to the Media Team now, or a returned referral again. */
  mayReferToMedia: z.boolean().optional(),
  familyDuplicateWarnings: z.array(
    z.object({
      beneficiaryId: z.uuid(),
      benNo: z.string(),
      name: z.string(),
      matchedOn: z.array(z.enum(['mobile', 'union_village_father'])),
    }),
  ),
});
export type OfficeApplication = z.infer<typeof officeApplicationSchema>;

/** The record with the version a decision carries back in If-Match. */
export const officeApplicationRecordSchema = recordOf(officeApplicationSchema);
export type OfficeApplicationRecord = z.infer<typeof officeApplicationRecordSchema>;

/** A page of a project's applications for the office, with a total that stops at 10000. */
export const officeApplicationPageSchema = z.object({
  data: z.array(applicationSummarySchema),
  meta: z.object({
    nextCursor: z.string().nullable(),
    prevCursor: z.string().nullable(),
    total: z.union([z.number().int(), z.literal('10000+')]).optional(),
  }),
});
export type OfficeApplicationPage = z.infer<typeof officeApplicationPageSchema>;

/** One step of the application as the office reads it: the actor and the office's texts too. */
export const officeTimelineEntrySchema = z.object({
  id: z.uuid(),
  at: dateTime,
  action: z.string(),
  from: z.string().nullable(),
  to: z.string(),
  automatic: z.boolean(),
  actor: z.object({ id: z.uuid(), name: z.string() }).nullable().optional(),
  reason: z.string().nullable().optional(),
  comment: z.string().nullable().optional(),
  message: z.string().nullable(),
});
export type OfficeTimelineEntry = z.infer<typeof officeTimelineEntrySchema>;

/** One change of an answer or a locked field, in the change log. */
export const fieldChangeSchema = z.object({
  id: z.uuid(),
  field: z.string(),
  kind: z.string(),
  oldValue: z.unknown(),
  newValue: z.unknown(),
  reason: z.string().nullable(),
  createdAt: dateTime,
});
export type FieldChange = z.infer<typeof fieldChangeSchema>;

/** The application the waitlist pull moved into approved. */
export const pulledApplicationSchema = recordOf(
  z.object({ id: z.uuid(), appNo: z.string().nullable() }),
);
export type PulledApplication = z.infer<typeof pulledApplicationSchema>;

/** The result of one row of the office's bulk review. */
export const bulkRowResultSchema = z.object({
  clientUuid: z.uuid(),
  result: z.enum(['done', 'failed', 'pending_photos', 'needs_verification', 'synced']),
  code: z.string().nullable(),
  serverId: z.uuid().nullable(),
  status: z.string().nullable(),
  stage: z.string().nullable(),
});
export type BulkRowResult = z.infer<typeof bulkRowResultSchema>;

export const bulkReviewSchema = z.object({ results: z.array(bulkRowResultSchema) });
export type BulkReview = z.infer<typeof bulkReviewSchema>;
