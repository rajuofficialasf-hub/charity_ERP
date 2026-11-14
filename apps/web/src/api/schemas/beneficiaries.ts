import type { BeneficiaryRow, BeneficiaryStatistics } from '@css/shared/beneficiaries';
import { z } from 'zod';
import { date, dateTime, tabPageOf, versionedOf } from './common';
import { publishedWorkSchema } from './media';

/** A row of the beneficiary tab (`GET /beneficiaries`). */
export const beneficiaryRowSchema = z.object({
  id: z.uuid(),
  benNo: z.number().int(),
  name: z.string(),
  fatherOrHusbandName: z.string().optional(),
  classCode: z.string().nullable().optional(),
  status: z.string(),
  divisionId: z.uuid(),
  districtId: z.uuid(),
  upazilaId: z.uuid(),
  unionId: z.uuid().optional(),
  village: z.string().optional(),
  mobile: z.string().nullable().optional(),
  hasDocument: z.boolean().optional(),
  isBlocked: z.boolean().optional(),
  photoFileId: z.uuid().nullable().optional(),
}) satisfies z.ZodType<BeneficiaryRow>;

export const beneficiaryPageSchema = tabPageOf(beneficiaryRowSchema);
export type BeneficiaryPage = z.infer<typeof beneficiaryPageSchema>;

/** The counts above the beneficiary tab for the filters in use. */
export const beneficiaryStatisticsSchema = z.object({
  total: z.number().int(),
  assistedThisYear: z.number().int(),
  blocked: z.number().int().optional(),
  male: z.number().int().optional(),
  female: z.number().int().optional(),
}) satisfies z.ZodType<BeneficiaryStatistics>;

/** What the caller may do on a profile; the server decides each flag from the person's state. */
export const profileActionsSchema = z.object({
  block: z.boolean(),
  unblock: z.boolean(),
  editContact: z.boolean(),
  requestCorrection: z.boolean(),
  decideCorrection: z.boolean(),
  proposeMerge: z.boolean(),
  merge: z.boolean(),
  revertMerge: z.boolean(),
});
export type ProfileActions = z.infer<typeof profileActionsSchema>;

/** The fields of a profile that change only through a correction request. */
export const lockedFieldSchema = z.enum(['name', 'father_or_husband_name', 'nid', 'birth_reg']);
export type LockedField = z.infer<typeof lockedFieldSchema>;

/** A request to change a locked field of a profile, and its decision. */
export const correctionRequestSchema = z.object({
  id: z.uuid(),
  beneficiaryId: z.uuid(),
  field: lockedFieldSchema,
  oldValue: z.string().nullable(),
  newValue: z.string().nullable(),
  reason: z.string(),
  status: z.enum(['submitted', 'approved', 'rejected']),
  requestedBy: z.string(),
  requestedAt: dateTime,
  decidedBy: z.string().nullable(),
  decidedAt: dateTime.nullable(),
});
export type CorrectionRequest = z.infer<typeof correctionRequestSchema>;

const dated = { id: z.uuid(), at: dateTime };

