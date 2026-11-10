import { describe, expect, it } from 'vitest';
import { isNumberTerm, literalContains, mobileOf } from './search.js';

describe('the search terms of the nationwide lists', () => {
  it('reads a mobile number with or without the country prefix', () => {
    expect(mobileOf('01711000001')).toBe('01711000001');
    expect(mobileOf('8801711000001')).toBe('01711000001');
  });

  it('refuses digits that are not a Bangladeshi mobile number', () => {
    for (const digits of ['0171100000', '01211000001', '1000000001', '880121100000'])
      expect(mobileOf(digits)).toBeNull();
  });

  it('takes digits, spaces, dashes and a plus sign as a number search, and letters as a name', () => {
    expect(isNumberTerm('+880 1711-000001')).toBe(true);
    expect(isNumberTerm('1000000001')).toBe(true);
    expect(isNumberTerm('Rahim 1')).toBe(false);
    expect(isNumberTerm('')).toBe(false);
  });

  it('keeps the LIKE wildcards and the escape as letters', () => {
    expect(literalContains('50%_off\\x')).toBe('50\\%\\_off\\\\x');
    expect(literalContains('plain')).toBe('plain');
  });
});
