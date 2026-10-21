import type { FieldType } from './library.js';

/**
 * The mandatory core of every application form: the fields every project collects, each with its
 * type and the beneficiary column it fills. A definition without one of them, with one that is
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

/** The library sections the core fields sit in when a form starts blank. */
export const CORE_SECTIONS: readonly { key: string; fields: readonly CoreFieldKey[] }[] = [
  {
    key: 'basic_info',
    fields: ['nid_or_birth_reg', 'mobile', 'name', 'father_or_husband_name', 'gender'],
  },
  { key: 'address', fields: ['address', 'village'] },
];

/**
 * The only beneficiary columns a form may fill, taken from the standard fields of the library:
 * the identity, the names, the contact and address data, the family and income figures and the
 * photo. A definition naming any other column is refused, so no form can write a status, a flag
 * or an audit column of the profile. The two comma-separated entries are the exact chains the
 * address and the GPS fields fill.
 */
export const STANDARD_COLUMNS = [
  'nid_or_birth_reg',
  'mobile',
  'name',
  'father_or_husband_name',
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
  'occupation_code',
  'monthly_income',
] as const;
export type FamilyMemberColumn = (typeof FAMILY_MEMBER_COLUMNS)[number];
export const isFamilyMemberColumn = (column: string): column is FamilyMemberColumn =>
  (FAMILY_MEMBER_COLUMNS as readonly string[]).includes(column);
