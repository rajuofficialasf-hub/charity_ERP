import {
  AVAILABILITIES,
  DETAIL_OPTIONS,
  EDUCATION_STATUSES,
  INTEREST_AREAS,
  PROFESSION_FIELDS,
  PROFESSIONS,
  type Profession,
  QUALIFICATIONS,
  VEHICLES,
} from '@css/shared/registration';
import { CheckboxGroup, RadioGroup, Select, TextField } from '@css/ui';
import { useTranslations } from 'use-intl';
import { type Address, AddressFields, EMPTY_ADDRESS } from './AddressFields';

/**
 * The inputs of the profession, the skills and the emergency contact (DECISION_LOG O-65, D-092;
 * BR-246), used by the registration steps and by the edit mode of the own profile, so both ask the
 * same way. Each group holds its values as the form needs them (strings, one yes or no as text) and
 * turns them into the value the API takes with the `…Value` functions; blank values are dropped.
 */
export interface ProfessionState {
  profession: Profession | '';
  details: Record<string, string>;
}
export const EMPTY_PROFESSION: ProfessionState = { profession: '', details: {} };

export interface SkillsState {
  interestAreas: string[];
  vehicle: string;
  canSwim: '' | 'yes' | 'no';
  availability: string;
  emergencyFullTime: '' | 'yes' | 'no';
}
export const EMPTY_SKILLS: SkillsState = {
  interestAreas: [],
  vehicle: '',
  canSwim: '',
  availability: '',
  emergencyFullTime: '',
};

/** Education as the form holds it (the year as typed); `educationValue` turns it into the API value. */
export interface EducationState {
  highestQualification: string;
  institutionName: string;
  subject: string;
  passingYear: string;
  result: string;
  status: '' | 'studying' | 'completed';
}
export const EMPTY_EDUCATION: EducationState = {
  highestQualification: '',
  institutionName: '',
  subject: '',
  passingYear: '',
  result: '',
  status: '',
};

/** The permanent address as the form holds it: the four levels and a line. */
export interface PermanentState {
  address: Address;
  line: string;
}
export const EMPTY_PERMANENT: PermanentState = { address: EMPTY_ADDRESS, line: '' };

const CHOICE_FIELDS = new Set(Object.keys(DETAIL_OPTIONS));

const blank = (v: string) => v.trim() === '';

/** The details of the chosen profession without blanks. */
export function professionDetailsOf(state: ProfessionState): Record<string, string> {
  if (!state.profession) return {};
  const own = new Set(PROFESSION_FIELDS[state.profession]);
  const out: Record<string, string> = {};
  for (const [field, value] of Object.entries(state.details)) {
    if (!own.has(field) || blank(value)) continue;
    out[field] = value.trim();
  }
  return out;
}

/** The edit value of the profession: `{ profession, details }`. */
export const professionValue = (state: ProfessionState) => ({
  profession: state.profession,
  details: professionDetailsOf(state),
});

/** The edit value of the skills; whatever is not given is left out. */
export function skillsValue(state: SkillsState) {
  return {
    ...(state.interestAreas.length ? { interestAreas: state.interestAreas } : {}),
    ...(state.vehicle ? { vehicle: state.vehicle } : {}),
    ...(state.canSwim ? { canSwim: state.canSwim === 'yes' } : {}),
    ...(state.availability ? { availability: state.availability } : {}),
    ...(state.emergencyFullTime ? { emergencyFullTime: state.emergencyFullTime === 'yes' } : {}),
  };
}

/** The edit value of the education; blank parts are left out and the year becomes a number. */
export function educationValue(state: EducationState) {
  return {
    ...(state.highestQualification ? { highestQualification: state.highestQualification } : {}),
    ...(blank(state.institutionName) ? {} : { institutionName: state.institutionName.trim() }),
    ...(blank(state.subject) ? {} : { subject: state.subject.trim() }),
    ...(state.passingYear ? { passingYear: Number(state.passingYear) } : {}),
    ...(blank(state.result) ? {} : { result: state.result.trim() }),
    ...(state.status ? { status: state.status } : {}),
  };
}

