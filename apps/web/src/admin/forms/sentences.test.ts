import { describe, expect, it } from 'vitest';
import { definition, field, option, section } from '../../../test/forms';
import { calculationRules, conditionRules, type RuleWords } from './sentences';

const words: RuleWords = {
  and: 'and',
  or: 'or',
  compare: (op, q, v) => `${q} ${op} ${v}`,
  plus: '+',
  minus: '−',
  times: '×',
  dividedBy: '÷',
  age: (q) => `age from ${q}`,
  nisab: (q) => `${q} against the nisab`,
  groupSum: (group, f) => `sum of ${f} over ${group}`,
};

const def = definition(
  section('money', [
    field('has_loan', 'radio', {
      label: { bn: 'ঋণ আছে?', en: 'Loan?' },
      options: [option('yes', { label: { bn: 'হ্যাঁ', en: 'Yes' } }), option('no')],
    }),
    field('income', 'number', { label: { bn: 'আয়', en: 'Income' } }),
    field('members', 'repeat_group', { label: { bn: 'সদস্য', en: 'Members' } }),
    field('member_income', 'money', {
      label: { bn: 'সদস্যের আয়', en: "Member's income" },
      settings: { repeat: { group: 'members' } },
    }),
    field('dob', 'date', { label: { bn: 'জন্মতারিখ', en: 'Date of birth' } }),
  ]),
);

describe('a condition read as a sentence', () => {
  it('names the questions by their labels and an option by its label, joined by the rule', () => {
    expect(
      conditionRules(
        def,
        {
          any: [
            { field: 'has_loan', op: 'eq', value: 'yes' },
            { field: 'income', op: 'gt', value: 5000 },
          ],
        },
        'en',
        words,
      ),
    ).toEqual({ kind: 'rules', text: 'Loan? eq Yes or Income gt 5000' });
    expect(
      conditionRules(def, { field: 'has_loan', op: 'in', value: ['yes', 'no'] }, 'bn', words),
    ).toEqual({ kind: 'rules', text: 'ঋণ আছে? in হ্যাঁ, no' });
  });

  it('says none for no condition and complex for one the rows cannot show', () => {
    expect(conditionRules(def, undefined, 'en', words)).toEqual({ kind: 'none' });
    expect(
      conditionRules(def, { any: [{ all: [{ field: 'income', op: 'is_empty' }] }] }, 'en', words),
    ).toEqual({ kind: 'complex' });
  });
});

describe('a calculation read as a sentence', () => {
  const calc = (expr: unknown) =>
    calculationRules(
      def,
      field('total', 'calculation', { calculation: { expr } as never }),
      'en',
      words,
    );

  it('joins a chain with plus and minus, a group sum by its words, a product by its sign', () => {
    expect(
      calc({
        op: 'sub',
        args: [
          {
            op: 'add',
            args: [
              { field: 'income' },
              { sum_repeat: { group: 'members', field: 'member_income' } },
            ],
          },
          1,
        ],
      }),
    ).toEqual({ kind: 'rules', text: "“Income” + sum of Member's income over Members − 1" });
    expect(calc({ op: 'mul', args: [{ field: 'income' }, 12] })).toEqual({
      kind: 'rules',
      text: '“Income” × 12',
    });
  });

  it('reads the age and the nisab rules, and says none without a rule', () => {
    expect(calc({ op: 'age_from_dob', args: [{ field: 'dob' }] })).toEqual({
      kind: 'rules',
      text: 'age from Date of birth',
    });
    expect(calculationRules(def, field('total', 'calculation'), 'en', words)).toEqual({
      kind: 'none',
    });
  });
});
