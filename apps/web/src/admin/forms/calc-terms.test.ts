import type { Expr } from '@css/shared';
import { describe, expect, it } from 'vitest';
import { exprFromTerms, termsFromExpr } from './calc-terms';

const f = (field: string): Expr => ({ field });
const add = (...args: Expr[]): Expr => ({ op: 'add', args });
const sub = (...args: Expr[]): Expr => ({ op: 'sub', args });

/** The calculations of the two seeded form templates, as the library holds them. */
const SEEDED: Expr[] = [
  add(f('members_14_plus'), f('children_under_14')),
  add(f('monthly_income'), { sum_repeat: { group: 'earners', field: 'earner_monthly_income' } }),
  { op: 'mul', args: [f('gold_amount'), f('gold_price_per_ana')] },
  { op: 'mul', args: [f('silver_amount'), f('silver_price_per_ana')] },
  add(
    f('zakat_cash'),
    f('zakat_bank_deposit'),
    f('gold_value'),
    f('silver_value'),
    f('zakat_savings_certificates'),
    f('zakat_stock_goods'),
    f('zakat_receivables'),
    f('zakat_rent_crop_income'),
    f('zakat_land_for_sale'),
    f('zakat_security_deposit'),
  ),
  add(f('zakat_debts'), f('loan_total')),
  sub(f('zakat_total_assets'), f('zakat_total_debts')),
  { op: 'compare_gte', args: [f('zakat_net_assets'), { setting: 'nisab_value' }] },
];

describe('calculation terms', () => {
  it('reads and writes back every calculation of the seeded templates', () => {
    for (const expr of SEEDED) {
      const terms = termsFromExpr(expr);
      expect(terms.kind, JSON.stringify(expr)).not.toBe('complex');
      expect(exprFromTerms(terms as Exclude<typeof terms, { kind: 'complex' }>)).toEqual(expr);
    }
  });

  it('reads a plus-and-minus chain with a repeat group sum and a number', () => {
    expect(
      termsFromExpr(sub(add(f('a'), { sum_repeat: { group: 'g', field: 'x' } }), f('b'), 10)),
    ).toEqual({
      kind: 'chain',
      terms: [
        { sign: 1, term: { kind: 'field', key: 'a' } },
        { sign: 1, term: { kind: 'group_sum', group: 'g', field: 'x' } },
        { sign: -1, term: { kind: 'field', key: 'b' } },
        { sign: -1, term: { kind: 'number', value: 10 } },
      ],
    });
  });

  it('writes pluses first and the minuses after them, keeping the result', () => {
    expect(
      exprFromTerms({
        kind: 'chain',
        terms: [
          { sign: 1, term: { kind: 'field', key: 'a' } },
          { sign: -1, term: { kind: 'field', key: 'b' } },
          { sign: 1, term: { kind: 'field', key: 'c' } },
        ],
      }),
    ).toEqual(sub(add(f('a'), f('c')), f('b')));
    expect(
      exprFromTerms({ kind: 'chain', terms: [{ sign: 1, term: { kind: 'field', key: 'a' } }] }),
    ).toEqual(f('a'));
  });

  it('reads two terms times or divided by, the age from a date of birth and the nisab rule', () => {
    expect(termsFromExpr({ op: 'div', args: [f('a'), 2] })).toEqual({
      kind: 'product',
      op: 'div',
      left: { kind: 'field', key: 'a' },
      right: { kind: 'number', value: 2 },
    });
    const age: Expr = { op: 'age_from_dob', args: [f('dob')] };
    expect(termsFromExpr(age)).toEqual({ kind: 'age', dob: 'dob' });
    expect(exprFromTerms({ kind: 'age', dob: 'dob' })).toEqual(age);
    expect(termsFromExpr(SEEDED[7]!)).toEqual({ kind: 'nisab', net: 'zakat_net_assets' });
  });

  it('writes a chain of only minus terms so that it reads back the same', () => {
    const shape = {
      kind: 'chain' as const,
      terms: [
        { sign: -1 as const, term: { kind: 'field' as const, key: 'a' } },
        { sign: -1 as const, term: { kind: 'field' as const, key: 'b' } },
      ],
    };
    expect(termsFromExpr(exprFromTerms(shape))).toEqual(shape);
  });

  it('marks what the editor cannot show as not editable here', () => {
    expect(termsFromExpr({ op: 'min', args: [f('a'), f('b')] })).toEqual({ kind: 'complex' });
    expect(termsFromExpr({ op: 'mul', args: [add(f('a'), f('b')), f('c')] })).toEqual({
      kind: 'complex',
    });
    expect(termsFromExpr({ op: 'mul', args: [f('a'), f('b'), f('c')] })).toEqual({
      kind: 'complex',
    });
    expect(termsFromExpr(sub(f('a'), add(f('b'), f('c'))))).toEqual({ kind: 'complex' });
    // only the nisab is a setting today; anything else stays read-only rather than be rewritten
    expect(
      termsFromExpr({ op: 'compare_gte', args: [f('a'), { setting: 'other' } as unknown as Expr] }),
    ).toEqual({ kind: 'complex' });
  });
});
