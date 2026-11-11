/**
 * All numbers use English digits 0-9 in both languages.
 * The complete number and date formatter arrives with the i18n task; this guard is the
 * first shared rule so that the workspace wiring is proven end to end.
 */
const BENGALI_DIGITS = /[\u09E6-\u09EF]/u;

/** True when the text contains no Bengali digits (০-৯). Other characters are allowed. */
export function hasOnlyEnglishDigits(text: string): boolean {
  return !BENGALI_DIGITS.test(text);
}

/**
 * Converts Bengali digits typed by a user (০-৯) into English digits 0-9 (docs/ui/I18N.md, "Input
 * parsing and normalization"). Used on input by phone, NID and number fields; other characters are
 * left unchanged.
 */
export function toEnglishDigits(text: string): string {
  return text.replace(/[\u09E6-\u09EF]/gu, (d) => String(d.charCodeAt(0) - 0x09e6));
}
