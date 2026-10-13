import { checkPassword, minPasswordLength } from '@css/shared/auth';
import type {
  PhotoSlot,
  RegistrationKind,
  RegistrationSubmitRequest,
} from '@css/shared/registration';
import { type Address, EMPTY_ADDRESS } from './AddressFields';

/** The steps of each kind (UX-16, UX-18, O-64): the photos are always the last one. */
export const STEPS = {
  volunteer: ['contact', 'identity', 'work', 'account', 'photos'],
  staff: ['contact', 'account', 'photos'],
} as const satisfies Record<RegistrationKind, readonly string[]>;
export type StepKey = (typeof STEPS)[RegistrationKind][number];

/** The photo slots of each kind: a volunteer gives both pages of the NID card. */
export const PHOTOS: Record<RegistrationKind, readonly PhotoSlot[]> = {
  volunteer: ['photo', 'nid_photo', 'nid_photo_back'],
  staff: ['photo'],
};

export const TEXT_FIELDS = [
  'education',
  'experience',
  'workDescription',
  'previousProjects',
  'facebookId',
] as const;

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
  education: string;
  experience: string;
  workDescription: string;
  previousProjects: string;
  facebookId: string;
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
  education: '',
  experience: '',
  workDescription: '',
  previousProjects: '',
  facebookId: '',
  designation: '',
  password: '',
  confirm: '',
  photos: { photo: false, nid_photo: false, nid_photo_back: false },
};

export const MOBILE = /^01[3-9][0-9]{8}$/;
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NID = /^([0-9]{10}|[0-9]{13}|[0-9]{17})$/;

/** A problem of one field: a key of the root catalogue. */
export type Problem =
  | 'errors.validation.required'
  | 'errors.validation.nid_format'
  | 'errors.validation.mobile_format'
  | 'errors.validation.password_too_short'
  | 'errors.validation.password_uppercase_digit'
  | 'auth.password.mismatch'
  | 'registration.form.missing_photo';

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
    for (const level of ['divisionId', 'districtId', 'upazilaId', 'unionId'] as const)
      need(level, v.address[level]);
  }
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
  if ((TEXT_FIELDS as readonly string[]).includes(root)) return at('work');
  if (['password', 'confirm'].includes(root)) return at('account');
  if ((PHOTOS.volunteer as readonly string[]).includes(root)) return at('photos');
  return kind === 'volunteer' ? at('identity') : at('contact');
}

const optional = (value: string) => value.trim() || undefined;

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
    education: optional(v.education),
    experience: optional(v.experience),
    workDescription: optional(v.workDescription),
    previousProjects: optional(v.previousProjects),
    facebookId: optional(v.facebookId),
  };
}
