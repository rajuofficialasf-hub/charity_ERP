import {
  AVAILABILITIES,
  DETAIL_OPTIONS,
  INTEREST_AREAS,
  PROFESSION_FIELDS,
  PROFESSIONS,
  type Profession,
  VEHICLES,
} from '@css/shared/registration';
import { CheckboxGroup, RadioGroup, Select, TextField } from '@css/ui';
import { useTranslations } from 'use-intl';

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
}
export const EMPTY_SKILLS: SkillsState = {
  interestAreas: [],
  vehicle: '',
  canSwim: '',
  availability: '',
};

export interface EmergencyState {
  name: string;
  mobile: string;
}
export const EMPTY_EMERGENCY: EmergencyState = { name: '', mobile: '' };

const BOOLEAN_FIELDS = new Set(['fullTimeAvailable']);
const CHOICE_FIELDS = new Set(Object.keys(DETAIL_OPTIONS));

const blank = (v: string) => v.trim() === '';

/** The details of the chosen profession without blanks; a yes or no becomes a boolean. */
export function professionDetailsOf(state: ProfessionState): Record<string, string | boolean> {
  if (!state.profession) return {};
  const own = new Set(PROFESSION_FIELDS[state.profession]);
  const out: Record<string, string | boolean> = {};
  for (const [field, value] of Object.entries(state.details)) {
    if (!own.has(field) || blank(value)) continue;
    out[field] = BOOLEAN_FIELDS.has(field) ? value === 'yes' : value.trim();
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
  };
}

/** The edit value of the emergency contact; whatever is not given is left out. */
export function emergencyValue(state: EmergencyState) {
  return {
    ...(blank(state.name) ? {} : { name: state.name.trim() }),
    ...(blank(state.mobile) ? {} : { mobile: state.mobile }),
  };
}

interface GroupProps<T> {
  value: T;
  onChange: (value: T) => void;
  errors?: Record<string, string>;
}

const digits = (v: string) => v.replace(/\D/g, '').slice(0, 11);

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
            if (BOOLEAN_FIELDS.has(field))
              return (
                <RadioGroup
                  key={field}
                  label={text}
                  name={`professionDetails.${field}`}
                  orientation="horizontal"
                  value={current || null}
                  onChange={(id) => setDetail(field, id)}
                  options={[
                    { id: 'yes', label: t('form.yes') },
                    { id: 'no', label: t('form.no') },
                  ]}
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

/** The guardian to call in an emergency: a name and a mobile number. */
export function EmergencyContactFields({
  value,
  onChange,
  errors = {},
}: GroupProps<EmergencyState>) {
  const t = useTranslations('registration');
  return (
    <div className="register-grid">
      <TextField
        label={t('form.emergency_name')}
        name="emergencyName"
        value={value.name}
        onChange={(name) => onChange({ ...value, name })}
        error={errors['emergencyContact.name']}
      />
      <TextField
        label={t('form.emergency_mobile')}
        name="emergencyMobile"
        value={value.mobile}
        onChange={(mobile) => onChange({ ...value, mobile: digits(mobile) })}
        inputMode="numeric"
        error={errors['emergencyContact.mobile']}
      />
    </div>
  );
}
