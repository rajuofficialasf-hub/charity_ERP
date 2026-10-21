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
