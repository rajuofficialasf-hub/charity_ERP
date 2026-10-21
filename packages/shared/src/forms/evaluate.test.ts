import { describe, expect, it } from 'vitest';
import { definitionWith, field, option, section, TODAY, yesNo } from '../../test/forms-fixture.js';
import { evaluate, type Answer, type Condition, type FormField } from './index.js';

// The one evaluator: visibility, requirement, options and calculated values from the answers.
const inputs: FormField[] = [
  field('kind', 'radio', { options: [option('a'), option('b'), option('c')] }),
  field('tags', 'multi_select', { options: [option('x'), option('y'), option('z')] }),
  field('amount', 'money'),
  field('count', 'number'),
  field('note', 'short_text'),
  field('dob', 'date'),
];
const answer = (fieldKey: string, value: Answer['value'], repeatIndex?: number): Answer =>
  repeatIndex === undefined ? { fieldKey, value } : { fieldKey, repeatIndex, value };
const given: Answer[] = [
  answer('kind', { t: 'radio', v: 'b' }),
  answer('tags', { t: 'multi_select', v: ['x', 'y'] }),
  answer('amount', { t: 'money', v: '1500.50' }),
  answer('count', { t: 'number', v: 3 }),
  answer('note', { t: 'short_text', v: 'hello' }),
  answer('dob', { t: 'date', v: '2000-05-15' }),
];

/** Whether a probe field with the condition as its show-if is visible for the answers. */
function holds(condition: Condition, answers: Answer[] = given): boolean {
  const definition = definitionWith([
    ...inputs,
    field('probe', 'short_text', { logic: { show_if: condition } }),
  ]);
  return evaluate(definition, answers, { today: TODAY }).fields.probe!.visible;
}

describe('condition operators', () => {
  it('compares text, a number, money and an option with eq and neq', () => {
    expect(holds({ field: 'note', op: 'eq', value: 'hello' })).toBe(true);
    expect(holds({ field: 'note', op: 'eq', value: 'bye' })).toBe(false);
    expect(holds({ field: 'note', op: 'neq', value: 'bye' })).toBe(true);
    expect(holds({ field: 'count', op: 'eq', value: 3 })).toBe(true);
    expect(holds({ field: 'count', op: 'eq', value: '3' })).toBe(true);
    expect(holds({ field: 'count', op: 'neq', value: 3 })).toBe(false);
    expect(holds({ field: 'amount', op: 'eq', value: '1500.5' })).toBe(true);
    expect(holds({ field: 'amount', op: 'eq', value: 1500.5 })).toBe(true);
    expect(holds({ field: 'kind', op: 'eq', value: 'b' })).toBe(true);
    expect(holds({ field: 'kind', op: 'neq', value: 'a' })).toBe(true);
  });

  it('matches a multiple choice when it holds the value', () => {
    expect(holds({ field: 'tags', op: 'eq', value: 'x' })).toBe(true);
    expect(holds({ field: 'tags', op: 'eq', value: 'z' })).toBe(false);
    expect(holds({ field: 'tags', op: 'in', value: ['z', 'y'] })).toBe(true);
    expect(holds({ field: 'tags', op: 'not_in', value: ['z'] })).toBe(true);
  });

  it('orders numbers, money, dates and texts with gt, gte, lt and lte', () => {
    expect(holds({ field: 'count', op: 'gt', value: 2 })).toBe(true);
    expect(holds({ field: 'count', op: 'gt', value: 3 })).toBe(false);
    expect(holds({ field: 'count', op: 'gte', value: 3 })).toBe(true);
    expect(holds({ field: 'count', op: 'lt', value: 3 })).toBe(false);
    expect(holds({ field: 'count', op: 'lte', value: 3 })).toBe(true);
    expect(holds({ field: 'amount', op: 'gt', value: 1500 })).toBe(true);
    expect(holds({ field: 'amount', op: 'gt', value: '1500.50' })).toBe(false);
    expect(holds({ field: 'amount', op: 'lte', value: '1500.50' })).toBe(true);
    expect(holds({ field: 'dob', op: 'lt', value: '2001-01-01' })).toBe(true);
    expect(holds({ field: 'dob', op: 'gte', value: '2001-01-01' })).toBe(false);
    expect(holds({ field: 'note', op: 'gt', value: 'abc' })).toBe(true);
    // a text that is not a number cannot be ordered against one
    expect(holds({ field: 'note', op: 'gt', value: 1 })).toBe(true);
    expect(holds({ field: 'count', op: 'gt', value: 'many' })).toBe(false);
  });

  it('tests membership with in and not_in', () => {
    expect(holds({ field: 'kind', op: 'in', value: ['a', 'b'] })).toBe(true);
    expect(holds({ field: 'kind', op: 'in', value: ['a', 'c'] })).toBe(false);
    expect(holds({ field: 'kind', op: 'not_in', value: ['a', 'c'] })).toBe(true);
    expect(holds({ field: 'count', op: 'in', value: [1, 3] })).toBe(true);
    expect(holds({ field: 'kind', op: 'in', value: 'b' })).toBe(false);
  });

  it('treats a blank, a missing and a hidden answer as empty', () => {
    expect(holds({ field: 'note', op: 'is_empty' })).toBe(false);
    expect(holds({ field: 'note', op: 'not_empty' })).toBe(true);
    const blank = [
      answer('note', { t: 'short_text', v: '   ' }),
      answer('tags', { t: 'multi_select', v: [] }),
    ];
    expect(holds({ field: 'note', op: 'is_empty' }, blank)).toBe(true);
    expect(holds({ field: 'tags', op: 'is_empty' }, blank)).toBe(true);
    expect(holds({ field: 'count', op: 'is_empty' }, blank)).toBe(true);
    for (const op of ['eq', 'neq', 'gt', 'lt', 'in', 'not_in'] as const)
      expect(holds({ field: 'count', op, value: [3] }, []), op).toBe(false);
  });

  it('nests all, any and not', () => {
    expect(
      holds({
        all: [
          { field: 'kind', op: 'eq', value: 'b' },
          {
            any: [
              { field: 'count', op: 'gt', value: 10 },
              { not: { field: 'note', op: 'is_empty' } },
            ],
          },
        ],
      }),
    ).toBe(true);
    expect(
      holds({
        all: [
          { field: 'kind', op: 'eq', value: 'b' },
          { not: { field: 'count', op: 'eq', value: 3 } },
        ],
      }),
    ).toBe(false);
    expect(holds({ not: { all: [{ field: 'kind', op: 'eq', value: 'b' }] } })).toBe(false);
  });
});

