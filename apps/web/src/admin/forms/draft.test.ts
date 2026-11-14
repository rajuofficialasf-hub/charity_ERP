import {
  checkDefinition,
  type FormDefinition,
  type FormField,
  formDefinitionSchema,
  identityRoleOf,
  listOfField,
} from '@css/shared/forms';
import { describe, expect, it } from 'vitest';
import { definition, field, keysOf, option, section, T } from '../../../test/forms';
import {
  addEmptySection,
  addIdentityQuestions,
  addLibraryField,
  addMobileOwnerQuestions,
  addLibrarySection,
  addOwnQuestion,
  coreLocks,
  duplicateField,
  emptyOption,
  insertOptionAfter,
  lacksMobileOwnerQuestion,
  missingIdentityRoles,
  missingIn,
  missingTextCount,
  moveField,
  moveFieldTo,
  moveSection,
  pastedLines,
  pasteOptions,
  setOptions,
  removeField,
  removeFieldWithUses,
  removeSection,
  removeSectionWithUses,
  setFormScoring,
  setSectionCondition,
  setIdentityRole,
  setSectionTitle,
  setSectionVisibility,
  setText,
  textsOf,
  updateField,
  usesOf,
  usesOfSection,
  yesNoOptions,
} from './draft';
import * as draftEdits from './draft';
import { missingTexts, publishEntries } from './publish-entries';

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

/** A key maker that hands out the given keys in turn, so a test knows the key a question takes. */
const keysFrom = (...keys: string[]) => {
  let next = 0;
  return () => keys[Math.min(next++, keys.length - 1)]!;
};
const RANDOM_KEY = /^q_[a-z0-9]{6}$/;

describe('the project own question', () => {
  it('starts empty, with a key of q_ and six letters or digits that is different each time', () => {
    const base = definition(section('project_questions', []));
    const first = addOwnQuestion(base, 'project_questions', { type: 'radio' });
    expect(first.fieldKey).toMatch(RANDOM_KEY);
    const second = addOwnQuestion(first.definition, 'project_questions', { type: 'radio' });
    expect(second.fieldKey).toMatch(RANDOM_KEY);
    expect(second.fieldKey).not.toBe(first.fieldKey);
    const added = second.definition.sections.at(-1)!.fields;
    expect(added.map((f) => f.fieldKey)).toEqual([first.fieldKey, second.fieldKey]);
    // no text yet, no option yet: the settings pane is where they are written
    for (const question of added)
      expect(question).toMatchObject({
        type: 'radio',
        label: { bn: '', en: '' },
        libraryFieldKey: null,
        standardColumn: null,
        required: false,
        options: [],
        settings: {},
      });
    valid(second.definition);
    // many questions, many keys
    let def = base;
    const keys = new Set<string>();
    for (let n = 0; n < 60; n += 1) {
      const made = addOwnQuestion(def, 'project_questions', { type: 'short_text' });
      def = made.definition;
      keys.add(made.fieldKey!);
    }
    expect(keys.size).toBe(60);
    for (const key of keys) expect(key).toMatch(RANDOM_KEY);
  });

  it('draws another key when the form already has the one drawn', () => {
    const base = definition(section('project_questions', [field('q_taken0', 'number')]));
    const made = addOwnQuestion(
      base,
      'project_questions',
      { type: 'short_text' },
      undefined,
      keysFrom('q_taken0', 'name', 'q_fresh1'),
    );
    // `name` is a question of another part: a key is the form's, not the part's
    expect(made.fieldKey).toBe('q_fresh1');
    valid(made.definition);
  });

  it('keeps its key when its text is written and changed: the key never comes from a text', () => {
    const { definition: def, fieldKey } = addOwnQuestion(
      definition(section('project_questions', [])),
      'project_questions',
      { type: 'short_text' },
    );
    const named = updateField(def, fieldKey!, { label: T('পেশা', 'Work') });
    const renamed = updateField(named, fieldKey!, { label: T('বর্তমান পেশা', 'Current work') });
    expect(keysOf(renamed)).toContain(fieldKey);
    expect(fieldKey).not.toContain('work');
  });

  describe('lands', () => {
    const base = definition(
      section('family', [
        field('occupation', 'radio', { options: [option('business'), option('farming')] }),
        field('earners', 'repeat_group', { settings: { repeat: { min_rows: 0, max_rows: 5 } } }),
        field('earner_name', 'short_text', { settings: { repeat: { group: 'earners' } } }),
        field('earner_age', 'number', { settings: { repeat: { group: 'earners' } } }),
        field('family_note', 'long_text'),
      ]),
      section('last', [field('end', 'number')]),
    );
    const add = (question: Parameters<typeof addOwnQuestion>[2], at?: number) =>
      addOwnQuestion(base, 'family', question, at, keysFrom('q_new001'));
    const family = (def: FormDefinition) =>
      def.sections.find((s) => s.key === 'family')!.fields.map((f) => f.fieldKey);
    const added = (def: FormDefinition) =>
      def.sections.flatMap((s) => s.fields).find((f) => f.fieldKey === 'q_new001')!;

    it('right after the question it follows, in the same part', () => {
      const made = add({ type: 'short_text', after: 'occupation' });
      expect(made.fieldKey).toBe('q_new001');
      expect(family(made.definition)).toEqual([
        'occupation',
        'q_new001',
        'earners',
        'earner_name',
        'earner_age',
        'family_note',
      ]);
      expect(added(made.definition).settings).toEqual({});
      valid(made.definition);
      // after the last question of the part, at its end
      expect(family(add({ type: 'short_text', after: 'family_note' }).definition).at(-1)).toBe(
        'q_new001',
      );
    });

    it('at the end of the part when no question is named, or one the part does not hold', () => {
      expect(family(add({ type: 'short_text' }).definition).at(-1)).toBe('q_new001');
      expect(family(add({ type: 'short_text', after: 'end' }).definition).at(-1)).toBe('q_new001');
      expect(family(add({ type: 'short_text', after: 'nothing' }).definition).at(-1)).toBe(
        'q_new001',
      );
    });

    it('in the rows of a repeat group, right after the row question it follows', () => {
      const made = add({ type: 'money', after: 'earner_name' });
      expect(family(made.definition)).toEqual([
        'occupation',
        'earners',
        'earner_name',
        'q_new001',
        'earner_age',
        'family_note',
      ]);
      expect(added(made.definition).settings).toEqual({ repeat: { group: 'earners' } });
      valid(made.definition);
    });

    it('at the end of the rows when the group itself is named, as a question to follow or as the group to join', () => {
      for (const question of [
        { type: 'money' as const, after: 'earners' },
        { type: 'money' as const, group: 'earners' },
      ]) {
        const made = add(question);
        expect(family(made.definition)).toEqual([
          'occupation',
          'earners',
          'earner_name',
          'earner_age',
          'q_new001',
          'family_note',
        ]);
        expect(added(made.definition).settings).toEqual({ repeat: { group: 'earners' } });
        valid(made.definition);
      }
    });

    it('after the whole group when its type cannot sit in rows: a list and a number table', () => {
      const table = {
        rows: [{ key: 'r1', label: T('সারি 1') }],
        cols: [{ key: 'c1', label: T('কলাম 1') }],
      };
      for (const after of ['earners', 'earner_name']) {
        const list = add({ type: 'repeat_group', after });
        expect(family(list.definition)).toEqual([
          'occupation',
          'earners',
          'earner_name',
          'earner_age',
          'q_new001',
          'family_note',
        ]);
        expect(added(list.definition).settings).toEqual({});
        valid(list.definition);
        const numbers = add({ type: 'number_table', after, table });
        expect(family(numbers.definition).indexOf('q_new001')).toBe(4);
        expect(added(numbers.definition).settings).toEqual({ table });
        valid(numbers.definition);
      }
    });

    it('nowhere when it is to join a group that is none of the part, or with a type rows do not take', () => {
      for (const question of [
        { type: 'repeat_group' as const, group: 'earners' },
        { type: 'number_table' as const, group: 'earners' },
        { type: 'short_text' as const, group: 'occupation' },
        { type: 'short_text' as const, group: 'end' },
      ])
        expect(add(question)).toEqual({ definition: base, fieldKey: null });
    });
  });

  it('frees the options of a later question that followed a removed option', () => {
    const base = definition(
      section('work', [
        field('occupation', 'radio', { options: [option('business'), option('farming')] }),
        field('business_kind', 'single_select', {
          logic: { options_depend_on: 'occupation' },
          options: [
            option('shop', { dependsOnOptionCode: 'business' }),
            option('crops', { dependsOnOptionCode: 'farming' }),
          ],
        }),
      ]),
    );
    const next = setOptions(base, 'occupation', [option('farming')]);
    const kinds = next.sections.at(-1)!.fields[1]!.options!;
    expect(kinds.map((o) => o.dependsOnOptionCode)).toEqual([null, 'farming']);
    valid(next);
  });

  it('moves a question to a place in another section, a group with its members, an identity question too', () => {
    const def = definition(
      section('one', [
        field('a', 'number'),
        field('g', 'repeat_group'),
        field('m', 'short_text', { settings: { repeat: { group: 'g' } } }),
        field('b', 'number'),
      ]),
      section('two', [field('c', 'number')]),
    );
    const moved = moveFieldTo(def, 'g', 'two', 0);
    expect(moved.sections.at(-2)!.fields.map((f) => f.fieldKey)).toEqual(['a', 'b']);
    expect(moved.sections.at(-1)!.fields.map((f) => f.fieldKey)).toEqual(['g', 'm', 'c']);
    valid(moved);
    // inside one section the index counts blocks, so b goes before the group
    const within = moveFieldTo(def, 'b', 'one', 1);
    expect(within.sections.at(-2)!.fields.map((f) => f.fieldKey)).toEqual(['a', 'b', 'g', 'm']);
    // the same place is no change; a member stays in its group; an identity question moves
    expect(moveFieldTo(def, 'a', 'one', 0)).toBe(def);
    expect(moveFieldTo(def, 'm', 'two', 0)).toBe(def);
    const marked = moveFieldTo(def, 'name', 'two', 0);
    expect(marked.sections.at(-1)!.fields.map((f) => f.fieldKey)).toEqual(['name', 'c']);
  });

  it('puts an own question at a dropped place, counted in blocks', () => {
    const def = definition(
      section('one', [
        field('a', 'number'),
        field('g', 'repeat_group'),
        field('m', 'short_text', { settings: { repeat: { group: 'g' } } }),
        field('b', 'number'),
      ]),
    );
    const own = { type: 'short_text' as const };
    const key = () => 'q_new001';
    const placed = addOwnQuestion(def, 'one', own, 2, key);
    expect(placed.definition.sections.at(-1)!.fields.map((f) => f.fieldKey)).toEqual([
      'a',
      'g',
      'm',
      'q_new001',
      'b',
    ]);
    const first = addOwnQuestion(def, 'one', own, 0, key);
    expect(first.definition.sections.at(-1)!.fields[0]!.fieldKey).toBe('q_new001');
    const past = addOwnQuestion(def, 'one', own, 9, key);
    expect(past.definition.sections.at(-1)!.fields.at(-1)!.fieldKey).toBe('q_new001');
    valid(placed.definition);
  });

  it('copies a question after itself with a marked label and a random key of its own', () => {
    const def = definition(
      section('one', [
        field('q_note', 'radio', { label: T('মন্তব্য', 'Note'), options: [option('a')] }),
        field('g', 'repeat_group'),
      ]),
    );
    const mark = { bn: '(কপি)', en: '(copy)' };
    const made = duplicateField(def, 'q_note', mark);
    // never the copied question's key with a mark, never a word of its text
    expect(made.fieldKey).toMatch(RANDOM_KEY);
    expect(made.fieldKey).not.toContain('note');
    expect(duplicateField(def, 'q_note', mark).fieldKey).not.toBe(made.fieldKey);
    const [first, second] = made.definition.sections.at(-1)!.fields;
    expect(second).toMatchObject({
      fieldKey: made.fieldKey,
      libraryFieldKey: null,
      standardColumn: null,
      label: { bn: 'মন্তব্য (কপি)', en: 'Note (copy)' },
      options: first!.options,
    });
    valid(made.definition);
    // a key the form has is drawn again
    expect(duplicateField(def, 'q_note', mark, keysFrom('g', 'q_copy01')).fieldKey).toBe(
      'q_copy01',
    );
    expect(duplicateField(def, 'g', mark).fieldKey).toBeNull();
    // the copy of an identity question carries no mark, so each role stays marked once
    const copied = duplicateField(definition(), 'name', mark);
    const copy = copied.definition.sections[0]!.fields.find((f) => f.fieldKey === copied.fieldKey);
    expect(copy).toMatchObject({ standardColumn: null });
    // a question with no text yet is copied with the mark alone
    const blank = addOwnQuestion(def, 'one', { type: 'short_text' }, undefined, () => 'q_blank1');
    const twin = duplicateField(blank.definition, 'q_blank1', mark, () => 'q_twin01');
    expect(
      twin.definition.sections.at(-1)!.fields.find((f) => f.fieldKey === 'q_twin01')!.label,
    ).toEqual({ bn: '(কপি)', en: '(copy)' });
  });

  it('adds nothing and names no key for a section the form does not have', () => {
    const def = definition();
    const result = addOwnQuestion(def, 'no_such_section', { type: 'short_text' });
    expect(result).toEqual({ definition: def, fieldKey: null });
  });
});

