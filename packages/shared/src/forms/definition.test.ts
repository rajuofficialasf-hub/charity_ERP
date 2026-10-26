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
import {
  checkDefinition,
  formDefinitionSchema,
  type FormDefinition,
  type FormField,
} from './index.js';

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

describe('conditional values, comparisons and row counts', () => {
  const calc = (key: string, expr: unknown, extra: Partial<FormField> = {}) =>
    field(key, 'calculation', { calculation: { expr: expr as never }, ...extra });
  const results = { results: [{ code: 'low', label: T('low') }] };

  it('refuses a text result the question does not list, and results on any other question', () => {
    const definition = definitionWith([
      field('income', 'money'),
      calc(
        'band',
        {
          if: [{ when: { field: 'income', op: 'lt', value: 5 }, then: { result: 'low' } }],
          else: { result: 'medium' },
        },
        { settings: results },
      ),
      field('note', 'short_text', { settings: results }),
    ]);
    expect(codesOf(definition)).toEqual([
      ['form.result_unknown', 'band'],
      ['form.result_misplaced', 'note'],
    ]);
  });

  it('follows the conditions of a branch as references and finds a cycle through them', () => {
    const definition = definitionWith([
      calc('a', { if: [{ when: { field: 'b', op: 'gt', value: 0 }, then: 1 }], else: 0 }),
      calc('b', { op: 'add', args: [{ field: 'a' }, 1] }),
      calc('c', { if: [{ when: { field: 'gone', op: 'gt', value: 0 }, then: 1 }], else: 0 }),
    ]);
    const codes = codesOf(definition).map(([code]) => code);
    expect(codes).toContain('form.calculation_cycle');
    expect(codesOf(definition)).toContainEqual(['form.unknown_reference', 'gone']);
  });

  it('checks the answer a comparison names, and refuses comparing a text with a number', () => {
    const definition = definitionWith([
      field('income', 'money'),
      field('name_again', 'short_text'),
      field('why', 'long_text', {
        logic: { show_if: { field: 'income', op: 'gt', value: { field: 'name_again' } } },
      }),
      field('lost', 'long_text', {
        logic: { show_if: { field: 'income', op: 'gt', value: { field: 'missing' } } },
      }),
    ]);
    expect(codesOf(definition)).toEqual([
      ['form.comparison_type', 'why'],
      ['form.unknown_reference', 'missing'],
    ]);
  });

  it('counts rows only of a repeat group, with a condition on its own rows', () => {
    const definition = definitionWith([
      field('members', 'repeat_group'),
      field('m_income', 'money', { settings: { repeat: { group: 'members' } } }),
      field('other', 'repeat_group'),
      field('o_income', 'money', { settings: { repeat: { group: 'other' } } }),
      calc('ok', {
        count_rows: { group: 'members', where: { field: 'm_income', op: 'gt', value: 0 } },
      }),
      calc('not_group', { count_rows: { group: 'ok' } }),
      calc('cross', {
        count_rows: { group: 'members', where: { field: 'o_income', op: 'gt', value: 0 } },
      }),
    ]);
    expect(codesOf(definition)).toEqual([
      ['form.unknown_reference', 'ok'],
      ['form.repeat_reference', 'o_income'],
    ]);
  });

  it('refuses at publish a volunteer question that reads an official-only answer, and allows the reverse', () => {
    const official = section(
      'office',
      [
        field('assessed', 'money'),
        calc('office_total', { op: 'add', args: [{ field: 'income' }, 1] }),
      ],
      { visibility: 'official_only' },
    );
    const definition = definitionWith(
      [
        field('income', 'money'),
        field('shown', 'short_text', {
          logic: { show_if: { field: 'assessed', op: 'gt', value: 0 } },
        }),
        field('compared', 'short_text', {
          logic: { show_if: { field: 'income', op: 'gt', value: { field: 'assessed' } } },
        }),
        calc('leak', { op: 'add', args: [{ field: 'assessed' }, 1] }),
      ],
      [official],
    );
    // a draft keeps saving while the builder works; the publish refuses it
    expect(codesOf(definition)).toEqual([]);
    expect(
      checkDefinition(definition, { publishing: true }).map((i) => [i.code, i.params?.fieldKey]),
    ).toEqual([
      ['form.reference_hidden', 'shown'],
      ['form.reference_hidden', 'compared'],
      ['form.reference_hidden', 'leak'],
    ]);
  });

  it('refuses a comparison value that is neither a fixed value nor exactly another answer', () => {
    const condition = (value: unknown) =>
      schemaCodes(
        definitionWith([
          field('a', 'money'),
          field('b', 'money', {
            logic: { show_if: { field: 'a', op: 'gt', value: value as never } },
          }),
        ]),
      ).length;
    expect(condition({ field: 'a' })).toBe(0);
    expect(condition(5)).toBe(0);
    expect(condition({ field: 'a', extra: 1 })).toBeGreaterThan(0);
    expect(condition({ other: 'a' })).toBeGreaterThan(0);
  });

  it('refuses an expression deeper than 20 levels or larger than 500 parts', () => {
    let deep: unknown = 1;
    for (let i = 0; i < 20; i += 1) deep = { op: 'add', args: [deep, 1] };
    const wide = { op: 'add', args: Array.from({ length: 500 }, () => 1) };
    let fine: unknown = 1;
    for (let i = 0; i < 19; i += 1) fine = { op: 'add', args: [fine, 1] };
    // a comparison with another answer reads two answers and counts as two parts
    const compared = {
      if: [
        {
          when: {
            any: Array.from({ length: 300 }, () => ({
              field: 'a',
              op: 'gt',
              value: { field: 'b' },
            })),
          },
          then: 1,
        },
      ],
      else: 0,
    };
    const definition = definitionWith([
      field('a', 'money'),
      field('b', 'money'),
      calc('deep', deep),
      calc('wide', wide),
      calc('fine', fine),
      calc('compared', compared),
    ]);
    expect(codesOf(definition)).toEqual([
      ['form.expression_too_large', 'deep'],
      ['form.expression_too_large', 'wide'],
      ['form.expression_too_large', 'compared'],
    ]);
  });
});

