import { describe, expect, it } from 'vitest';
import { commonPasswords } from './common-passwords.js';
import {
  checkPassword,
  minPasswordLength,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MIN_LENGTH_GLOBAL,
} from './password.js';
import { loginRequestSchema, passwordChangeRequestSchema } from './schemas.js';

const base = { minLength: PASSWORD_MIN_LENGTH, common: commonPasswords() };

describe('password rules (AUTH.md 3, O-05, O-25, BR-203)', () => {
  it('accepts 8 characters with a letter and a digit, spaces included', () => {
    expect(checkPassword('Nadi 2026', base)).toEqual([]);
    expect(checkPassword('kalo-megh7', base)).toEqual([]);
  });

  it('refuses short passwords and counts characters, not bytes', () => {
    expect(checkPassword('ab12cd3', base)).toEqual(['validation.password_too_short']);
    expect(checkPassword('অআইঈ১২৩৪', base)).not.toContain('validation.password_too_short');
  });

  it('needs at least one letter and one digit', () => {
    expect(checkPassword('onlyletters', base)).toContain('validation.password_letter_digit');
    expect(checkPassword('1234567890', base)).toContain('validation.password_letter_digit');
  });

  it('requires 12 characters for officials with GLOBAL scope (O-25)', () => {
    expect(minPasswordLength(true)).toBe(PASSWORD_MIN_LENGTH_GLOBAL);
    expect(minPasswordLength(false)).toBe(PASSWORD_MIN_LENGTH);
    expect(checkPassword('Nadi 2026x', { ...base, minLength: minPasswordLength(true) })).toEqual([
      'validation.password_too_short',
    ]);
  });

  it('refuses the own mobile number, the email and its name part', () => {
    const ctx = { ...base, mobile: '01700000101', email: 'rahim.uddin@example.org' };
    expect(checkPassword('x01700000101', ctx)).toContain('validation.password_identity');
    expect(checkPassword('Rahim.Uddin@example.org', ctx)).toContain('validation.password_identity');
    expect(checkPassword('rahim.uddin', ctx)).toContain('validation.password_identity');
    expect(checkPassword('Nadi 2026', ctx)).toEqual([]);
  });

  it('refuses common passwords from the bundled list and local words with decoration (D-071)', () => {
    expect(commonPasswords().size).toBeGreaterThan(2000);
    expect(checkPassword('password1', base)).toContain('validation.password_common');
    expect(checkPassword('Bismillah786', base)).toContain('validation.password_common');
    expect(checkPassword('assunnah@2026', base)).toContain('validation.password_common');
    expect(checkPassword('Bangladesh71', base)).toContain('validation.password_common');
  });

  it('checks only length, letter and digit without the list (the PWA hint)', () => {
    expect(checkPassword('qwerty123', { minLength: 8 })).toEqual([]);
    expect(checkPassword('qwerty123', base)).toEqual(['validation.password_common']);
  });

  it('names the catalogue code of a too short new password in the request schema', () => {
    const result = passwordChangeRequestSchema.safeParse({
      currentPassword: 'x',
      newPassword: 'a1',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('validation.password_too_short');
  });

  it('rejects unknown fields and unknown platforms at login', () => {
    expect(loginRequestSchema.safeParse({ loginId: 'a', password: 'b', extra: 1 }).success).toBe(
      false,
    );
    expect(
      loginRequestSchema.safeParse({ loginId: 'a', password: 'b', device: { platform: 'tv' } })
        .success,
    ).toBe(false);
    expect(
      loginRequestSchema.parse({ loginId: '  head@example.org ', password: 'b' }).loginId,
    ).toBe('head@example.org');
  });
});
