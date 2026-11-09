/**
 * Password rules (AUTH.md section 3). Pure functions shared by the API, which
 * enforces the rules, and the PWA, which shows the same conditions as a checklist while typing.
 * The whole rule: a minimum length, one upper-case letter, one digit.
 */
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_MIN_LENGTH = 8;
/** Officials with GLOBAL scope (Department Head, Monitoring Team) need a longer password. */
export const PASSWORD_MIN_LENGTH_GLOBAL = 12;

export type PasswordProblem =
  'validation.password_too_short' | 'validation.password_uppercase_digit';

export interface PasswordContext {
  /** Minimum length for this account (minPasswordLength). */
  minLength: number;
}

/** Minimum length for an account: 12 with a GLOBAL-scope role, otherwise 8. */
export function minPasswordLength(hasGlobalScope: boolean): number {
  return hasGlobalScope ? PASSWORD_MIN_LENGTH_GLOBAL : PASSWORD_MIN_LENGTH;
}

/** Length in characters (code points), so a Bengali or emoji character counts once. */
export function passwordLength(password: string): number {
  return [...password].length;
}

/** At least one upper-case letter (a letter without case, such as a Bengali one, does not count). */
export const hasUppercase = (password: string): boolean => /\p{Lu}/u.test(password);

/** At least one digit. */
export const hasDigit = (password: string): boolean => /\p{Nd}/u.test(password);

/** Every rule the password breaks, in a stable order; empty when it is acceptable. */
export function checkPassword(password: string, context: PasswordContext): PasswordProblem[] {
  const problems: PasswordProblem[] = [];
  if (passwordLength(password) < context.minLength) problems.push('validation.password_too_short');
  if (!hasUppercase(password) || !hasDigit(password))
    problems.push('validation.password_uppercase_digit');
  return problems;
}
