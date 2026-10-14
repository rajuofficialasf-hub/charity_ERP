import { BLOOD_GROUPS, TSHIRT_SIZES, VOLUNTEERING_AREAS } from '@css/shared/registration';
import { DateField, Select, TextField } from '@css/ui';
import { useTranslations } from 'use-intl';
import { type Address, AddressFields, EMPTY_ADDRESS } from '../registration/AddressFields';
import {
  EMPTY_EMERGENCY,
  EMPTY_PROFESSION,
  EMPTY_SKILLS,
  EmergencyContactFields,
  emergencyValue,
  type EmergencyState,
  ProfessionFields,
  type ProfessionState,
  professionValue,
  SkillsFields,
  type SkillsState,
  skillsValue,
} from '../registration/ProfileInputs';
import type { OwnProfile, RequestField } from './profile-api';

type Bank = Record<
  'bankName' | 'accountName' | 'accountNumber' | 'branchName' | 'routingNumber',
  string
>;
const BANK_LABEL = {
  bankName: 'form.bank_name',
  accountName: 'form.account_name',
  accountNumber: 'form.account_number',
  branchName: 'form.branch_name',
  routingNumber: 'form.routing_number',
} as const;
const NUMERIC = new Set<RequestField>(['nid', 'whatsapp', 'mobile']);

/**
 * The input for the new value of one field (DECISION_LOG D-085, O-65): a text, a choice, a date,
 * the address cascade, the bank details, or one of the groups (profession, skills, emergency
 * contact) with the same inputs as the registration; photos are uploaded by their own field. The
 * value is held as the form needs it and turned into what the API expects as `newValue` by
 * `cleanValue`.
 */
export function ValueEditor({
  field,
  label,
  value,
  onChange,
  error,
}: {
  field: RequestField;
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
}) {
  const t = useTranslations('registration');
  if (field === 'address')
    return (
      <AddressFields
        value={(value as Address | undefined) ?? EMPTY_ADDRESS}
        onChange={onChange}
        errors={{ divisionId: error }}
      />
    );
  if (field === 'profession')
    return (
      <ProfessionFields
        value={(value as ProfessionState | undefined) ?? EMPTY_PROFESSION}
        onChange={onChange}
        errors={error ? { profession: error } : {}}
      />
    );
  if (field === 'skills')
    return (
      <SkillsFields
        value={(value as SkillsState | undefined) ?? EMPTY_SKILLS}
        onChange={onChange}
        errors={error ? { interestAreas: error } : {}}
      />
    );
  if (field === 'emergencyContact')
    return (
      <EmergencyContactFields
        value={(value as EmergencyState | undefined) ?? EMPTY_EMERGENCY}
        onChange={onChange}
        errors={error ? { 'emergencyContact.mobile': error } : {}}
      />
    );
  if (field === 'bloodGroup' || field === 'tshirtSize' || field === 'volunteeringArea') {
    const options =
      field === 'bloodGroup'
        ? BLOOD_GROUPS.map((id) => ({ id, label: id }))
        : field === 'tshirtSize'
          ? TSHIRT_SIZES.map((id) => ({ id, label: id }))
          : VOLUNTEERING_AREAS.map((id) => ({
              id,
              label: t(`lists.volunteering_area.${id}`),
            }));
    return (
      <Select
        label={label}
        name={`value-${field}`}
        placeholder={t('form.choose')}
        value={typeof value === 'string' && value ? value : null}
        onChange={(id) => onChange(id ?? '')}
        options={options}
        error={error}
      />
    );
  }
  if (field === 'dateOfBirth')
    return (
      <DateField
        label={label}
        name="value-dateOfBirth"
        value={typeof value === 'string' && value ? value : null}
        onChange={(iso) => onChange(iso ?? '')}
        min="1900-01-01"
        max={new Date().toISOString().slice(0, 10)}
        error={error}
      />
    );
  if (field === 'bank') {
    const bank = (value as Partial<Bank> | undefined) ?? {};
    return (
      <>
        {(Object.keys(BANK_LABEL) as (keyof Bank)[]).map((key) => (
          <TextField
            key={key}
            label={t(BANK_LABEL[key])}
            name={key}
            value={bank[key] ?? ''}
            onChange={(v) => onChange({ ...bank, [key]: v })}
            error={key === 'bankName' ? error : undefined}
          />
        ))}
      </>
    );
  }
  return (
    <TextField
      label={label}
      name={`value-${field}`}
      type={field === 'email' ? 'email' : 'text'}
      inputMode={NUMERIC.has(field) ? 'numeric' : undefined}
      value={typeof value === 'string' ? value : ''}
      onChange={onChange}
      required
      error={error}
    />
  );
}

/** The value a field starts with when its edit is ticked: what the volunteer has now. */
export function initialValue(field: RequestField, me: OwnProfile): unknown {
  switch (field) {
    case 'bloodGroup':
    case 'tshirtSize':
    case 'volunteeringArea':
    case 'dateOfBirth':
      return me[field] ?? '';
    case 'profession':
      return {
        profession: (me.profession ?? '') as ProfessionState['profession'],
        details: Object.fromEntries(
          Object.entries(me.professionDetails).map(([k, v]) => [
            k,
            typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v ?? ''),
          ]),
        ),
      } satisfies ProfessionState;
    case 'skills':
      return {
        interestAreas: me.interestAreas,
        vehicle: me.vehicle ?? '',
        canSwim: me.canSwim === null ? '' : me.canSwim ? 'yes' : 'no',
        availability: me.availability ?? '',
      } satisfies SkillsState;
    case 'emergencyContact':
      return {
        name: me.emergencyContact.name ?? '',
        mobile: me.emergencyContact.mobile ?? '',
      } satisfies EmergencyState;
    default:
      return undefined;
  }
}

/** The value as the API takes it: empty bank fields are dropped, a group becomes its own object. */
export function cleanValue(field: RequestField, value: unknown): unknown {
  if (field === 'profession')
    return professionValue((value as ProfessionState | undefined) ?? EMPTY_PROFESSION);
  if (field === 'skills') return skillsValue((value as SkillsState | undefined) ?? EMPTY_SKILLS);
  if (field === 'emergencyContact')
    return emergencyValue((value as EmergencyState | undefined) ?? EMPTY_EMERGENCY);
  if (field !== 'bank' || !value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, string>).filter(([, v]) => v.trim() !== ''),
  );
}
