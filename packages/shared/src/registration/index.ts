import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../auth/password.js';
import { otpCodeSchema } from '../auth/schemas.js';

/**
 * Registration before login (AUTH.md 2; DECISION_LOG D-082, D-086, D-088): request schemas of the
 * `/auth/register/*` operations and the rules of a registration draft. The API validates with
 * them and the PWA builds the registration screens on them.
 */
export const REGISTRATION_RULES = {
  /** A draft lives this long after the start or the last verification (O-25). */
  draftLifeMs: 24 * 60 * 60_000,
  /** Reference lookups a team member may make per draft (D-088). */
  maxReferenceLookups: 5,
  /** Lookups of one NID per day across all drafts (D-088). */
  maxLookupsPerNidPerDay: 5,
  /** Refused submits (conflict or invalid form) a draft allows before 429. */
  maxRefusedSubmits: 5,
} as const;

export const REGISTRATION_KINDS = ['volunteer', 'staff'] as const;
export type RegistrationKind = (typeof REGISTRATION_KINDS)[number];

/** Photo slots of a registration and of a correction or edit request (D-087). */
export const PHOTO_SLOTS = ['photo', 'nid_photo'] as const;
export type PhotoSlot = (typeof PHOTO_SLOTS)[number];
export const PHOTO_SOURCES = ['camera', 'gallery'] as const;
export type PhotoSource = (typeof PHOTO_SOURCES)[number];
/** Largest photo the API accepts; the phone compresses below it. */
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

/** The draft token header (D-082): never in a URL or a log. */
export const REGISTRATION_TOKEN_HEADER = 'X-Registration-Token';

export const mobileSchema = z
  .string()
  .regex(/^01[3-9][0-9]{8}$/, { message: 'validation.mobile_format' });
export const nidSchema = z
  .string()
  .regex(/^([0-9]{10}|[0-9]{13}|[0-9]{17})$/, { message: 'validation.nid_format' });

export const registrationStartRequestSchema = z.strictObject({
  mobile: mobileSchema,
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  kind: z.enum(REGISTRATION_KINDS).default('volunteer'),
});
export type RegistrationStartRequest = z.infer<typeof registrationStartRequestSchema>;

export const otpSendRequestSchema = z.strictObject({
  registrationId: z.uuid(),
  channel: z.enum(['sms', 'email']),
});
export type OtpSendRequest = z.infer<typeof otpSendRequestSchema>;

export const otpVerifyRequestSchema = z.strictObject({
  registrationId: z.uuid(),
  mobileCode: otpCodeSchema,
  emailCode: otpCodeSchema,
});
export type OtpVerifyRequest = z.infer<typeof otpVerifyRequestSchema>;

export const referenceLookupRequestSchema = z.strictObject({
  registrationId: z.uuid(),
  nid: nidSchema,
});
export type ReferenceLookupRequest = z.infer<typeof referenceLookupRequestSchema>;

export interface RegistrationStart {
  registrationId: string;
  otpSentTo: ('sms' | 'email')[];
}

export interface RegistrationVerified {
  registrationToken: string;
  expiresAt: string;
  kind: RegistrationKind;
}

/** The expiry of a draft started or verified at `at`. */
export function draftExpiry(at: Date): Date {
  return new Date(at.getTime() + REGISTRATION_RULES.draftLifeMs);
}

const text = (max: number) => z.string().trim().min(1, { message: 'validation.required' }).max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional();
const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { message: 'validation.password_too_short' })
  .max(PASSWORD_MAX_LENGTH);

/** Volunteer types of the one registration form (BR-033). */
export const VOLUNTEER_TYPES = ['general', 'local_daee', 'both', 'team_member', 'paid'] as const;
export type VolunteerType = (typeof VOLUNTEER_TYPES)[number];

/** Optional bank details (A5, used when paying operational expenses). */
export const bankDetailsSchema = z.strictObject({
  bankName: optionalText(200),
  accountName: optionalText(200),
  accountNumber: optionalText(40),
  routingNumber: optionalText(20),
});
export type BankDetails = z.infer<typeof bankDetailsSchema>;

