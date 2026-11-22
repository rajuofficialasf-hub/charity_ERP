import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../auth/password.js';
import { otpCodeSchema } from '../auth/schemas.js';
import { staffWorkplaceSchema } from '../auth/staff.js';
import {
  bloodGroupSchema,
  dateOfBirthSchema,
  educationValueSchema,
  facebookLinkSchema,
  interestAreasSchema,
  parseProfessionDetails,
  professionValueSchema,
  PROFESSIONS,
  skillsValueSchema,
  tshirtSizeSchema,
  volunteeringAreaSchema,
} from './details.js';

export * from './details.js';

/**
 * Registration before login (docs/architecture/AUTH.md, "Registration with two OTPs"): request
 * schemas of the
 * `/auth/register/*` operations and the rules of a registration draft. The API validates with
 * them and the PWA builds the registration screens on them.
 */
export const REGISTRATION_RULES = {
  /** A draft lives this long after the start or the last verification. */
  draftLifeMs: 24 * 60 * 60_000,
  /** Refused submits (conflict or invalid form) a draft allows before 429. */
  maxRefusedSubmits: 5,
  /** Codes one draft may send in its lifetime, across channels and address changes. */
  maxSendsPerDraft: 6,
} as const;

export const REGISTRATION_KINDS = ['volunteer', 'staff'] as const;
export type RegistrationKind = (typeof REGISTRATION_KINDS)[number];

/**
 * Photo slots of a registration and of a correction or edit request: the own photo and
 * both pages of the NID card.
 */
export const PHOTO_SLOTS = ['photo', 'nid_photo', 'nid_photo_back'] as const;
export type PhotoSlot = (typeof PHOTO_SLOTS)[number];
export const PHOTO_SOURCES = ['camera', 'gallery'] as const;
export type PhotoSource = (typeof PHOTO_SOURCES)[number];
/** Largest photo the API accepts; the phone compresses below it. */
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

/** The draft token header: never in a URL or a log. */
export const REGISTRATION_TOKEN_HEADER = 'X-Registration-Token';

/** A Bangladesh mobile number as stored: 11 digits starting with 01 (the form patterns reuse it). */
export const MOBILE_PATTERN = /^01[3-9][0-9]{8}$/;
export const mobileSchema = z
  .string()
  .regex(MOBILE_PATTERN, { message: 'validation.mobile_format' });
export const nidSchema = z
  .string()
  .regex(/^([0-9]{10}|[0-9]{13}|[0-9]{17})$/, { message: 'validation.nid_format' });

const emailSchema = z
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());

/** A draft starts with its kind only; each contact comes with its own code. */
export const registrationStartRequestSchema = z.strictObject({
  kind: z.enum(REGISTRATION_KINDS).default('volunteer'),
});
export type RegistrationStartRequest = z.infer<typeof registrationStartRequestSchema>;

export const OTP_CHANNELS = ['sms', 'email'] as const;
export type RegistrationChannel = (typeof OTP_CHANNELS)[number];

/** Sends a code to one contact of the draft; a changed address clears that channel. */
export const otpSendRequestSchema = z.discriminatedUnion('channel', [
  z.strictObject({ registrationId: z.uuid(), channel: z.literal('sms'), address: mobileSchema }),
  z.strictObject({ registrationId: z.uuid(), channel: z.literal('email'), address: emailSchema }),
]);
export type OtpSendRequest = z.infer<typeof otpSendRequestSchema>;

/** Verifies the code of one channel. */
export const otpVerifyRequestSchema = z.strictObject({
  registrationId: z.uuid(),
  channel: z.enum(OTP_CHANNELS),
  code: otpCodeSchema,
});
export type OtpVerifyRequest = z.infer<typeof otpVerifyRequestSchema>;

export interface RegistrationStart {
  registrationId: string;
}

/**
 * The answer of a verify: the channels verified so far; once both are, also the draft token
 * and what the form needs.
 */
