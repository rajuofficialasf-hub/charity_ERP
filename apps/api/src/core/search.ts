/**
 * Helpers of the nationwide list searches: a mobile number written in digits (with or without the
 * country prefix +88) as the stored 01XXXXXXXXX, and a name term whose LIKE wildcards are letters.
 */
export function mobileOf(digits: string): string | null {
  const local = digits.startsWith('880') ? digits.slice(2) : digits;
  return /^01[3-9][0-9]{8}$/.test(local) ? local : null;
}

/** True for a term written only in digits, spaces, dashes and a plus sign (a number search). */
export const isNumberTerm = (term: string): boolean => /^[+0-9\s-]+$/.test(term);

/** The term for a `contains` match, with the LIKE wildcards % and _ and the escape \ as letters. */
export const literalContains = (term: string): string => term.replace(/[\\%_]/g, '\\$&');
