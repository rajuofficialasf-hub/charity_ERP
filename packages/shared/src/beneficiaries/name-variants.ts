import { z } from 'zod';
import { isNameTitle, spellingKey } from './match-key.js';

/**
 * The groups of spelling variants the Department Head and the Monitoring Team keep in the settings:
 * one spelling the name keys use (the canonical) and the other spellings of the same name, made
 * equal word by word when two names are compared; the name as written is always kept.
 * The rules a request can be checked against alone live here, so the screen refuses what the API
 * refuses; that a spelling is already in another group is the server's to say.
 */

/** The most spellings one group holds besides its canonical. */
export const NAME_VARIANT_GROUP_MAX = 30;

/** Letters and their marks of the Bengali and the Latin scripts, nothing else. */
const LETTERS = /^(?:(?=[\p{L}\p{M}])[\p{Script=Bengali}\p{Script=Latin}])+$/u;
/** At least one letter: marks alone (ঁ, ঃ) spell nothing. */
const A_LETTER = /\p{L}/u;

/**
 * One spelling: one word of Bengali or Latin letters, at most 100 characters (the database's own
 * check), never one of the titles the key drops (a title in a group would make names equal that
 * the key keeps apart on purpose), and never a word of marks alone, or one whose key form is empty
 * (a lone ঃ is read as a space), since such a spelling would make nothing equal.
 */
export const nameSpellingSchema = z
  .string()
  .trim()
  .min(1, 'validation.required')
  .max(100, 'validation.too_long')
  .superRefine((value, ctx) => {
    if (!value) return;
    if (/\s/u.test(value))
      ctx.addIssue({ code: 'custom', message: 'validation.name_variant_one_word' });
    else if (!LETTERS.test(value))
      ctx.addIssue({ code: 'custom', message: 'validation.name_variant_letters' });
    else if (!A_LETTER.test(value) || !spellingKey(value))
      ctx.addIssue({ code: 'custom', message: 'validation.name_variant_no_letter' });
    else if (isNameTitle(value))
      ctx.addIssue({ code: 'custom', message: 'validation.name_variant_title' });
  });

const spellings = z
  .array(nameSpellingSchema)
  .min(1, 'validation.required')
  .max(NAME_VARIANT_GROUP_MAX, 'validation.too_long');

/** A spelling given twice in one group, in the key's form, is refused at its second place. */
function refuseRepeats(
  canonical: string | undefined,
  variants: readonly string[] | undefined,
  ctx: z.RefinementCtx,
): void {
  if (variants === undefined) return;
  const seen = new Set<string>();
  if (canonical !== undefined) seen.add(spellingKey(canonical));
  variants.forEach((variant, index) => {
    const key = spellingKey(variant);
    if (!key) return;
    if (seen.has(key))
      ctx.addIssue({
        code: 'custom',
        path: ['variants', index],
        message: 'validation.name_variant_repeated',
      });
    seen.add(key);
  });
}

/** A new group: its canonical and at least one other spelling. */
export const nameVariantGroupCreateSchema = z
  .strictObject({ canonical: nameSpellingSchema, variants: spellings })
  .superRefine((v, ctx) => refuseRepeats(v.canonical, v.variants, ctx));
export type NameVariantGroupCreate = z.infer<typeof nameVariantGroupCreateSchema>;

/**
 * A change of a group: its spellings as they are to be (the canonical and the others together, a
 * spelling left out leaves the group), switched on or off, or both.
 */
export const nameVariantGroupUpdateSchema = z
  .strictObject({
    canonical: nameSpellingSchema.optional(),
    variants: spellings.optional(),
    active: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.canonical === undefined && v.variants === undefined && v.active === undefined)
      ctx.addIssue({ code: 'custom', message: 'validation.required' });
    else if (v.canonical !== undefined && v.variants === undefined)
      ctx.addIssue({ code: 'custom', path: ['variants'], message: 'validation.required' });
    else if (v.canonical === undefined && v.variants !== undefined)
      ctx.addIssue({ code: 'custom', path: ['canonical'], message: 'validation.required' });
    refuseRepeats(v.canonical, v.variants, ctx);
  });
export type NameVariantGroupUpdate = z.infer<typeof nameVariantGroupUpdateSchema>;

/** One group as the settings page reads it. */
export interface NameVariantGroup {
  id: string;
  canonical: string;
  /** The other spellings, in the order of their letters' code points. */
  variants: string[];
  active: boolean;
  /** The group's version, sent back in If-Match by its change. */
  etag: string;
}
