import { describe, expect, it } from 'vitest';
import { hasOnlyEnglishDigits } from './digits.js';

describe('hasOnlyEnglishDigits (UX-05)', () => {
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