describe('the identity questions', () => {
  it('stay required, without a condition and seen by everyone, and are removed like any other', () => {
    const def = definition();
    expect(coreLocks(def.sections[0]!.fields[0]!)).toEqual({ optional: true, condition: true });
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
    expect(keysOf(removeField(def, 'name'))).not.toContain('name');
    expect(removeSection(def, 'address').sections.map((s) => s.key)).not.toContain('address');
  });

  it('never go into an official-only section', () => {
    const def = definition(
      section('office', [field('remark', 'long_text')], { visibility: 'official_only' }),
    );
    expect(moveFieldTo(def, 'name', 'office', 0)).toBe(def);
  });

  it('are known by their mark, not their key: a question keyed mobile without the mark is free', () => {
    expect(coreLocks(field('mobile', 'phone'))).toEqual({ optional: false, condition: false });
    expect(coreLocks(field('remark', 'short_text'))).toEqual({ optional: false, condition: false });
  });

  it('can still have their labels and help text changed', () => {
    const next = updateField(definition(), 'village', {
      label: T('গ্রাম/মহল্লা', 'Village or area'),
    });
    expect(next.sections[1]!.fields[1]!.label).toEqual(T('গ্রাম/মহল্লা', 'Village or area'));
  });
});

describe('the identity mark', () => {
  const own = () =>
    definition(
      section('mine', [
        field('q_phone', 'short_text', { settings: { validation: { max_length: 20 } } }),
        field('q_age', 'number', {
          logic: { show_if: { field: 'q_phone', op: 'eq', value: 'x' } },
        }),
        field('g', 'repeat_group'),
        field('member', 'short_text', { settings: { repeat: { group: 'g' } } }),
      ]),
      section('office', [field('remark', 'short_text')], { visibility: 'official_only' }),
    );
  const find = (def: ReturnType<typeof own>, key: string) =>
    def.sections.flatMap((s) => s.fields).find((f) => f.fieldKey === key)!;

  it("sets the role's column and type, keeps it required, and takes the role from its earlier holder", () => {
    const def = own();
    const next = setIdentityRole(def, 'q_phone', 'mobile');
    expect(find(next, 'q_phone')).toMatchObject({
      type: 'phone',
      standardColumn: 'mobile',
      required: true,
      settings: {},
    });
    // the core section's mobile question held the role before; it loses the mark
    expect(find(next, 'mobile').standardColumn).toBeNull();
    valid(next);
  });

  it('drops the show condition of the marked question, and clears the mark on request', () => {
    const marked = setIdentityRole(own(), 'q_age', 'village');
    expect(find(marked, 'q_age')).toMatchObject({ type: 'short_text', standardColumn: 'village' });
    expect(find(marked, 'q_age').logic).toBeUndefined();
    const cleared = setIdentityRole(marked, 'q_age', null);
    expect(find(cleared, 'q_age').standardColumn).toBeNull();
    // a question with no mark has nothing to clear
    expect(setIdentityRole(cleared, 'q_age', null)).toBe(cleared);
  });

  it('is refused to a repeat group, its members and an official-only question', () => {
    const def = own();
    for (const key of ['g', 'member', 'remark'])
      expect(setIdentityRole(def, key, 'name'), key).toBe(def);
  });
});

