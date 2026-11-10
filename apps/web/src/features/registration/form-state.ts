import { checkPassword, minPasswordLength } from '@css/shared/auth';
import {
  dateOfBirthSchema,
  isFacebookLink,
  type PhotoSlot,
  type RegistrationChannel,
  type RegistrationKind,
  type RegistrationSubmitRequest,
} from '@css/shared/registration';
import { type Address, EMPTY_ADDRESS } from './AddressFields';
import {
  addressStarted,
  EMPTY_EDUCATION,
  EMPTY_PERMANENT,
  EMPTY_PROFESSION,
  EMPTY_SKILLS,
  educationValue,
  type EducationState,
  permanentValue,
  type PermanentState,
  professionDetailsOf,
  type ProfessionState,
  skillsValue,
  type SkillsState,
} from './ProfileInputs';

/**
 * The steps of each kind: the contacts first, the photos always last.
 * A volunteer gives the identity, the address, the education, the profession and the skills in
 * between.
 */
export const STEPS = {
  volunteer: [
    'contact',
    'identity',
    'address',
    'education',
    'profession',
    'skills',
    'account',
    'photos',
  ],
  staff: ['contact', 'account', 'photos'],
} as const satisfies Record<RegistrationKind, readonly string[]>;
export type StepKey = (typeof STEPS)[RegistrationKind][number];

/** The photo slots of each kind: a volunteer gives both pages of the NID card. */
export const PHOTOS: Record<RegistrationKind, readonly PhotoSlot[]> = {
  volunteer: ['photo', 'nid_photo', 'nid_photo_back'],
  staff: ['photo'],
};

/** Everything the steps collect; held in the page only (nothing is stored on the device). */
export interface RegistrationValues {
  name: string;
  fatherName: string;
  motherName: string;
  nid: string;
  whatsapp: string;
  mobile: string;
  email: string;
  address: Address;
  addressLine: string;
  /** The present address is the permanent one too (ticked at the start). */
  permanentSame: boolean;
  permanent: PermanentState;
  volunteeringArea: string;
  dateOfBirth: string;
  bloodGroup: string;
  tshirtSize: string;
  facebookId: string;
  education: EducationState;
  profession: ProfessionState;
  skills: SkillsState;
  designation: string;
  password: string;
  confirm: string;
  photos: Record<PhotoSlot, boolean>;
}

export const EMPTY_VALUES: RegistrationValues = {
  name: '',
  fatherName: '',
  motherName: '',
  nid: '',
  whatsapp: '',
  mobile: '',
  email: '',
  address: EMPTY_ADDRESS,
  addressLine: '',
  permanentSame: true,
  permanent: EMPTY_PERMANENT,
  volunteeringArea: '',
  dateOfBirth: '',
  bloodGroup: '',
  tshirtSize: '',
  facebookId: '',
  education: EMPTY_EDUCATION,
  profession: EMPTY_PROFESSION,
  skills: EMPTY_SKILLS,
  designation: '',
  password: '',
  confirm: '',
  photos: { photo: false, nid_photo: false, nid_photo_back: false },
};

/** The form of the registration page: the values and the code typed for each contact. */
export type RegistrationForm = RegistrationValues & { codes: Record<RegistrationChannel, string> };

export const EMPTY_FORM: RegistrationForm = { ...EMPTY_VALUES, codes: { sms: '', email: '' } };

export const MOBILE = /^01[3-9][0-9]{8}$/;
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NID = /^([0-9]{10}|[0-9]{13}|[0-9]{17})$/;

/** A problem of one field: a key of the root catalogue. */
export type Problem =
  | 'errors.validation.required'
  | 'errors.validation.nid_format'
  | 'errors.validation.mobile_format'
  | 'errors.validation.date_format'
  | 'errors.validation.date_future'
  | 'errors.validation.facebook_link'
  | 'errors.validation.out_of_range'
  | 'errors.validation.password_too_short'
  | 'errors.validation.password_uppercase_digit'
  | 'auth.password.mismatch'
  | 'registration.form.missing_photo';

/** The problem of a date of birth, or null: a real date, not in the future, not before 1900. */
function dateProblem(value: string): Problem | null {
  const parsed = dateOfBirthSchema.safeParse(value);
  return parsed.success ? null : (`errors.${parsed.error.issues[0]!.message}` as Problem);
}

