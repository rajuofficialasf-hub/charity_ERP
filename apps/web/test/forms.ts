import type {
  FieldOption,
  FieldType,
  FormDefinition,
  FormField,
  FormSection,
} from '@css/shared/forms';

/**
 * Small form definitions for the builder and renderer tests: the mandatory core in its two
 * sections, plus whatever a test adds. A label carries one text for both languages unless a test
 * gives two.
 */
export const T = (text: string, en = text) => ({ bn: text, en });

export const field = (
  key: string,
  type: FieldType,
  overrides: Partial<FormField> = {},
): FormField => ({
  fieldKey: key,
  libraryFieldKey: null,
  type,
  label: T(key),
  required: false,
  standardColumn: null,
  settings: {},
  options: [],
  ...overrides,
});

export const option = (code: string, overrides: Partial<FieldOption> = {}): FieldOption => ({
  code,
  label: T(code),
  dependsOnOptionCode: null,
  allowsOtherText: false,
  ...overrides,
});

export const section = (
  key: string,
  fields: FormField[],
  overrides: Partial<FormSection> = {},
): FormSection => ({
  key,
  librarySectionKey: null,
  title: T(key),
  visibility: 'volunteer',
  condition: null,
  fields,
  ...overrides,
});

/** The mandatory core: identity, names, mobile and gender, then the address and the village. */
export const coreSections = (): FormSection[] => [
  section('basic_info', [
    field('nid_or_birth_reg', 'short_text', {
      required: true,
      standardColumn: 'nid_or_birth_reg',
      libraryFieldKey: 'nid_or_birth_reg',
      settings: { validation: { pattern: 'nid' } },
    }),
    field('mobile', 'phone', {
      required: true,
      standardColumn: 'mobile',
      libraryFieldKey: 'mobile',
    }),
    field('name', 'short_text', {
      required: true,
      standardColumn: 'name',
      libraryFieldKey: 'name',
    }),
    field('father_or_husband_name', 'short_text', {
      required: true,
      standardColumn: 'father_or_husband_name',
      libraryFieldKey: 'father_or_husband_name',
    }),
    field('gender', 'single_select', {
      required: true,
      standardColumn: 'gender_code',
      libraryFieldKey: 'gender',
      options: [option('male'), option('female')],
    }),
  ]),
  section('address', [
    field('address', 'bd_address', {
      required: true,
      standardColumn: 'division_id,district_id,upazila_id,union_id',
      libraryFieldKey: 'address',
    }),
    field('village', 'short_text', {
      required: true,
      standardColumn: 'village',
      libraryFieldKey: 'village',
    }),
  ]),
];

/** The core plus the sections a test adds after it. */
export const definition = (...more: FormSection[]): FormDefinition => ({
  sections: [...coreSections(), ...more],
});

/** Every field key of a definition, in order. */
export const keysOf = (def: FormDefinition) =>
  def.sections.flatMap((s) => s.fields.map((f) => f.fieldKey));