export interface RegistrationVerifyResult extends Partial<RegistrationVerified> {
  verified: RegistrationChannel[];
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

/** Volunteer types of the one registration form. */
export const VOLUNTEER_TYPES = ['general', 'local_daee', 'both', 'team_member', 'paid'] as const;
export type VolunteerType = (typeof VOLUNTEER_TYPES)[number];

/** The permanent address: the four levels of the present address and a line. */
export const permanentAddressSchema = z.strictObject({
  divisionId: z.uuid(),
  districtId: z.uuid(),
  upazilaId: z.uuid(),
  unionId: z.uuid(),
  addressLine: optionalText(500),
});
export type PermanentAddress = z.infer<typeof permanentAddressSchema>;

/**
 * Optional bank details (A5, used when paying operational expenses): added later from the own
 * profile through an edit request, never at registration; the branch is its own field.
 */
export const bankDetailsSchema = z.strictObject({
  bankName: optionalText(200),
  accountName: optionalText(200),
  accountNumber: optionalText(40),
  branchName: optionalText(100),
  routingNumber: optionalText(20),
});
export type BankDetails = z.infer<typeof bankDetailsSchema>;

/**
 * The volunteer form: no type, no reference and no bank details; every
 * volunteer registers as a general volunteer and the Foundation sets the role per project later.
 * Mandatory: the name, the parents' names, the NID, the address to the union and the profession;
 * the profession's details are one nested object checked against that profession's schema, and
 * everything else is optional.
 */
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
    divisionId: z.uuid(),
    districtId: z.uuid(),
    upazilaId: z.uuid(),
    unionId: z.uuid(),
    addressLine: optionalText(500),
    permanentAddress: permanentAddressSchema.optional(),
    educationDetails: educationValueSchema.optional(),
    facebookId: facebookLinkSchema.optional(),
    dateOfBirth: dateOfBirthSchema.optional(),
    bloodGroup: bloodGroupSchema.optional(),
    tshirtSize: tshirtSizeSchema.optional(),
    volunteeringArea: volunteeringAreaSchema.optional(),
    profession: z.enum(PROFESSIONS),
    professionDetails: z.record(z.string(), z.unknown()).optional(),
    interestAreas: interestAreasSchema.optional(),
    vehicle: skillsValueSchema.shape.vehicle,
    canSwim: skillsValueSchema.shape.canSwim,
    availability: skillsValueSchema.shape.availability,
    emergencyFullTime: skillsValueSchema.shape.emergencyFullTime,
  })
  .superRefine((value, ctx) => {
    const details = parseProfessionDetails(value.profession, value.professionDetails);
    if (!details.success)
      for (const issue of details.issues)
        ctx.addIssue({
          code: 'custom',
          path: ['professionDetails', ...issue.path],
          message: issue.message,
        });
  });
export type VolunteerRegistrationSubmit = z.infer<typeof volunteerRegistrationSubmitSchema>;

/**
 * The staff form (docs/MASTER_SPEC.md, "Registration, profiles and volunteer management"): the name
 * and the designation; no NID, parents, bank details, program or workplace (those are set after
 * registration).
 */