describe('visibility and requirement', () => {
  it('hides a field whose show-if fails and then never requires it', () => {
    const definition = definitionWith([
      yesNo('has_loan'),
      field('loan_total', 'money', {
        required: true,
        logic: { show_if: { field: 'has_loan', op: 'eq', value: 'yes' } },
      }),
    ]);
    const no = evaluate(definition, [answer('has_loan', { t: 'radio', v: 'no' })], {
      today: TODAY,
    });
    expect(no.fields.loan_total).toMatchObject({ visible: false, required: false });
    const yes = evaluate(definition, [answer('has_loan', { t: 'radio', v: 'yes' })], {
      today: TODAY,
    });
    expect(yes.fields.loan_total).toMatchObject({ visible: true, required: true });
  });

  it('requires a field only while its required-if holds', () => {
    const definition = definitionWith([
      yesNo('has_loan'),
      field('loan_purpose', 'short_text', {
        logic: { required_if: { field: 'has_loan', op: 'eq', value: 'yes' } },
      }),
    ]);
    const yes = evaluate(definition, [answer('has_loan', { t: 'radio', v: 'yes' })], {
      today: TODAY,
    });
    expect(yes.fields.loan_purpose!.required).toBe(true);
    const none = evaluate(definition, [], { today: TODAY });
    expect(none.fields.loan_purpose).toMatchObject({ visible: true, required: false });
  });

  it('hides every field of a section whose condition fails, and their answers count as empty', () => {
    const definition = definitionWith(
      [
        yesNo('wants_loan'),
        field('probe', 'short_text', {
          logic: { show_if: { field: 'loan_total', op: 'not_empty' } },
        }),
      ],
      [
        section('loans', [field('loan_total', 'money')], {
          condition: { field: 'wants_loan', op: 'eq', value: 'yes' },
        }),
      ],
    );
    const answers = [
      answer('wants_loan', { t: 'radio', v: 'no' }),
      answer('loan_total', { t: 'money', v: '10.00' }),
    ];
    const result = evaluate(definition, answers, { today: TODAY });
    expect(result.sections.loans).toBe(false);
    expect(result.fields.loan_total!.visible).toBe(false);
    expect(result.fields.probe!.visible).toBe(false);
  });

  it('lets a condition refer to a field answered later in the form', () => {
    const definition = definitionWith([
      field('early', 'short_text', {
        logic: { show_if: { field: 'late', op: 'eq', value: 'yes' } },
      }),
      yesNo('late'),
    ]);
    const result = evaluate(definition, [answer('late', { t: 'radio', v: 'yes' })], {
      today: TODAY,
    });
    expect(result.fields.early!.visible).toBe(true);
  });

  it('filters branching options by the previous answer and keeps the unconditional ones', () => {
    const definition = definitionWith([
      field('kind', 'radio', { options: [option('a'), option('b')] }),
      field('sub', 'single_select', {
        logic: { options_depend_on: 'kind' },
        options: [
          option('x', { dependsOnOptionCode: 'a' }),
          option('y', { dependsOnOptionCode: 'b' }),
          option('other', { allowsOtherText: true }),
        ],
      }),
    ]);
    const codes = (answers: Answer[]) =>
      evaluate(definition, answers, { today: TODAY }).fields.sub!.options.map((o) => o.code);
    expect(codes([answer('kind', { t: 'radio', v: 'a' })])).toEqual(['x', 'other']);
    expect(codes([answer('kind', { t: 'radio', v: 'b' })])).toEqual(['y', 'other']);
    expect(codes([])).toEqual(['other']);
  });
});