/** The volunteer form (BR-026); a team member names the main volunteer's NID (R3). */
export const volunteerRegistrationSubmitSchema = z
  .strictObject({
    kind: z.literal('volunteer'),
    registrationId: z.uuid(),
    password,
    name: text(200),
    fatherName: text(200),
    motherName: text(200),
    nid: nidSchema,
    whatsapp: mobileSchema.optional(),
    type: z.enum(VOLUNTEER_TYPES),
    divisionId: z.uuid(),
    districtId: z.uuid(),
    upazilaId: z.uuid(),
    unionId: z.uuid(),
    addressLine: optionalText(500),
    education: optionalText(500),
    experience: optionalText(2000),
    workDescription: optionalText(2000),
    previousProjects: optionalText(2000),
    facebookId: optionalText(200),
    bank: bankDetailsSchema.optional(),
    referenceNid: nidSchema.optional(),
  })
  .refine((v) => v.type !== 'team_member' || v.referenceNid !== undefined, {
    path: ['referenceNid'],
    message: 'validation.required',
  });
export type VolunteerRegistrationSubmit = z.infer<typeof volunteerRegistrationSubmitSchema>;

/** The staff form (MASTER_SPEC A5, D-088): no NID, parents or bank details. */
export const staffRegistrationSubmitSchema = z.strictObject({
  kind: z.literal('staff'),
  registrationId: z.uuid(),
  password,
  name: text(200),
  designation: text(200),
  homeProgramId: z.uuid(),
  homeDivisionId: z.uuid(),
});
export type StaffRegistrationSubmit = z.infer<typeof staffRegistrationSubmitSchema>;

export const registrationSubmitRequestSchema = z.discriminatedUnion('kind', [
  volunteerRegistrationSubmitSchema,
  staffRegistrationSubmitSchema,
]);
export type RegistrationSubmitRequest = z.infer<typeof registrationSubmitRequestSchema>;

/** The address of a volunteer as one corrected or edited value. */
export const addressValueSchema = z.strictObject({
  divisionId: z.uuid(),
  districtId: z.uuid(),
  upazilaId: z.uuid(),
  unionId: z.uuid(),
});

/**
 * The volunteer fields a correction request may name, with the shape of their new value (BR-030;
 * DECISION_LOG D-085). The type and the team member's reference are not among them: they decide
 * the role and need the counted reference lookup, so a wrong one is rejected and registered again.
 * A photo's value is the file id the own photo upload stored on the request.
 */
export const CORRECTION_FIELD_VALUES = {
  name: text(200),
  fatherName: text(200),
  motherName: text(200),
  nid: nidSchema,
  whatsapp: mobileSchema,
  address: addressValueSchema,
  addressLine: optionalText(500),
  education: optionalText(500),
  experience: optionalText(2000),
  workDescription: optionalText(2000),
  previousProjects: optionalText(2000),
  facebookId: optionalText(200),
  bank: bankDetailsSchema,
  photo: z.uuid(),
  nid_photo: z.uuid(),
} as const;
export type CorrectionField = keyof typeof CORRECTION_FIELD_VALUES;
export const CORRECTION_FIELDS = Object.keys(CORRECTION_FIELD_VALUES) as CorrectionField[];

export const registrationCorrectionCreateSchema = z.strictObject({
  fields: z
    .array(z.enum(CORRECTION_FIELDS as [CorrectionField, ...CorrectionField[]]))
    .min(1)
    .max(20),
  note: z.string().trim().min(3).max(1000),
});
export type RegistrationCorrectionCreate = z.infer<typeof registrationCorrectionCreateSchema>;

/** The answer to one request: text, an object (address, bank) or a photo's file id. */
export const changeRequestAnswerSchema = z.strictObject({
  newValue: z.union([z.string().max(2000), z.record(z.string(), z.unknown())]),
});
export type ChangeRequestAnswer = z.infer<typeof changeRequestAnswerSchema>;

/** The staff decision (R9): a role on approval, a reason on rejection. */
export const staffDecisionSchema = z
  .strictObject({
    decision: z.enum(['approve', 'reject']),
    reason: z.string().trim().min(3).max(1000).optional(),
    roleKey: z.string().max(64).optional(),
  })
  .refine((v) => v.decision !== 'approve' || v.roleKey !== undefined, {
    path: ['roleKey'],
    message: 'validation.required',
  })
  .refine((v) => v.decision !== 'reject' || v.reason !== undefined, {
    path: ['reason'],
    message: 'validation.required',
  });
export type StaffDecision = z.infer<typeof staffDecisionSchema>;