describe('defaults, read-only questions, rows from a count and piping', () => {
  it('refuses a read-only question with neither a calculation nor a default, and a default of the wrong kind', () => {
    const definition = definitionWith([
      field('free', 'short_text', { settings: { read_only: true } }),
      field('when', 'date', { settings: { default: { text: 'today' } } }),
      field('prefix', 'short_text', { settings: { default: { text: 'ASF-' }, read_only: true } }),
      field('day', 'date', { settings: { default: { today: true } } }),
      field('half', 'number', { settings: { default: { number: 2.5 } } }),
      field('over', 'number', { settings: { default: { number: 5 }, validation: { max: 3 } } }),
      field('owed', 'money', { settings: { default: { number: -1 } } }),
      field('cell', 'phone', { settings: { default: { text: 'ASF-' } } }),
      field('long_prefix', 'short_text', {
        settings: { default: { text: 'abcdef' }, validation: { max_length: 3 } },
      }),
      field('amount', 'money', { settings: { default: { number: 500.5 } } }),
    ]);
    expect(codesOf(definition)).toEqual([
      ['form.read_only_invalid', 'free'],
      ['form.default_misplaced', 'when'],
      ['form.default_misplaced', 'half'],
      ['form.default_misplaced', 'over'],
      ['form.default_misplaced', 'owed'],
      ['form.default_misplaced', 'cell'],
      ['form.default_misplaced', 'long_prefix'],
    ]);
  });

  it('takes a row count only from an earlier whole-number question with a cap within the rows', () => {
    const group = (countFrom: string) =>
      field('members', 'repeat_group', { settings: { repeat: { count_from: countFrom } } });
    const capped = field('family_count', 'number', {
      settings: { validation: { min: 0, max: 20 } },
    });
    expect(codesOf(definitionWith([capped, group('family_count')]))).toEqual([]);
    expect(
      codesOf(definitionWith([field('label_text', 'short_text'), group('label_text')])),
    ).toEqual([['form.repeat_count_invalid', 'members']]);
    expect(codesOf(definitionWith([group('family_count'), capped]))).toEqual([
      ['form.repeat_count_invalid', 'members'],
    ]);
    // no cap, or one above the 50 rows a group may hold
    expect(
      codesOf(definitionWith([field('family_count', 'number'), group('family_count')])),
    ).toEqual([['form.repeat_count_invalid', 'members']]);
    expect(
      codesOf(
        definitionWith([
          field('family_count', 'number', { settings: { validation: { min: 0, max: 60 } } }),
          group('family_count'),
        ]),
      ),
    ).toEqual([['form.repeat_count_invalid', 'members']]);
    // a count that may go below 0 asks for rows that cannot exist
    expect(
      codesOf(
        definitionWith([
          field('family_count', 'number', { settings: { validation: { max: 20 } } }),
          group('family_count'),
        ]),
      ),
    ).toEqual([['form.repeat_count_invalid', 'members']]);
  });

  it('pipes only an earlier answer that exists, and at publish only one its readers see', () => {
    const definition = definitionWith(
      [
        field('q_farm', 'single_select', { options: [option('cow')] }),
        field('q_count', 'number', {
          label: { bn: 'কতটি {{q_farm}}?', en: 'How many {{q_farm}}?' },
        }),
        field('q_early', 'number', { label: { bn: '{{q_late}}', en: '{{q_late}}' } }),
        field('q_late', 'short_text'),
        field('q_gone', 'number', { settings: { help: { bn: '{{nope}}', en: 'x' } } }),
        field('q_secret', 'short_text', { label: { bn: '{{assessed}}', en: '{{assessed}}' } }),
      ],
      [section('office', [field('assessed', 'money')], { visibility: 'official_only' })],
    );
    expect(codesOf(definition)).toEqual([
      ['form.pipe_order', 'q_early'],
      ['form.unknown_reference', 'nope'],
      ['form.pipe_order', 'q_secret'],
    ]);
    expect(
      checkDefinition(definition, { publishing: true })
        .filter((i) => i.code === 'form.reference_hidden')
        .map((i) => i.params?.fieldKey),
    ).toEqual(['q_secret']);
  });
});

