import { toEnglishDigits } from '@css/shared';
import { normalizeJobId } from '@css/shared/auth';

export type LoginId =
  | { kind: 'email'; value: string }
  | { kind: 'mobile'; value: string }
  | { kind: 'job_id'; value: string };

/**
 * Normalizes what a user typed as login id (docs/architecture/AUTH.md, "Identities and accounts"
 * and "Login"): an email is trimmed and lower-cased (emails are stored lower-case,
 * docs/database/DATABASE_SCHEMA.md, "users"); a mobile number gets English digits, loses spaces and dashes and the +88 / 88 country
 * prefix; anything else is an official's job ID, stored in capitals, so a job ID never reads as a
 * mobile number.
 */
export function normalizeLoginId(raw: string): LoginId {
  const trimmed = raw.trim();
  if (trimmed.includes('@')) return { kind: 'email', value: trimmed.toLowerCase() };
  let digits = toEnglishDigits(trimmed).replace(/[\s-]/g, '');
  if (/^\+?88(01\d{9})$/.test(digits)) digits = digits.replace(/^\+?88/, '');
  if (/^01\d{9}$/.test(digits)) return { kind: 'mobile', value: digits };
  return { kind: 'job_id', value: normalizeJobId(trimmed) };
}
