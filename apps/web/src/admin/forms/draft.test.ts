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
    expect(fieldKey).toBe('q_work');
    const renamed = updateField(def, 'q_work', { label: T('বর্তমান পেশা', 'Current work') });
    expect(keysOf(renamed)).toContain('q_work');
  });

  it('places a row question after the last field of its repeat group, and lets options follow an earlier answer', () => {
    const base = definition(
      section('family', [
        field('occupation', 'radio', {
          options: [option('business'), option('farming')],
        }),
        field('earners', 'repeat_group', { settings: { repeat: { min_rows: 0, max_rows: 5 } } }),
        field('earner_name', 'short_text', { settings: { repeat: { group: 'earners' } } }),
        field('family_note', 'long_text'),
      ]),
    );
    const inGroup = addOwnQuestion(base, 'family', {
      type: 'money',
      label: T('আয়', 'Income'),
      group: 'earners',
    });
    expect(inGroup.definition.sections.at(-1)!.fields.map((f) => f.fieldKey)).toEqual([
      'occupation',
      'earners',
      'earner_name',
      'q_income',
      'family_note',
    ]);
    expect(inGroup.definition.sections.at(-1)!.fields[3]!.settings).toEqual({
      repeat: { group: 'earners' },
    });
    const branching = addOwnQuestion(inGroup.definition, 'family', {
      type: 'single_select',
      label: T('কাজের ধরন', 'Kind of work'),
      dependsOn: 'occupation',
      options: [option('shop', { dependsOnOptionCode: 'business' })],
    });
    const added = branching.definition.sections.at(-1)!.fields.at(-1)!;
    expect(added.logic).toEqual({ options_depend_on: 'occupation' });
    valid(branching.definition);
    // a group inside a group, or a group the section does not hold, adds nothing
    expect(
      addOwnQuestion(base, 'family', { type: 'repeat_group', label: T('দল'), group: 'earners' })
        .fieldKey,
    ).toBeNull();
    expect(
      addOwnQuestion(base, 'family', { type: 'short_text', label: T('x'), group: 'occupation' })
        .fieldKey,
    ).toBeNull();
  });

  it('adds nothing and names no key for a section the form does not have', () => {
    const def = definition();
    const result = addOwnQuestion(def, 'no_such_section', {
      type: 'short_text',
      label: T('x', 'x'),
    });
    expect(result).toEqual({ definition: def, fieldKey: null });
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

describe('the other sections and fields', () => {
  const extraSection = () =>
    section('loans', [field('has_loan', 'radio'), field('loan_total', 'money')]);

  it('make a section official-only, give it a condition, and remove it', () => {
    const def = definition(extraSection());
    expect(setSectionVisibility(def, 'loans', 'official_only').sections[2]!.visibility).toBe(
      'official_only',
    );
    expect(setSectionVisibility(def, 'loans', 'volunteer')).toBe(def);
    const when = { field: 'gender', op: 'eq' as const, value: 'female' };
    expect(setSectionCondition(def, 'loans', when).sections[2]!.condition).toEqual(when);
    expect(setSectionCondition(def, 'loans', null).sections[2]!.condition).toBeNull();
    expect(removeSection(def, 'loans').sections.map((s) => s.key)).toEqual([
      'basic_info',
      'address',
    ]);
    expect(removeSection(def, 'no_such_section')).toBe(def);
  });

  it('change a field that is not core: required, a condition, a setting', () => {
    const when = { field: 'has_loan', op: 'eq' as const, value: 'yes' };
    const next = updateField(definition(extraSection()), 'loan_total', {
      required: true,
      logic: { show_if: when },
      settings: { validation: { min: 0 } },
    });
    expect(next.sections[2]!.fields[1]).toMatchObject({
      fieldKey: 'loan_total',
      required: true,
      logic: { show_if: when },
      settings: { validation: { min: 0 } },
    });
    valid(next);
    const def = definition();
    expect(updateField(def, 'no_such_field', { required: true })).toBe(def);
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
    expect(extra().sections[2]!.fields.length).toBe(5);
    expect(removeField(extra(), 'earners').sections[2]!.fields.map((f) => f.fieldKey)).toEqual([
      'members_14_plus',
      'daily_income',
    ]);
  });
});
