import { describe, expect, it } from 'vitest';
import {
  blankDefinition,
  checkDefinition,
  definitionFromTemplate,
  formDefinitionSchema,
  TemplateError,
  type FormTemplateForm,
  type LibraryField,
  type LibraryOption,
  type LibrarySection,
  type TemplateSources,
} from './index.js';

// A project's form built from the library shapes: the core alone, or a template's sections.
const libraryFields: LibraryField[] = [
  {
    key: 'nid_or_birth_reg',
    type: 'short_text',
    bn: 'NID',
    en: 'NID',
    standard: 'nid_or_birth_reg',
    settings: { validation: { pattern: 'nid' } },
  },
  { key: 'mobile', type: 'phone', bn: 'Mobile', en: 'Mobile', standard: 'mobile' },
  { key: 'name', type: 'short_text', bn: 'Name', en: 'Name', standard: 'name' },
  {
    key: 'father_or_husband_name',
    type: 'short_text',
    bn: 'Father',
    en: 'Father',
    standard: 'father_or_husband_name',
  },
  {
    key: 'gender',
    type: 'single_select',
    bn: 'Gender',
    en: 'Gender',
    standard: 'gender_code',
    settings: { options_from_reference_list: 'gender' },
  },
  {
    key: 'address',
    type: 'bd_address',
    bn: 'Address',
    en: 'Address',
    standard: 'division_id,district_id,upazila_id,union_id',
  },
  {
    key: 'village',
    type: 'short_text',
    bn: 'Village',
    en: 'Village',
    standard: 'village',
    settings: { validation: { pattern: 'bangla_text' } },
  },
  {
    key: 'beneficiary_class',
    type: 'single_select',
    bn: 'Class',
    en: 'Class',
    standard: 'class_code',
    settings: { options_from_reference_list: 'beneficiary_class_default', allows_other_text: true },
  },
  { key: 'members', type: 'number', bn: 'Members', en: 'Members', standard: 'members_14_plus' },
  {
    key: 'earners',
    type: 'repeat_group',
    bn: 'Earners',
    en: 'Earners',
    standard: 'beneficiary_family_members',
    settings: {
      repeat: { max_rows: 10 },
      repeat_fields: [
        {
          key: 'earner_name',
          type: 'short_text',
          label_bn: 'Name',
          label_en: 'Name',
          standard: 'name',
          required: true,
        },
        {
          key: 'earner_income',
          type: 'money',
          label_bn: 'Income',
          label_en: 'Income',
          standard: 'monthly_income',
        },
      ],
    },
  },
  {
    key: 'total',
    type: 'calculation',
    bn: 'Total',
    en: 'Total',
    settings: {
      calculation: { expr: { sum_repeat: { group: 'earners', field: 'earner_income' } } },
    },
  },
];
const librarySections: LibrarySection[] = [
  {
    key: 'basic_info',
    bn: 'Basic',
    en: 'Basic',
    visibility: 'volunteer',
    fields: [
      'nid_or_birth_reg',
      'mobile',
      'name',
      'father_or_husband_name',
      'gender',
      'beneficiary_class',
    ],
  },
  {
    key: 'address',
    bn: 'Address',
    en: 'Address',
    visibility: 'volunteer',
    fields: ['address', 'village'],
  },
  {
    key: 'family',
    bn: 'Family',
    en: 'Family',
    visibility: 'volunteer',
    fields: ['members', 'earners', 'total'],
  },
];
const lists: Record<string, LibraryOption[]> = {
  gender: [
    { code: 'male', label_bn: 'M', label_en: 'Male' },
    { code: 'female', label_bn: 'F', label_en: 'Female' },
  ],
  beneficiary_class_default: [
    { code: 'widow', label_bn: 'W', label_en: 'Widow' },
    { code: 'other', label_bn: 'O', label_en: 'Other' },
  ],
};
const sources: TemplateSources = {
  libraryFields,
  librarySections,
  resolveList: (key) => (Object.hasOwn(lists, key) ? lists[key]! : []),
};

