import { describe, expect, it } from 'vitest';
import { fieldName } from './account-events';

// A request field is named in both languages as the screens name it.
describe('fieldName', () => {
  it('names each field in bn and en and joins several', () => {
    const one = fieldName(['fatherName']);
    expect(one.en).toMatch(/father/i);
    expect(one.bn).not.toBe(one.en);
    expect(fieldName(['name', 'nid']).en).toContain(', ');
  });

  it('keeps an unknown key as it is', () => {
    expect(fieldName(['__proto__'])).toEqual({ bn: '__proto__', en: '__proto__' });
  });
});