export const staffRegistrationSubmitSchema = z.strictObject({
  kind: z.literal('staff'),
  registrationId: z.uuid(),
  password,
  name: text(200),
  designation: text(200),
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
 * The volunteer fields a correction request may name, with the shape of their new value. The type and the team member's reference are not among them: they decide
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
  facebookId: facebookLinkSchema,
  bloodGroup: bloodGroupSchema,
  dateOfBirth: dateOfBirthSchema,
  tshirtSize: tshirtSizeSchema,
  volunteeringArea: volunteeringAreaSchema,
  profession: professionValueSchema,
  skills: skillsValueSchema,
  educationDetails: educationValueSchema,
  permanentAddress: permanentAddressSchema,
  bank: bankDetailsSchema,
  photo: z.uuid(),
  nid_photo: z.uuid(),
  nid_photo_back: z.uuid(),
} as const;
export type CorrectionField = keyof typeof CORRECTION_FIELD_VALUES;
export const CORRECTION_FIELDS = Object.keys(CORRECTION_FIELD_VALUES) as CorrectionField[];

export const registrationCorrectionCreateSchema = z.strictObject({
  fields: z
    .array(z.enum(CORRECTION_FIELDS as [CorrectionField, ...CorrectionField[]]))
    .min(1)
    .max(40),
  note: z.string().trim().min(3).max(1000),
});
export type RegistrationCorrectionCreate = z.infer<typeof registrationCorrectionCreateSchema>;

/** The answer to one request: text, an object (address, bank) or a photo's file id. */
export const changeRequestAnswerSchema = z.strictObject({
  newValue: z.union([z.string().max(2000), z.record(z.string(), z.unknown())]),
});
export type ChangeRequestAnswer = z.infer<typeof changeRequestAnswerSchema>;

/** The staff decision: a role on approval, a reason on rejection. */
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

/**
 * The fields an approved volunteer may ask to change: the correction
 * fields plus the mobile and the email, which first need a code to the new value. A photo edit is
 * created without a value; the own photo upload fills it.
 */
export const EDIT_FIELD_VALUES = {
  ...CORRECTION_FIELD_VALUES,
  mobile: mobileSchema,
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
} as const;
export type EditField = keyof typeof EDIT_FIELD_VALUES;
export const EDIT_FIELDS = Object.keys(EDIT_FIELD_VALUES) as EditField[];
export const CONTACT_FIELDS = ['mobile', 'email'] as const;
export const PHOTO_FIELDS = PHOTO_SLOTS;

/**
 * The catalogue label key of each field a correction or edit request may name (registration
 * namespace): the screens and the notifications name a field the same way.
 */
/**
 * The details an official may ask to change about themself (docs/DECISION_LOG.md, the official's
 * own profile of 2026-11-02): the name, the designation, the contacts (a code to the new value
 * first), the photo (the own upload fills it) and the workplace; the Department Head or the
 * Monitoring Team decides. A program of null asks to clear it. The supervisor is not
 * asked for: the deciders change it on the official's page (docs/DECISION_LOG.md, 2026-11-03).
 */
export const STAFF_EDIT_FIELD_VALUES = {
  displayName: z.string().trim().min(1, { message: 'validation.required' }).max(200),
  designation: z.string().trim().min(1, { message: 'validation.required' }).max(200),
  mobile: EDIT_FIELD_VALUES.mobile,
  email: EDIT_FIELD_VALUES.email,
  workplace: staffWorkplaceSchema,
  homeProgramId: z.uuid().nullable(),
} as const;
export type StaffValueField = keyof typeof STAFF_EDIT_FIELD_VALUES;
export const STAFF_EDIT_FIELDS = [
  ...(Object.keys(STAFF_EDIT_FIELD_VALUES) as StaffValueField[]),
  'photo',
] as const;
export type StaffEditField = (typeof STAFF_EDIT_FIELDS)[number];

export const staffEditRequestCreateSchema = z
  .strictObject({
    field: z.enum(STAFF_EDIT_FIELDS),
    newValue: z
      .union([z.string().max(2000), z.record(z.string(), z.unknown()), z.null()])
      .optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .refine((v) => v.field === 'photo' || v.newValue !== undefined, {
    path: ['newValue'],
    message: 'validation.required',
  });
export type StaffEditRequestCreate = z.infer<typeof staffEditRequestCreateSchema>;

export const REQUEST_FIELD_LABEL = {
  name: 'form.name',
  fatherName: 'form.father_name',
  motherName: 'form.mother_name',
  nid: 'form.nid',
  whatsapp: 'form.whatsapp',
  address: 'form.address',
  addressLine: 'form.address_line',
  education: 'form.education',
  experience: 'form.experience',
  workDescription: 'form.work_description',
  previousProjects: 'form.previous_projects',
  facebookId: 'form.facebook',
  bloodGroup: 'form.blood_group',
  dateOfBirth: 'form.date_of_birth',
  tshirtSize: 'form.tshirt_size',
  volunteeringArea: 'form.volunteering_area',
  profession: 'form.profession_group',
  skills: 'form.skills',
  educationDetails: 'form.education_group',
  permanentAddress: 'form.address_permanent',
  bank: 'form.bank',
  photo: 'form.photo',
  nid_photo: 'form.nid_photo',
  nid_photo_back: 'form.nid_photo_back',
  mobile: 'form.mobile',
  email: 'form.email',
  displayName: 'form.name',
  designation: 'form.designation',
  workplace: 'form.workplace',
  homeProgramId: 'form.home_program',
} as const;

export const editRequestCreateSchema = z
  .strictObject({
    field: z.enum(EDIT_FIELDS as [EditField, ...EditField[]]),
    newValue: changeRequestAnswerSchema.shape.newValue.optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .refine(
    (v) => (PHOTO_FIELDS as readonly string[]).includes(v.field) || v.newValue !== undefined,
    { path: ['newValue'], message: 'validation.required' },
  );
export type EditRequestCreate = z.infer<typeof editRequestCreateSchema>;

/** An approver's decision on an edit request: a refusal needs a reason. */
export const decisionRequestSchema = z
  .strictObject({
    decision: z.enum(['approve', 'reject']),
    reason: z.string().trim().min(3).max(1000).optional(),
  })
  .refine((v) => v.decision !== 'reject' || v.reason !== undefined, {
    path: ['reason'],
    message: 'validation.required',
  });
export type DecisionRequest = z.infer<typeof decisionRequestSchema>;

export const otpCodeRequestSchema = z.strictObject({ code: otpCodeSchema });
export type OtpCodeRequest = z.infer<typeof otpCodeRequestSchema>;
