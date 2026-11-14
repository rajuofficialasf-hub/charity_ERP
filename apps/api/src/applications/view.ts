import { COMMENT_REASONS } from './decision-rules.js';
import { unlockView } from './unlocks.js';
import { answerValueSchema } from '@css/shared';
import { APPLICATION_STATES } from '@css/shared';
import { z } from 'zod';
import { sensitive } from '../access/field-mask.js';
import { versionView } from '../routes/forms.js';
import type { FormVersionView } from '../services/forms.js';
import { DUPLICATE_RULES } from '../services/beneficiary-merge-candidates.js';
import { applicationMediaView } from '../services/media-referrals.js';

/** The class of the official section and of the office's own texts (permissions.yaml). */
export const OFFICIAL_SECTION = 'application.official_section';
/** The person's identity number and their contact (permissions.yaml, the protected field classes). */
export const BENEFICIARY_NID = 'beneficiary.nid';
export const BENEFICIARY_CONTACT = 'beneficiary.contact';
/** The person's details beside the name, among them the father's or husband's name. */
export const BENEFICIARY_PROFILE_DETAIL = 'beneficiary.profile_detail';
/**
 * The flag of an entry that waits because a person without a document looks like a blocked one
 * (the same name, father's or husband's name and village in the union): the office's to read.
 */
export const BLOCKED_NAME_MATCH = 'blocked_name_match';

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
  /**
   * Whether the person's profile holds an identity document, and a mobile of their own; null
   * before a profile is bound and for a viewer who may not know.
   */
  hasDocument: z.boolean().nullable(),
  hasMobile: z.boolean().nullable(),
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
  /** Photo slots an offline record still waits for; the office sees the record without them. */
  pendingPhotos: z.int().min(0),
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

/** Another profile a signal names, only where the viewer may open it. */
const personRef = z.object({ beneficiaryId: uuid, benNo: z.string(), name: z.string() });

/** How sure a person signal is; an entry the viewer may not open carries this alone. */
const signalLevel = z.object({ level: z.enum(['probable']) });

/**
 * The applicant is probably a member an earlier beneficiary listed in their family: the head and
 * every relationship its list gives, or the level alone where the viewer may not open the head.
 */
const familyMemberSignal = z.union([
  signalLevel.extend({
    relationships: z.array(
      z.object({
        code: z.string(),
        name: z.object({ bn: z.string(), en: z.string() }).nullable(),
      }),
    ),
    head: personRef,
  }),
  signalLevel,
]);

/**
 * The applicant's profile and another one probably are one person (an open probable pair): the
 * rules and the other profile, or the level alone where the viewer may not compare the two.
 */
const samePersonSignal = z.union([
  signalLevel.extend({ matchedOn: z.array(z.enum(DUPLICATE_RULES)), other: personRef }),
  signalLevel,
]);

/**
 * The record (contract `Application`): the answers of the caller's audience, the office's reason
 * and the zakat figures for the office only, the family warnings at review, and the actions the
 * caller may take now.
 */
export const applicationView = applicationSummary.extend({
  formVersionId: uuid,
  candidateBeneficiaryId: nullableUuid,
  createdByUserId: nullableUuid,
  /** The device time the record was made, when it came from a phone; its late or stale flags say why it waits. */
  clientCreatedAt: z.string().nullable(),
  identityKind: z.enum(['nid', 'birth_reg', 'none']).nullable(),
  /**
   * Whether the father's or husband's name is the father's or the husband's: the profile's, else
   * the application's own answer; null where neither says.
   */
  guardianRelationCode: sensitive(z.string().nullable(), BENEFICIARY_PROFILE_DETAIL),
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
  /** The earlier families that probably hold the person as a member; the office only. */
  familyMemberSignals: z.array(familyMemberSignal),
  /** How many such families there are in all, also beyond the ones listed. */
  familyMemberSignalsTotal: z.number().int(),
  /** The person's open probable pairs with another profile; the office only. */
  samePersonSignals: z.array(samePersonSignal),
  /** How many such pairs there are in all, also beyond the ones listed. */
  samePersonSignalsTotal: z.number().int(),
  availableActions: z.array(z.string()),
  /** The comments the office's decisions would ask for now, by action; empty for a volunteer. */
  decisionHints: z.record(z.string(), z.array(z.enum(COMMENT_REASONS))),
  /** The unlocks of the application waiting for a step, as the caller may see them. */
  unlocks: z.array(unlockView),
  /** Whether the caller may open an answer of this application for correction now. */
  mayUnlock: z.boolean(),
  /** Its referral to the Media Team, for the referrer's scope and the directors; never moves the state. */
  media: applicationMediaView.nullable(),
  /** Whether the caller may refer it to the Media Team now (or send a returned referral again). */
  mayReferToMedia: z.boolean(),
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
  /** A person picked from the name lookup: the token that lookup gave this caller for this project. */
  pickToken: z.string().min(1).max(512).optional(),
  /** The phone left the name lookup out for want of network; the office compares at the send. */
  nameLookupSkipped: z.literal(true).optional(),
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
  /** At a verification: the project's volunteer who owns the application from then on. */
  ownerVolunteerId: uuid.optional(),
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
