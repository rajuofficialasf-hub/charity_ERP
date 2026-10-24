import { describe, expect, it } from 'vitest';
import {
  addressFields,
  coreFields,
  definitionWith,
  field,
  option,
  section,
  T,
  yesNo,
} from '../../test/forms-fixture.js';
import { checkDefinition, formDefinitionSchema, type FormDefinition } from './index.js';

const codesOf = (definition: FormDefinition) =>
  checkDefinition(definition).map((issue) => [
    issue.code,
    issue.params?.fieldKey ?? issue.params?.reference,
  ]);
const schemaCodes = (input: unknown) => {
  const result = formDefinitionSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

// A definition is refused for what the shape cannot say: a lost core field, a dangling reference,
// a reach into a repeat group, a cycle, a duplicate key, a free regex, a one-language label.
describe('the identity of an application form', () => {
  // the check runs when an application form is published; a draft and another kind need none
  const atPublish = (
    definition: FormDefinition,
    kind: 'beneficiary_application' | 'other' = 'beneficiary_application',
  ) =>
    checkDefinition(definition, { publishing: true, kind }).map((issue) => [
      issue.code,
      issue.params?.role,
    ]);
  const withoutCore: FormDefinition = { sections: [section('more', [yesNo('has_loan')])] };

  it('accepts a form with the marked identity questions and extra fields', () => {
    const definition = definitionWith([yesNo('has_loan')]);
    expect(atPublish(definition)).toEqual([]);
    expect(formDefinitionSchema.safeParse(definition).success).toBe(true);
  });

  it('lets a draft and a form of another kind go without identity questions', () => {
    expect(checkDefinition(withoutCore)).toEqual([]);
    expect(atPublish(withoutCore, 'other')).toEqual([]);
    expect(schemaCodes(withoutCore)).toEqual([]);
  });

  it('refuses to publish an application form without a role, naming it', () => {
    const definition: FormDefinition = {
      sections: [
        section(
          'basic_info',
          coreFields().filter((f) => f.fieldKey !== 'gender'),
        ),
        section('address', addressFields()),
      ],
    };
    expect(atPublish(definition)).toEqual([['form.core_field_missing', 'gender']]);
    expect(atPublish(withoutCore)).toHaveLength(7);
  });

  it('finds the identity by the mark under any key, never by the key alone', () => {
    const renamed = definitionWith();
    for (const f of renamed.sections.flatMap((s) => s.fields)) f.fieldKey = `q_${f.fieldKey}`;
    expect(atPublish(renamed)).toEqual([]);
    // a question keyed mobile without the mark is a plain question
    const unmarked = definitionWith();
    unmarked.sections[0]!.fields.find((f) => f.fieldKey === 'mobile')!.standardColumn = null;
    expect(atPublish(unmarked)).toEqual([['form.core_field_missing', 'mobile']]);
  });

  it('refuses a marked question made optional', () => {
    const definition = definitionWith();
    definition.sections[0]!.fields.find((f) => f.fieldKey === 'name')!.required = false;
    expect(atPublish(definition)).toEqual([['form.core_field_optional', 'name']]);
  });

  it('refuses a marked question in an official-only section', () => {
    const definition = definitionWith();
    definition.sections[1]!.visibility = 'official_only';
    expect(atPublish(definition)).toEqual([
      ['form.core_field_hidden', 'address'],
      ['form.core_field_hidden', 'village'],
    ]);
  });

  it('refuses a marked question behind a condition or inside a conditional section', () => {
    const withShowIf = definitionWith([yesNo('x')]);
    withShowIf.sections[0]!.fields.find((f) => f.fieldKey === 'mobile')!.logic = {
      show_if: { field: 'x', op: 'eq', value: 'yes' },
    };
    expect(atPublish(withShowIf)).toEqual([['form.core_field_hidden', 'mobile']]);
    const withCondition = definitionWith([yesNo('x')]);
    withCondition.sections[1]!.condition = { field: 'x', op: 'eq', value: 'yes' };
    expect(atPublish(withCondition)).toEqual([
      ['form.core_field_hidden', 'address'],
      ['form.core_field_hidden', 'village'],
    ]);
  });

  it('refuses a marked question of another type', () => {
    const definition = definitionWith();
    definition.sections[0]!.fields.find((f) => f.fieldKey === 'mobile')!.type = 'short_text';
    expect(atPublish(definition)).toEqual([['form.core_field_shape', 'mobile']]);
  });
});

describe('references', () => {
  it('refuses a condition that names a field the form does not have', () => {
    const definition = definitionWith([
      yesNo('a', { logic: { show_if: { field: 'nope', op: 'eq', value: 'yes' } } }),
    ]);
    expect(codesOf(definition)).toEqual([['form.unknown_reference', 'nope']]);
  });

  it('refuses a calculation that names a field the form does not have', () => {
    const definition = definitionWith([
      field('total', 'calculation', {
        calculation: { expr: { op: 'add', args: [{ field: 'gone' }, 1] } },
      }),
    ]);
    expect(codesOf(definition)).toEqual([['form.unknown_reference', 'gone']]);
  });

  it('lets a condition refer to a field that comes later in the form', () => {
    const definition = definitionWith([
      field('early', 'short_text', {
        logic: { show_if: { field: 'late', op: 'eq', value: 'yes' } },
      }),
      yesNo('late'),
    ]);
    expect(checkDefinition(definition)).toEqual([]);
  });

  it('refuses a reach into a repeat group from outside it, and allows a sum over it', () => {
    const group = [
      field('earners', 'repeat_group'),
      field('earner_income', 'money', { settings: { repeat: { group: 'earners' } } }),
      field('earner_note', 'short_text', {
        settings: { repeat: { group: 'earners' } },
        logic: { show_if: { field: 'earner_income', op: 'gt', value: 0 } },
      }),
    ];
    const fromOutside = definitionWith([
      ...group,
      yesNo('rich', { logic: { show_if: { field: 'earner_income', op: 'gt', value: 1000 } } }),
      field('double', 'calculation', {
        calculation: { expr: { op: 'mul', args: [{ field: 'earner_income' }, 2] } },
      }),
    ]);
    expect(codesOf(fromOutside)).toEqual([
      ['form.repeat_reference', 'earner_income'],
      ['form.repeat_reference', 'earner_income'],
    ]);
    const summed = definitionWith([
      ...group,
      field('total', 'calculation', {
        calculation: { expr: { sum_repeat: { group: 'earners', field: 'earner_income' } } },
      }),
    ]);
    expect(checkDefinition(summed)).toEqual([]);
  });

  it('refuses a sum over a field that is not inside the named group', () => {
    const definition = definitionWith([
      field('earners', 'repeat_group'),
      field('income', 'money'),
      field('total', 'calculation', {
        calculation: { expr: { sum_repeat: { group: 'earners', field: 'income' } } },
      }),
    ]);
    expect(codesOf(definition)).toEqual([['form.repeat_reference', 'income']]);
  });

  it('refuses a member whose group is not a repeat group of the same section', () => {
    const definition = definitionWith([
      field('income', 'money'),
      field('member', 'short_text', { settings: { repeat: { group: 'income' } } }),
    ]);
    expect(codesOf(definition)).toEqual([['form.repeat_group_invalid', 'member']]);
  });
});

describe('cycles', () => {
  it('refuses a calculation that depends on itself through another field', () => {
    const definition = definitionWith([
      field('a', 'calculation', {
        calculation: { expr: { op: 'add', args: [{ field: 'b' }, 1] } },
      }),
      field('b', 'calculation', {
        calculation: { expr: { op: 'add', args: [{ field: 'a' }, 1] } },
      }),
    ]);
    const issues = checkDefinition(definition);
    expect(issues.map((i) => i.code)).toEqual(['form.calculation_cycle']);
    expect(issues[0]!.params).toMatchObject({ cycle: 'a > b' });
  });

  it('refuses a calculation whose input shows only by the calculation itself', () => {
    const definition = definitionWith([
      field('total', 'calculation', {
        calculation: { expr: { op: 'add', args: [{ field: 'amount' }, 1] } },
      }),
      field('amount', 'money', { logic: { show_if: { field: 'total', op: 'gt', value: 0 } } }),
    ]);
    expect(codesOf(definition)).toEqual([['form.calculation_cycle', 'total']]);
  });

  it('refuses two fields that show only by each other', () => {
    const definition = definitionWith([
      yesNo('a', { logic: { show_if: { field: 'b', op: 'eq', value: 'yes' } } }),
      yesNo('b', { logic: { show_if: { field: 'a', op: 'eq', value: 'yes' } } }),
    ]);
    expect(codesOf(definition)).toEqual([['form.condition_cycle', 'a']]);
  });
});

describe('keys, options and placement', () => {
  it('refuses a duplicate field key, section key and option code', () => {
    const definition = definitionWith(
      [yesNo('x'), yesNo('x'), field('k', 'radio', { options: [option('a'), option('a')] })],
      [section('more', [])],
    );
    expect(checkDefinition(definition).map((i) => [i.code, i.params?.key])).toEqual([
      ['form.duplicate_key', 'x'],
      ['form.duplicate_key', 'a'],
      ['form.duplicate_key', 'more'],
    ]);
  });

  it('accepts branching options on a select answered earlier and refuses the rest', () => {
    const parent = field('kind', 'radio', { options: [option('a'), option('b')] });
    const child = (dependsOn: string, code: string) =>
      field('sub', 'single_select', {
        logic: { options_depend_on: dependsOn },
        options: [option('x', { dependsOnOptionCode: code }), option('z')],
      });
    expect(checkDefinition(definitionWith([parent, child('kind', 'a')]))).toEqual([]);
    expect(codesOf(definitionWith([parent, child('kind', 'c')]))).toEqual([
      ['form.option_dependency', 'sub'],
    ]);
    expect(codesOf(definitionWith([child('kind', 'a')], [section('later', [parent])]))).toEqual([
      ['form.option_dependency', 'sub'],
    ]);
    expect(
      codesOf(
        definitionWith([
          field('sub', 'single_select', { options: [option('x', { dependsOnOptionCode: 'a' })] }),
        ]),
      ),
    ).toEqual([['form.option_dependency', 'sub']]);
  });

  it('refuses a calculation on a text field; a calculation field without one only at publish', () => {
    const def = definitionWith([
      field('t', 'short_text', { calculation: { expr: 1 } }),
      field('c', 'calculation'),
    ]);
    expect(codesOf(def)).toEqual([['form.calculation_misplaced', 't']]);
    expect(
      checkDefinition(def, { publishing: true }).map((issue) => [
        issue.code,
        issue.params?.fieldKey,
      ]),
    ).toEqual([
      ['form.calculation_misplaced', 't'],
      ['form.calculation_missing', 'c'],
    ]);
  });

  it('refuses options on a field that takes none', () => {
    expect(codesOf(definitionWith([field('n', 'number', { options: [option('a')] })]))).toEqual([
      ['form.options_misplaced', 'n'],
    ]);
  });
});

describe('the shape', () => {
  it('refuses a free regex as a pattern', () => {
    const definition = definitionWith([
      field('code', 'short_text', { settings: { validation: { pattern: '^[0-9]+$' as never } } }),
    ]);
    expect(schemaCodes(definition)).toEqual(['form.pattern_unknown']);
  });

  it('refuses a label, help text, placeholder or option label in one language', () => {
    const oneLanguage = { bn: '', en: 'Only English' };
    expect(schemaCodes(definitionWith([field('a', 'short_text', { label: oneLanguage })]))).toEqual(
      ['form.label_language'],
    );
    expect(
      schemaCodes(
        definitionWith([field('a', 'short_text', { settings: { help: { en: 'help' } as never } })]),
      ),
    ).toEqual(['form.label_language']);
    expect(
      schemaCodes(
        definitionWith([
          field('a', 'radio', { options: [{ code: 'x', label: { bn: 'x' } as never }] }),
        ]),
      ),
    ).toEqual(['form.label_language']);
    expect(schemaCodes(definitionWith([], [section('s', [], { title: T('') })]))).toEqual([
      'form.label_language',
      'form.label_language',
    ]);
  });

  it('refuses a text cap above 4,000 characters and an unknown field type', () => {
    expect(
      formDefinitionSchema.safeParse(
        definitionWith([
          field('a', 'long_text', { settings: { validation: { max_length: 4001 } } }),
        ]),
      ).success,
    ).toBe(false);
    const unknownType = definitionWith([
      { ...field('a', 'short_text'), type: 'rich_text' as never },
    ]);
    expect(formDefinitionSchema.safeParse(unknownType).success).toBe(false);
  });
});

describe('the standard columns', () => {
  it('lets a field fill a column of the allowlist and refuses any other column', () => {
    expect(
      checkDefinition(
        definitionWith([field('mother', 'short_text', { standardColumn: 'mother_name' })]),
      ),
    ).toEqual([]);
    for (const column of [
      'status',
      'is_blocked',
      'created_by',
      'merged_into_id',
      'name,mobile',
      'Name',
    ])
      expect(
        codesOf(definitionWith([field('x', 'short_text', { standardColumn: column })])),
        column,
      ).toEqual([['form.standard_column_unknown', 'x']]);
  });

  it('refuses two fields of one version that fill the same column', () => {
    const definition = definitionWith([
      field('name_again', 'short_text', { standardColumn: 'name' }),
    ]);
    expect(codesOf(definition)).toEqual([['form.standard_column_duplicate', 'name_again']]);
  });

  it('lets a repeat group name the family-member table only, and its members the member columns only', () => {
    const group = (groupColumn: string | null, memberColumn: string | null) => [
      field('earners', 'repeat_group', { standardColumn: groupColumn }),
      field('earner_name', 'short_text', {
        settings: { repeat: { group: 'earners' } },
        standardColumn: memberColumn,
      }),
      field('earner_income', 'money', {
        settings: { repeat: { group: 'earners' } },
        standardColumn: 'monthly_income',
      }),
    ];
    expect(checkDefinition(definitionWith(group('beneficiary_family_members', 'name')))).toEqual(
      [],
    );
    expect(codesOf(definitionWith(group('name', 'name')))).toEqual([
      ['form.standard_column_unknown', 'earners'],
    ]);
    expect(codesOf(definitionWith(group(null, 'village')))).toEqual([
      ['form.standard_column_unknown', 'earner_name'],
    ]);
    // the member's income is a column of the row, not of the profile, so the profile may fill it too
    const both = definitionWith([
      ...group('beneficiary_family_members', 'name'),
      field('income', 'money', { standardColumn: 'monthly_income' }),
    ]);
    expect(checkDefinition(both)).toEqual([]);
    // two groups may fill the family-member table, their rows apart, with the same member columns
    const members = definitionWith([
      ...group('beneficiary_family_members', 'name'),
      field('members', 'repeat_group', { standardColumn: 'beneficiary_family_members' }),
      field('member_name', 'short_text', {
        settings: { repeat: { group: 'members' } },
        standardColumn: 'name',
      }),
    ]);
    expect(checkDefinition(members)).toEqual([]);
    const twice = definitionWith([...group('beneficiary_family_members', 'monthly_income')]);
    expect(codesOf(twice)).toEqual([['form.standard_column_duplicate', 'earner_income']]);
  });
});

describe('the size of a definition', () => {
  it('refuses more than 100 options on a field', () => {
    const options = Array.from({ length: 101 }, (_, i) => option(`o${i}`));
    expect(
      formDefinitionSchema.safeParse(definitionWith([field('k', 'radio', { options })])).success,
    ).toBe(false);
    expect(
      formDefinitionSchema.safeParse(
        definitionWith([field('k', 'radio', { options: options.slice(0, 100) })]),
      ).success,
    ).toBe(true);
  });

  it('refuses more than 50 sections and more than 200 fields in one section', () => {
    const sections = Array.from({ length: 49 }, (_, i) => section(`s${i}`, []));
    expect(formDefinitionSchema.safeParse(definitionWith([], sections)).success).toBe(false);
    expect(formDefinitionSchema.safeParse(definitionWith([], sections.slice(0, 48))).success).toBe(
      true,
    );
    const fields = Array.from({ length: 201 }, (_, i) => field(`f${i}`, 'short_text'));
    expect(formDefinitionSchema.safeParse(definitionWith(fields)).success).toBe(false);
  });

  it('refuses more than 50 fields inside one repeat group', () => {
    const members = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        field(`m${i}`, 'short_text', { settings: { repeat: { group: 'g' } } }),
      );
    expect(codesOf(definitionWith([field('g', 'repeat_group'), ...members(51)]))).toEqual([
      ['form.repeat_group_too_large', 'g'],
    ]);
    expect(checkDefinition(definitionWith([field('g', 'repeat_group'), ...members(50)]))).toEqual(
      [],
    );
  });
});