describe('a blank form', () => {
  it('holds the mandatory core only, required, in the library sections, and is valid', () => {
    const definition = blankDefinition(sources);
    expect(definition.sections.map((s) => [s.key, s.fields.map((f) => f.fieldKey)])).toEqual([
      ['basic_info', ['nid_or_birth_reg', 'mobile', 'name', 'father_or_husband_name', 'gender']],
      ['address', ['address', 'village']],
    ]);
    expect(definition.sections.flatMap((s) => s.fields).every((f) => f.required)).toBe(true);
    expect(definition.sections[0]!.title).toEqual({ bn: 'Basic', en: 'Basic' });
    expect(checkDefinition(definition)).toEqual([]);
    expect(formDefinitionSchema.safeParse(definition).success).toBe(true);
  });
});

describe('a form from a template', () => {
  const template: FormTemplateForm = {
    title_bn: 'T',
    title_en: 'T',
    sections: [
      {
        key: 'basic_info',
        visibility: 'volunteer',
        fields: [
          { key: 'nid_or_birth_reg', required: true },
          { key: 'mobile', required: true },
          { key: 'name', required: true },
          { key: 'father_or_husband_name', required: true },
          { key: 'gender', required: true },
          { key: 'beneficiary_class', required: false },
        ],
      },
      {
        key: 'address',
        visibility: 'volunteer',
        fields: [
          { key: 'address', required: true },
          { key: 'village', required: true },
        ],
      },
      {
        key: 'family',
        visibility: 'official_only',
        fields: [
          { key: 'members', required: false },
          { key: 'earners', required: false, show_if: { field: 'members', op: 'gt', value: 1 } },
          { key: 'total', required: false },
        ],
      },
    ],
  };

  it('copies the reference-list options into the form and marks the other option', () => {
    const definition = definitionFromTemplate(template, sources);
    const classField = definition.sections[0]!.fields.find(
      (f) => f.fieldKey === 'beneficiary_class',
    )!;
    expect(classField.options).toEqual([
      { code: 'widow', label: { bn: 'W', en: 'Widow' } },
      { code: 'other', label: { bn: 'O', en: 'Other' }, allowsOtherText: true },
    ]);
    expect(classField).toMatchObject({
      libraryFieldKey: 'beneficiary_class',
      standardColumn: 'class_code',
      required: false,
    });
    expect(
      definition.sections[0]!.fields.find((f) => f.fieldKey === 'gender')!.options?.map(
        (o) => o.code,
      ),
    ).toEqual(['male', 'female']);
    expect(checkDefinition(definition)).toEqual([]);
  });

  it('places the members of a repeat group after it, marked with their group, and keeps the calculation', () => {
    const definition = definitionFromTemplate(template, sources);
    const family = definition.sections[2]!;
    expect(family.visibility).toBe('official_only');
    expect(family.fields.map((f) => f.fieldKey)).toEqual([
      'members',
      'earners',
      'earner_name',
      'earner_income',
      'total',
    ]);
    expect(family.fields[1]).toMatchObject({
      settings: { repeat: { max_rows: 10 } },
      logic: { show_if: { field: 'members', op: 'gt', value: 1 } },
    });
    expect(family.fields[2]).toMatchObject({
      libraryFieldKey: null,
      required: true,
      standardColumn: 'name',
      settings: { repeat: { group: 'earners' } },
    });
    expect(family.fields[4]!.calculation).toEqual({
      expr: { sum_repeat: { group: 'earners', field: 'earner_income' } },
    });
    expect(definition.sections[1]!.fields[1]!.settings).toEqual({
      validation: { pattern: 'bangla_text' },
    });
  });

  it('refuses a template that names a field or a section the library lacks', () => {
    const badField = {
      ...template,
      sections: [{ ...template.sections[0]!, fields: [{ key: 'nope', required: false }] }],
    };
    expect(() => definitionFromTemplate(badField, sources)).toThrow(TemplateError);
    const badSection = {
      ...template,
      sections: [{ key: 'nope', visibility: 'volunteer' as const, fields: [] }],
    };
    expect(() => definitionFromTemplate(badSection, sources)).toThrow(
      /form.unknown_library_section/u,
    );
  });

  it('gives a field an empty option list when its reference list is unknown', () => {
    const definition = definitionFromTemplate(template, { ...sources, resolveList: () => [] });
    expect(definition.sections[0]!.fields.find((f) => f.fieldKey === 'gender')!.options).toEqual(
      [],
    );
  });
});
