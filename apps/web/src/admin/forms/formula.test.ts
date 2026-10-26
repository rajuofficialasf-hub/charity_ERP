import { describe, expect, it } from 'vitest';
import { type FormulaNames, parseFormula, printFormula } from './formula';

// A typed formula reads into the engine's expression and prints back as the same text; a mistake
// names what is wrong and where.
const names: FormulaNames = {
  fields: new Set([
    'gold_karat',
    'gold_weight',
    'gold_price',
    'cash',
    'bank',
    'income',
    'expense',
    'adults',
    'children',
    'dob',
    'net',
  ]),
  groups: new Map([['members', new Set(['m_income', 'm_name'])]]),
  tables: new Map([
    ['livestock', { rows: new Set(['cow', 'goat']), cols: new Set(['own', 'shared']) }],
  ]),
  results: new Set(['low', 'high', 'zakat_receiver']),
};
const read = (text: string) => {
  const result = parseFormula(text, names);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.expr;
};
const roundTrip = (text: string) => expect(printFormula(read(text))).toBe(text);

describe('a typed formula', () => {
  it('reads a value by condition, nested, into one step with its branches', () => {
    expect(read("if(gold_karat = '24', 16236, if(gold_karat = '22', 14883, 0))")).toEqual({
      if: [
        { when: { field: 'gold_karat', op: 'eq', value: '24' }, then: 16236 },
        { when: { field: 'gold_karat', op: 'eq', value: '22' }, then: 14883 },
      ],
      else: 0,
    });
    roundTrip("if(gold_karat = '24', 16236, if(gold_karat = '22', 14883, 0))");
  });

  it('reads a long formula with the usual order and keeps a bracket as its own part', () => {
    expect(read('cash + bank + gold_weight * gold_price')).toEqual({
      op: 'add',
      args: [
        { field: 'cash' },
        { field: 'bank' },
        { op: 'mul', args: [{ field: 'gold_weight' }, { field: 'gold_price' }] },
      ],
    });
    roundTrip('cash + bank + gold_weight * gold_price');
    expect(read('1 + (adults - 1) * 0.5 + children * 0.3')).toEqual({
      op: 'add',
      args: [
        1,
        { op: 'mul', args: [{ op: 'sub', args: [{ field: 'adults' }, 1] }, 0.5] },
        { op: 'mul', args: [{ field: 'children' }, 0.3] },
      ],
    });
    roundTrip('1 + (adults - 1) * 0.5 + children * 0.3');
    roundTrip('cash - (bank + income)');
  });

  it('reads the rows of a group, a cell of a table, a text result and the ready rules', () => {
    expect(read('count(members, m_income > 0)')).toEqual({
      count_rows: { group: 'members', where: { field: 'm_income', op: 'gt', value: 0 } },
    });
    expect(read('sum(members.m_income)')).toEqual({
      sum_repeat: { group: 'members', field: 'm_income' },
    });
    expect(read('cell(livestock, cow, own)')).toEqual({
      cell: { field: 'livestock', row: 'cow', col: 'own' },
    });
    expect(read("if(net < 199500, 'zakat_receiver', 'high')")).toMatchObject({
      if: [{ then: { result: 'zakat_receiver' } }],
      else: { result: 'high' },
    });
    for (const text of [
      'count(members, m_income > 0)',
      'sum(members.m_income)',
      'cell(livestock, cow, own)',
      "if(expense > income and filled(cash), 'high', 'low')",
      'age(dob)',
      'nisab(net)',
      'min(cash, bank)',
    ])
      roundTrip(text);
  });

  it('compares with another answer by its key and takes Bengali digits', () => {
    expect(read("if(expense > income, 'high', 'low')")).toMatchObject({
      if: [{ when: { field: 'expense', op: 'gt', value: { field: 'income' } } }],
    });
    expect(read('cash * ২')).toEqual({ op: 'mul', args: [{ field: 'cash' }, 2] });
    // a quoted text keeps its own digits
    expect(read("if(gold_karat = '২৪', 1, 0)")).toMatchObject({
      if: [{ when: { value: '২৪' } }],
    });
  });

  it('says where an unknown question, a missing bracket or an unlisted result is', () => {
    expect(parseFormula('cash + gold_karats', names)).toEqual({
      ok: false,
      error: { code: 'unknown_name', column: 8, name: 'gold_karats' },
    });
    expect(parseFormula('(cash + bank', names)).toEqual({
      ok: false,
      error: { code: 'bracket', column: 13 },
    });
    expect(parseFormula("if(cash > 1, 'medium', 'low')", names)).toEqual({
      ok: false,
      error: { code: 'unknown_result', column: 14, name: 'medium' },
    });
    expect(parseFormula('cash +', names)).toMatchObject({ ok: false, error: { code: 'syntax' } });
    expect(parseFormula('   ', names)).toMatchObject({ ok: false, error: { code: 'empty' } });
    expect(parseFormula('sum(members.cash)', names)).toMatchObject({
      ok: false,
      error: { code: 'unknown_name', name: 'cash' },
    });
  });
});

describe('the self-reliance Kobo form typed as formulas', () => {
  const srp: FormulaNames = {
    fields: new Set([
      'adults_count',
      'children_count',
      'beneficiary_income',
      'earner_income',
      'cash',
      'bank',
      'gold_karat',
      'gold_weight',
      'gold_price_per_ana',
      'silver_karat',
      'silver_weight',
      'silver_price_per_ana',
      'investment',
      'receivable_amount',
      'personal_loan_amount',
      'unpaid_dower_amount',
      'bills',
      'total_assets',
      'total_liabilities',
      'net_wealth',
      'total_family_income',
      'daily_income',
      'equiv_adults',
      'yearly_income',
      'poverty_threshold',
      'income_ratio',
      'international_threshold',
      'international_income_ratio',
    ]),
    groups: new Map(),
    tables: new Map(),
    results: new Set(['zakat_receiver', 'not_zakat_receiver', 'above', 'moderate', 'severe']),
  };
  it('reads every calculation of the form', () => {
    for (const text of [
      'adults_count + children_count',
      'beneficiary_income + earner_income',
      "if(gold_karat = '24', 16236, if(gold_karat = '22', 14883, if(gold_karat = '21', 14208, if(gold_karat = '18', 12757, 0))))",
      "if(silver_karat = '24', 249, if(silver_karat = '22', 228, if(silver_karat = '21', 218, if(silver_karat = '18', 187, 0))))",
      'cash + bank + gold_weight * gold_price_per_ana + silver_weight * silver_price_per_ana + investment + receivable_amount',
      'personal_loan_amount + unpaid_dower_amount + bills',
      'total_assets - total_liabilities',
      "if(net_wealth < 199500, 'zakat_receiver', 'not_zakat_receiver')",
      'total_family_income / 30',
      '1 + (adults_count - 1) * 0.5 + children_count * 0.3',
      'daily_income * 22 * 12',
      'equiv_adults * 42936',
      'yearly_income / poverty_threshold',
      "if(income_ratio >= 1, 'above', if(income_ratio >= 0.5, 'moderate', 'severe'))",
      '366 * 365 * equiv_adults',
      'yearly_income / international_threshold',
    ]) {
      const read = parseFormula(text, srp);
      expect(read.ok, text).toBe(true);
      if (read.ok) expect(printFormula(read.expr)).toBe(text);
    }
  });
});
