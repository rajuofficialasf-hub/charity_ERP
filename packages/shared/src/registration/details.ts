import { z } from 'zod';

/**
 * The personal, profession and skills data of a volunteer (DECISION_LOG O-65, D-092; BR-246): the
 * fixed lists, the schema of each profession's own fields and the grouped values an edit request
 * carries. Pure and shared by the API (which validates and stores) and the PWA (which builds the
 * registration steps and the profile inputs on them). Every field is optional except the
 * profession choice; an empty text counts as not given.
 */
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'] as const;
export const TSHIRT_SIZES = ['S', 'M', 'L', 'XL', 'XXL'] as const;
export const VOLUNTEERING_AREAS = ['own_union', 'own_upazila', 'own_district', 'anywhere'] as const;
export const VEHICLES = ['bicycle', 'motorcycle', 'none'] as const;
export const AVAILABILITIES = ['holidays', 'anytime', 'on_call'] as const;
export const INTEREST_AREAS = [
  'field_relief',
  'survey',
  'data_entry',
  'media',
  'first_aid',
] as const;
export const PROFESSIONS = [
  'student',
  'teacher',
  'imam',
  'businessman',
  'job_seeker',
  'service_holder',
] as const;

export type BloodGroup = (typeof BLOOD_GROUPS)[number];
export type TshirtSize = (typeof TSHIRT_SIZES)[number];
export type VolunteeringArea = (typeof VOLUNTEERING_AREAS)[number];
export type Vehicle = (typeof VEHICLES)[number];
export type Availability = (typeof AVAILABILITIES)[number];
export type InterestArea = (typeof INTEREST_AREAS)[number];
export type Profession = (typeof PROFESSIONS)[number];

/** A text that may be left out: blank counts as not given. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || undefined)
    .optional();

const mobile = z.string().regex(/^01[3-9][0-9]{8}$/, { message: 'validation.mobile_format' });

/** The date of birth: a real calendar date in the past, not before 1900. */
export const dateOfBirthSchema = z
  .string()
  .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/, { message: 'validation.date_format' })
  // a real calendar date: 1990-02-30 does not survive the round trip
  .refine(
    (v) => {
      const at = new Date(`${v}T00:00:00.000Z`);
      return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === v;
    },
    { message: 'validation.date_format' },
  )
  .refine((v) => v >= '1900-01-01', { message: 'validation.date_format' })
  .refine((v) => v <= new Date().toISOString().slice(0, 10), { message: 'validation.date_future' });

export const bloodGroupSchema = z.enum(BLOOD_GROUPS);
export const tshirtSizeSchema = z.enum(TSHIRT_SIZES);
export const volunteeringAreaSchema = z.enum(VOLUNTEERING_AREAS);

/** The areas of interest: a list without repeats of the fixed options. */
export const interestAreasSchema = z
  .array(z.enum(INTEREST_AREAS))
  .max(INTEREST_AREAS.length)
  .refine((v) => new Set(v).size === v.length, { message: 'validation.option_unknown' });

/** The skills of a volunteer as one edit value; every part is optional. */
export const skillsValueSchema = z.strictObject({
  interestAreas: interestAreasSchema.optional(),
  vehicle: z.enum(VEHICLES).optional(),
  canSwim: z.boolean().optional(),
  availability: z.enum(AVAILABILITIES).optional(),
});
export type SkillsValue = z.infer<typeof skillsValueSchema>;

/** The emergency contact (the guardian) as one value: a name and a Bangladeshi mobile. */
export const emergencyContactSchema = z.strictObject({
  name: optionalText(200),
  mobile: mobile.optional(),
});
export type EmergencyContact = z.infer<typeof emergencyContactSchema>;

/** The own fields of each profession (all optional; an unknown field is refused). */
export const PROFESSION_DETAILS = {
  student: z.strictObject({
    educationMedium: z.enum(['general', 'aliya', 'qawmi', 'technical']).optional(),
    institutionName: optionalText(200),
    currentClass: optionalText(100),
    subject: optionalText(200),
    institutionLocation: optionalText(300),
  }),
  teacher: z.strictObject({
    institutionType: z.enum(['school', 'college', 'university', 'madrasa']).optional(),
    institutionNameAddress: optionalText(400),
    designation: optionalText(200),
    teachingSubject: optionalText(200),
  }),
  imam: z.strictObject({
    role: z.enum(['khatib', 'imam', 'muazzin']).optional(),
    mosqueName: optionalText(200),
    mosqueType: z.enum(['jame', 'panjegana']).optional(),
    mosqueAddress: optionalText(400),
  }),
  businessman: z.strictObject({
    businessName: optionalText(200),
    businessType: z
      .enum(['retail', 'wholesale', 'service', 'agriculture', 'it_online', 'other'])
      .optional(),
    businessAddress: optionalText(400),
  }),
  job_seeker: z.strictObject({
    highestQualification: optionalText(200),
    skills: optionalText(400),
    fullTimeAvailable: z.boolean().optional(),
  }),
  service_holder: z.strictObject({
    sector: optionalText(200),
    organization: optionalText(200),
    designation: optionalText(200),
    workplaceLocation: optionalText(300),
  }),
} as const satisfies Record<Profession, z.ZodType>;

export type ProfessionDetails = {
  [P in Profession]: z.infer<(typeof PROFESSION_DETAILS)[P]>;
}[Profession];

/** The field names of each profession, in the order the form shows them. */
export const PROFESSION_FIELDS: { [P in Profession]: readonly string[] } = {
  student: Object.keys(PROFESSION_DETAILS.student.shape),
  teacher: Object.keys(PROFESSION_DETAILS.teacher.shape),
  imam: Object.keys(PROFESSION_DETAILS.imam.shape),
  businessman: Object.keys(PROFESSION_DETAILS.businessman.shape),
  job_seeker: Object.keys(PROFESSION_DETAILS.job_seeker.shape),
  service_holder: Object.keys(PROFESSION_DETAILS.service_holder.shape),
};

export interface DetailsIssue {
  path: PropertyKey[];
  message: string;
}

/**
 * The details of a profession against the schema of that profession only, so a field of another
 * profession (a stale value after a change of choice) is refused. The schema is looked up by an own
 * key, so an inherited name such as `constructor` is an unknown profession. Returns the cleaned
 * object.
 */
export function parseProfessionDetails(
  profession: string,
  details: unknown,
): { success: true; data: Record<string, unknown> } | { success: false; issues: DetailsIssue[] } {
  if (!Object.hasOwn(PROFESSION_DETAILS, profession))
    return {
      success: false,
      issues: [{ path: ['profession'], message: 'validation.option_unknown' }],
    };
  const schema = PROFESSION_DETAILS[profession as Profession];
  const parsed = schema.safeParse(details ?? {});
  if (parsed.success) return { success: true, data: parsed.data };
  return {
    success: false,
    issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
  };
}

/** The profession with its details as one edit value ({ profession, details }). */
export const professionValueSchema = z
  .strictObject({
    profession: z.enum(PROFESSIONS),
    details: z.record(z.string(), z.unknown()).default({}),
  })
  .transform((value, ctx) => {
    const parsed = parseProfessionDetails(value.profession, value.details);
    if (!parsed.success) {
      for (const issue of parsed.issues)
        ctx.addIssue({
          code: 'custom',
          path: ['details', ...issue.path],
          message: issue.message,
        });
      return z.NEVER;
    }
    return { profession: value.profession, details: parsed.data };
  });
export type ProfessionValue = z.output<typeof professionValueSchema>;
