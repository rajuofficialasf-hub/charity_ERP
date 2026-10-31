import { toEnglishDigits } from '../digits.js';
import { normalizeText } from '../i18n/bilingual.js';

/** Punctuation and symbols a typed name may carry that the profile's spelling does not. */
const PUNCTUATION = /[\p{P}\p{S}]+/gu;

/**
 * One canonical form of a person's name for comparing a hand-typed name with a profile's:
 * Unicode-composed, lower-cased, English digits, punctuation dropped, one space between words.
 */
export function normalizeName(value: string): string {
  return toEnglishDigits(normalizeText(value))
    .toLowerCase()
    .replace(PUNCTUATION, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * Whether a typed name and a profile's name are the same person's spelling of it. An empty side
 * never matches: a missing name is a mismatch the office must look at.
 */
export function namesMatch(
  typed: string | null | undefined,
  stored: string | null | undefined,
): boolean {
  if (!typed || !stored) return false;
  const a = normalizeName(typed);
  const b = normalizeName(stored);
  return a.length > 0 && a === b;
}
