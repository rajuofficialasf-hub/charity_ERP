import type { FieldType } from './library.js';

/**
 * The identity roles of a beneficiary application form: the beneficiary columns its
 * questions must fill before it is published, each with the answer type the column takes. Nothing
 * places these questions; the builder writes them and marks each by its standard column, under any
 * key. A published application form without one of them, or with one that is of another type,
 * optional, hidden or inside an official-only section, is refused.
 */
export const CORE_FIELDS = [
  { key: 'nid_or_birth_reg', type: 'short_text', standardColumn: 'nid_or_birth_reg' },
  { key: 'name', type: 'short_text', standardColumn: 'name' },
  { key: 'father_or_husband_name', type: 'short_text', standardColumn: 'father_or_husband_name' },
  { key: 'mobile', type: 'phone', standardColumn: 'mobile' },
  { key: 'gender', type: 'single_select', standardColumn: 'gender_code' },
  {
    key: 'address',
    type: 'bd_address',
    standardColumn: 'division_id,district_id,upazila_id,union_id',
  },
  { key: 'village', type: 'short_text', standardColumn: 'village' },
] as const satisfies readonly { key: string; type: FieldType; standardColumn: string }[];

export type CoreFieldKey = (typeof CORE_FIELDS)[number]['key'];
export const CORE_FIELD_KEYS: readonly CoreFieldKey[] = CORE_FIELDS.map((f) => f.key);

export const isCoreFieldKey = (key: string): key is CoreFieldKey =>
  (CORE_FIELD_KEYS as readonly string[]).includes(key);

/**
 * The identity role a question is marked with: the role whose column it fills, outside a repeat
 * group (a row's `name` is a family member's, not the applicant's); none for any other question.
 */
export function identityRoleOf(field: {
  standardColumn?: string | null;
  settings?: { repeat?: { group?: string } } | null;
}): CoreFieldKey | null {
  if (field.settings?.repeat?.group) return null;
  return CORE_FIELDS.find((c) => c.standardColumn === field.standardColumn)?.key ?? null;
}

/** What a form is for: a beneficiary application (the identity roles apply), another form, the library. */
export const FORM_KINDS = ['beneficiary_application', 'other', 'library'] as const;
export type FormKind = (typeof FORM_KINDS)[number];

/**
 * The only beneficiary columns a form may fill, taken from the standard fields of the library:
 * the identity, the names (with whether the name beside the person is the father's or the
 * husband's), the contact and address data (with whose number the mobile is and that person's
 * name; these three are optional questions and no identity roles), the family and income
 * figures and the photo. A definition naming any other column is refused, so no form can write a status, a flag
 * or an audit column of the profile. The two comma-separated entries are the exact chains the
 * address and the GPS fields fill.
 */
export const STANDARD_COLUMNS = [
  'nid_or_birth_reg',
  'mobile',
  'mobile_owner_code',
  'mobile_owner_name',
  'name',
  'father_or_husband_name',
  'guardian_relation_code',
  'mother_name',
  'gender_code',
  'dob',
  'age_years',
  'marital_status_code',
  'education_code',
  'class_code',
  'occupation_code',
  'photo_file_id',
  'division_id,district_id,upazila_id,union_id',
  'village',
  'post_office',
  'post_code',
  'landmark',
  'latitude,longitude,gps_accuracy_m',
  'members_14_plus',
  'children_under_14',
  'total_members',
  'daily_income',
  'monthly_income',
  'monthly_expense',
] as const;
export type StandardColumn = (typeof STANDARD_COLUMNS)[number];
export const isStandardColumn = (column: string): column is StandardColumn =>
  (STANDARD_COLUMNS as readonly string[]).includes(column);

/** The standard column of a repeat group whose rows become family members. */
export const FAMILY_MEMBERS_TABLE = 'beneficiary_family_members';

/** The only family-member columns a field inside the earners group may fill. */
export const FAMILY_MEMBER_COLUMNS = [
  'name',
  'relationship_code',
  'age_years',
  'occupation_code',
  'monthly_income',
] as const;
export type FamilyMemberColumn = (typeof FAMILY_MEMBER_COLUMNS)[number];
export const isFamilyMemberColumn = (column: string): column is FamilyMemberColumn =>
  (FAMILY_MEMBER_COLUMNS as readonly string[]).includes(column);

/**
 * The reference list a coded column takes its codes from: the database keeps each of these codes
 * against its list, so the options of a question that fills one are the list's, never the
 * builder's own. A question inside a repeat group fills a family member's
 * column, any other question the profile's.
 */
const PROFILE_COLUMN_LISTS: ReadonlyMap<string, string> = new Map([
  ['gender_code', 'gender'],
  ['mobile_owner_code', 'mobile_owner'],
  ['guardian_relation_code', 'guardian_relation'],
  ['marital_status_code', 'marital_status'],
  ['education_code', 'education_level'],
]);
const MEMBER_COLUMN_LISTS: ReadonlyMap<string, string> = new Map([
  ['relationship_code', 'relationship'],
]);

/** The reference list whose codes a question's options must be, or null for a free question. */
export function listOfField(field: {
  standardColumn?: string | null;
  settings?: { repeat?: { group?: string } } | null;
}): string | null {
  const column = field.standardColumn;
  if (!column) return null;
  const lists = field.settings?.repeat?.group ? MEMBER_COLUMN_LISTS : PROFILE_COLUMN_LISTS;
  return lists.get(column) ?? null;
}