/** The fields of a step that are not filled in as the API needs them. */
export function checkStep(
  step: StepKey,
  kind: RegistrationKind,
  v: RegistrationValues,
): Record<string, Problem> {
  const problems: Record<string, Problem> = {};
  const need = (field: string, value: string | null) => {
    if (!value?.trim()) problems[field] = 'errors.validation.required';
  };
  if (step === 'contact') {
    need('name', v.name);
    if (kind === 'volunteer') need('fatherName', v.fatherName);
    else need('designation', v.designation);
  }
  if (step === 'identity') {
    need('motherName', v.motherName);
    if (!NID.test(v.nid)) problems.nid = 'errors.validation.nid_format';
    if (v.whatsapp && !MOBILE.test(v.whatsapp))
      problems.whatsapp = 'errors.validation.mobile_format';
    if (v.dateOfBirth) {
      const bad = dateProblem(v.dateOfBirth);
      if (bad) problems.dateOfBirth = bad;
    }
    if (v.facebookId.trim() && !isFacebookLink(v.facebookId.trim()))
      problems.facebookId = 'errors.validation.facebook_link';
  }
  if (step === 'address') {
    for (const level of ['divisionId', 'districtId', 'upazilaId', 'unionId'] as const)
      need(level, v.address[level]);
    // the permanent address is optional, but a started one needs all four levels
    if (!v.permanentSame && addressStarted(v.permanent.address))
      for (const level of ['divisionId', 'districtId', 'upazilaId', 'unionId'] as const)
        if (!v.permanent.address[level])
          problems[`permanent-${level}`] = 'errors.validation.required';
  }
  if (step === 'education' && v.education.passingYear) {
    const year = Number(v.education.passingYear);
    if (year < 1950 || year > new Date().getFullYear() + 8)
      problems['educationDetails.passingYear'] = 'errors.validation.out_of_range';
  }
  if (step === 'profession') need('profession', v.profession.profession);
  if (step === 'account') {
    // the checklist under the field shows the rule while typing; a refused step says it once more
    for (const problem of checkPassword(v.password, { minLength: minPasswordLength(false) }))
      problems.password =
        problem === 'validation.password_too_short'
          ? 'errors.validation.password_too_short'
          : 'errors.validation.password_uppercase_digit';
    // Two values the user just typed on this device, not a secret check.
    // eslint-disable-next-line security/detect-possible-timing-attacks
    if (v.password !== v.confirm) problems.confirm = 'auth.password.mismatch';
  }
  if (step === 'photos')
    for (const slot of PHOTOS[kind])
      if (!v.photos[slot]) problems[slot] = 'registration.form.missing_photo';
  return problems;
}

/** The step a field of a refused submit belongs to, so the page can show it there. */
export function stepOf(kind: RegistrationKind, field: string): number {
  const at = (step: StepKey) => (STEPS[kind] as readonly string[]).indexOf(step);
  const root = field.split('.')[0] ?? field;
  if (['name', 'fatherName', 'designation', 'mobile', 'email'].includes(root)) return at('contact');
  if (
    [
      'divisionId',
      'districtId',
      'upazilaId',
      'unionId',
      'addressLine',
      'volunteeringArea',
      'permanentAddress',
    ].includes(root)
  )
    return at('address');
  if (root === 'educationDetails') return at('education');
  if (['profession', 'professionDetails'].includes(root)) return at('profession');
  if (['interestAreas', 'vehicle', 'canSwim', 'availability', 'emergencyFullTime'].includes(root))
    return at('skills');
  if (['password', 'confirm'].includes(root)) return at('account');
  if ((PHOTOS.volunteer as readonly string[]).includes(root)) return at('photos');
  return kind === 'volunteer' ? at('identity') : at('contact');
}

const optional = (value: string) => value.trim() || undefined;

type VolunteerSubmit = Extract<RegistrationSubmitRequest, { kind: 'volunteer' }>;

/** The skills as the flat fields of the submit; whatever is not given is left out. */
function skillFields(skills: SkillsState) {
  const value = skillsValue(skills);
  return value as Pick<
    VolunteerSubmit,
    'interestAreas' | 'vehicle' | 'canSwim' | 'availability' | 'emergencyFullTime'
  >;
}

/** The permanent address of the submit: a copy of the present one, the one typed, or none. */
function permanentField(v: RegistrationValues): Pick<VolunteerSubmit, 'permanentAddress'> {
  const line = optional(v.addressLine);
  if (v.permanentSame) {
    const { divisionId, districtId, upazilaId, unionId } = v.address;
    if (!divisionId || !districtId || !upazilaId || !unionId) return {};
    return {
      permanentAddress: {
        divisionId,
        districtId,
        upazilaId,
        unionId,
        ...(line ? { addressLine: line } : {}),
      },
    };
  }
  const typed = permanentValue(v.permanent);
  return typed ? { permanentAddress: typed } : {};
}

/** The submit body of the kind (registrationSubmitRequestSchema). */
export function submitBody(
  kind: RegistrationKind,
  registrationId: string,
  v: RegistrationValues,
): RegistrationSubmitRequest {
  if (kind === 'staff')
    return {
      kind,
      registrationId,
      password: v.password,
      name: v.name.trim(),
      designation: v.designation.trim(),
    };
  return {
    kind,
    registrationId,
    password: v.password,
    name: v.name.trim(),
    fatherName: v.fatherName.trim(),
    motherName: v.motherName.trim(),
    nid: v.nid,
    whatsapp: optional(v.whatsapp),
    divisionId: v.address.divisionId ?? '',
    districtId: v.address.districtId ?? '',
    upazilaId: v.address.upazilaId ?? '',
    unionId: v.address.unionId ?? '',
    addressLine: optional(v.addressLine),
    volunteeringArea: optional(v.volunteeringArea) as VolunteerSubmit['volunteeringArea'],
    dateOfBirth: optional(v.dateOfBirth),
    bloodGroup: optional(v.bloodGroup) as VolunteerSubmit['bloodGroup'],
    tshirtSize: optional(v.tshirtSize) as VolunteerSubmit['tshirtSize'],
    facebookId: optional(v.facebookId),
    ...permanentField(v),
    ...(Object.keys(educationValue(v.education)).length
      ? { educationDetails: educationValue(v.education) as VolunteerSubmit['educationDetails'] }
      : {}),
    profession: v.profession.profession as VolunteerSubmit['profession'],
    professionDetails: professionDetailsOf(v.profession),
    ...skillFields(v.skills),
  };
}
