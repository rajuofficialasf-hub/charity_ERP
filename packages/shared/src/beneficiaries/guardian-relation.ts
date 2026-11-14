/**
 * Whether the name beside a beneficiary (`father_or_husband_name`) is the father's or the
 * husband's: a code of the reference list `guardian_relation`, or nothing where it is not known.
 * It describes a name only a correction request changes, so an application's answer gives it to a
 * profile that has none and never changes one the profile holds.
 */

/** The standard column the question of a form fills. */
export const GUARDIAN_RELATION_COLUMN = 'guardian_relation_code';

/** The reference list of its codes. */
export const GUARDIAN_RELATION_LIST = 'guardian_relation';

/** The codes of the list, which the comparison of two people reads. */
export const GUARDIAN_RELATIONS = ['father', 'husband'] as const;
export type GuardianRelation = (typeof GUARDIAN_RELATIONS)[number];

/**
 * The relation an application's answer writes to a profile: the answer where the profile holds
 * none, otherwise nothing (null), also where the answer is empty or names the same relation.
 */
export function guardianRelationToFill(
  current: string | null | undefined,
  answered: string | null | undefined,
): string | null {
  if (current) return null;
  const code = answered?.trim();
  return code ? code : null;
}
