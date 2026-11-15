import { describe, expect, it } from 'vitest';
import {
  nameSpellingSchema,
  nameVariantGroupCreateSchema,
  nameVariantGroupUpdateSchema,
} from './name-variants.js';

const messageOf = (value: string) => {
  const parsed = nameSpellingSchema.safeParse(value);
  return parsed.success ? null : parsed.error.issues[0]!.message;
};

describe('a spelling of a group', () => {
  it('takes one word of Bengali or Latin letters', () => {
    expect(messageOf('আকতার')).toBeNull();
    expect(messageOf('Akter')).toBeNull();
    // a mark after a letter is part of the word
    expect(messageOf('চাঁদ')).toBeNull();
  });

  it('refuses a spelling of marks alone, whose key would be empty or would make nothing equal', () => {
    // the abbreviation mark alone is read as a space: its key is empty
    expect(messageOf('ঃ')).toBe('validation.name_variant_no_letter');
    // the nasal mark alone carries no letter
    expect(messageOf('ঁ')).toBe('validation.name_variant_no_letter');
    expect(messageOf('ঁঃ')).toBe('validation.name_variant_no_letter');
  });

  it('refuses such a spelling inside a new group and inside a change', () => {
    const created = nameVariantGroupCreateSchema.safeParse({
      canonical: 'আকতার',
      variants: ['ঃ'],
    });
    expect(created.success).toBe(false);
    expect(created.error!.issues.map((i) => [i.path.join('.'), i.message])).toEqual([
      ['variants.0', 'validation.name_variant_no_letter'],
    ]);
    const changed = nameVariantGroupUpdateSchema.safeParse({
      canonical: 'ঁ',
      variants: ['আখতার'],
    });
    expect(changed.success).toBe(false);
    expect(changed.error!.issues.map((i) => [i.path.join('.'), i.message])).toEqual([
      ['canonical', 'validation.name_variant_no_letter'],
    ]);
  });

  it('keeps its earlier refusals', () => {
    expect(messageOf('আকতার হোসেন')).toBe('validation.name_variant_one_word');
    expect(messageOf('আকতার1')).toBe('validation.name_variant_letters');
    expect(messageOf('মোঃ')).toBe('validation.name_variant_title');
  });
});
