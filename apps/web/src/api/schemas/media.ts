import { mediaScriptSchema, PLATFORM_KINDS } from '@css/shared';
import {
  CONTENT_TYPES,
  MEDIA_PRIORITIES,
  PUBLICATION_STATES,
  REFERRAL_STATES,
  SCRIPT_STATES,
} from '@css/shared/media';
import { z } from 'zod';
import { bilingual, date, dateTime, pageOf } from './common';

/** An item of a reference list (the media stages, production roles and platforms). */
export const referenceItemSchema = z.object({
  code: z.string(),
  label: bilingual,
  active: z.boolean(),
  sortOrder: z.number().int(),
  /** An entry the rules need: it stays active. */
  system: z.boolean(),
  /** A media platform's kind; null on the other lists. */
  kind: z.enum(PLATFORM_KINDS).nullable(),
});
export type MediaListItem = z.infer<typeof referenceItemSchema>;

export const mediaPersonSchema = z.object({ id: z.uuid(), name: z.string() });
export type MediaPerson = z.infer<typeof mediaPersonSchema>;

const place = {
  program: z.object({ id: z.uuid(), name: bilingual }),
  project: z.object({ id: z.uuid(), name: bilingual, year: z.number().int() }),
};
const member = z.object({ userId: z.uuid(), name: z.string(), roles: z.array(z.string()) });

/** A published or done work, as a profile and a portfolio show it. */
export const publishedWorkSchema = z.object({
  ...place,
  referralId: z.uuid(),
  workId: z.uuid(),
  title: z.string(),
  stageCode: z.string(),
  contentType: z.enum(CONTENT_TYPES),
  summary: z.string().nullable(),
  publishedOn: date.nullable(),
  publications: z.array(
    z.object({
      platformCode: z.string(),
      link: z.string(),
      publishedOn: date.nullable(),
      youtubeId: z.string().nullable(),
    }),
  ),
  members: z.array(member),
});
export type PublishedWork = z.infer<typeof publishedWorkSchema>;

const count = z.number().int();
export const mediaCountsSchema = z.object({
  referrals: count,
  new: count,
  inReview: count,
  inProgress: count,
  waitingForShooting: count,
  inEditing: count,
  published: count,
  done: count,
  rejected: count,
});
export type MediaCounts = z.infer<typeof mediaCountsSchema>;

/** The Media Team home's counts, overall and per program. */
export const mediaSummarySchema = z.object({
  overall: mediaCountsSchema,
  programs: z.array(
    z.object({ program: z.object({ id: z.uuid(), name: bilingual }), counts: mediaCountsSchema }),
  ),
});
export type MediaSummary = z.infer<typeof mediaSummarySchema>;

/** A row of the works list: a referral, with its work once accepted. */
export const mediaWorkRowSchema = z.object({
  ...place,
  referralId: z.uuid(),
  workId: z.uuid().nullable(),
  title: z.string().nullable(),
  beneficiaryName: z.string(),
  members: z.array(z.object({ userId: z.uuid(), name: z.string() })),
  state: z.enum(REFERRAL_STATES),
  stageCode: z.string().nullable(),
  priority: z.enum(MEDIA_PRIORITIES),
  referredAt: dateTime,
  updatedAt: dateTime,
});
export type MediaWorkRow = z.infer<typeof mediaWorkRowSchema>;

/** A page of the works list with its cursor. */
export const mediaWorkPageSchema = pageOf(mediaWorkRowSchema);
export type MediaWorkPage = z.infer<typeof mediaWorkPageSchema>;

export const mediaPublicationSchema = z.object({
  id: z.uuid(),
  platformCode: z.string(),
  state: z.enum(PUBLICATION_STATES),
  publishedOn: date.nullable(),
  link: z.string().nullable(),
  note: z.string().nullable(),
  youtubeId: z.string().nullable(),
});
export type MediaPublication = z.infer<typeof mediaPublicationSchema>;

export const mediaWorkSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  stageCode: z.string(),
  heldStageCode: z.string().nullable(),
  contentType: z.enum(CONTENT_TYPES),
  script: mediaScriptSchema.nullable(),
  scriptState: z.enum(SCRIPT_STATES),
  reviewApprovedBy: mediaPersonSchema.nullable(),
  reviewApprovedAt: dateTime.nullable(),
  version: z.string(),
  members: z.array(member),
  publications: z.array(mediaPublicationSchema),
  comments: z.array(
    z.object({ id: z.uuid(), author: mediaPersonSchema, body: z.string(), at: dateTime }),
  ),
  nextStages: z.array(z.string()),
  mayManage: z.boolean(),
  mayEditScript: z.boolean(),
  mayDirect: z.boolean(),
  mayReview: z.boolean(),
});
export type MediaWork = z.infer<typeof mediaWorkSchema>;

export const mediaEventSchema = z.object({
  id: z.uuid(),
  kind: z.string(),
  fromValue: z.string().nullable(),
  toValue: z.string().nullable(),
  comment: z.string().nullable(),
  actor: mediaPersonSchema,
  at: dateTime,
});
export type MediaEvent = z.infer<typeof mediaEventSchema>;

/** A referral with the person's allowed details, its work and its history. */
export const mediaReferralSchema = z.object({
  ...place,
  id: z.uuid(),
  applicationId: z.uuid(),
  appNo: z.string().nullable(),
  state: z.enum(REFERRAL_STATES),
  priority: z.enum(MEDIA_PRIORITIES),
  beneficiaryName: z.string(),
  referredBy: mediaPersonSchema,
  referredAt: dateTime,
  decidedAt: dateTime.nullable(),
  note: z.string(),
  story: z.string().nullable(),
  decidedBy: mediaPersonSchema.nullable(),
  decisionComment: z.string().nullable(),
  beneficiary: z.object({
    name: z.string(),
    fatherOrHusbandName: z.string(),
    ageYears: z.number().int().nullable(),
    /** Null for a person reached through their volunteer. */
    mobile: z.string().nullable(),
    address: z.object({
      divisionId: z.uuid(),
      districtId: z.uuid(),
      upazilaId: z.uuid(),
      unionId: z.uuid(),
      village: z.string(),
      postOffice: z.string().nullable(),
    }),
    occupation: bilingual.nullable(),
    monthlyIncome: z.string().nullable(),
  }),
  officialComment: z.string().nullable(),
  work: mediaWorkSchema.nullable(),
  history: z.array(mediaEventSchema),
  mayDecide: z.boolean(),
  mayResend: z.boolean(),
});
export type MediaReferral = z.infer<typeof mediaReferralSchema>;

/** A member of the Media Team with their portfolio. */
export const mediaMemberSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  designation: z.string().nullable(),
  mobile: z.string().nullable(),
  email: z.string().nullable(),
  roles: z.array(z.string()),
  counts: z.object({ works: count, published: count }),
  portfolio: z.array(publishedWorkSchema.extend({ ownRoles: z.array(z.string()) })),
});
export type MediaMember = z.infer<typeof mediaMemberSchema>;

/** A member of the Media Team, for the team editor. */
export const mediaTeamMemberSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  designation: z.string().nullable(),
  roles: z.array(z.string()),
});
export type MediaTeamMember = z.infer<typeof mediaTeamMemberSchema>;