describe('the identity questions added all at once', () => {
  const title = (n: number) => T(`অংশ ${n}`, `Section ${n}`);
  /** A library that holds the questions of four of the seven roles, and one of no role. */
  const identityLibrary = new Map([
    [
      'name',
      [
        field('name', 'short_text', {
          label: T('উপকারভোগীর নাম', "Beneficiary's name"),
          standardColumn: 'name',
          libraryFieldKey: 'name',
        }),
      ],
    ],
    [
      'mobile',
      [
        field('mobile', 'phone', {
          label: T('মোবাইল নম্বর', 'Mobile number'),
          standardColumn: 'mobile',
          libraryFieldKey: 'mobile',
          settings: { validation: { pattern: 'mobile' } },
          // the library's own question is optional and conditional; a marked one is neither
          logic: { show_if: { field: 'name', op: 'not_empty' } },
        }),
      ],
    ],
    [
      'gender',
      [
        field('gender', 'single_select', {
          label: T('লিঙ্গ', 'Gender'),
          standardColumn: 'gender_code',
          libraryFieldKey: 'gender',
          options: [option('male'), option('female')],
        }),
      ],
    ],
    // a question that fills the village column under another type is not the role's question
    ['village', [field('village', 'long_text', { standardColumn: 'village' })]],
    ['members_14_plus', [field('members_14_plus', 'number')]],
  ]);
  const empty = (): FormDefinition => ({ sections: [section('section_1', [])] });
  /** The wording a role's new question starts with. */
  const wording = (role: string) => T(`${role} (বাংলা)`, `${role} (English)`);
  const add = (def: FormDefinition, kind: 'beneficiary_application' | 'other' | 'library') =>
    addIdentityQuestions(def, identityLibrary, {
      kind,
      title,
      wording,
      makeKey: keysFrom('q_aaaaaa', 'q_bbbbbb', 'q_cccccc', 'q_dddddd', 'q_eeeeee', 'q_ffffff'),
    });
  /** The questions of a part that carry an identity mark, and the ones that carry none. */
  const marked = (fields: readonly FormField[]) => fields.filter((f) => identityRoleOf(f) !== null);
  const unmarked = (fields: readonly FormField[]) =>
    fields.filter((f) => identityRoleOf(f) === null);
  const ROLES = [
    'nid_or_birth_reg',
    'name',
    'father_or_husband_name',
    'mobile',
    'gender',
    'address',
    'village',
  ];

  it('gives an empty application form one marked question per role, the library’s where it has one', () => {
    const start = empty();
    expect(missingIdentityRoles(start)).toEqual(ROLES);
    const { definition: next, section: part, fieldKeys } = add(start, 'beneficiary_application');
    expect(part).toBe('section_1');
    // in the order of the roles: the library's question by its own key, an empty one otherwise;
    // then the two questions on whose number the mobile is
    expect(fieldKeys).toEqual([
      'q_aaaaaa',
      'name',
      'q_bbbbbb',
      'mobile',
      'gender',
      'q_cccccc',
      'q_dddddd',
      'q_eeeeee',
      'q_ffffff',
    ]);
    const fields = marked(next.sections[0]!.fields);
    expect(fields.map((f) => f.fieldKey)).toEqual(fieldKeys.slice(0, 7));
    expect(fields.map((f) => identityRoleOf(f))).toEqual(ROLES);
    expect(fields.every((f) => f.required)).toBe(true);
    expect(fields.map((f) => f.type)).toEqual([
      'short_text',
      'short_text',
      'short_text',
      'phone',
      'single_select',
      'bd_address',
      'short_text',
    ]);
    // the library's texts and settings come along, without what a marked question may not have
    expect(fields[1]).toMatchObject({ label: T('উপকারভোগীর নাম', "Beneficiary's name") });
    expect(fields[3]).toMatchObject({
      label: T('মোবাইল নম্বর', 'Mobile number'),
      settings: { validation: { pattern: 'mobile' } },
    });
    expect(fields[3]!.logic).toBeUndefined();
    expect(fields[4]!.options?.map((o) => o.code)).toEqual(['male', 'female']);
    // a role the library lacks is a new question, worded for its role in both languages
    expect(fields[0]).toMatchObject({
      label: T('nid_or_birth_reg (বাংলা)', 'nid_or_birth_reg (English)'),
      libraryFieldKey: null,
      options: [],
    });
    expect(fields.map((f) => f.label.bn)).toEqual([
      'nid_or_birth_reg (বাংলা)',
      'উপকারভোগীর নাম',
      'father_or_husband_name (বাংলা)',
      'মোবাইল নম্বর',
      'লিঙ্গ',
      'address (বাংলা)',
      'village (বাংলা)',
    ]);
    expect(missingIdentityRoles(next)).toEqual([]);
    valid(next);
    // nothing of the added questions waits for a text
    expect(missingTextCount(textsOf(next))).toBe(0);
    expect(
      checkDefinition(next, { publishing: true, kind: 'beneficiary_application' }).filter((i) =>
        i.code.startsWith('form.core_field'),
      ),
    ).toEqual([]);
  });

  it('adds nine questions to an empty application form: after the mobile, whose number it is and the owner’s name, optional, conditional and unmarked', () => {
    const { definition: next, fieldKeys } = add(empty(), 'beneficiary_application');
    expect(fieldKeys).toHaveLength(9);
    const fields = next.sections[0]!.fields;
    expect(fields).toHaveLength(9);
    // the two stand right after the mobile question, in their order
    expect(fields.map((f) => f.fieldKey)).toEqual([
      'q_aaaaaa',
      'name',
      'q_bbbbbb',
      'mobile',
      'q_eeeeee',
      'q_ffffff',
      'gender',
      'q_cccccc',
      'q_dddddd',
    ]);
    const [owner, ownerName] = unmarked(fields);
    expect(owner).toMatchObject({
      fieldKey: 'q_eeeeee',
      type: 'single_select',
      standardColumn: 'mobile_owner_code',
      required: false,
      libraryFieldKey: null,
      label: T('mobile_owner (বাংলা)', 'mobile_owner (English)'),
      // shown only once the mobile is answered
      logic: { show_if: { field: 'mobile', op: 'not_empty' } },
    });
    expect(ownerName).toMatchObject({
      fieldKey: 'q_ffffff',
      type: 'short_text',
      standardColumn: 'mobile_owner_name',
      required: false,
      label: T('mobile_owner_name (বাংলা)', 'mobile_owner_name (English)'),
      // shown only for a number that is answered as someone else's
      logic: { show_if: { field: 'q_eeeeee', op: 'neq', value: 'own' } },
      settings: { validation: { max_length: 200 } },
    });
    // the owner's options are its list's, set by the server at the save: none of the builder's
    expect(listOfField(owner!)).toBe('mobile_owner');
    expect(owner!.options).toEqual([]);
    expect(listOfField(ownerName!)).toBeNull();
    for (const question of [owner!, ownerName!]) {
      expect(identityRoleOf(question)).toBeNull();
      expect(coreLocks(question)).toEqual({ optional: false, condition: false });
    }
    valid(next);
    expect(checkDefinition(next, { publishing: true, kind: 'beneficiary_application' })).toEqual(
      [],
    );
    // a second press adds nothing
    expect(add(next, 'beneficiary_application').definition).toBe(next);
  });

  it('takes the library’s two questions where it has them, under the form’s own conditions, and adds none the form already asks', () => {
    const withOwner = new Map([
      ...identityLibrary,
      [
        'mobile_owner',
        [
          field('mobile_owner', 'single_select', {
            label: T('নম্বরটি কার?', 'Whose number is it?'),
            standardColumn: 'mobile_owner_code',
            libraryFieldKey: 'mobile_owner',
            required: true,
            options: [option('own'), option('family')],
            // the library's own condition names the library's mobile question
            logic: { show_if: { field: 'somewhere_else', op: 'not_empty' } },
          }),
        ],
      ],
      [
        'mobile_owner_name',
        [
          field('mobile_owner_name', 'short_text', {
            label: T('যাঁর নম্বর, তাঁর নাম', "Name of the number's owner"),
            standardColumn: 'mobile_owner_name',
            libraryFieldKey: 'mobile_owner_name',
          }),
        ],
      ],
    ]);
    const press = (def: FormDefinition) =>
      addIdentityQuestions(def, withOwner, {
        kind: 'beneficiary_application',
        title,
        wording,
        makeKey: keysFrom('q_aaaaaa', 'q_bbbbbb', 'q_cccccc', 'q_dddddd', 'q_eeeeee'),
      });
    const { definition: next, fieldKeys } = press(empty());
    expect(fieldKeys.slice(-2)).toEqual(['mobile_owner', 'mobile_owner_name']);
    const fields = next.sections[0]!.fields;
    const at = fields.findIndex((f) => f.fieldKey === 'mobile');
    expect(fields.slice(at + 1, at + 3)).toMatchObject([
      {
        fieldKey: 'mobile_owner',
        libraryFieldKey: 'mobile_owner',
        label: T('নম্বরটি কার?', 'Whose number is it?'),
        required: false,
        logic: { show_if: { field: 'mobile', op: 'not_empty' } },
      },
      {
        fieldKey: 'mobile_owner_name',
        libraryFieldKey: 'mobile_owner_name',
        required: false,
        logic: { show_if: { field: 'mobile_owner', op: 'neq', value: 'own' } },
      },
    ]);
    expect(fields[at + 1]!.options?.map((o) => o.code)).toEqual(['own', 'family']);
    // the options are the list's: read among the form's texts, never written there
    const optionRows = textsOf(next).filter(
      (row) => row.kind === 'option' && row.place.field === 'mobile_owner',
    );
    expect(optionRows.map((row) => row.locked)).toEqual([true, true]);
    expect(setText(next, optionRows[0]!, 'bn', 'আমার')).toBe(next);
    valid(next);

    // a form that asks whose number it is already, under a key of its own, gets only the name,
    // after that question and conditional on it
    const asking: FormDefinition = {
      sections: [
        section('section_1', [
          field('q_whose', 'single_select', { standardColumn: 'mobile_owner_code' }),
        ]),
      ],
    };
    const some = press(asking);
    const columns = some.definition.sections[0]!.fields.map((f) => f.standardColumn);
    expect(columns.filter((c) => c === 'mobile_owner_code')).toHaveLength(1);
    expect(columns.filter((c) => c === 'mobile_owner_name')).toHaveLength(1);
    expect(some.definition.sections[0]!.fields.slice(0, 2)).toMatchObject([
      { fieldKey: 'q_whose' },
      {
        fieldKey: 'mobile_owner_name',
        logic: { show_if: { field: 'q_whose', op: 'neq', value: 'own' } },
      },
    ]);
    expect(some.fieldKeys.at(-1)).toBe('mobile_owner_name');
    expect(some.fieldKeys).not.toContain('mobile_owner');
    valid(some.definition);
  });

  it('gives a form that has all seven identity questions the two on whose number the mobile is, right after its mobile question, and nothing a second time', () => {
    const start = definition();
    expect(missingIdentityRoles(start)).toEqual([]);
    expect(lacksMobileOwnerQuestion(start)).toBe(true);
    const mobile = start.sections
      .flatMap((s) => s.fields)
      .find((f) => identityRoleOf(f) === 'mobile')!;
    const home = start.sections.find((s) => s.fields.includes(mobile))!;
    const once = add(start, 'beneficiary_application');
    expect(once.fieldKeys).toEqual(['q_aaaaaa', 'q_bbbbbb']);
    // the part the two went to is the mobile question's, for the page to show
    expect(once.section).toBe(home.key);
    // no part and no identity question was added, and the seven stand as they were
    expect(once.definition.sections.map((s) => s.key)).toEqual(start.sections.map((s) => s.key));
    expect(
      once.definition.sections.flatMap((s) => s.fields).filter((f) => identityRoleOf(f) !== null),
    ).toEqual(start.sections.flatMap((s) => s.fields).filter((f) => identityRoleOf(f) !== null));
    const fields = once.definition.sections.find((s) => s.key === home.key)!.fields;
    const at = fields.findIndex((f) => f.fieldKey === mobile.fieldKey);
    expect(fields.slice(at + 1, at + 3)).toMatchObject([
      {
        fieldKey: 'q_aaaaaa',
        type: 'single_select',
        standardColumn: 'mobile_owner_code',
        required: false,
        label: T('mobile_owner (বাংলা)', 'mobile_owner (English)'),
        logic: { show_if: { field: mobile.fieldKey, op: 'not_empty' } },
      },
      {
        fieldKey: 'q_bbbbbb',
        type: 'short_text',
        standardColumn: 'mobile_owner_name',
        required: false,
        label: T('mobile_owner_name (বাংলা)', 'mobile_owner_name (English)'),
        logic: { show_if: { field: 'q_aaaaaa', op: 'neq', value: 'own' } },
        settings: { validation: { max_length: 200 } },
      },
    ]);
    valid(once.definition);
    expect(
      checkDefinition(once.definition, { publishing: true, kind: 'beneficiary_application' }),
    ).toEqual(checkDefinition(start, { publishing: true, kind: 'beneficiary_application' }));
    expect(lacksMobileOwnerQuestion(once.definition)).toBe(false);
    // a second press adds nothing
    expect(add(once.definition, 'beneficiary_application')).toEqual({
      definition: once.definition,
      section: null,
      fieldKeys: [],
    });
    // the edit of the two alone does the same on such a form, and nothing on its result
    const alone = addMobileOwnerQuestions(start, identityLibrary, {
      wording,
      makeKey: keysFrom('q_aaaaaa', 'q_bbbbbb'),
    });
    expect(alone).toEqual(once);
    expect(addMobileOwnerQuestions(once.definition, identityLibrary, { wording })).toEqual({
      definition: once.definition,
      section: null,
      fieldKeys: [],
    });
  });

  it('offers the two only to a form that asks the mobile and not whose number it is', () => {
    expect(lacksMobileOwnerQuestion(empty())).toBe(false);
    const start = definition();
    expect(lacksMobileOwnerQuestion(start)).toBe(true);
    const unmarkedMobile = setIdentityRole(
      start,
      start.sections.flatMap((s) => s.fields).find((f) => identityRoleOf(f) === 'mobile')!.fieldKey,
      null,
    );
    expect(lacksMobileOwnerQuestion(unmarkedMobile)).toBe(false);
    expect(addMobileOwnerQuestions(unmarkedMobile, identityLibrary, { wording }).definition).toBe(
      unmarkedMobile,
    );
  });

  it('adds only the roles that are missing, and nothing a second time', () => {
    const start = definition();
    const some = setIdentityRole(setIdentityRole(start, 'name', null), 'village', null);
    const once = add(some, 'beneficiary_application');
    // the form holds a question keyed name already, so the role gets an empty one of its own;
    // the two questions on whose number it is come with the press, after the form's mobile
    expect(once.fieldKeys).toEqual(['q_aaaaaa', 'q_bbbbbb', 'q_cccccc', 'q_dddddd']);
    expect(once.section).toBe('basic_info');
    const added = marked(once.definition.sections[0]!.fields).slice(-2);
    expect(added.map((f) => f.fieldKey)).toEqual(['q_aaaaaa', 'q_bbbbbb']);
    expect(added.map((f) => identityRoleOf(f))).toEqual(['name', 'village']);
    const all = once.definition.sections.flatMap((s) => s.fields);
    const mobileAt = all.findIndex((f) => identityRoleOf(f) === 'mobile');
    expect(all.slice(mobileAt + 1, mobileAt + 3).map((f) => f.standardColumn)).toEqual([
      'mobile_owner_code',
      'mobile_owner_name',
    ]);
    expect(add(once.definition, 'beneficiary_application').definition).toBe(once.definition);
    valid(once.definition);
  });

  it('gives a form of another kind nothing', () => {
    const start = empty();
    for (const kind of ['other', 'library'] as const)
      expect(add(start, kind)).toEqual({ definition: start, section: null, fieldKeys: [] });
    expect(
      addIdentityQuestions(start, identityLibrary, { kind: undefined, title, wording }).definition,
    ).toBe(start);
  });

  it('opens a new part when no part of the form is seen by everyone at all times', () => {
    const start: FormDefinition = {
      sections: [section('office', [], { visibility: 'official_only' })],
    };
    const { definition: next, section: part, fieldKeys } = add(start, 'beneficiary_application');
    expect(part).toBe('section_2');
    expect(next.sections.map((s) => s.key)).toEqual(['office', 'section_2']);
    expect(next.sections[1]).toMatchObject({ title: T('অংশ 2', 'Section 2') });
    expect([...next.sections[1]!.fields.map((f) => f.fieldKey)].sort()).toEqual(
      [...fieldKeys].sort(),
    );
    expect(fieldKeys).toHaveLength(9);
    valid(next);
  });
});

