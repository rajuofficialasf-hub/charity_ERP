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
describe('the mandatory core', () => {
  it('accepts a form with the core and extra fields', () => {
    const definition = definitionWith([yesNo('has_loan')]);
    expect(checkDefinition(definition)).toEqual([]);
    expect(formDefinitionSchema.safeParse(definition).success).toBe(true);
  });

  it('refuses a form without a core field, naming it', () => {
    const definition: FormDefinition = {
      sections: [
        section(
          'basic_info',
          coreFields().filter((f) => f.fieldKey !== 'gender'),
        ),
        section('address', addressFields()),
      ],
    };
    expect(codesOf(definition)).toEqual([['form.core_field_missing', 'gender']]);
    expect(schemaCodes(definition)).toEqual(['form.core_field_missing']);
  });

  it('refuses a core field made optional', () => {
    const definition = definitionWith();
    definition.sections[0]!.fields.find((f) => f.fieldKey === 'name')!.required = false;
    expect(codesOf(definition)).toEqual([['form.core_field_optional', 'name']]);
  });

  it('refuses a core field in an official-only section', () => {
    const definition = definitionWith();
    definition.sections[1]!.visibility = 'official_only';
    expect(codesOf(definition)).toEqual([
      ['form.core_field_hidden', 'address'],
      ['form.core_field_hidden', 'village'],
    ]);
  });

  it('refuses a core field behind a condition or inside a conditional section', () => {
    const withShowIf = definitionWith([yesNo('x')]);
    withShowIf.sections[0]!.fields.find((f) => f.fieldKey === 'mobile')!.logic = {
      show_if: { field: 'x', op: 'eq', value: 'yes' },
    };
    expect(codesOf(withShowIf)).toEqual([['form.core_field_hidden', 'mobile']]);
    const withCondition = definitionWith([yesNo('x')]);
    withCondition.sections[1]!.condition = { field: 'x', op: 'eq', value: 'yes' };
    expect(codesOf(withCondition)).toEqual([
      ['form.core_field_hidden', 'address'],
      ['form.core_field_hidden', 'village'],
    ]);
  });

  it('refuses a core field of another type or column', () => {
    const definition = definitionWith();
    definition.sections[1]!.fields.find((f) => f.fieldKey === 'village')!.standardColumn =
      'landmark';
    expect(codesOf(definition)).toEqual([['form.core_field_shape', 'village']]);
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

  it('refuses a calculation on a text field and a calculation field without one', () => {
    expect(
      codesOf(
        definitionWith([
          field('t', 'short_text', { calculation: { expr: 1 } }),
          field('c', 'calculation'),
        ]),
      ),
    ).toEqual([
      ['form.calculation_misplaced', 't'],
      ['form.calculation_misplaced', 'c'],
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
