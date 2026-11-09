import { describe, expect, it } from 'vitest';
import { TODAY } from '../../test/forms-fixture.js';
import { srp26Definition } from '../../test/forms-srp26.js';
import { checkDefinition, evaluate, resultLabelOf, type Answer } from './index.js';

// The self-reliance Kobo form's household calculations, built in the engine, give the numbers the
// Kobo form gives for the same household (worked out by hand below).
const money = (fieldKey: string, v: string): Answer => ({ fieldKey, value: { t: 'money', v } });
const num = (fieldKey: string, v: number): Answer => ({ fieldKey, value: { t: 'number', v } });

describe('the self-reliance household calculations', () => {
  it('is a valid definition', () => {
    expect(checkDefinition(srp26Definition(), { publishing: true })).toEqual([]);
  });

  it('gives a moderately poor family with some gold the zakat and the poverty status', () => {
    const answers: Answer[] = [
      num('adults_count', 3),
      num('children_count', 2),
      money('beneficiary_income', '6000.00'),
      money('earner_income', '3000.00'),
      money('cash', '5000.00'),
      money('bank', '2000.00'),
      { fieldKey: 'gold_karat', value: { t: 'single_select', v: '22' } },
      { fieldKey: 'gold_weight', value: { t: 'decimal', v: 2 } },
      money('receivable_amount', '1000.00'),
      money('personal_loan_amount', '10000.00'),
      money('unpaid_dower_amount', '5000.00'),
    ];
    const computed = evaluate(srp26Definition(), answers, { today: TODAY }).computed;
    expect(computed).toMatchObject({
      family_member: 5,
      total_family_income: '9000.00',
      gold_price_per_ana: 14883,
      // the silver price of no karat is the last branch, 0
      silver_price_per_ana: 0,
      // 5000 + 2000 + 2 × 14883 + 1000
      total_assets: '37766.00',
      total_liabilities: '15000.00',
      net_wealth: '22766.00',
      zakat_status: 'zakat_receiver',
      daily_income: '300.00',
      yearly_income: '79200.00',
      // 1 + (3 − 1) × 0.5 + 2 × 0.3
      equiv_adults: 2.6,
      // 79200 ÷ (2.6 × 42936) = 0.709…
      income_ratio: '0.71',
      poverty_status: 'moderate',
      // 79200 ÷ (366 × 365 × 2.6) = 0.228…
      international_income_ratio: '0.23',
      international_poverty_status: 'severe',
    });
  });

  it('gives a single earner above the line with savings no zakat', () => {
    const answers: Answer[] = [
      num('adults_count', 1),
      money('beneficiary_income', '30000.00'),
      money('cash', '250000.00'),
    ];
    const computed = evaluate(srp26Definition(), answers, { today: TODAY }).computed;
    expect(computed).toMatchObject({
      family_member: 1,
      equiv_adults: 1,
      net_wealth: '250000.00',
      zakat_status: 'not_zakat_receiver',
      daily_income: '1000.00',
      yearly_income: '264000.00',
      // 264000 ÷ 42936 = 6.148…; a ratio above 1 is compared as a number, not as text
      income_ratio: '6.15',
      poverty_status: 'above',
      international_income_ratio: '1.98',
      international_poverty_status: 'above',
    });
  });

  it('reads a text result in the reader’s language', () => {
    const status = srp26Definition()
      .sections.flatMap((s) => s.fields)
      .find((f) => f.fieldKey === 'poverty_status')!;
    expect(resultLabelOf(status, 'severe')).toEqual({
      bn: 'চরম দারিদ্র্য',
      en: 'Severe Poverty',
    });
    expect(resultLabelOf(status, 'unknown')).toBeNull();
  });
});
