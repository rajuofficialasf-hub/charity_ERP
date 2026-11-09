import type { AnswerValue } from '@css/shared';
import type { Answer, FormDefinition, FormField } from '@css/shared/forms';
import type { LookupAutofill } from '../../admin/beneficiaries/beneficiaries-api';

/** The standard column of the question that holds the NID or birth-registration number. */
export const IDENTITY_COLUMN = 'nid_or_birth_reg';
const ADDRESS_COLUMNS = 'division_id,district_id,upazila_id,union_id';
/** The identity answers a found person locks (the lookup's own rule). */
const LOCKED_COLUMNS = [IDENTITY_COLUMN, 'name', 'father_or_husband_name'];

const fields = (definition: FormDefinition): FormField[] =>
  definition.sections.flatMap((s) => s.fields);

/** The question marked with a standard column, if the form has one. */
export const fieldByColumn = (definition: FormDefinition, column: string): FormField | undefined =>
  fields(definition).find((f) => f.standardColumn === column);

const text = (field: FormField, v: string | null | undefined): Answer | null =>
  v
    ? {
        fieldKey: field.fieldKey,
        value: { t: field.type === 'phone' ? 'phone' : 'short_text', v } as AnswerValue,
      }
    : null;

/**
 * The answers a found person's profile gives the form: the number, the name, the father's or
 * husband's name, the mobile, the gender, the address and the village, each on the question that
 * carries its column. A form without that question takes nothing for it.
 */
export function answersOfProfile(
  definition: FormDefinition,
  number: string,
  profile: LookupAutofill,
): Answer[] {
  const out: (Answer | null)[] = [];
  const put = (column: string, v: string | null | undefined) => {
    const field = fieldByColumn(definition, column);
    if (field) out.push(text(field, v));
  };
  put(IDENTITY_COLUMN, number);
  put('name', profile.name);
  put('father_or_husband_name', profile.fatherOrHusbandName);
  put('mother_name', profile.motherName);
  put('mobile', profile.mobile);
  put('village', profile.village);
  put('post_office', profile.postOffice);
  put('post_code', profile.postCode);
  put('landmark', profile.landmark);
  const gender = fieldByColumn(definition, 'gender_code');
  if (gender && profile.genderCode)
    out.push({ fieldKey: gender.fieldKey, value: { t: 'single_select', v: profile.genderCode } });
  const dob = fieldByColumn(definition, 'dob');
  if (dob && profile.dob)
    out.push({ fieldKey: dob.fieldKey, value: { t: 'date', v: profile.dob } });
  const address = fieldByColumn(definition, ADDRESS_COLUMNS);
  if (address)
    out.push({
      fieldKey: address.fieldKey,
      value: {
        t: 'bd_address',
        division_id: profile.divisionId,
        district_id: profile.districtId,
        upazila_id: profile.upazilaId,
        union_id: profile.unionId,
      },
    });
  return out.filter((a): a is Answer => a !== null);
}

/**
 * Whether the answers hold the whole four-level address: the server takes a draft only with it
 * (BR-058), since the application's region and the volunteer's limit come from it.
 */
export function hasAddress(definition: FormDefinition, answers: readonly Answer[]): boolean {
  const field = fieldByColumn(definition, ADDRESS_COLUMNS);
  const value = field && answers.find((a) => a.fieldKey === field.fieldKey)?.value;
  return Boolean(
    value?.t === 'bd_address' &&
    value.division_id &&
    value.district_id &&
    value.upazila_id &&
    value.union_id,
  );
}

/** The answer of a new person: the number alone, on the identity question. */
export function answersOfNumber(definition: FormDefinition, number: string): Answer[] {
  const field = fieldByColumn(definition, IDENTITY_COLUMN);
  const answer = field ? text(field, number) : null;
  return answer ? [answer] : [];
}

/** The questions a found person may read but not change. */
export function lockedKeysOf(definition: FormDefinition): ReadonlySet<string> {
  return new Set(
    LOCKED_COLUMNS.map((c) => fieldByColumn(definition, c)?.fieldKey).filter(
      (k): k is string => k !== undefined,
    ),
  );
}
