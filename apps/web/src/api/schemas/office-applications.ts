import { MEDIA_PRIORITIES, REFERRAL_STATES } from '@css/shared/media';
import { z } from 'zod';
import { applicationSchema, applicationSummarySchema } from './applications';
import { duplicateRuleSchema, helpSummarySchema } from './beneficiaries';
import { bilingual, dateTime, recordOf } from './common';

/** Another beneficiary profile a signal of the review names. */
const personRefSchema = z.object({ beneficiaryId: z.uuid(), benNo: z.string(), name: z.string() });
/** How sure a person signal is; an entry the viewer may not open carries this alone. */
const signalLevel = z.object({ level: z.literal('probable') });

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
 * the person appears again in the project (probably the same person under another profile, or
 * someone of the same family) where the project holds that repeat.
 */
export const commentReasonSchema = z.enum([
  'against_score',
  'quota_full',
  'same_person',
  'family_match',
]);
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

/** One item of the project's review checklist with this application's answer, if any. */
export const reviewCheckItemSchema = z.object({
  code: z.string(),
  label: bilingual,
  result: z.enum(['ok', 'problem']).nullable(),
  comment: z.string().nullable(),
  checkedBy: z.object({ id: z.string(), name: z.string() }).nullable(),
  checkedAt: z.string().nullable(),
});
export type ReviewCheckItem = z.infer<typeof reviewCheckItemSchema>;

/** The record as an official reads it: the volunteer's view plus the office's own fields. */
export const officeApplicationSchema = applicationSchema.extend({
  decisionComment: z.string().nullable().optional(),
  /** The project's review checklist with the answers given on this application. */
  reviewChecklist: z
    .object({ required: z.boolean(), items: z.array(reviewCheckItemSchema) })
    .nullable()
    .optional(),
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
  /** Whether the caller may add the number this application carries to the profile, which has none. */
  mayAddIdentity: z.boolean().optional(),
  familyDuplicateWarnings: z.array(
    z.object({
      beneficiaryId: z.uuid(),
      benNo: z.string(),
      name: z.string(),
      matchedOn: z.array(z.enum(['mobile', 'union_village_father'])),
    }),
  ),
  /**
   * The earlier families that probably hold the person: the head and the relationships only where
   * the head may be opened, else the level alone.
   */
  familyMemberSignals: z
    .array(
      z.union([
        signalLevel.extend({
          relationships: z.array(z.object({ code: z.string(), name: bilingual.nullable() })),
          head: personRefSchema,
        }),
        signalLevel,
      ]),
    )
    .default([]),
  /** How many earlier families there are in all, also beyond the ones listed. */
  familyMemberSignalsTotal: z.number().int().default(0),
  /** The person's open probable pairs: the rules and the other profile only where both may be compared. */
  samePersonSignals: z
    .array(
      z.union([
        signalLevel.extend({ matchedOn: z.array(duplicateRuleSchema), other: personRefSchema }),
        signalLevel,
      ]),
    )
    .default([]),
  /** How many open probable pairs there are in all, also beyond the ones listed. */
  samePersonSignalsTotal: z.number().int().default(0),
  /** The mobile the approval writes to the known person's profile; null when none changes. */
  profileMobileChange: z
    .object({
      from: z.string().nullable(),
      to: z.string(),
      /** Why the number stays on the application; null when the approval writes it. */
      kept: z
        .enum(['other_profile', 'volunteer_mobile', 'not_allowed', 'profile_changed'])
        .nullable(),
    })
    .nullable()
    .default(null),
  /**
   * The same person's other sent applications in this project on a profile merged with this one;
   * all three fields null where the caller does not reach that application.
   */
  mergedTwins: z
    .array(
      z.object({
        applicationId: z.uuid().nullable(),
        appNo: z.string().nullable(),
        status: z.string().nullable(),
      }),
    )
    .default([]),
  /**
   * How often the person was helped by their other applications; absent without the application
   * history class, null before a person is bound.
   */
  helpedBefore: helpSummarySchema.nullable().optional(),
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
  /** How an unlock ended; a sent-back value never reached the answer. */
  decision: z.enum(['accepted', 'refused', 'cancelled']).nullable().default(null),
  decisionReason: z.string().nullable().default(null),
  changedByName: z.string().nullable().default(null),
  requestedByName: z.string().nullable().default(null),
  enteredByName: z.string().nullable().default(null),
  decidedByName: z.string().nullable().default(null),
});
export type FieldChange = z.infer<typeof fieldChangeSchema>;

/** The application the waitlist pull moved into approved. */
export const pulledApplicationSchema = recordOf(
  z.object({ id: z.uuid(), appNo: z.string().nullable() }),
);
export type PulledApplication = z.infer<typeof pulledApplicationSchema>;

/** Who a pull of an area would take now, or null when nobody waits. */
export const nextWaitlistedSchema = recordOf(
  z
    .object({
      id: z.uuid(),
      appNo: z.string().nullable(),
      beneficiaryName: z.string().nullable(),
      totalScore: z.number().nullable(),
    })
    .nullable(),
);
export type NextWaitlisted = z.infer<typeof nextWaitlistedSchema>['data'];

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
