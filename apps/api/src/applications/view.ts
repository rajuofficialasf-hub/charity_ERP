import { answerValueSchema } from '@css/shared';
import { APPLICATION_STATES } from '@css/shared';
import { z } from 'zod';
import { sensitive } from '../access/field-mask';
import { versionView } from '../routes/forms';
import type { FormVersionView } from '../services/forms';

/** The class of the official section and of the office's own texts (permissions.yaml). */
export const OFFICIAL_SECTION = 'application.official_section';

const uuid = z.uuid();
const nullableUuid = z.uuid().nullable();

/** One answer as the record stores it and the client sends it. */
export const answerView = z.object({
  fieldKey: z.string(),
  repeatIndex: z.int().min(0),
  value: answerValueSchema,
});

/** The row of the list (contract `ApplicationSummary`). */
export const applicationSummary = z.object({
  id: uuid,
  appNo: z.string().nullable(),
  projectId: uuid,
  beneficiaryId: nullableUuid,
  beneficiaryName: z.string().nullable(),
  ownerVolunteerId: nullableUuid,
  status: z.enum(APPLICATION_STATES),
  stage: z.string().nullable(),
  outcome: z.string().nullable(),
  flags: z.array(z.string()),
  totalScore: sensitive(z.number().nullable(), OFFICIAL_SECTION),
  districtId: uuid,
  unionId: uuid,
  submittedAt: z.string().nullable(),
  waitingDays: z.int().nullable(),
  /** The version of the row, carried back by a bulk action's row as its If-Match. */
  etag: z.string(),
});
export type ApplicationSummary = z.infer<typeof applicationSummary>;

const familyWarning = z.object({
  beneficiaryId: uuid,
  benNo: z.string(),
  name: z.string(),
  matchedOn: z.array(z.enum(['mobile', 'union_village_father'])),
});

/**
 * The record (contract `Application`): the answers of the caller's audience, the office's reason
 * and the zakat figures for the office only, the family warnings at review, and the actions the
 * caller may take now.
 */
export const applicationView = applicationSummary.extend({
  formVersionId: uuid,
  candidateBeneficiaryId: nullableUuid,
  createdByUserId: nullableUuid,
  identityKind: z.enum(['nid', 'birth_reg']).nullable(),
  rejectionMessage: z.string().nullable(),
  answers: z.array(answerView),
  reviewedAt: z.string().nullable(),
  approvedAt: z.string().nullable(),
  decisionComment: sensitive(z.string().nullable(), OFFICIAL_SECTION),
  /** The priority score's breakdown, frozen with the score at the decision. */
  scoreItems: sensitive(
    z
      .array(
        z.object({
          key: z.string(),
          label: z.object({ bn: z.string(), en: z.string() }).optional(),
          input: z.unknown(),
          max_points: z.number(),
          points: z.number(),
        }),
      )
      .nullable(),
    OFFICIAL_SECTION,
  ),
  zakat: sensitive(
    z
      .object({ nisabValue: z.string(), decision: z.enum(['eligible', 'not_eligible']).nullable() })
      .nullable(),
    OFFICIAL_SECTION,
  ),
  familyDuplicateWarnings: z.array(familyWarning),
  availableActions: z.array(z.string()),
  /** The comments the office's decisions would ask for now, by action; empty for a volunteer. */
  decisionHints: z.record(z.string(), z.array(z.enum(['against_score', 'quota_full']))),
  /** The form version the answers belong to, as the caller's audience sees it. */
  form: versionView,
});
/** The record as the service builds it; the form keeps the service's own version view. */
export type ApplicationView = Omit<z.infer<typeof applicationView>, 'form'> & {
  form: FormVersionView;
};

const dateTime = z.iso.datetime({ offset: true });

/** The request of a draft (contract `ApplicationCreate`). */
export const applicationCreateSchema = z.strictObject({
  clientUuid: uuid,
  clientCreatedAt: dateTime.optional(),
  projectId: uuid,
  formVersionId: uuid,
  beneficiaryId: uuid.optional(),
  answers: z.array(z.unknown()).max(2000),
});
export type ApplicationCreate = z.infer<typeof applicationCreateSchema>;

/** The request of an edit (contract `ApplicationUpdate`). */
export const applicationUpdateSchema = z.strictObject({
  answers: z.array(z.unknown()).max(2000),
});
export type ApplicationUpdate = z.infer<typeof applicationUpdateSchema>;

/** The request of a workflow action (contract `ApplicationActionRequest`). */
export const applicationActionSchema = z.object({
  reason: z.string().max(2000).optional(),
  message: z.string().max(2000).optional(),
  comment: z.string().max(2000).optional(),
  linkBeneficiaryId: uuid.optional(),
  zakatDecision: z.enum(['eligible', 'not_eligible']).optional(),
});
export type ApplicationActionBody = z.infer<typeof applicationActionSchema>;

const dateOnly = z.iso.date();

/** The filters of a project's list (contract parameters of `applications.application.list`). */
export const applicationFilterSchema = z.strictObject({
  q: z.string().max(200).optional(),
  status: z.string().max(200).optional(),
  stage: z.string().max(100).optional(),
  districtId: uuid.optional(),
  unionId: uuid.optional(),
  ownerVolunteerId: uuid.optional(),
  flag: z.string().max(100).optional(),
  submittedFrom: dateOnly.optional(),
  submittedTo: dateOnly.optional(),
});
export type ApplicationFilter = z.infer<typeof applicationFilterSchema>;