describe('the options of a choice question', () => {
  const RANDOM_CODE = /^o_[a-z0-9]{6}$/;
  const codes = (list: readonly { code: string }[]) => list.map((o) => o.code);
  const texts = (list: readonly { label: { bn: string; en: string } }[]) =>
    list.map((o) => [o.label.bn, o.label.en]);
  const three = () => [
    option('a', { label: T('ক', 'A') }),
    option('b', { label: T('খ', 'B') }),
    option('c', { label: T('গ', 'C') }),
  ];

  it('gives a new option a random code, never made from a text and never one the question has', () => {
    const first = emptyOption([]);
    expect(first).toEqual({
      code: expect.stringMatching(RANDOM_CODE),
      label: T('', ''),
      dependsOnOptionCode: null,
      allowsOtherText: false,
    });
    expect(emptyOption([first]).code).not.toBe(first.code);
    // a code the question has is drawn again
    const taken = [option('o_aaaaaa'), option('o_bbbbbb')];
    expect(emptyOption(taken, keysFrom('o_aaaaaa', 'o_bbbbbb', 'o_cccccc')).code).toBe('o_cccccc');
  });

  it('puts a new option right after the one it follows, and leaves the others their codes', () => {
    const { options: next, added } = insertOptionAfter(three(), 0, keysFrom('o_new000'));
    expect(codes(next)).toEqual(['a', 'o_new000', 'b', 'c']);
    expect(added).toMatchObject({ code: 'o_new000', label: T('', '') });
    expect(codes(insertOptionAfter(three(), 2, keysFrom('o_new000')).options)).toEqual([
      'a',
      'b',
      'c',
      'o_new000',
    ]);
    expect(codes(insertOptionAfter([], 0, keysFrom('o_new000')).options)).toEqual(['o_new000']);
  });

  it('reads the lines of a pasted text, without the empty ones and the space around each', () => {
    expect(pastedLines(' বৃদ্ধ \r\n\r\nবিধবা\n  \nএতিম\n')).toEqual(['বৃদ্ধ', 'বিধবা', 'এতিম']);
    expect(pastedLines('একটি')).toEqual(['একটি']);
    expect(pastedLines(' \n ')).toEqual([]);
  });

  it('makes one option of each line pasted into a Bengali text, the first in the option itself', () => {
    const start = [option('a', { label: T('', '') }), option('z', { label: T('শেষ', 'Last') })];
    const next = pasteOptions(
      start,
      0,
      'bn',
      ['বৃদ্ধ', 'বিধবা', 'এতিম'],
      keysFrom('o_new001', 'o_new002'),
    );
    expect(codes(next)).toEqual(['a', 'o_new001', 'o_new002', 'z']);
    expect(texts(next)).toEqual([
      ['বৃদ্ধ', ''],
      ['বিধবা', ''],
      ['এতিম', ''],
      ['শেষ', 'Last'],
    ]);
    // a draft takes options that wait for their English
    valid(definition(section('extra', [field('kind', 'radio', { options: [...next] })])));
  });

  it('fills the English of the option and the ones after it from the lines pasted into an English text', () => {
    const start = [
      option('a', { label: T('বৃদ্ধ', '') }),
      option('b', { label: T('বিধবা', 'old text') }),
      option('c', { label: T('এতিম', '') }),
    ];
    const filled = pasteOptions(start, 0, 'en', ['Elderly', 'Widow', 'Orphan']);
    expect(codes(filled)).toEqual(['a', 'b', 'c']);
    expect(texts(filled)).toEqual([
      ['বৃদ্ধ', 'Elderly'],
      ['বিধবা', 'Widow'],
      ['এতিম', 'Orphan'],
    ]);
    // from the second option on, and a line with no option left is a new one at the end
    const more = pasteOptions(start, 1, 'en', ['Widow', 'Orphan', 'Other'], keysFrom('o_new001'));
    expect(codes(more)).toEqual(['a', 'b', 'c', 'o_new001']);
    expect(texts(more)).toEqual([
      ['বৃদ্ধ', ''],
      ['বিধবা', 'Widow'],
      ['এতিম', 'Orphan'],
      ['', 'Other'],
    ]);
  });

  it('puts the first pasted line where the cursor stands, so what is written stays', () => {
    const start = [
      option('a', { label: T('চাল ও', 'Rice and') }),
      option('b', { label: T('ডাল', 'old text') }),
    ];
    // the cursor at the end of the Bengali text: the line follows it, the rest are new options
    const after = pasteOptions(start, 0, 'bn', [' গম', 'ভুট্টা'], keysFrom('o_new001'), {
      start: 6,
      end: 6,
    });
    expect(codes(after)).toEqual(['a', 'o_new001', 'b']);
    expect(texts(after)).toEqual([
      ['চাল ও গম', 'Rice and'],
      ['ভুট্টা', ''],
      ['ডাল', 'old text'],
    ]);
    // a selected word gives way to the line; the next option's English is the next line
    const over = pasteOptions(start, 0, 'en', ['Wheat', 'Lentils'], undefined, {
      start: 0,
      end: 4,
    });
    expect(texts(over)).toEqual([
      ['চাল ও', 'Wheat and'],
      ['ডাল', 'Lentils'],
    ]);
  });

  it('places nothing for no line or an option that is not there, and stops at 100 options', () => {
    const start = three();
    expect(pasteOptions(start, 0, 'bn', [])).toBe(start);
    expect(pasteOptions(start, 5, 'bn', ['ক', 'খ'])).toBe(start);
    expect(pasteOptions(start, -1, 'en', ['A', 'B'])).toBe(start);
    const many = Array.from({ length: 150 }, (_, i) => `লাইন ${i}`);
    expect(pasteOptions(start, 2, 'bn', many)).toHaveLength(100);
    expect(pasteOptions(start, 2, 'en', many)).toHaveLength(100);
  });

  it('makes yes and no in both languages, each under a code of its own', () => {
    const made = yesNoOptions(
      { yes: T('হ্যাঁ', 'Yes'), no: T('না', 'No') },
      keysFrom('o_same00', 'o_same00', 'o_other0'),
    );
    expect(texts(made)).toEqual([
      ['হ্যাঁ', 'Yes'],
      ['না', 'No'],
    ]);
    expect(codes(made)).toEqual(['o_same00', 'o_other0']);
    expect(codes(yesNoOptions({ yes: T('হ্যাঁ', 'Yes'), no: T('না', 'No') }))).toEqual([
      expect.stringMatching(RANDOM_CODE),
      expect.stringMatching(RANDOM_CODE),
    ]);
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

describe('a new empty section', () => {
  it('goes at the end, seen by everyone, under the first free number', () => {
    const title = (n: number) => T(`অংশ ${n}`, `Section ${n}`);
    const made = addEmptySection(definition(), title);
    expect(made.key).toBe('section_3');
    expect(made.definition.sections.at(-1)).toEqual({
      key: 'section_3',
      librarySectionKey: null,
      title: T('অংশ 3', 'Section 3'),
      visibility: 'volunteer',
      condition: null,
      fields: [],
    });
    valid(made.definition);
    // a number already taken is skipped
    expect(addEmptySection(made.definition, title).key).toBe('section_4');
    expect(addEmptySection({ sections: [] }, title).key).toBe('section_1');
  });
});

describe('a row question of a repeat group', () => {
  const grouped = () =>
    definition(
      section('family', [
        field('before', 'number'),
        field('members', 'repeat_group'),
        field('m_name', 'short_text', {
          label: T('সদস্যের নাম', 'Member name'),
          standardColumn: 'name',
          settings: { repeat: { group: 'members' }, validation: { max_length: 80 } },
        }),
        field('m_age', 'number', { settings: { repeat: { group: 'members' } } }),
        field('after', 'number'),
      ]),
    );
  const mark = { bn: '(কপি)', en: '(copy)' };
  const familyKeys = (def: ReturnType<typeof definition>) =>
    def.sections[2]!.fields.map((f) => f.fieldKey);

  it('is removed on its own: the group and its other rows stay', () => {
    const next = removeField(grouped(), 'm_name');
    expect(familyKeys(next)).toEqual(['before', 'members', 'm_age', 'after']);
    valid(next);
    // the last row question goes too, and the group stays, empty
    const empty = removeField(next, 'm_age');
    expect(familyKeys(empty)).toEqual(['before', 'members', 'after']);
    valid(empty);
  });

  it('is copied right after itself inside the group, with a key of its own', () => {
    const made = duplicateField(grouped(), 'm_name', mark, () => 'q_copy01');
    expect(made.fieldKey).toBe('q_copy01');
    expect(familyKeys(made.definition)).toEqual([
      'before',
      'members',
      'm_name',
      'q_copy01',
      'm_age',
      'after',
    ]);
    expect(made.definition.sections[2]!.fields[3]).toMatchObject({
      label: { bn: 'সদস্যের নাম (কপি)', en: 'Member name (copy)' },
      libraryFieldKey: null,
      standardColumn: null,
      settings: { repeat: { group: 'members' }, validation: { max_length: 80 } },
    });
    valid(made.definition);
    // the last row question's copy stays inside the group, before the next plain question
    const last = duplicateField(grouped(), 'm_age', mark);
    expect(familyKeys(last.definition)).toEqual([
      'before',
      'members',
      'm_name',
      'm_age',
      last.fieldKey,
      'after',
    ]);
    valid(last.definition);
    // a whole group is still not copied
    expect(duplicateField(grouped(), 'members', mark).fieldKey).toBeNull();
  });
});

describe('the uses of a question', () => {
  type Def = ReturnType<typeof definition>;
  const eq = (key: string, value: unknown = 'yes') => ({ field: key, op: 'eq' as const, value });
  const yesNo = [option('yes'), option('no')];
  /** A part with the question `source`, and a part after it with the questions the test gives. */
  const using = (source: ReturnType<typeof field>, users: ReturnType<typeof field>[], more = {}) =>
    definition(section('one', [source]), section('two', users, more));
  const twoOf = (def: Def) => def.sections.find((s) => s.key === 'two')!;
  const userOf = (def: Def, key = 'user') => twoOf(def).fields.find((f) => f.fieldKey === key)!;
  /** The keys after the identity questions. */
  const keys = (def: Def) => keysOf(def).slice(keysOf(definition()).length);

  it('finds a show condition, and removing drops the condition with the question', () => {
    const def = using(field('src', 'radio', { options: yesNo }), [
      field('user', 'short_text', { logic: { show_if: eq('src') } }),
      field('other', 'short_text', { logic: { show_if: eq('gender', 'female') } }),
    ]);
    valid(def);
    expect(usesOf(def, 'src')).toEqual([
      { kind: 'show_if', used: ['src'], section: 'two', field: 'user' },
    ]);
    const next = removeFieldWithUses(def, 'src');
    expect(keys(next)).toEqual(['user', 'other']);
    expect(userOf(next).logic).toBeUndefined();
    // a condition on another question stays as it was
    expect(userOf(next, 'other')).toBe(userOf(def, 'other'));
    valid(next);
  });

  it('finds a required condition and a comparison with its answer; a group of conditions loses only that leaf', () => {
    const def = using(field('src', 'number'), [
      field('n', 'number'),
      field('user', 'short_text', {
        logic: {
          required_if: { all: [eq('gender', 'female'), { any: [eq('src', 1)] }] },
          show_if: { field: 'n', op: 'gt', value: { field: 'src' } },
        },
      }),
      field('negated', 'short_text', {
        logic: { show_if: { not: eq('src', 2) }, validation: { max_length: 20 } },
      }),
    ]);
    valid(def);
    expect(usesOf(def, 'src')).toEqual([
      { kind: 'show_if', used: ['src'], section: 'two', field: 'user' },
      { kind: 'required_if', used: ['src'], section: 'two', field: 'user' },
      { kind: 'show_if', used: ['src'], section: 'two', field: 'negated' },
    ]);
    const next = removeFieldWithUses(def, 'src');
    expect(userOf(next).logic).toEqual({ required_if: { all: [eq('gender', 'female')] } });
    // the rest of a question's logic stays when its condition goes
    expect(userOf(next, 'negated').logic).toEqual({ validation: { max_length: 20 } });
    valid(next);
  });

  it("finds a part's condition, and removing leaves the part always shown", () => {
    const def = using(field('src', 'radio', { options: yesNo }), [field('user', 'short_text')], {
      condition: eq('src'),
    });
    valid(def);
    expect(usesOf(def, 'src')).toEqual([
      { kind: 'section_condition', used: ['src'], section: 'two' },
    ]);
    const next = removeFieldWithUses(def, 'src');
    expect(twoOf(next).condition).toBeNull();
    valid(next);
  });

  it('finds a calculation by a term, a branch condition and a table cell, and removing takes the rule and keeps the question', () => {
    const term = using(field('src', 'number'), [
      field('user', 'calculation', {
        calculation: { expr: { op: 'add', args: [{ field: 'src' }, 1] }, round: 2 },
      }),
      field('branch', 'calculation', {
        calculation: { expr: { if: [{ when: eq('src', 1), then: 1 }], else: 0 } },
      }),
      field('free', 'calculation', { calculation: { expr: { op: 'add', args: [1, 2] } } }),
    ]);
    valid(term);
    expect(usesOf(term, 'src')).toEqual([
      { kind: 'calculation', used: ['src'], section: 'two', field: 'user' },
      { kind: 'calculation', used: ['src'], section: 'two', field: 'branch' },
    ]);
    const next = removeFieldWithUses(term, 'src');
    expect(keys(next)).toEqual(['user', 'branch', 'free']);
    expect(userOf(next).calculation).toBeUndefined();
    expect(userOf(next, 'branch').calculation).toBeUndefined();
    expect(userOf(next, 'free')).toBe(userOf(term, 'free'));
    valid(next);

    const cell = using(
      field('src', 'number_table', {
        settings: {
          table: { rows: [{ key: 'r', label: T('র') }], cols: [{ key: 'c', label: T('ক') }] },
        },
      }),
      [
        field('user', 'calculation', {
          calculation: { expr: { cell: { field: 'src', row: 'r', col: 'c' } } },
        }),
      ],
    );
    valid(cell);
    expect(usesOf(cell, 'src')).toEqual([
      { kind: 'calculation', used: ['src'], section: 'two', field: 'user' },
    ]);
    const cleared = removeFieldWithUses(cell, 'src');
    expect(userOf(cleared).calculation).toBeUndefined();
    valid(cleared);
  });

  it('finds the sum and the count of a group in a calculation, for the group and for its row question', () => {
    const def = definition(
      section('one', [
        field('members', 'repeat_group'),
        field('m_income', 'money', { settings: { repeat: { group: 'members' } } }),
        field('m_earns', 'radio', {
          options: yesNo,
          settings: { repeat: { group: 'members' } },
          logic: { show_if: { field: 'm_income', op: 'not_empty' } },
        }),
      ]),
      section('two', [
        field('total', 'calculation', {
          calculation: { expr: { sum_repeat: { group: 'members', field: 'm_income' } } },
        }),
        field('earners', 'calculation', {
          calculation: { expr: { count_rows: { group: 'members', where: eq('m_earns') } } },
        }),
        field('rows', 'calculation', {
          calculation: { expr: { count_rows: { group: 'members' } } },
        }),
      ]),
    );
    valid(def);
    // a row question: the other row question that reads it, and the sum over it
    expect(usesOf(def, 'm_income')).toEqual([
      { kind: 'show_if', used: ['m_income'], section: 'one', field: 'm_earns' },
      { kind: 'calculation', used: ['m_income'], section: 'two', field: 'total' },
    ]);
    expect(usesOf(def, 'm_earns')).toEqual([
      { kind: 'calculation', used: ['m_earns'], section: 'two', field: 'earners' },
    ]);
    const without = removeFieldWithUses(def, 'm_income');
    expect(keys(without)).toEqual(['members', 'm_earns', 'total', 'earners', 'rows']);
    expect(userOf(without, 'total').calculation).toBeUndefined();
    expect(userOf(without, 'earners').calculation).toBeDefined();
    valid(without);
    // the group goes with its row questions: what reads any of them is a use, a row question
    // reading another row question of the same group is not
    expect(usesOf(def, 'members')).toEqual([
      { kind: 'calculation', used: ['members', 'm_income'], section: 'two', field: 'total' },
      { kind: 'calculation', used: ['members', 'm_earns'], section: 'two', field: 'earners' },
      { kind: 'calculation', used: ['members'], section: 'two', field: 'rows' },
    ]);
    const gone = removeFieldWithUses(def, 'members');
    expect(keys(gone)).toEqual(['total', 'earners', 'rows']);
    for (const key of ['total', 'earners', 'rows'])
      expect(userOf(gone, key).calculation).toBeUndefined();
    valid(gone);
  });

  it("finds the question a group's rows are counted from, and removing unsets it", () => {
    const def = using(field('src', 'number', { settings: { validation: { min: 0, max: 5 } } }), [
      field('user', 'repeat_group', { settings: { repeat: { count_from: 'src', max_rows: 5 } } }),
    ]);
    valid(def);
    expect(usesOf(def, 'src')).toEqual([
      { kind: 'count_from', used: ['src'], section: 'two', field: 'user' },
    ]);
    const next = removeFieldWithUses(def, 'src');
    expect(userOf(next).settings).toEqual({ repeat: { max_rows: 5 } });
    valid(next);
  });

  it('finds the options that follow its answer, and removing frees them', () => {
    const def = using(field('src', 'radio', { options: yesNo }), [
      field('user', 'single_select', {
        logic: { options_depend_on: 'src' },
        options: [option('a', { dependsOnOptionCode: 'yes' }), option('b')],
      }),
    ]);
    valid(def);
    expect(usesOf(def, 'src')).toEqual([
      { kind: 'options_depend_on', used: ['src'], section: 'two', field: 'user' },
    ]);
    const next = removeFieldWithUses(def, 'src');
    expect(userOf(next).logic).toBeUndefined();
    expect(userOf(next).options!.map((o) => o.dependsOnOptionCode)).toEqual([null, null]);
    valid(next);
  });

  it('finds its answer inserted in a label or a help text, and removing takes it out of the text', () => {
    const def = using(field('src', 'number'), [
      field('user', 'short_text', {
        label: T('{{src|কয়েকটি}} গরুর জন্য কত টাকা?', 'How much for {{src}} cows?'),
      }),
      field('helped', 'short_text', {
        label: T('{{name}} কী চান?', 'What does {{name}} want?'),
        settings: { help: T('আগে বলেছেন {{src}}টি', 'You said {{src}} before') },
      }),
    ]);
    valid(def);
    expect(usesOf(def, 'src')).toEqual([
      { kind: 'pipe', used: ['src'], section: 'two', field: 'user' },
      { kind: 'pipe', used: ['src'], section: 'two', field: 'helped' },
    ]);
    const next = removeFieldWithUses(def, 'src');
    expect(userOf(next).label).toEqual(T('গরুর জন্য কত টাকা?', 'How much for cows?'));
    // another question's inserted answer stays in the text
    expect(userOf(next, 'helped').label).toEqual(userOf(def, 'helped').label);
    expect(userOf(next, 'helped').settings!.help).toEqual(T('আগে বলেছেন টি', 'You said before'));
    valid(next);
  });

  it('names nothing for a question nothing reads, and removes it as before', () => {
    const def = using(field('src', 'number', { logic: { show_if: eq('gender', 'female') } }), [
      field('user', 'short_text', { logic: { show_if: eq('gender', 'female') } }),
    ]);
    expect(usesOf(def, 'src')).toEqual([]);
    expect(usesOf(def, 'no_such_question')).toEqual([]);
    expect(removeFieldWithUses(def, 'src')).toEqual(removeField(def, 'src'));
    expect(removeFieldWithUses(def, 'no_such_question')).toBe(def);
  });

  it('names for a part only the uses from outside it, and removing the part cleans them', () => {
    const def = definition(
      section('one', [
        field('src', 'radio', { options: yesNo }),
        field('n', 'number'),
        // inside the part: goes with it, and is no use to name
        field('inner', 'short_text', { logic: { show_if: eq('src') } }),
      ]),
      section('two', [
        field('user', 'short_text', { logic: { show_if: eq('src') } }),
        field('sum', 'calculation', {
          calculation: { expr: { op: 'add', args: [{ field: 'n' }, 1] } },
        }),
      ]),
      section('three', [field('last', 'short_text')], { condition: eq('src', 'no') }),
    );
    valid(def);
    expect(usesOfSection(def, 'one')).toEqual([
      { kind: 'show_if', used: ['src'], section: 'two', field: 'user' },
      { kind: 'calculation', used: ['n'], section: 'two', field: 'sum' },
      { kind: 'section_condition', used: ['src'], section: 'three' },
    ]);
    // a part nothing outside reads, and one the form does not have
    expect(usesOfSection(def, 'three')).toEqual([]);
    expect(usesOfSection(def, 'no_such_part')).toEqual([]);
    const next = removeSectionWithUses(def, 'one');
    expect(next.sections.map((s) => s.key)).toEqual(['basic_info', 'address', 'two', 'three']);
    expect(userOf(next).logic).toBeUndefined();
    expect(userOf(next, 'sum').calculation).toBeUndefined();
    expect(next.sections.at(-1)!.condition).toBeNull();
    valid(next);
    expect(removeSectionWithUses(def, 'three')).toEqual(removeSection(def, 'three'));
    expect(removeSectionWithUses(def, 'no_such_part')).toBe(def);
  });
});

describe('the texts of the form in both languages', () => {
  /** A form with a text of every kind, some of them written in one language only. */
  const worded = (): FormDefinition => ({
    sections: [
      section(
        'one',
        [
          field('kind', 'radio', {
            label: T('ধরন', 'Kind'),
            settings: { help: T('একটি বেছে নিন', ''), placeholder: T('', '') },
            options: [
              option('a', { label: T('ক', 'A') }),
              option('b', { label: T('খ', '') }),
              option('c', { label: T('', 'C') }),
            ],
          }),
          field('herd', 'number_table', {
            label: T('গরু-ছাগল', ''),
            settings: {
              placeholder: T('', 'Count'),
              table: {
                rows: [
                  { key: 'r1', label: T('গরু', 'Cows') },
                  { key: 'r2', label: T('ছাগল', '') },
                ],
                cols: [{ key: 'c1', label: T('নিজের', 'Own') }],
              },
            },
          }),
          field('level', 'calculation', {
            label: T('অবস্থা', 'Level'),
            settings: {
              results: [
                { code: 'poor', label: T('দরিদ্র', '') },
                { code: 'ok', label: T('  ', 'Fine') },
              ],
            },
          }),
        ],
        { title: T('প্রথম অংশ', '') },
      ),
      section('two', [field('note', 'short_text', { label: T('', '') })], {
        title: T('দ্বিতীয় অংশ', 'Second part'),
      }),
    ],
    scoring: { not_previously_assisted: 10 },
  });
  const brief = (def: FormDefinition) =>
    textsOf(def).map((r) => [r.kind, r.place.field ?? r.place.section, r.item ?? '', r.bn, r.en]);

  it('lists every text with its place and kind, in the order of the form', () => {
    const rows = textsOf(worded());
    expect(brief(worded())).toEqual([
      ['title', 'one', '', 'প্রথম অংশ', ''],
      ['label', 'kind', '', 'ধরন', 'Kind'],
      // a help text in one language is listed; a placeholder empty in both is none
      ['help', 'kind', '', 'একটি বেছে নিন', ''],
      ['option', 'kind', 'a', 'ক', 'A'],
      ['option', 'kind', 'b', 'খ', ''],
      ['option', 'kind', 'c', '', 'C'],
      ['label', 'herd', '', 'গরু-ছাগল', ''],
      ['placeholder', 'herd', '', '', 'Count'],
      ['table_row', 'herd', 'r1', 'গরু', 'Cows'],
      ['table_row', 'herd', 'r2', 'ছাগল', ''],
      ['table_col', 'herd', 'c1', 'নিজের', 'Own'],
      ['label', 'level', '', 'অবস্থা', 'Level'],
      ['result', 'level', 'poor', 'দরিদ্র', ''],
      ['result', 'level', 'ok', '  ', 'Fine'],
      ['title', 'two', '', 'দ্বিতীয় অংশ', 'Second part'],
      ['label', 'note', '', '', ''],
    ]);
    expect(rows.find((r) => r.kind === 'title')!.place).toEqual({ section: 'one' });
    expect(rows.find((r) => r.id === 'option|kind|c')).toMatchObject({
      place: { section: 'one', field: 'kind' },
      item: 'c',
      index: 2,
      locked: false,
    });
    // every row has a name of its own
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });

  it('counts the missing languages as the publish check does', () => {
    const def = worded();
    const rows = textsOf(def);
    expect(missingIn({ bn: 'ক', en: ' ' })).toEqual(['en']);
    expect(missingIn({ bn: '', en: '' })).toEqual(['bn', 'en']);
    // a help text or a placeholder is optional: empty in both languages, it lacks nothing
    expect(missingIn({ kind: 'help', bn: '', en: '' })).toEqual([]);
    expect(missingIn({ kind: 'placeholder', bn: ' ', en: '' })).toEqual([]);
    expect(missingIn({ kind: 'help', bn: 'ক', en: '' })).toEqual(['en']);
    expect(missingIn({ kind: 'label', bn: '', en: '' })).toEqual(['bn', 'en']);
    expect(missingIn({ bn: 'ক', en: 'A' })).toEqual([]);
    // the part's English, a help text, two options, the table's label, placeholder and row, two
    // results, and both languages of the last question
    expect(missingTextCount(rows)).toBe(11);
    expect(
      checkDefinition(def, { publishing: true, kind: 'other' }).filter(
        (i) => i.code === 'form.label_language',
      ),
    ).toHaveLength(11);
    expect(missingTexts(publishEntries(def, 'other'))).toBe(11);
    // and on a complete form alike
    const complete = definition();
    expect(missingTextCount(textsOf(complete))).toBe(0);
    expect(missingTexts(publishEntries(complete, 'beneficiary_application'))).toBe(0);
  });

  it('writes exactly one text in one language, and keeps every other and the points', () => {
    const def = worded();
    const rows = textsOf(def);
    for (const [at, row] of rows.entries())
      for (const language of ['bn', 'en'] as const) {
        const next = setText(def, row, language, 'নতুন লেখা');
        const expected = rows.map((r, i) => (i === at ? { ...r, [language]: 'নতুন লেখা' } : r));
        expect(textsOf(next), `${row.id} ${language}`).toEqual(expected);
        expect(next.scoring).toEqual(def.scoring);
        valid(next);
        // nothing but that text changed: the rest of the question is as it was
        expect(setText(next, row, language, row[language])).toEqual(def);
      }
  });

  it('gives back the same form for a text as it is, a text the form lacks and a list’s option', () => {
    const def = worded();
    const label = textsOf(def).find((r) => r.id === 'label|kind')!;
    expect(setText(def, label, 'bn', 'ধরন')).toBe(def);
    expect(
      setText(
        def,
        { place: { section: 'one', field: 'kind' }, kind: 'option', item: 'zz' },
        'bn',
        'x',
      ),
    ).toBe(def);
    expect(setText(def, { place: { section: 'none' }, kind: 'title' }, 'bn', 'x')).toBe(def);
    // a help text the question does not have, emptied: nothing to take away
    expect(setText(def, { place: { section: 'two', field: 'note' }, kind: 'help' }, 'bn', '')).toBe(
      def,
    );
    // the gender question's options are its reference list's: read here, never written
    const core = definition();
    const male = textsOf(core).find((r) => r.id === 'option|gender|male')!;
    expect(male.locked).toBe(true);
    expect(setText(core, male, 'en', 'Man')).toBe(core);
  });

  it('takes a help text away once it is emptied in both languages, and writes it again from the first letter', () => {
    const def = worded();
    const help = textsOf(def).find((r) => r.kind === 'help')!;
    const next = setText(def, help, 'bn', '');
    expect(next.sections[0]!.fields[0]!.settings).toEqual({ placeholder: T('', '') });
    expect(textsOf(next).some((r) => r.kind === 'help')).toBe(false);
    valid(next);
    // the same row written again: the help text is back, in the language typed
    const again = setText(next, help, 'en', 'Pick one');
    expect(again.sections[0]!.fields[0]!.settings!.help).toEqual(T('', 'Pick one'));
    expect(textsOf(again).find((r) => r.kind === 'help')).toMatchObject({ bn: '', en: 'Pick one' });
    valid(again);
  });
});

describe('the rest of the definition', () => {
  const POINTS = { not_previously_assisted: 20 };
  const yes = { field: 'has_cow', op: 'eq' as const, value: 'yes' };
  /** A form with points of its own, and questions for every edit to work on. */
  const scored = (): FormDefinition => ({
    ...definition(
      section('extra', [
        field('has_cow', 'radio', { options: [option('yes'), option('no')] }),
        field('cows', 'number', { logic: { show_if: yes } }),
        field('breed', 'single_select', {
          options: [option('local', { dependsOnOptionCode: 'yes' })],
          logic: { options_depend_on: 'has_cow' },
        }),
        field('q_note', 'short_text'),
      ]),
      section('more', [
        field('last', 'short_text'),
        field('list', 'repeat_group'),
        field('row', 'number', { settings: { repeat: { group: 'list' } } }),
      ]),
    ),
    scoring: POINTS,
  });
  const mark = { bn: '(কপি)', en: '(copy)' };
  /**
   * Every edit of the module, each called so that it changes the form: the name of the exported
   * function, what the call does, and the call.
   */
  const EDITS: [keyof typeof draftEdits, string, (def: FormDefinition) => FormDefinition][] = [
    [
      'addLibrarySection',
      'a library part',
      (d) => addLibrarySection(d, library.sections[0]!, library.fields),
    ],
    [
      'addLibraryField',
      'a library question',
      (d) => addLibraryField(d, 'extra', library.fields.get('members_14_plus')!),
    ],
    [
      'addOwnQuestion',
      'at the end of a part',
      (d) => addOwnQuestion(d, 'extra', { type: 'short_text' }).definition,
    ],
    [
      'addOwnQuestion',
      'at a place',
      (d) => addOwnQuestion(d, 'extra', { type: 'short_text' }, 0).definition,
    ],
    [
      'addOwnQuestion',
      'after a question',
      (d) => addOwnQuestion(d, 'extra', { type: 'short_text', after: 'has_cow' }).definition,
    ],
    [
      'addOwnQuestion',
      'in the rows of a list',
      (d) => addOwnQuestion(d, 'more', { type: 'short_text', after: 'row' }).definition,
    ],
    [
      'moveFieldTo',
      'to the end of another part',
      (d) => moveFieldTo(d, 'q_note', 'more', Number.MAX_SAFE_INTEGER),
    ],
    ['updateField', 'a setting', (d) => updateField(d, 'q_note', { required: true })],
    [
      'setOptions',
      'one option more',
      (d) => setOptions(d, 'has_cow', [option('yes'), option('no'), option('maybe')]),
    ],
    ['setOptions', 'an option others follow gone', (d) => setOptions(d, 'has_cow', [option('no')])],
    ['removeField', 'a question', (d) => removeField(d, 'q_note')],
    ['removeSection', 'a part', (d) => removeSection(d, 'more')],
    ['removeFieldWithUses', 'a question others read', (d) => removeFieldWithUses(d, 'has_cow')],
    ['removeFieldWithUses', 'a question nothing reads', (d) => removeFieldWithUses(d, 'q_note')],
    ['removeSectionWithUses', 'a part', (d) => removeSectionWithUses(d, 'more')],
    ['setSectionTitle', 'a name', (d) => setSectionTitle(d, 'extra', T('নতুন নাম', 'New name'))],
    [
      'setSectionVisibility',
      'officials only',
      (d) => setSectionVisibility(d, 'extra', 'official_only'),
    ],
    ['setSectionCondition', 'a condition', (d) => setSectionCondition(d, 'more', yes)],
    ['moveSection', 'up', (d) => moveSection(d, 'more', -1)],
    ['moveField', 'down', (d) => moveField(d, 'extra', 'has_cow', 1)],
    ['moveFieldTo', 'inside its part', (d) => moveFieldTo(d, 'q_note', 'extra', 0)],
    ['moveFieldTo', 'to another part', (d) => moveFieldTo(d, 'q_note', 'more', 0)],
    ['duplicateField', 'a copy', (d) => duplicateField(d, 'q_note', mark).definition],
    ['setIdentityRole', 'a mark taken from another', (d) => setIdentityRole(d, 'q_note', 'name')],
    ['setIdentityRole', 'a mark cleared', (d) => setIdentityRole(d, 'name', null)],
    [
      'addEmptySection',
      'an empty part',
      (d) => addEmptySection(d, (n) => T(`অংশ ${n}`, `Section ${n}`)).definition,
    ],
    [
      'setText',
      'a text in one language',
      (d) =>
        setText(d, { place: { section: 'extra', field: 'q_note' }, kind: 'label' }, 'en', 'Remark'),
    ],
    [
      'setText',
      'an option’s text',
      (d) =>
        setText(
          d,
          { place: { section: 'extra', field: 'has_cow' }, kind: 'option', item: 'yes' },
          'bn',
          'হ্যাঁ',
        ),
    ],
    [
      'setText',
      'a part’s name',
      (d) => setText(d, { place: { section: 'more' }, kind: 'title' }, 'bn', 'আরও'),
    ],
    [
      'addIdentityQuestions',
      'the question of a role no question is marked with',
      (d) =>
        addIdentityQuestions(setIdentityRole(d, 'name', null), library.fields, {
          kind: 'beneficiary_application',
          title: (n) => T(`অংশ ${n}`, `Section ${n}`),
          wording: (role) => T(role, role),
        }).definition,
    ],
    [
      'addMobileOwnerQuestions',
      'the two questions on whose number the mobile is',
      (d) =>
        addMobileOwnerQuestions(d, library.fields, { wording: (name) => T(name, name) }).definition,
    ],
  ];
  /**
   * The exported functions that return no draft: the ones that read a draft, and the ones that
   * work on a question's list of options, which `setOptions` then writes into the draft.
   */
  const READERS: (keyof typeof draftEdits)[] = [
    'canMarkIdentity',
    'coreLocks',
    'emptyOption',
    'hasIdentity',
    'insertOptionAfter',
    'lacksMobileOwnerQuestion',
    'missingIdentityRoles',
    'missingIn',
    'missingTextCount',
    'pastedLines',
    'pasteOptions',
    'textsOf',
    'usesOf',
    'usesOfSection',
    'yesNoOptions',
  ];

  it.each(EDITS)('%s (%s) keeps the points of the form', (_name, _what, edit) => {
    const start = scored();
    const next = edit(start);
    // the call is one that changes the form, so the points are kept by the edit itself
    expect(next).not.toBe(start);
    expect(next.sections).not.toEqual(start.sections);
    expect(next.scoring).toEqual(POINTS);
    valid(next);
  });

  it('is checked for every edit the module has', () => {
    const exported = Object.entries(draftEdits)
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name);
    const covered = new Set<string>([...EDITS.map(([name]) => name), ...READERS, 'setFormScoring']);
    expect(exported.filter((name) => !covered.has(name))).toEqual([]);
  });

  it('keeps the only part of a form: a draft without a part cannot be saved', () => {
    const one: FormDefinition = { sections: [section('only', [field('q', 'short_text')])] };
    expect(removeSection(one, 'only')).toBe(one);
    expect(removeSectionWithUses(one, 'only')).toBe(one);
    const two: FormDefinition = { sections: [...one.sections, section('second', [])] };
    expect(removeSection(two, 'only').sections.map((s) => s.key)).toEqual(['second']);
  });

  it('sets and takes away the points alone, leaving the questions as they are', () => {
    const start = scored();
    const changed = setFormScoring(start, 35);
    expect(changed.scoring).toEqual({ not_previously_assisted: 35 });
    expect(changed.sections).toBe(start.sections);
    const none = setFormScoring(start, undefined);
    expect('scoring' in none).toBe(false);
    expect(none.sections).toBe(start.sections);
  });
});
