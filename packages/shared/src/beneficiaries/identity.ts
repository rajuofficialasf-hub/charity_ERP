import { toEnglishDigits } from '../digits.js';

/**
 * The identity of a beneficiary: an NID of 10, 13 or 17 digits or a birth registration of
 * 17 digits, each unique; the database checks the same patterns. Mobile is contact data only.
 */
export const NID_PATTERN = /^([0-9]{10}|[0-9]{13}|[0-9]{17})$/;
export const BIRTH_REG_PATTERN = /^[0-9]{17}$/;

export const isNidNumber = (value: string) => NID_PATTERN.test(value);
export const isBirthRegNumber = (value: string) => BIRTH_REG_PATTERN.test(value);

/** An identity number as a person types it: Bengali digits made English, spaces and hyphens dropped. */
export function normalizeIdentityNumber(text: string): string {
  return toEnglishDigits(text).replace(/[\s-]/gu, '');
}

/**
 * The fields of a profile that never change by a plain edit; only an approved correction request
 * changes them, and the lookup marks them locked in its auto-fill.
 */
export const LOCKED_FIELDS = ['name', 'father_or_husband_name', 'nid', 'birth_reg'] as const;
export type LockedField = (typeof LOCKED_FIELDS)[number];

/** The largest BEN number the database column holds. */
export const BEN_NO_MAX = 2_147_483_647;
const BEN_NO_TYPED = /^ben[\s-]?0*([1-9][0-9]{0,9})$/iu;

/** A BEN number as shown everywhere: `BEN-` and the number padded to seven digits. */
export function formatBenNo(benNo: number): string {
  return `BEN-${String(benNo).padStart(7, '0')}`;
}

/** The number in a typed BEN number (`BEN-0000123`, `ben-123`, `BEN123`), or null. */
export function parseBenNo(text: string): number | null {
  const match = BEN_NO_TYPED.exec(toEnglishDigits(text).trim());
  if (!match) return null;
  const value = Number(match[1]);
  return value <= BEN_NO_MAX ? value : null;
}

/**
 * The comparable form of a person's name, as the database function `person_name_key` makes it:
 * every run of white space one space, then trimmed, letter case folded. The duplicate suggestions
 * and the family warning compare names this way.
 */
export function personNameKey(name: string): string {
  return name.replace(/\s+/gu, ' ').trim().toLowerCase();
}
