/**
 * Password rules (AUTH.md section 3, O-05, O-25, D-071). Pure functions shared by the API, which
 * enforces every rule, and the PWA, which shows length, letter and digit hints while typing.
 */
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_MIN_LENGTH = 8;
/** Officials with GLOBAL scope (Department Head, Monitoring Team) need a longer password (O-25). */
export const PASSWORD_MIN_LENGTH_GLOBAL = 12;

export type PasswordProblem =
  | 'validation.password_too_short'
  | 'validation.password_letter_digit'
  | 'validation.password_identity'
  | 'validation.password_common';

export interface PasswordContext {
  /** Minimum length for this account (minPasswordLength). */
  minLength: number;
  /** The account's mobile number and email, never allowed as or inside the password. */
  mobile?: string | null;
  email?: string | null;
  /** The bundled common-password list; the PWA leaves it out, the API passes it. */
  common?: ReadonlySet<string>;
}

/**
 * Words people build passwords from here (organization, country, frequent phrases). A password
 * whose letters alone spell one of them is refused, so "Bismillah786" and "assunnah@2026" fail.
 */
const LOCAL_WORDS = new Set([
  'assunnah',
  'assunnahfoundation',
  'sunnah',
  'foundation',
  'charity',
  'socialservice',
  'bangladesh',
  'dhaka',
  'password',
  'bismillah',
  'alhamdulillah',
  'subhanallah',
  'mashallah',
  'inshallah',
  'allahuakbar',
  'lailahaillallah',
  'muhammad',
]);

/** Minimum length for an account: 12 with a GLOBAL-scope role, otherwise 8. */
export function minPasswordLength(hasGlobalScope: boolean): number {
  return hasGlobalScope ? PASSWORD_MIN_LENGTH_GLOBAL : PASSWORD_MIN_LENGTH;
}

/** Length in characters (code points), so a Bengali or emoji character counts once. */
export function passwordLength(password: string): number {
  return [...password].length;
}

/** Every rule the password breaks, in a stable order; empty when it is acceptable. */
export function checkPassword(password: string, context: PasswordContext): PasswordProblem[] {
  const problems: PasswordProblem[] = [];
  if (passwordLength(password) < context.minLength) problems.push('validation.password_too_short');
  if (!/\p{L}/u.test(password) || !/\p{Nd}/u.test(password))
    problems.push('validation.password_letter_digit');

  const lower = password.toLowerCase();
  const mobile = context.mobile?.trim();
  const email = context.email?.trim().toLowerCase();
  const emailName = email?.split('@')[0];
  if (
    (mobile && lower.includes(mobile)) ||
    (email && lower === email) ||
    (emailName && emailName.length >= 4 && lower === emailName)
  )
    problems.push('validation.password_identity');

  const letters = lower.replace(/[^\p{L}]/gu, '');
  if (context.common?.has(lower) || LOCAL_WORDS.has(letters))
    problems.push('validation.password_common');
  return problems;
}
