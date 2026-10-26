import type { Condition, Expr, FormField } from '../src/forms/index.js';
import { definitionWith, field, option, T } from './forms-fixture.js';

/**
 * The household calculations of the department's self-reliance Kobo form (SRP-26) as one form
 * definition: the gold and silver price by karat, total assets and liabilities, net wealth and the
 * zakat status, the family income by day and year, the equivalent adults and the national and
 * international poverty status. The numbers are the ones the Kobo form uses.
 */

const f = (key: string): Expr => ({ field: key });
const add = (...args: Expr[]): Expr => ({ op: 'add', args });
const mul = (...args: Expr[]): Expr => ({ op: 'mul', args });
const div = (...args: Expr[]): Expr => ({ op: 'div', args });
const sub = (...args: Expr[]): Expr => ({ op: 'sub', args });
const calc = (key: string, expr: Expr, extra: Partial<FormField> = {}): FormField =>
  field(key, 'calculation', { calculation: { expr }, ...extra });
const rounded = (key: string, expr: Expr, round: number): FormField =>
  field(key, 'calculation', { calculation: { expr, round } });
const byKarat = (key: string, prices: [string, number][]): Expr => {
  const [first, ...rest] = prices;
  const when = (code: string): Condition => ({ field: key, op: 'eq', value: code });
  return {
    if: [{ when: when(first![0]), then: first![1] }],
    else: rest.length ? byKarat(key, rest) : 0,
  };
};
const status = (ratio: string): Expr => ({
  if: [
    { when: { field: ratio, op: 'gte', value: 1 }, then: { result: 'above' } },
    { when: { field: ratio, op: 'gte', value: 0.5 }, then: { result: 'moderate' } },
  ],
  else: { result: 'severe' },
});
const POVERTY = {
  results: [
    { code: 'above', label: { bn: 'দারিদ্র্যসীমার উপরে', en: 'Above Poverty Line' } },
    { code: 'moderate', label: { bn: 'মাঝারি দারিদ্র্য', en: 'Moderate Poverty' } },
    { code: 'severe', label: { bn: 'চরম দারিদ্র্য', en: 'Severe Poverty' } },
  ],
};
const karats = [option('24'), option('22'), option('21'), option('18')];
const money = (key: string) => field(key, 'money');

export const SRP26_FIELDS: FormField[] = [
  field('adults_count', 'number'),
  field('children_count', 'number'),
  money('beneficiary_income'),
  money('earner_income'),
  money('cash'),
  money('bank'),
  field('gold_karat', 'single_select', { options: karats }),
  field('gold_weight', 'decimal'),
  field('silver_karat', 'single_select', { options: karats }),
  field('silver_weight', 'decimal'),
  money('investment'),
  money('receivable_amount'),
  money('personal_loan_amount'),
  money('unpaid_dower_amount'),
  money('bills'),
  calc('family_member', add(f('adults_count'), f('children_count'))),
  calc('total_family_income', add(f('beneficiary_income'), f('earner_income'))),
  calc(
    'gold_price_per_ana',
    byKarat('gold_karat', [
      ['24', 16236],
      ['22', 14883],
      ['21', 14208],
      ['18', 12757],
    ]),
  ),
  calc(
    'silver_price_per_ana',
    byKarat('silver_karat', [
      ['24', 249],
      ['22', 228],
      ['21', 218],
      ['18', 187],
    ]),
  ),
  calc(
    'total_assets',
    add(
      f('cash'),
      f('bank'),
      mul(f('gold_weight'), f('gold_price_per_ana')),
      mul(f('silver_weight'), f('silver_price_per_ana')),
      f('investment'),
      f('receivable_amount'),
    ),
  ),
  calc('total_liabilities', add(f('personal_loan_amount'), f('unpaid_dower_amount'), f('bills'))),
  calc('net_wealth', sub(f('total_assets'), f('total_liabilities'))),
  calc(
    'zakat_status',
    {
      if: [
        {
          when: { field: 'net_wealth', op: 'lt', value: 199500 },
          then: { result: 'zakat_receiver' },
        },
      ],
      else: { result: 'not_zakat_receiver' },
    },
    {
      settings: {
        results: [
          { code: 'zakat_receiver', label: T('zakat_receiver') },
          { code: 'not_zakat_receiver', label: T('not_zakat_receiver') },
        ],
      },
    },
  ),
  rounded('daily_income', div(f('total_family_income'), 30), 2),
  calc('equiv_adults', add(1, mul(sub(f('adults_count'), 1), 0.5), mul(f('children_count'), 0.3))),
  rounded('yearly_income', mul(f('daily_income'), 22, 12), 2),
  calc('poverty_threshold', mul(f('equiv_adults'), 42936)),
  rounded('income_ratio', div(f('yearly_income'), f('poverty_threshold')), 2),
  calc('poverty_status', status('income_ratio'), { settings: POVERTY }),
  calc('international_threshold', mul(366, 365, f('equiv_adults'))),
  rounded('international_income_ratio', div(f('yearly_income'), f('international_threshold')), 2),
  calc('international_poverty_status', status('international_income_ratio'), {
    settings: POVERTY,
  }),
];

export const srp26Definition = () => definitionWith(SRP26_FIELDS);
