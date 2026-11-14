/**
 * The key two spellings of one person's name compare by. It is used only to find candidates for
 * the same person; the name as written is always the one kept and shown.
 *
 * What the key makes equal, and nothing more:
 * - the encoding: Unicode NFC, invisible joiners, the old spelling of khanda ta, Latin letter case;
 * - spaces, punctuation and the abbreviation mark ঃ after a word;
 * - a known title where it stands: at the start (any number in a row) or at the end of a name,
 *   never in the middle, and never a word that can be a family name (শেখ, মুন্সী are no titles);
 * - the spellings of one group of the list of spelling variants, word by word.
 * Letters are never made equal across the board: শ, ষ and স stay apart, as জ and য, ন and ণ,
 * র and ড়. The key is computed in TypeScript only and stored with the person, because the list
 * of variants is edited by officials and an SQL function cannot read an editable list.
 */

/** A map from each known spelling of a word to its group's one spelling, both in key form. */
export type NameVariants = ReadonlyMap<string, string>;

/**
 * The titles dropped at the start of a name, as people write them (the words are data the key
 * matches, not text shown to anyone).
 */
export const START_TITLES: readonly string[] = [
  ...'মোঃ মো. মোহাম্মদ মুহাম্মদ মোছাঃ মোসাঃ মোসাম্মৎ হাজী আলহাজ্ব শ্রী শ্রীমতি'.split(' '), // i18n-allow-bengali: titles the key matches
  ...'Md. Mohammad Muhammad Mst. Mosammat Haji Alhaj Sri Srimati'.split(' '),
];

/** The titles dropped at the end of a name. */
export const END_TITLES: readonly string[] = [
  ...'বেগম খাতুন'.split(' '), // i18n-allow-bengali: titles the key matches
  'Begum',
  'Khatun',
];

/**
 * The spelling variants the list starts with: each group's first word is the spelling its other
 * words are made equal to. Officials extend the list in the settings.
 */
export const STARTING_NAME_VARIANT_GROUPS: readonly (readonly string[])[] =
  'আক্তার আকতার আখতার; হোসেন হোসাইন হুসাইন; রহিমা রাহিমা; রহমান রাহমান' // i18n-allow-bengali: spellings the key matches
    .split('; ')
    .map((group) => group.split(' '));

const VISARGA = '\u0983';
/** The titles whose abbreviation mark ঃ is sometimes written with no space after it. */
const GLUED_TITLE = new RegExp(`(^|\\s)(মো|মোছা|মোসা)${VISARGA}(?=\\p{L})`, 'gu'); // i18n-allow-bengali: titles the key matches
/** ঃ that ends a word: an abbreviation mark, read as a space. */
const WORD_END_VISARGA = new RegExp(`${VISARGA}(?![\\p{L}\\p{M}])`, 'gu');
/** Khanda ta written the older way: ta, hasant and a zero-width joiner. */
const OLD_KHANDA_TA = /\u09A4\u09CD\u200D/g;
/** Characters that show nothing: zero-width space and joiners, word joiner, byte-order mark, soft hyphen. */
const INVISIBLE = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;
/** Apostrophes join the two halves of one word. */
const APOSTROPHES = /['\u2018\u2019\u02BC`\u00B4]/g;
/** Every other punctuation mark or symbol separates words. */
const PUNCTUATION = /[\p{P}\p{S}]/gu;

/** The words of a text in key form, in their order. */
export function keyWords(text: string): string[] {
  return text
    .normalize('NFC')
    .replace(OLD_KHANDA_TA, '\u09CE')
    .replace(INVISIBLE, '')
    .replace(APOSTROPHES, '')
    .replace(PUNCTUATION, ' ')
    .replace(GLUED_TITLE, '$1$2 ')
    .replace(WORD_END_VISARGA, ' ')
    .toLowerCase()
    .split(/\s+/u)
    .filter((word) => word.length > 0);
}

/** One word, or a short text, in key form with its spaces removed. */
const wordKey = (text: string) => keyWords(text).join('');

const START = new Set(START_TITLES.map(wordKey));
const END = new Set(END_TITLES.map(wordKey));

const spell = (words: string[], variants: NameVariants) =>
  words.map((word) => variants.get(word) ?? word).join('');

/**
 * The key of a person's name: the titles at its start and its end dropped (a name that would be
 * left empty keeps its last word), each word made its group's spelling, then joined without
 * spaces. An empty name gives an empty key.
 */
export function matchKey(text: string, variants: NameVariants): string {
  const words = keyWords(text);
  let from = 0;
  while (from < words.length - 1 && START.has(words.at(from)!)) from++;
  let to = words.length;
  while (to - 1 > from && END.has(words.at(to - 1)!)) to--;
  return spell(words.slice(from, to), variants);
}

/**
 * The key of a place written as text (a village): the same as a name's, but no word is dropped,
 * because a village may well be named হাজী পাড়া or শ্রীনগর.
 */
export function placeKey(text: string, variants: NameVariants): string {
  return spell(keyWords(text), variants);
}

/**
 * The variants map of a stored list: each spelling and its group's spelling in key form. A row
 * whose spelling is empty in key form is left out.
 */
export function nameVariantsOf(
  rows: Iterable<{ variant: string; canonical: string }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const { variant, canonical } of rows) {
    const from = wordKey(variant);
    const to = wordKey(canonical);
    if (from && to) map.set(from, to);
  }
  return map;
}

/** The rows of the starting list: every spelling of a group, its first one included. */
export function startingNameVariantRows(): { variant: string; canonical: string }[] {
  return STARTING_NAME_VARIANT_GROUPS.flatMap(([canonical, ...rest]) =>
    [canonical!, ...rest].map((variant) => ({ variant, canonical: canonical! })),
  );
}