/** `GET /beneficiaries/{id}`: the 360° profile; a section the caller may not see is absent. */
export const beneficiaryProfileSchema = z.object({
  id: z.uuid(),
  benNo: z.number().int(),
  /** The kept profile when this one was merged into it. */
  mergedInto: z.object({ id: z.uuid(), benNo: z.number().int() }).nullable(),
  actions: profileActionsSchema,
  contactLog: z
    .array(
      z.object({
        field: z.string(),
        oldValue: z.string().nullable(),
        newValue: z.string().nullable(),
        by: z.string().nullable(),
        at: dateTime,
      }),
    )
    .optional(),
  corrections: z.array(correctionRequestSchema),
  blocks: z
    .array(
      z.object({
        id: z.uuid(),
        reason: z.string(),
        active: z.boolean(),
        blockedAt: dateTime,
        releasedAt: dateTime.nullable(),
        releaseReason: z.string().nullable(),
      }),
    )
    .optional(),
  merges: z.array(
    z.object({
      id: z.uuid(),
      role: z.enum(['kept', 'merged']),
      otherId: z.uuid().nullable(),
      otherBenNo: z.number().int(),
      status: z.enum(['merged', 'reverted']),
      mergedAt: dateTime.nullable(),
      revertedAt: dateTime.nullable(),
      leftBehind: z.number().int(),
    }),
  ),
  files: z.array(z.object({ fileId: z.uuid(), slot: z.string(), kind: z.string() })).optional(),
  name: z.string(),
  fatherOrHusbandName: z.string().optional(),
  motherName: z.string().nullable().optional(),
  genderCode: z.string().optional(),
  ageYears: z.number().int().nullable().optional(),
  classCode: z.string().nullable().optional(),
  classOtherText: z.string().nullable().optional(),
  occupationCode: z.string().nullable().optional(),
  status: z.string(),
  photoFileId: z.uuid().nullable().optional(),
  divisionId: z.uuid(),
  districtId: z.uuid(),
  upazilaId: z.uuid(),
  unionId: z.uuid().optional(),
  village: z.string().optional(),
  postOffice: z.string().nullable().optional(),
  postCode: z.string().nullable().optional(),
  landmark: z.string().nullable().optional(),
  /** Null for a person reached through their volunteer; absent without the contact class. */
  mobile: z.string().nullable().optional(),
  /** Whose number the mobile is (a code of the list `mobile_owner`), with the contact class. */
  mobileOwnerCode: z.string().nullable().optional(),
  /** The name of the number's owner, when that is someone else than the person. */
  mobileOwnerName: z.string().nullable().optional(),
  /** Whether an identity document is on file; absent without the identity class. */
  hasDocument: z.boolean().optional(),
  familyMembers: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        relationshipCode: z.string().nullable(),
        ageYears: z.number().int().nullable(),
      }),
    )
    .optional(),
  nid: z.string().nullable().optional(),
  birthReg: z.string().nullable().optional(),
  isBlocked: z.boolean().optional(),
  projectsByYear: z.array(
    z.object({
      year: z.number().int(),
      projects: z.array(
        z.object({
          id: z.uuid(),
          code: z.string(),
          nameBn: z.string(),
          nameEn: z.string(),
          status: z.string(),
        }),
      ),
    }),
  ),
  applications: z
    .array(
      z.object({
        id: z.uuid(),
        appNo: z.string().nullable(),
        projectId: z.uuid(),
        status: z.string(),
        submittedAt: dateTime.nullable(),
        approvedAt: dateTime.nullable(),
        /** Left on a merged profile and shown here through the merge. */
        throughMerge: z.boolean().optional(),
      }),
    )
    .optional(),
  distributions: z.array(
    z.object({ id: z.uuid(), projectId: z.uuid(), status: z.string(), doneAt: dateTime }),
  ),
  /** The published and done media works about the person. */
  media: z.array(publishedWorkSchema).optional(),
  dawah: z
    .object({
      attendance: z.array(z.object({ ...dated, present: z.boolean() })),
      progress: z.array(z.object({ ...dated, status: z.string() })),
      exams: z.array(z.object({ ...dated, passed: z.boolean(), score: z.number().nullable() })),
    })
    .optional(),
  followUps: z
    .object({
      calls: z.array(z.object({ ...dated, projectId: z.uuid().nullable() })),
      evaluations: z.array(
        z.object({ ...dated, projectId: z.uuid().nullable(), result: z.string().nullable() }),
      ),
    })
    .optional(),
  activities: z
    .array(
      z.object({
        id: z.uuid(),
        projectId: z.uuid(),
        type: z.string(),
        stage: z.string().nullable(),
        status: z.string(),
        doneAt: dateTime,
      }),
    )
    .optional(),
});
export type BeneficiaryProfile = z.infer<typeof beneficiaryProfileSchema>;

