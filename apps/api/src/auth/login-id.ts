import { toEnglishDigits } from '@css/shared';

export type LoginId = { kind: 'email'; value: string } | { kind: 'mobile'; value: string };

/**
 * Normalizes what a user typed as login id (AUTH.md 1 and 4): an email is trimmed and lower-cased
 * (emails are stored lower-case, DATABASE_SCHEMA users); a mobile number gets English digits,
 * loses spaces and dashes and the +88 / 88 country prefix.
 */
export function normalizeLoginId(raw: string): LoginId {
  const trimmed = raw.trim();
  if (trimmed.includes('@')) return { kind: 'email', value: trimmed.toLowerCase() };
  let digits = toEnglishDigits(trimmed).replace(/[\s-]/g, '');
  if (/^\+?88(01\d{9})$/.test(digits)) digits = digits.replace(/^\+?88/, '');
  return { kind: 'mobile', value: digits };
}
