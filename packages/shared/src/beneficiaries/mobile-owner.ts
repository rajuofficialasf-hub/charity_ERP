/**
 * Whose number the mobile on a beneficiary's profile is: a code of the reference list
 * `mobile_owner` and, when the number is not the person's own, that person's name. Both are
 * optional and belong to the number.
 */

/** The standard columns the two questions of a form fill. */
export const MOBILE_OWNER_COLUMN = 'mobile_owner_code';
export const MOBILE_OWNER_NAME_COLUMN = 'mobile_owner_name';

/** The code that says the number is the person's own; such a number names no other owner. */
export const MOBILE_OWNER_OWN = 'own';

/** The longest owner's name the profile keeps. */
export const MOBILE_OWNER_NAME_MAX = 200;

export interface MobileOwner {
  code: string | null;
  name: string | null;
}

/**
 * What a profile keeps of the answers about the number's owner. An owner without a number says
 * nothing, so neither is kept without a mobile; the name is kept only beside an owner who is
 * someone else than the person.
 */
export function mobileOwnerOf(
  mobile: string | null | undefined,
  code: string | null | undefined,
  name: string | null | undefined,
): MobileOwner {
  if (!mobile || !code) return { code: null, name: null };
  const trimmed = name?.trim();
  return { code, name: code !== MOBILE_OWNER_OWN && trimmed ? trimmed : null };
}
