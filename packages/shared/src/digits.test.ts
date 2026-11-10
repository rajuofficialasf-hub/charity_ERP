import { describe, expect, it } from 'vitest';
import { hasOnlyEnglishDigits, toEnglishDigits } from './digits.js';

describe('hasOnlyEnglishDigits', () => {
  it('accepts English digits inside Bengali text', () => {
    expect(hasOnlyEnglishDigits('আবেদন WNT-2026-00125')).toBe(true);
  });

  it('rejects Bengali digits', () => {
    expect(hasOnlyEnglishDigits('আবেদন ১২৫')).toBe(false);
  });

  it('accepts text without digits', () => {
    expect(hasOnlyEnglishDigits('চ্যারিটি ও সোশ্যাল সার্ভিস')).toBe(true);
  });
});

describe('toEnglishDigits', () => {
  it('converts Bengali digits and keeps everything else', () => {
    expect(toEnglishDigits('০১৭১২-৩৪৫৬৭৮')).toBe('01712-345678');
    expect(toEnglishDigits('৳ ১,২৫০.৫০')).toBe('৳ 1,250.50');
    expect(toEnglishDigits('NID 1234 ৫৬৭৮৯০')).toBe('NID 1234 567890');
  });
});
