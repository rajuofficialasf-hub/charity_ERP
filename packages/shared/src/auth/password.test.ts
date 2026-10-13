import { describe, expect, it } from 'vitest';
import {
  checkPassword,
  minPasswordLength,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MIN_LENGTH_GLOBAL,
} from './password.js';
import { loginRequestSchema, passwordChangeRequestSchema } from './schemas.js';

const base = { minLength: PASSWORD_MIN_LENGTH };

describe('password rules (AUTH.md 3, O-64, O-25, BR-203)', () => {
  it('accepts 8 characters with an upper-case letter and a digit, spaces included', () => {
    expect(checkPassword('Nadi 2026', base)).toEqual([]);
    expect(checkPassword('Kalo-megh7', base)).toEqual([]);
    expect(checkPassword('Password1', base)).toEqual([]);
  });

  it('refuses short passwords and counts characters, not bytes', () => {
    expect(checkPassword('Ab12cd3', base)).toEqual(['validation.password_too_short']);
    expect(checkPassword('Aঅইঈ১২৩৪', base)).not.toContain('validation.password_too_short');
  });

  it('needs one upper-case letter and one digit', () => {
    expect(checkPassword('lowercase1', base)).toEqual(['validation.password_uppercase_digit']);
    expect(checkPassword('Uppercaseonly', base)).toEqual(['validation.password_uppercase_digit']);
    expect(checkPassword('12345678', base)).toEqual(['validation.password_uppercase_digit']);
    // a Bengali letter has no case, so it is not an upper-case letter
    expect(checkPassword('অআইঈউঊ১২৩৪', base)).toEqual(['validation.password_uppercase_digit']);
  });

  it('names both problems of a short password without the letters', () => {
    expect(checkPassword('abc', base)).toEqual([
      'validation.password_too_short',
      'validation.password_uppercase_digit',
    ]);
  });

  it('requires 12 characters for officials with GLOBAL scope (O-25), with the same letter rules', () => {
    expect(minPasswordLength(true)).toBe(PASSWORD_MIN_LENGTH_GLOBAL);
    expect(minPasswordLength(false)).toBe(PASSWORD_MIN_LENGTH);
    expect(checkPassword('Nadi 2026x', { minLength: minPasswordLength(true) })).toEqual([
      'validation.password_too_short',
    ]);
    expect(checkPassword('Nadi kul 2026', { minLength: minPasswordLength(true) })).toEqual([]);
  });

  it('does not look at the mobile number, the email or a list of common words (O-64)', () => {
    expect(checkPassword('X01700000101', base)).toEqual([]);
    expect(checkPassword('Rahim.uddin1', base)).toEqual([]);
    expect(checkPassword('Bismillah786', base)).toEqual([]);
    expect(checkPassword('Assunnah2026', base)).toEqual([]);
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
