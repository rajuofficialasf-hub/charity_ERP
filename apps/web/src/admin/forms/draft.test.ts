import { formDefinitionSchema } from '@css/shared/forms';
import { describe, expect, it } from 'vitest';
import { definition, field, keysOf, option, section, T } from '../../../test/forms';
import {
  addLibraryField,
  addLibrarySection,
  addOwnQuestion,
  coreLocks,
  moveField,
  moveSection,
  removeField,
  removeSection,
  setSectionCondition,
  setSectionVisibility,
  updateField,
} from './draft';

const valid = (def: Parameters<typeof formDefinitionSchema.parse>[0]) =>
  expect(formDefinitionSchema.safeParse(def).success).toBe(true);

/** The library as the builder reads it: each field ready to place, a repeat group with its members. */
const library = {
  sections: [
    {
      key: 'family_income',
      title: T('পরিবার ও আয়', 'Family and income'),
      defaultVisibility: 'volunteer',
      fieldKeys: ['members_14_plus', 'children_under_14', 'earners'],
    },
    {
      key: 'official',
      title: T('অফিসিয়াল', 'Official'),
      defaultVisibility: 'official_only',
      fieldKeys: ['local_imam_name'],
    },
  ],
  fields: new Map([
    [
      'members_14_plus',
      [field('members_14_plus', 'number', { libraryFieldKey: 'members_14_plus' })],
    ],
    [
      'children_under_14',
      [field('children_under_14', 'number', { libraryFieldKey: 'children_under_14' })],
    ],
    [
      'earners',
      [
        field('earners', 'repeat_group', {
          libraryFieldKey: 'earners',
          settings: { repeat: { max_rows: 5 } },
        }),
        field('earner_name', 'short_text', { settings: { repeat: { group: 'earners' } } }),
        field('earner_income', 'money', { settings: { repeat: { group: 'earners' } } }),
      ],
    ],
    [
      'local_imam_name',
      [field('local_imam_name', 'short_text', { libraryFieldKey: 'local_imam_name' })],
    ],
  ]),
};

describe('adding from the library', () => {
  it('brings a section with its fields in library order and its default visibility', () => {
    const next = addLibrarySection(definition(), library.sections[0]!, library.fields);
    const added = next.sections.at(-1)!;
    expect(added).toMatchObject({
      key: 'family_income',
      librarySectionKey: 'family_income',
      visibility: 'volunteer',
    });
    expect(added.fields.map((f) => f.fieldKey)).toEqual([
      'members_14_plus',
      'children_under_14',
      'earners',
      'earner_name',
      'earner_income',
    ]);
    valid(next);
    const official = addLibrarySection(next, library.sections[1]!, library.fields);
    expect(official.sections.at(-1)!.visibility).toBe('official_only');
  });

  it('adds a section only once and never repeats a field the form already has', () => {
    const once = addLibrarySection(definition(), library.sections[0]!, library.fields);
    expect(addLibrarySection(once, library.sections[0]!, library.fields)).toBe(once);
    const withField = addLibraryField(
      once,
      'family_income',
      library.fields.get('members_14_plus')!,
    );
    expect(withField).toBe(once);
  });

  it('adds one library field, with its repeat members, at the end of a section', () => {
    const next = addLibraryField(
      definition(section('extra', [])),
      'extra',
      library.fields.get('earners')!,
    );
    expect(next.sections.at(-1)!.fields.map((f) => f.fieldKey)).toEqual([
      'earners',
      'earner_name',
      'earner_income',
    ]);
    valid(next);
  });
});

describe('the project own question', () => {
  it('gets a key from its English label, unique in the form, and keeps it', () => {
    const base = definition(section('project_questions', []));
    const question = {
      type: 'radio' as const,
      label: T('আপনার কি নিজের ঘর আছে?', 'Do you have your own house?'),
      options: [
        option('yes', { label: T('হ্যাঁ', 'Yes') }),
        option('no', { label: T('না', 'No') }),
      ],
    };
    const first = addOwnQuestion(base, 'project_questions', question);
    expect(first.fieldKey).toBe('q_do_you_have_your_own_house');
    const second = addOwnQuestion(first.definition, 'project_questions', question);
    expect(second.fieldKey).toBe('q_do_you_have_your_own_house_2');
    const added = second.definition.sections.at(-1)!.fields;
    expect(added.map((f) => f.libraryFieldKey)).toEqual([null, null]);
    expect(added[0]!.options!.map((o) => o.code)).toEqual(['yes', 'no']);
    valid(second.definition);
  });

  it('keeps the key of an own question after its label changes', () => {
    const { definition: def, fieldKey } = addOwnQuestion(
      definition(section('project_questions', [])),
      'project_questions',
      {
        type: 'short_text',
        label: T('পেশা', 'Work'),
      },
    );
    const renamed = updateField(def, fieldKey, { label: T('বর্তমান পেশা', 'Current work') });
    expect(keysOf(renamed)).toContain(fieldKey);
  });

  it('gives a label with no Latin letters a numbered key', () => {
    const { fieldKey } = addOwnQuestion(
      definition(section('project_questions', [])),
      'project_questions',
      {
        type: 'short_text',
        label: T('পেশা', 'পেশা'),
      },
    );
    expect(fieldKey).toMatch(/^q_\d+$/);
  });
});