describe('calculations', () => {
  const calc = (key: string, expr: unknown, round?: number): FormField =>
    field(key, 'calculation', {
      calculation: { expr: expr as never, ...(round === undefined ? {} : { round }) },
    });
  const compute = (fields: FormField[], answers: Answer[], nisabValue?: string) =>
    evaluate(definitionWith(fields), answers, { today: TODAY, nisabValue }).computed;

  it('adds and subtracts money in paisa, exactly', () => {
    const fields = [
      field('a', 'money'),
      field('b', 'money'),
      calc('sum', { op: 'add', args: [{ field: 'a' }, { field: 'b' }] }),
      calc('diff', { op: 'sub', args: [{ field: 'a' }, { field: 'b' }] }),
    ];
    const computed = compute(fields, [
      answer('a', { t: 'money', v: '0.10' }),
      answer('b', { t: 'money', v: '0.20' }),
    ]);
    expect(computed).toEqual({ sum: '0.30', diff: '-0.10' });
  });

  it('multiplies a decimal amount by a money price into money, and divides', () => {
    const fields = [
      field('ana', 'decimal'),
      field('price', 'money'),
      field('people', 'number'),
      calc('value', { op: 'mul', args: [{ field: 'ana' }, { field: 'price' }] }),
      calc('each', { op: 'div', args: [{ field: 'value' }, { field: 'people' }] }),
      calc('ratio', { op: 'div', args: [{ field: 'ana' }, { field: 'people' }] }),
    ];
    const answers = [
      answer('ana', { t: 'decimal', v: 2.5 }),
      answer('price', { t: 'money', v: '7000.00' }),
      answer('people', { t: 'number', v: 4 }),
    ];
    expect(compute(fields, answers)).toEqual({ value: '17500.00', each: '4375.00', ratio: 0.625 });
  });

  it('gives nothing for a division by zero', () => {
    const fields = [
      field('a', 'number'),
      field('b', 'number'),
      calc('q', { op: 'div', args: [{ field: 'a' }, { field: 'b' }] }),
      calc('again', { op: 'add', args: [{ field: 'q' }, 1] }),
    ];
    const computed = compute(fields, [
      answer('a', { t: 'number', v: 5 }),
      answer('b', { t: 'number', v: 0 }),
    ]);
    expect(computed).toEqual({});
  });

  it('takes the smallest and the largest, and rounds last', () => {
    const fields = [
      field('a', 'decimal'),
      field('b', 'decimal'),
      calc('low', { op: 'min', args: [{ field: 'a' }, { field: 'b' }, 10] }),
      calc('high', { op: 'max', args: [{ field: 'a' }, { field: 'b' }] }),
      calc('third', { op: 'div', args: [{ field: 'a' }, 3] }, 2),
      field('m', 'money'),
      calc('whole', { op: 'add', args: [{ field: 'm' }, 0] }, 0),
    ];
    const answers = [
      answer('a', { t: 'decimal', v: 1.25 }),
      answer('b', { t: 'decimal', v: 8 }),
      answer('m', { t: 'money', v: '12.50' }),
    ];
    expect(compute(fields, answers)).toEqual({ low: 1.25, high: 8, third: 0.42, whole: '13.00' });
  });

  it('counts a blank input as zero and gives nothing when every input is blank', () => {
    const fields = [
      field('a', 'money'),
      field('b', 'money'),
      calc('sum', { op: 'add', args: [{ field: 'a' }, { field: 'b' }] }),
    ];
    expect(compute(fields, [answer('a', { t: 'money', v: '5.00' })])).toEqual({ sum: '5.00' });
    expect(compute(fields, [])).toEqual({});
  });

  it('takes the age from a date of birth at the given day', () => {
    const fields = [
      field('dob', 'date'),
      calc('age', { op: 'age_from_dob', args: [{ field: 'dob' }] }),
    ];
    expect(compute(fields, [answer('dob', { t: 'date', v: '2000-10-21' })])).toEqual({ age: 26 });
    expect(compute(fields, [answer('dob', { t: 'date', v: '2000-10-22' })])).toEqual({ age: 25 });
    expect(compute(fields, [])).toEqual({});
  });

  it('compares net assets with the nisab in force and gives nothing without one', () => {
    const fields = [
      field('net', 'money'),
      calc('zakat', { op: 'compare_gte', args: [{ field: 'net' }, { setting: 'nisab_value' }] }),
    ];
    const net = (v: string) => [answer('net', { t: 'money', v })];
    expect(compute(fields, net('70000.00'), '70000.00')).toEqual({ zakat: true });
    expect(compute(fields, net('69999.99'), '70000.00')).toEqual({ zakat: false });
    expect(compute(fields, net('70000.00'))).toEqual({});
  });

  it('sums a field over the rows of a repeat group and computes a member per row', () => {
    const fields = [
      field('base', 'money'),
      field('earners', 'repeat_group'),
      field('income', 'money', { settings: { repeat: { group: 'earners' } } }),
      calc('doubled', { op: 'mul', args: [{ field: 'income' }, 2] }),
      calc('total', {
        op: 'add',
        args: [{ field: 'base' }, { sum_repeat: { group: 'earners', field: 'income' } }],
      }),
    ];
    fields[3]!.settings = { repeat: { group: 'earners' } };
    const answers = [
      answer('base', { t: 'money', v: '5000.00' }),
      answer('income', { t: 'money', v: '3000.00' }, 0),
      answer('income', { t: 'money', v: '2500.50' }, 1),
    ];
    const result = evaluate(definitionWith(fields), answers, { today: TODAY });
    expect(result.rows).toEqual({ earners: 2 });
    expect(result.computed).toEqual({
      'doubled[0]': '6000.00',
      'doubled[1]': '5001.00',
      total: '10500.50',
    });
    expect(Object.keys(result.fields)).toContain('income[1]');
  });

  it('hides the rows of a hidden group so their incomes count for nothing', () => {
    const fields = [
      yesNo('has_earners'),
      field('earners', 'repeat_group', {
        logic: { show_if: { field: 'has_earners', op: 'eq', value: 'yes' } },
      }),
      field('income', 'money', { settings: { repeat: { group: 'earners' } } }),
      field('base', 'money'),
      calc('total', {
        op: 'add',
        args: [{ field: 'base' }, { sum_repeat: { group: 'earners', field: 'income' } }],
      }),
    ];
    const answers = [
      answer('has_earners', { t: 'radio', v: 'no' }),
      answer('base', { t: 'money', v: '100.00' }),
      answer('income', { t: 'money', v: '3000.00' }, 0),
    ];
    const result = evaluate(definitionWith(fields), answers, { today: TODAY });
    expect(result.fields['income[0]']!.visible).toBe(false);
    expect(result.computed).toEqual({ total: '100.00' });
  });

  it('gives nothing, without looping, for a calculation that needs itself', () => {
    const fields = [
      calc('a', { op: 'add', args: [{ field: 'b' }, 1] }),
      calc('b', { op: 'add', args: [{ field: 'a' }, 1] }),
    ];
    expect(compute(fields, [])).toEqual({});
  });
});
