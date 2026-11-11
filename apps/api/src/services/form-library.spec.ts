import type { FormDefinition, FormFieldDefinition } from '@css/shared/forms';
import { describe, expect, it } from 'vitest';
import { libraryOf } from './form-library.js';

// The question library read from the library form: its sections, and each top question ready to
// place, a repeat group with its members after it.
const question = (
  fieldKey: string,
  extra: Partial<FormFieldDefinition> = {},
): FormFieldDefinition => ({
  fieldKey,
  libraryFieldKey: null,
  type: 'short_text',
  label: { bn: fieldKey, en: fieldKey },
  required: false,
  standardColumn: null,
  settings: {},
  options: [],
  ...extra,
});
const member = (fieldKey: string, group: string) =>
  question(fieldKey, { settings: { repeat: { group } } });

const definition: FormDefinition = {
  sections: [
    {
      key: 'family',
      librarySectionKey: null,
      title: { bn: 'পরিবার', en: 'Family' },
      visibility: 'volunteer',
      condition: null,
      fields: [
        question('income', { type: 'number', standardColumn: null }),
        question('members', { type: 'repeat_group' }),
        member('member_name', 'members'),
        member('member_age', 'members'),
      ],
    },
    {
      key: 'office',
      librarySectionKey: null,
      title: { bn: 'অফিস', en: 'Office' },
      visibility: 'official_only',
      condition: null,
      fields: [question('remark', { type: 'long_text' })],
    },
  ],
};

describe('the library from the library form', () => {
  it('lists each section with its top questions and its visibility', () => {
    expect(libraryOf(definition).sections).toEqual([
      {
        key: 'family',
        title: { bn: 'পরিবার', en: 'Family' },
        defaultVisibility: 'volunteer',
        fieldKeys: ['income', 'members'],
      },
      {
        key: 'office',
        title: { bn: 'অফিস', en: 'Office' },
        defaultVisibility: 'official_only',
        fieldKeys: ['remark'],
      },
    ]);
  });

  it('gives a repeat group its members after it, and never lists a member on its own', () => {
    const { fields } = libraryOf(definition);
    expect(fields.map((f) => f.key)).toEqual(['income', 'members', 'remark']);
    const group = fields.find((f) => f.key === 'members')!;
    expect(group.formFields.map((f) => f.fieldKey)).toEqual([
      'members',
      'member_name',
      'member_age',
    ]);
    expect(fields.find((f) => f.key === 'income')!.formFields.map((f) => f.fieldKey)).toEqual([
      'income',
    ]);
  });

  it('is empty for a library with no section', () => {
    expect(libraryOf({ sections: [] })).toEqual({ sections: [], fields: [] });
  });
});
