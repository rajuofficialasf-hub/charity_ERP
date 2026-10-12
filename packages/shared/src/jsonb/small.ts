import { z } from 'zod';
import { code64, dateTime, looseLabel } from './common.js';

// The smaller JSONB shapes of docs/database/json-schemas/.

/** application_scores.criteria (BD-17, BR-097, O-21). */
export const scoreCriteriaSchema = z.strictObject({
  scoring_version: z.string(),
  items: z.array(
    z.strictObject({
      key: z.string(),
      label: looseLabel.optional(),
      input: z.unknown().optional(),
      max_points: z.number().min(0).max(100),
      points: z.number().min(0).max(100),
    }),
  ),
  total: z.number().min(0).max(100),
});

/** distributions.items (BD-23, BR-116). */
export const distributionItemsSchema = z.strictObject({
  items: z.array(
    z.strictObject({
      code: z.string().max(64),
      label: looseLabel.optional(),
      quantity: z.int().min(1).optional(),
      received: z.boolean(),
    }),
  ),
});

/** followup_evaluations.answers (O-23): question code to a boolean, number or short text. */
export const followupAnswersSchema = z.record(
  code64,
  z.union([z.boolean(), z.number(), z.string().max(2000)]),
);

/** handovers.scope (BD-08, BR-034). */
export const handoverScopeSchema = z.strictObject({
  items: z.array(
    z.strictObject({
      item_type: z.enum([
        'pending_review',
        'pending_approval',
        'program',
        'project_area',
        'project_staff',
        'document',
        'issue',
        'followup',
        'edit_request',
        'correction_request',
        'work_assignment',
      ]),
      item_id: z.uuid(),
      project_id: z.uuid().optional(),
      new_owner_user_id: z.uuid(),
      done_at: dateTime.optional(),
    }),
  ),
  note: z.string().max(2000).optional(),
});

/** volunteer_ratings.proposed_scores and final_scores (BD-40, BR-042): at most 5 criteria, 1 to 5. */
export const ratingScoresSchema = z
  .record(code64, z.int().min(1).max(5))
  .refine((scores) => Object.keys(scores).length <= 5, 'at most 5 criteria');

/** users.preferences (NOTIFICATIONS.md section 5, O-35). */
export const userPreferencesSchema = z.strictObject({
  email_mode: z.enum(['digest', 'immediate']).optional(),
  digest_time: z
    .string()
    .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
    .optional(),
  push_opt_in_sessions: z.array(z.uuid()).optional(),
});
