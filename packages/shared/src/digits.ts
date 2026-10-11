/**
 * All numbers use English digits 0-9 in both languages (UX-05, BR-219).
 * The complete number and date formatter arrives with the i18n task (T1.5); this guard is the
 * first shared rule so that the workspace wiring is proven end to end.
 */
const BENGALI_DIGITS = /[\u09E6-\u09EF]/u;

/** True when the text contains no Bengali digits (০-৯). Other characters are allowed. */
export function hasOnlyEnglishDigits(text: string): boolean {
  return !BENGALI_DIGITS.test(text);
}
