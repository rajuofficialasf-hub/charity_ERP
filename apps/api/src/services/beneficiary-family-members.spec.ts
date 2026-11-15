import { describe, expect, it } from 'vitest';
import { valuesOf } from './beneficiary-family-members.js';

const row = (columns: Record<string, unknown>) => ({
  group: 'q_members',
  repeatIndex: 1,
  columns,
  isEarner: false,
});
const refusal = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return (error as { details?: unknown }).details;
  }
  return null;
};

describe('the values of a row of the family group', () => {
  it('write the income as the amount checked, with two decimals', () => {
    expect(valuesOf(row({ name: 'করিম', monthly_income: 2500.5 }), 'p')?.monthlyIncome).toBe(
      '2500.50',
    );
    expect(valuesOf(row({ name: 'করিম', monthly_income: ' 300 ' }), 'p')?.monthlyIncome).toBe(
      '300.00',
    );
  });

  it('refuse a text income that is not written as an amount, though a number reads it', () => {
    for (const income of ['0x10', '1e3', '-5', 'Infinity', '3,000'])
      expect(refusal(() => valuesOf(row({ name: 'করিম', monthly_income: income }), 'p'))).toEqual([
        { path: 'answers', code: 'validation.amount_format' },
      ]);
  });

  it('refuse an income that rounds beyond the column, and a negative or endless number', () => {
    for (const income of ['999999999999.999', 1e12, -1, Number.POSITIVE_INFINITY])
      expect(refusal(() => valuesOf(row({ name: 'করিম', monthly_income: income }), 'p'))).toEqual([
        { path: 'answers', code: 'validation.out_of_range' },
      ]);
  });

  it('skip a row that answers nothing, and refuse one without a name at the name', () => {
    expect(valuesOf(row({ name: '  ', relationship_code: null, age_years: undefined }), 'p')).toBe(
      null,
    );
    expect(refusal(() => valuesOf(row({ age_years: 7 }), 'q_member_name[1]'))).toEqual([
      { path: 'q_member_name[1]', code: 'validation.required' },
    ]);
  });
});
