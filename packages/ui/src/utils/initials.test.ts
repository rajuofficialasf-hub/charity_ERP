import { describe, expect, it } from 'vitest';
import { initials } from './initials.js';

describe('initials', () => {
  it('takes the first grapheme of the first two words, a Bengali vowel sign or conjunct staying whole', () => {
    expect(initials('Karim Uddin', 2)).toBe('KU');
    expect(initials('রহিমা খাতুন', 2)).toBe('রখা');
    expect(initials('স্বপ্না বেগম', 2)).toBe('স্ববে');
  });

  it('takes one letter alone for a calm list', () => {
    expect(initials('স্বেচ্ছাসেবক দল', 1)).toBe('স');
    expect(initials('karim', 1)).toBe('K');
  });

  it('gives nothing for an empty or blank name', () => {
    expect(initials('', 2)).toBe('');
    expect(initials('   ', 1)).toBe('');
  });
});
