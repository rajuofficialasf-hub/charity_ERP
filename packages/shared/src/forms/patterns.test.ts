import { describe, expect, it } from 'vitest';
import { isPatternKey, matchesPattern, PATTERN_KEYS, PATTERNS } from './patterns.js';

// The patterns a form may name, each bounded and run only on a text under its cap.
describe('the named patterns', () => {
  it('names exactly the seven patterns a PM may pick', () => {
    expect([...PATTERN_KEYS]).toEqual([
      'nid',
      'birth_reg',
      'mobile',
      'bangla_text',
      'email',
      'post_code',
      'digits',
    ]);
    expect(isPatternKey('nid')).toBe(true);
    expect(isPatternKey('^[0-9]+$')).toBe(false);
    expect(isPatternKey('')).toBe(false);
  });

  it('matches an NID of 10, 13 or 17 digits and a birth registration of 17 digits', () => {
    for (const nid of ['1000000001', '1000000000123', '19901234567890123'])
      expect(matchesPattern('nid', nid), nid).toBe(true);
    for (const bad of ['123456789', '12345678901', '100000000012a', '', '19901234567890123 '])
      expect(matchesPattern('nid', bad), bad).toBe(false);
    expect(matchesPattern('birth_reg', '20261011000000001')).toBe(true);
    expect(matchesPattern('birth_reg', '2026101100000000')).toBe(false);
    expect(matchesPattern('birth_reg', '1000000001')).toBe(false);
  });

  it('matches a Bangladesh mobile number as the registration does', () => {
    expect(matchesPattern('mobile', '01712345678')).toBe(true);
    expect(matchesPattern('mobile', '01312345678')).toBe(true);
    for (const bad of [
      '02712345678',
      '0171234567',
      '017123456789',
      '+8801712345678',
      '01212345678',
    ])
      expect(matchesPattern('mobile', bad), bad).toBe(false);
  });

  it('matches Bangla text with digits, spaces and address punctuation, not Latin letters', () => {
    expect(matchesPattern('bangla_text', 'চরপাড়া')).toBe(true);
    expect(matchesPattern('bangla_text', 'উত্তর চরপাড়া, ওয়ার্ড 3 (পূর্ব)')).toBe(true);
    // the zero-width joiner of র‍্য spelling never fails the text
    expect(matchesPattern('bangla_text', 'র‍্যাব নগর')).toBe(true);
    expect(matchesPattern('bangla_text', '৭ নং ওয়ার্ড')).toBe(true);
    expect(matchesPattern('bangla_text', 'Charpara')).toBe(false);
    expect(matchesPattern('bangla_text', 'চরপাড়া Charpara')).toBe(false);
    expect(matchesPattern('bangla_text', '')).toBe(false);
  });

  it('matches an email address with a dotted domain', () => {
    expect(matchesPattern('email', 'rahima@example.com')).toBe(true);
    expect(matchesPattern('email', 'a.b+c@mail.example.co.uk')).toBe(true);
    for (const bad of [
      'rahima',
      'rahima@',
      '@example.com',
      'rahima@example',
      'a b@example.com',
      'a@b..com',
    ])
      expect(matchesPattern('email', bad), bad).toBe(false);
  });

  it('matches a four-digit post code and a run of digits', () => {
    expect(matchesPattern('post_code', '1200')).toBe(true);
    expect(matchesPattern('post_code', '12000')).toBe(false);
    expect(matchesPattern('post_code', '12a0')).toBe(false);
    expect(matchesPattern('digits', '0123456789')).toBe(true);
    expect(matchesPattern('digits', '12 34')).toBe(false);
    expect(matchesPattern('digits', '')).toBe(false);
  });

  it('refuses a text over the cap before the expression runs', () => {
    // five digits would match the digits pattern; the cap of four refuses them first
    expect(matchesPattern('digits', '12345', 4)).toBe(false);
    expect(matchesPattern('digits', '1234', 4)).toBe(true);
    // a pattern's own cap holds whatever the field allows
    expect(matchesPattern('mobile', '017123456789', 4000)).toBe(false);
    expect(PATTERNS.email.maxLength).toBe(254);
    expect(matchesPattern('email', `${'a'.repeat(250)}@example.com`)).toBe(false);
  });

  it('answers a 100,000-character input in bounded time', () => {
    const inputs = [
      'a'.repeat(100_000),
      `${'a@'.repeat(50_000)}`,
      `${'a.'.repeat(50_000)}@x.com`,
      'ক'.repeat(100_000),
      '1'.repeat(100_000),
    ];
    const started = performance.now();
    for (const key of PATTERN_KEYS)
      for (const input of inputs) expect(matchesPattern(key, input)).toBe(false);
    expect(performance.now() - started).toBeLessThan(200);
  });
});