/** The profile with its version, which the contact edit sends back in If-Match. */
export const beneficiaryRecordSchema = versionedOf(beneficiaryProfileSchema);
export type BeneficiaryRecord = z.infer<typeof beneficiaryRecordSchema>;

/** The auto-fill of a found profile; the locked fields change only through a correction. */
export const lookupAutofillSchema = z.object({
  beneficiaryId: z.uuid(),
  benNo: z.number().int(),
  name: z.string(),
  fatherOrHusbandName: z.string(),
  motherName: z.string().nullable(),
  mobile: z.string().nullable(),
  genderCode: z.string(),
  dob: date.nullable(),
  ageYears: z.number().int().nullable(),
  divisionId: z.uuid(),
  districtId: z.uuid(),
  upazilaId: z.uuid(),
  unionId: z.uuid(),
  village: z.string(),
  postOffice: z.string().nullable(),
  postCode: z.string().nullable(),
  landmark: z.string().nullable(),
  members14Plus: z.number().int().nullable(),
  childrenUnder14: z.number().int().nullable(),
  lockedFields: z.array(lockedFieldSchema),
});
export type LookupAutofill = z.infer<typeof lookupAutofillSchema>;

/** `POST /beneficiaries/lookup`: never the other identity number and never a block reason. */
export const lookupResultSchema = z.object({
  found: z.boolean(),
  blocked: z.boolean().optional(),
  alreadyAppliedInProject: z.boolean().optional(),
  mobileIsCallerOwn: z.boolean().optional(),
  mergedInto: z.object({ benNo: z.number().int() }).optional(),
  autofill: lookupAutofillSchema.optional(),
});
export type LookupResult = z.infer<typeof lookupResultSchema>;

/** The saved contact with the warning of a mobile other profiles share. */
export const contactSavedSchema = z.object({
  id: z.uuid(),
  mobile: z.string().nullable(),
  warnings: z.array(
    z.object({
      code: z.literal('beneficiary.mobile_shared'),
      count: z.number().int(),
      benNos: z.array(z.string()),
    }),
  ),
});
export type ContactSaved = z.infer<typeof contactSavedSchema>;

/** Why two profiles look like one person. */
export const duplicateRuleSchema = z.enum(['name_dob_union', 'name_father_mobile', 'same_mobile']);

/** A suggested pair: who and by which rules; never an identity number or a mobile. */
export const mergeCandidateSchema = z.object({
  beneficiaryId: z.uuid(),
  otherBeneficiaryId: z.uuid(),
  benNo: z.string(),
  otherBenNo: z.string(),
  name: z.string(),
  otherName: z.string(),
  matchedOn: z.array(duplicateRuleSchema),
});
export type MergeCandidate = z.infer<typeof mergeCandidateSchema>;

/** A page of the suggested pairs with its cursor. */
export const mergeCandidatePageSchema = z.object({
  data: z.array(mergeCandidateSchema),
  meta: z.object({ nextCursor: z.string().nullable() }),
});
export type MergeCandidatePage = z.infer<typeof mergeCandidatePageSchema>;

/** A merge or a proposal of one: the pair, its state and the reason. */
export const mergeViewSchema = z.object({
  id: z.uuid(),
  keptId: z.uuid(),
  mergedId: z.uuid(),
  keptBenNo: z.string(),
  mergedBenNo: z.string(),
  keptName: z.string(),
  mergedName: z.string(),
  status: z.enum(['proposed', 'merged', 'reverted']),
  reason: z.string(),
  proposedBy: z.string(),
  proposedAt: dateTime,
  mergedAt: dateTime.nullable(),
  revertedAt: dateTime.nullable(),
  leftBehind: z.number().int(),
});
export type MergeView = z.infer<typeof mergeViewSchema>;
