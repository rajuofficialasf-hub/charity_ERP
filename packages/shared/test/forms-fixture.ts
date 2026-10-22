import type {
  Answer,
  FieldOption,
  FieldType,
  FormDefinition,
  FormField,
  FormSection,
} from '../src/forms/index.js';

/**
 * Small definitions for the engine tests: the mandatory core in its two sections, plus whatever
 * fields or sections a test adds. Labels carry the same text in both languages; the tests of the
 * seeded forms use the real bilingual library.
 */
export const T = (text: string) => ({ bn: text, en: text });

export const DIVISION = '0190a1b2-c3d4-7e5f-8a9b-000000000001';
export const DISTRICT = '0190a1b2-c3d4-7e5f-8a9b-000000000002';
export const UPAZILA = '0190a1b2-c3d4-7e5f-8a9b-000000000003';
export const UNION = '0190a1b2-c3d4-7e5f-8a9b-000000000004';
export const FILE_ID = '0190a1b2-c3d4-7e5f-8a9b-00000000000f';

export const field = (
  key: string,
  type: FieldType,
  overrides: Partial<FormField> = {},
): FormField => ({
  fieldKey: key,
  type,
  label: T(key),
  required: false,
  ...overrides,
});

export const option = (code: string, overrides: Partial<FieldOption> = {}): FieldOption => ({
  code,
  label: T(code),
  ...overrides,
});

export const yesNo = (key: string, overrides: Partial<FormField> = {}): FormField =>
  field(key, 'radio', { options: [option('yes'), option('no')], ...overrides });

export const coreFields = (): FormField[] => [
  field('nid_or_birth_reg', 'short_text', {
    required: true,
    standardColumn: 'nid_or_birth_reg',
    settings: { validation: { pattern: 'nid' } },
  }),
  field('mobile', 'phone', { required: true, standardColumn: 'mobile' }),
  field('name', 'short_text', { required: true, standardColumn: 'name' }),
  field('father_or_husband_name', 'short_text', {
    required: true,
    standardColumn: 'father_or_husband_name',
  }),
  field('gender', 'single_select', {
    required: true,
    standardColumn: 'gender_code',
    options: [option('male'), option('female')],
  }),
];

export const addressFields = (): FormField[] => [
  field('address', 'bd_address', {
    required: true,
    standardColumn: 'division_id,district_id,upazila_id,union_id',
  }),
  field('village', 'short_text', { required: true, standardColumn: 'village' }),
];

export const section = (
  key: string,
  fields: FormField[],
  overrides: Partial<FormSection> = {},
): FormSection => ({
  key,
  title: T(key),
  visibility: 'volunteer',
  condition: null,
  fields,
  ...overrides,
});

/** The core, then the given fields in a section `more`, then any further sections. */
export function definitionWith(
  fields: FormField[] = [],
  sections: FormSection[] = [],
): FormDefinition {
  return {
    sections: [
      section('basic_info', coreFields()),
      section('address', addressFields()),
      ...(fields.length ? [section('more', fields)] : []),
      ...sections,
    ],
  };
}

/** Valid answers for the core. */
export const coreAnswers = (): Answer[] => [
  { fieldKey: 'nid_or_birth_reg', value: { t: 'short_text', v: '1234567890' } },
  { fieldKey: 'mobile', value: { t: 'phone', v: '01712345678' } },
  { fieldKey: 'name', value: { t: 'short_text', v: 'Rahima Khatun' } },
  { fieldKey: 'father_or_husband_name', value: { t: 'short_text', v: 'Abdul Karim' } },
  { fieldKey: 'gender', value: { t: 'single_select', v: 'female' } },
  {
    fieldKey: 'address',
    value: {
      t: 'bd_address',
      division_id: DIVISION,
      district_id: DISTRICT,
      upazila_id: UPAZILA,
      union_id: UNION,
    },
  },
  { fieldKey: 'village', value: { t: 'short_text', v: 'Charpara' } },
];

export const TODAY = '2026-10-21';