describe('the core fields', () => {
  it('cannot be removed, made optional, given a condition or moved into an official-only section', () => {
    const def = definition();
    expect(coreLocks(def.sections[0]!.fields[0]!)).toEqual({
      remove: true,
      optional: true,
      condition: true,
    });
    expect(removeField(def, 'name')).toBe(def);
    expect(
      updateField(def, 'name', { required: false }).sections[0]!.fields.find(
        (f) => f.fieldKey === 'name',
      )!.required,
    ).toBe(true);
    expect(
      updateField(def, 'name', {
        logic: { show_if: { field: 'gender', op: 'eq', value: 'male' } },
      }).sections[0]!.fields.find((f) => f.fieldKey === 'name')!.logic,
    ).toBeUndefined();
    expect(setSectionVisibility(def, 'basic_info', 'official_only')).toBe(def);
    expect(setSectionCondition(def, 'address', { field: 'gender', op: 'eq', value: 'male' })).toBe(
      def,
    );
    expect(removeSection(def, 'address')).toBe(def);
  });

  it('can still have their labels and help text changed', () => {
    const next = updateField(definition(), 'village', {
      label: T('গ্রাম/মহল্লা', 'Village or area'),
    });
    expect(next.sections[1]!.fields[1]!.label).toEqual(T('গ্রাম/মহল্লা', 'Village or area'));
  });

  it('leave other fields free', () => {
    expect(coreLocks(field('remark', 'short_text'))).toEqual({
      remove: false,
      optional: false,
      condition: false,
    });
  });
});

describe('ordering', () => {
  const extra = () =>
    definition(
      section('family_income', [
        field('members_14_plus', 'number'),
        field('earners', 'repeat_group'),
        field('earner_name', 'short_text', { settings: { repeat: { group: 'earners' } } }),
        field('earner_income', 'money', { settings: { repeat: { group: 'earners' } } }),
        field('daily_income', 'money'),
      ]),
    );

  it('moves a section up and down, and does nothing at either end', () => {
    const def = extra();
    expect(moveSection(def, 'family_income', -1).sections.map((s) => s.key)).toEqual([
      'basic_info',
      'family_income',
      'address',
    ]);
    expect(moveSection(def, 'basic_info', -1)).toBe(def);
    expect(moveSection(def, 'family_income', 1)).toBe(def);
  });

  it('moves a repeat group with its members, and a member only inside its group', () => {
    const def = extra();
    const keys = (d: typeof def) => d.sections[2]!.fields.map((f) => f.fieldKey);
    expect(keys(moveField(def, 'family_income', 'earners', -1))).toEqual([
      'earners',
      'earner_name',
      'earner_income',
      'members_14_plus',
      'daily_income',
    ]);
    expect(keys(moveField(def, 'family_income', 'daily_income', -1))).toEqual([
      'members_14_plus',
      'daily_income',
      'earners',
      'earner_name',
      'earner_income',
    ]);
    expect(keys(moveField(def, 'family_income', 'earner_income', -1))).toEqual([
      'members_14_plus',
      'earners',
      'earner_income',
      'earner_name',
      'daily_income',
    ]);
    expect(moveField(def, 'family_income', 'earner_name', -1)).toBe(def);
    expect(moveField(def, 'family_income', 'members_14_plus', -1)).toBe(def);
    valid(moveField(def, 'family_income', 'earners', -1));
  });

  it('removes a repeat group with its members', () => {
    expect(keysOf(removeField(extra(), 'earners'))).not.toEqual(
      expect.arrayContaining(['earners', 'earner_name']),
    );
    expect(keysOf(removeField(extra(), 'earners'))).toContain('daily_income');
  });
});