describe('a number table', () => {
  const table = (rows: string[], cols: string[]) => ({
    table: {
      rows: rows.map((key) => ({ key, label: T(key) })),
      cols: cols.map((key) => ({ key, label: T(key) })),
    },
  });

  it('needs its rows and columns, unique keys of its own, at most 200 cells, outside any group', () => {
    const many = Array.from({ length: 21 }, (_, i) => `r${i}`);
    const definition = definitionWith([
      field('fine', 'number_table', { settings: table(['cow'], ['own']) }),
      field('largest', 'number_table', {
        settings: table(
          Array.from({ length: 20 }, (_, i) => `r${i}`),
          ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
        ),
      }),
      field('no_cols', 'number_table', { settings: table(['cow'], []) }),
      field('bare', 'number_table'),
      field('twice', 'number_table', { settings: table(['cow', 'cow'], ['own']) }),
      field('sneaky', 'number_table', { settings: table(['constructor'], ['own']) }),
      field('huge', 'number_table', {
        settings: table(many, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']),
      }),
      field('misplaced', 'short_text', { settings: table(['cow'], ['own']) }),
      field('people', 'repeat_group'),
      field('grouped', 'number_table', {
        settings: { ...table(['cow'], ['own']), repeat: { group: 'people' } },
      }),
    ]);
    expect(codesOf(definition)).toEqual([
      ['form.table_invalid', 'no_cols'],
      ['form.table_invalid', 'bare'],
      ['form.table_invalid', 'twice'],
      ['form.table_invalid', 'sneaky'],
      ['form.table_invalid', 'huge'],
      ['form.table_invalid', 'misplaced'],
      ['form.table_invalid', 'grouped'],
    ]);
  });

  it('refuses a cell of an unknown table, row or column', () => {
    const cell = (fieldName: string, row: string, col: string) =>
      field(`c_${fieldName}_${row}_${col}`, 'calculation', {
        calculation: { expr: { cell: { field: fieldName, row, col } } },
      });
    const definition = definitionWith([
      field('livestock', 'number_table', { settings: table(['cow'], ['own']) }),
      field('label_text', 'short_text'),
      cell('livestock', 'cow', 'own'),
      cell('livestock', 'horse', 'own'),
      cell('label_text', 'cow', 'own'),
    ]);
    expect(codesOf(definition)).toEqual([
      ['form.unknown_reference', 'livestock.horse.own'],
      ['form.unknown_reference', 'label_text.cow.own'],
    ]);
  });
});