/** Whether any part of an address is filled in. */
export const addressStarted = (a: Address) =>
  Boolean(a.divisionId || a.districtId || a.upazilaId || a.unionId);

/** The edit value of a permanent address, or null while no level is given. */
export function permanentValue(state: PermanentState) {
  const { divisionId, districtId, upazilaId, unionId } = state.address;
  if (!divisionId || !districtId || !upazilaId || !unionId) return null;
  return {
    divisionId,
    districtId,
    upazilaId,
    unionId,
    ...(blank(state.line) ? {} : { addressLine: state.line.trim() }),
  };
}

interface GroupProps<T> {
  value: T;
  onChange: (value: T) => void;
  errors?: Record<string, string>;
}

/** The profession choice and the fields of that profession only; a new choice drops the old fields. */
export function ProfessionFields({ value, onChange, errors = {} }: GroupProps<ProfessionState>) {
  const t = useTranslations('registration');
  const label = (profession: Profession, field: string) =>
    t(`lists.profession_field.${profession}.${field}` as 'lists.profession_field.student.subject');
  const optionLabel = (field: string, option: string) =>
    t(`lists.option.${field}.${option}` as 'lists.option.role.imam');
  const setDetail = (field: string, text: string) =>
    onChange({ ...value, details: { ...value.details, [field]: text } });
  return (
    <div className="register-stack">
      <Select
        label={t('form.profession')}
        name="profession"
        placeholder={t('form.choose')}
        value={value.profession || null}
        onChange={(id) => onChange({ profession: (id ?? '') as Profession | '', details: {} })}
        options={PROFESSIONS.map((id) => ({ id, label: t(`lists.profession.${id}`) }))}
        required
        error={errors.profession}
      />
      {value.profession && (
        <div className="register-grid" data-testid="profession-fields">
          {PROFESSION_FIELDS[value.profession].map((field) => {
            const text = label(value.profession as Profession, field);
            const current = value.details[field] ?? '';
            if (CHOICE_FIELDS.has(field))
              return (
                <Select
                  key={field}
                  label={text}
                  name={`professionDetails.${field}`}
                  placeholder={t('form.choose')}
                  value={current || null}
                  onChange={(id) => setDetail(field, id ?? '')}
                  options={DETAIL_OPTIONS[field as keyof typeof DETAIL_OPTIONS].map((id) => ({
                    id,
                    label: optionLabel(field, id),
                  }))}
                  error={errors[`professionDetails.${field}`]}
                />
              );
            return (
              <TextField
                key={field}
                label={text}
                name={`professionDetails.${field}`}
                value={current}
                onChange={(v) => setDetail(field, v)}
                error={errors[`professionDetails.${field}`]}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The areas of interest, the vehicle, swimming and the availability. */
export function SkillsFields({ value, onChange, errors = {} }: GroupProps<SkillsState>) {
  const t = useTranslations('registration');
  return (
    <div className="register-stack">
      <CheckboxGroup
        label={t('form.interest_areas')}
        name="interestAreas"
        columns={2}
        value={value.interestAreas}
        onChange={(interestAreas) => onChange({ ...value, interestAreas })}
        options={INTEREST_AREAS.map((id) => ({ id, label: t(`lists.interest.${id}`) }))}
        error={errors.interestAreas}
      />
      <div className="register-grid">
        <RadioGroup
          label={t('form.vehicle')}
          name="vehicle"
          orientation="horizontal"
          value={value.vehicle || null}
          onChange={(vehicle) => onChange({ ...value, vehicle })}
          options={VEHICLES.map((id) => ({ id, label: t(`lists.vehicle.${id}`) }))}
          error={errors.vehicle}
        />
        <RadioGroup
          label={t('form.can_swim')}
          name="canSwim"
          orientation="horizontal"
          value={value.canSwim || null}
          onChange={(canSwim) => onChange({ ...value, canSwim: canSwim as 'yes' | 'no' })}
          options={[
            { id: 'yes', label: t('form.yes') },
            { id: 'no', label: t('form.no') },
          ]}
          error={errors.canSwim}
        />
        <RadioGroup
          label={t('form.emergency_full_time')}
          name="emergencyFullTime"
          orientation="horizontal"
          value={value.emergencyFullTime || null}
          onChange={(v) => onChange({ ...value, emergencyFullTime: v as 'yes' | 'no' })}
          options={[
            { id: 'yes', label: t('form.yes') },
            { id: 'no', label: t('form.no') },
          ]}
          error={errors.emergencyFullTime}
        />
        <Select
          label={t('form.availability')}
          name="availability"
          placeholder={t('form.choose')}
          value={value.availability || null}
          onChange={(id) => onChange({ ...value, availability: id ?? '' })}
          options={AVAILABILITIES.map((id) => ({ id, label: t(`lists.availability.${id}`) }))}
          error={errors.availability}
        />
      </div>
    </div>
  );
}

/** The education: the highest qualification, the institution, the subject, the year, the result. */
export function EducationFields({ value, onChange, errors = {} }: GroupProps<EducationState>) {
  const t = useTranslations('registration');
  const set = (patch: Partial<EducationState>) => onChange({ ...value, ...patch });
  return (
    <div className="register-grid">
      <Select
        label={t('form.highest_qualification')}
        name="highestQualification"
        placeholder={t('form.choose')}
        value={value.highestQualification || null}
        onChange={(id) => set({ highestQualification: id ?? '' })}
        options={QUALIFICATIONS.map((id) => ({ id, label: t(`lists.qualification.${id}`) }))}
        error={errors['educationDetails.highestQualification']}
      />
      <TextField
        label={t('form.institution_name')}
        name="institutionName"
        value={value.institutionName}
        onChange={(institutionName) => set({ institutionName })}
        error={errors['educationDetails.institutionName']}
      />
      <TextField
        label={t('form.edu_subject')}
        name="eduSubject"
        value={value.subject}
        onChange={(subject) => set({ subject })}
        error={errors['educationDetails.subject']}
      />
      <TextField
        label={t('form.passing_year')}
        name="passingYear"
        value={value.passingYear}
        onChange={(v) => set({ passingYear: v.replace(/\D/g, '').slice(0, 4) })}
        inputMode="numeric"
        error={errors['educationDetails.passingYear']}
      />
      <TextField
        label={t('form.result')}
        name="eduResult"
        value={value.result}
        onChange={(result) => set({ result })}
        error={errors['educationDetails.result']}
      />
      <RadioGroup
        label={t('form.edu_status')}
        name="eduStatus"
        orientation="horizontal"
        value={value.status || null}
        onChange={(status) => set({ status: status as EducationState['status'] })}
        options={EDUCATION_STATUSES.map((id) => ({ id, label: t(`lists.education_status.${id}`) }))}
        error={errors['educationDetails.status']}
      />
    </div>
  );
}

/** The permanent address: the four levels (not mandatory) and a village or house line. */
export function PermanentAddressFields({
  value,
  onChange,
  errors = {},
}: GroupProps<PermanentState>) {
  const t = useTranslations('registration');
  return (
    <>
      <AddressFields
        value={value.address}
        onChange={(address) => onChange({ ...value, address })}
        errors={errors}
        optional
        labelSuffix={t('form.permanent_suffix')}
      />
      <TextField
        label={`${t('form.address_line')} ${t('form.permanent_suffix')}`}
        name="permanentLine"
        value={value.line}
        onChange={(line) => onChange({ ...value, line })}
        error={errors['permanentAddress.addressLine']}
      />
    </>
  );
}
