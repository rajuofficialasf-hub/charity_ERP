import { answerValueSchema } from '@css/shared';
import type { Answer } from '@css/shared/forms';
import { z } from 'zod';
import { dateTime, pageOf, recordOf } from './common';
import { formDefinitionShape } from './forms';

/** One answer as the API stores it: the field key, the repeat row and the typed value. */
export const answerSchema = z.object({
  fieldKey: z.string(),
  repeatIndex: z.number().int().optional(),
  value: answerValueSchema,
}) satisfies z.ZodType<Answer>;

/** A row of a list (the API's `ApplicationSummary`). */
export const applicationSummarySchema = z.object({
  id: z.uuid(),
  appNo: z.string().nullable(),
  projectId: z.uuid(),
  beneficiaryId: z.uuid().nullable(),
  beneficiaryName: z.string().nullable(),
  /**
   * Whether the person's profile holds an identity document, and a mobile of their own; null
   * before a profile is bound and for a reader who may not know; absent on a record the phone
   * holds on its own.
   */
  hasDocument: z.boolean().nullable().optional(),
  hasMobile: z.boolean().nullable().optional(),
  ownerVolunteerId: z.uuid().nullable(),
  status: z.string(),
  stage: z.string().nullable(),
  outcome: z.string().nullable(),
  flags: z.array(z.string()),
  /** The device time the record was made, when it came from a phone offline. */
  clientCreatedAt: dateTime.nullable().optional(),
  districtId: z.uuid(),
  unionId: z.uuid(),
  /** The area's names; absent on a record the phone holds on its own. */
  districtName: z.object({ bn: z.string(), en: z.string() }).optional(),
  unionName: z.object({ bn: z.string(), en: z.string() }).optional(),
  submittedAt: dateTime.nullable(),
  waitingDays: z.number().int().nullable(),
  /** The priority score, for the office only; none when the form gives no points. */
  totalScore: z.number().nullable().optional(),
  etag: z.string(),
});
export type ApplicationSummary = z.infer<typeof applicationSummarySchema>;

/** The form version the answers belong to, as the caller's audience sees it. */
export const applicationFormSchema = z.object({
  id: z.uuid(),
  formId: z.uuid(),
  versionNo: z.number().int(),
  status: z.string(),
  publishedAt: dateTime.nullable(),
  ...formDefinitionShape,
});
export type ApplicationForm = z.infer<typeof applicationFormSchema>;

/**
 * One answer of an approved application opened for correction: opened by an official, filled by
 * the volunteer (or the office), decided by an official who did not fill it.
 */
export const unlockSchema = z.object({
  id: z.uuid(),
  applicationId: z.uuid(),
  fieldKey: z.string(),
  repeatIndex: z.number().int(),
  state: z.enum(['open', 'updated', 'relocked']),
  oldValue: z.unknown(),
  newValue: z.unknown(),
  /** The office's reason; null for a volunteer. */
  reason: z.string().nullable(),
  openedBy: z.string().nullable(),
  openedAt: dateTime,
  enteredBy: z.string().nullable(),
  enteredAt: dateTime.nullable(),
  decidedBy: z.string().nullable(),
  decidedAt: dateTime.nullable(),
  decision: z.enum(['accepted', 'refused', 'cancelled']).nullable(),
  decisionReason: z.string().nullable(),
  mayFill: z.boolean(),
  mayDecide: z.boolean(),
  mayCancel: z.boolean(),
});
export type Unlock = z.infer<typeof unlockSchema>;

/** The record (the API's `Application`), as a volunteer reads it. */
export const applicationSchema = applicationSummarySchema.extend({
  formVersionId: z.uuid(),
  createdByUserId: z.uuid().nullable(),
  /** The profile an entry is compared with at its verification, where the reader may know it. */
  candidateBeneficiaryId: z.uuid().nullable().optional(),
  identityKind: z.enum(['nid', 'birth_reg', 'none']).nullable(),
  /** Whether the father's or husband's name is the father's or the husband's; absent outside the office. */
  guardianRelationCode: z.string().nullable().optional(),
  rejectionMessage: z.string().nullable(),
  answers: z.array(answerSchema),
  reviewedAt: dateTime.nullable(),
  approvedAt: dateTime.nullable(),
  familyDuplicateWarnings: z.array(z.unknown()),
  availableActions: z.array(z.string()),
  /** The unlocks of the application waiting for a step, as the reader may see them. */
  unlocks: z.array(unlockSchema).optional(),
  /** Whether the reader may open an answer for correction now (the office only). */
  mayUnlock: z.boolean().optional(),
  form: applicationFormSchema,
});
export type Application = z.infer<typeof applicationSchema>;

/** The record with the version a write carries back in If-Match. */
export const applicationRecordSchema = recordOf(applicationSchema);
export type ApplicationRecord = z.infer<typeof applicationRecordSchema>;

/** A page of the caller's own applications with its total. */
export const applicationPageSchema = pageOf(applicationSummarySchema);
export type ApplicationPage = z.infer<typeof applicationPageSchema>;

export const timelineEntrySchema = z.object({
  id: z.uuid(),
  at: dateTime,
  action: z.string(),
  from: z.string().nullable(),
  to: z.string(),
  automatic: z.boolean(),
  message: z.string().nullable(),
});
export type TimelineEntry = z.infer<typeof timelineEntrySchema>;
