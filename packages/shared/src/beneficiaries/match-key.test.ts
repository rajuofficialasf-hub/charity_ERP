import { describe, expect, it } from 'vitest';
import {
  END_TITLES,
  keyWords,
  matchKey,
  nameVariantsOf,
  placeKey,
  START_TITLES,
  startingNameVariantRows,
} from './match-key.js';

const STARTING = nameVariantsOf(startingNameVariantRows());

/**
 * The table of names the name key must make equal, or keep apart, with the starting list of
 * spelling variants. Each line is two names as people write them and whether they are one name.
 */
interface MatchKeyCase {
  a: string;
  b: string;
  same: boolean;
  /** What the line shows. */
  why: string;
}

const MATCH_KEY_CASES: readonly MatchKeyCase[] = [
  // titles at the start
  { a: 'মোঃ করিম', b: 'করিম', same: true, why: 'মোঃ at the start is a title' },
  { a: 'মোহাম্মদ করিম', b: 'করিম', same: true, why: 'মোহাম্মদ at the start is a title' },
  { a: 'মোঃ করিম', b: 'মোহাম্মদ করিম', same: true, why: 'two titles of one meaning' },
  { a: 'মো. করিম', b: 'মোঃ করিম', same: true, why: 'the dot and the colon of a title' },
  { a: 'মো: করিম', b: 'মো করিম', same: true, why: 'a title with and without its mark' },
  { a: 'মোঃকরিম', b: 'করিম', same: true, why: 'a title glued to the name' },
  { a: 'মুহাম্মদ আলী', b: 'আলী', same: true, why: 'মুহাম্মদ at the start is a title' },
  { a: 'হাজী আব্দুল করিম', b: 'আব্দুল করিম', same: true, why: 'হাজী at the start' },
  { a: 'আলহাজ্ব মোঃ আব্দুল করিম', b: 'আব্দুল করিম', same: true, why: 'two titles in a row' },
  { a: 'শ্রী রাম চন্দ্র', b: 'রাম চন্দ্র', same: true, why: 'শ্রী at the start' },
  { a: 'শ্রীমতি সীতা রানী', b: 'সীতা রানী', same: true, why: 'শ্রীমতি at the start' },
  { a: 'মোছাঃ রহিমা', b: 'মোসাঃ রহিমা', same: true, why: 'মোছাঃ and মোসাঃ are titles' },
  { a: 'মোসাম্মৎ রহিমা', b: 'রহিমা', same: true, why: 'মোসাম্মৎ at the start' },
  { a: 'মোহাঃ করিম', b: 'করিম', same: true, why: 'মোহাঃ, short for মোহাম্মদ, is a title' },
  { a: 'মোহা. করিম', b: 'মোঃ করিম', same: true, why: 'মোহা. with a dot' },
  { a: 'মুহাঃ আলী', b: 'আলী', same: true, why: 'মুহাঃ, short for মুহাম্মদ, is a title' },
  { a: 'মুহা. আলী', b: 'মুহাম্মদ আলী', same: true, why: 'মুহা. with a dot' },
  { a: 'মোহাঃকরিম', b: 'করিম', same: true, why: 'মোহাঃ glued to the name' },
  { a: 'মুহাঃআলী', b: 'আলী', same: true, why: 'মুহাঃ glued to the name' },
  // titles at the end
  { a: 'মোছাঃ রহিমা বেগম', b: 'রহিমা খাতুন', same: true, why: 'titles at both ends' },
  { a: 'রহিমা খাতুন', b: 'রাহিমা', same: true, why: 'a title at the end and a variant' },
  { a: 'মোছাঃ রহিমা বেগম', b: 'রাহিমা', same: true, why: 'titles and a variant together' },
  // spelling variants of the starting list
  { a: 'আকতার হোসাইন', b: 'আক্তার হোসেন', same: true, why: 'two variants in one name' },
  { a: 'আখতার হুসাইন', b: 'আক্তার হোসেন', same: true, why: 'the third spelling of each' },
  { a: 'মো. আব্দুর রাহমান', b: 'আব্দুর রহমান', same: true, why: 'a title and a variant' },
  { a: 'রহমান', b: 'রহিমা', same: false, why: 'two groups stay apart' },
  // family names are kept
  { a: 'শেখ ফরিদ', b: 'ফরিদ', same: false, why: 'শেখ can be a family name' },
  { a: 'মুন্সী আলম', b: 'আলম', same: false, why: 'মুন্সী can be a family name' },
  { a: 'শেখ', b: 'শেখ ফরিদ', same: false, why: 'a name that is only a family name' },
  { a: 'মোঃ শেখ ফরিদ', b: 'শেখ ফরিদ', same: true, why: 'a title before a family name' },
  // letters are not made equal
  { a: 'শফিক', b: 'সফিক', same: false, why: 'শ and স stay apart' },
  { a: 'আশরাফ', b: 'আষরাফ', same: false, why: 'শ and ষ stay apart' },
  { a: 'জাকির', b: 'যাকির', same: false, why: 'জ and য stay apart' },
  { a: 'নাজমুন', b: 'নাজমুণ', same: false, why: 'ন and ণ stay apart' },
  { a: 'বারি', b: 'বাড়ি', same: false, why: 'র and ড় stay apart' },
  { a: 'করিম', b: 'কারিম', same: false, why: 'a spelling not on the list stays apart' },
  // a title in the middle stays
  { a: 'আব্দুল মোহাম্মদ করিম', b: 'আব্দুল করিম', same: false, why: 'a title in the middle' },
  { a: 'রহিমা বেগম আক্তার', b: 'রহিমা আক্তার', same: false, why: 'an end title in the middle' },
  { a: 'করিম মোঃ', b: 'করিম', same: false, why: 'a start title at the end' },
  // a title alone, or only titles
  { a: 'মোঃ', b: 'মো.', same: true, why: 'a title alone keeps itself' },
  { a: 'মোঃ', b: 'মোহাম্মদ', same: false, why: 'two titles alone stay two words' },
  { a: 'বেগম', b: 'খাতুন', same: false, why: 'an end title alone keeps itself' },
  { a: 'মোহাম্মদ', b: 'মোঃ মোহাম্মদ', same: true, why: 'only titles keep the last word' },
  // spaces, marks and encodings do not matter
  { a: '  আব্দুর   রহমান ', b: 'আব্দুর রহমান', same: true, why: 'spaces around and between' },
  { a: 'আব্দুর রহমান', b: 'আব্দুররহমান', same: true, why: 'a space inside a name' },
  { a: 'করিম-উদ্দিন', b: 'করিম উদ্দিন', same: true, why: 'a hyphen' },
  { a: '(করিম), উদ্দিন।', b: 'করিম উদ্দিন', same: true, why: 'brackets, a comma and a danda' },
  {
    a: 'বা\u09DCৈ',
    b: 'বা\u09A1\u09BCৈ',
    same: true,
    why: 'ড় as one character or as ড and nukta',
  },
  {
    a: 'ম\u09DFনা',
    b: 'ম\u09AF\u09BCনা',
    same: true,
    why: 'য় as one character or as য and nukta',
  },
  {
    a: 'মোসাম্মত\u09CD\u200D রহিমা',
    b: 'রহিমা',
    same: true,
    why: 'khanda ta written the older way',
  },
  { a: 'কর\u200Cিম', b: 'করিম', same: true, why: 'an invisible joiner' },
  // Latin letters
  { a: 'Md. Karim', b: 'KARIM', same: true, why: 'a Latin title and letter case' },
  { a: 'Mst. Rahima Begum', b: 'Rahima Khatun', same: true, why: 'Latin titles at both ends' },
  { a: 'Mohammad Ali', b: 'Muhammad Ali', same: true, why: 'two Latin titles' },
  { a: "Ma'sum", b: 'Masum', same: true, why: 'an apostrophe inside a word' },
  { a: 'Md. করিম', b: 'মোঃ করিম', same: true, why: 'a Latin title before a Bengali name' },
  { a: 'Karim', b: 'করিম', same: false, why: 'Latin and Bengali letters stay apart' },
  { a: 'Sheikh Farid', b: 'Farid', same: false, why: 'a Latin family name is kept' },
];

describe('the name key', () => {
  it.each(MATCH_KEY_CASES)('$a and $b: $why', ({ a, b, same }) => {
    const left = matchKey(a, STARTING);
    const right = matchKey(b, STARTING);
    expect(left).not.toBe('');
    if (same) expect(left).toBe(right);
    else expect(left).not.toBe(right);
  });

  it('gives the expected keys: titles dropped, variants spelled one way, spaces removed', () => {
    expect(matchKey('মোঃ করিম', STARTING)).toBe('করিম');
    expect(matchKey('মোছাঃ রহিমা বেগম', STARTING)).toBe('রহিমা');
    expect(matchKey('আকতার হোসাইন', STARTING)).toBe('আক্তারহোসেন');
    expect(matchKey('Md. Karim Uddin', STARTING)).toBe('karimuddin');
    expect(matchKey('মোঃ', STARTING)).toBe('মো');
    expect(matchKey('', STARTING)).toBe('');
    expect(matchKey(' .,- ', STARTING)).toBe('');
  });

  it('changes when a variant is added to the list', () => {
    expect(matchKey('রহিম', STARTING)).not.toBe(matchKey('রাহিম', STARTING));
    const extended = nameVariantsOf([
      ...startingNameVariantRows(),
      { variant: 'রহিম', canonical: 'রহিম' },
      { variant: 'রাহিম', canonical: 'রহিম' },
    ]);
    expect(matchKey('রাহিম', extended)).toBe('রহিম');
    expect(matchKey('রহিম', extended)).toBe(matchKey('রাহিম', extended));
    // without the list only the titles, the spaces and the marks make names equal
    expect(matchKey('আকতার', new Map())).not.toBe(matchKey('আক্তার', new Map()));
  });

  it('is pure: the same name and list give the same key, and the list is not changed', () => {
    const variants = nameVariantsOf(startingNameVariantRows());
    const size = variants.size;
    const first = matchKey('মোছাঃ রাহিমা আকতার', variants);
    for (let i = 0; i < 3; i++) expect(matchKey('মোছাঃ রাহিমা আকতার', variants)).toBe(first);
    expect(variants.size).toBe(size);
    expect(variants).toEqual(nameVariantsOf(startingNameVariantRows()));
  });

  it('knows every title as one word', () => {
    for (const title of [...START_TITLES, ...END_TITLES]) expect(keyWords(title)).toHaveLength(1);
  });

  it('keeps the list in key form and leaves out an empty spelling', () => {
    const map = nameVariantsOf([
      { variant: ' AKTER ', canonical: 'Akter' },
      { variant: '..', canonical: 'x' },
    ]);
    expect([...map]).toEqual([['akter', 'akter']]);
  });

  it('follows a chain of group spellings to its end: C to B to A gives A', () => {
    const map = nameVariantsOf([
      { variant: 'c', canonical: 'b' },
      { variant: 'b', canonical: 'a' },
      { variant: 'a', canonical: 'a' },
    ]);
    expect([...map].sort()).toEqual([
      ['a', 'a'],
      ['b', 'a'],
      ['c', 'a'],
    ]);
    expect(matchKey('C', map)).toBe(matchKey('A', map));
  });

  it('stops on a chain that comes back to itself, every member at the same spelling', () => {
    const map = nameVariantsOf([
      { variant: 'x', canonical: 'y' },
      { variant: 'y', canonical: 'x' },
      { variant: 'z', canonical: 'y' },
    ]);
    expect([...map].sort()).toEqual([
      ['x', 'x'],
      ['y', 'x'],
      ['z', 'x'],
    ]);
  });
});

describe('the village key', () => {
  it('drops no word, so a village named after a title keeps it', () => {
    expect(placeKey('হাজী পাড়া', STARTING)).toBe('হাজীপাড়া');
    expect(placeKey('হাজী পাড়া', STARTING)).not.toBe(placeKey('পাড়া', STARTING));
    expect(placeKey('শ্রী নগর', STARTING)).toBe(placeKey('শ্রীনগর', STARTING));
    expect(placeKey('বেগম গঞ্জ', STARTING)).not.toBe(placeKey('গঞ্জ', STARTING));
  });

  it('ignores spaces, marks and letter case, and keeps letters apart', () => {
    expect(placeKey(' উত্তর-পাড়া ', STARTING)).toBe(placeKey('উত্তরপাড়া', STARTING));
    expect(placeKey('North Para', STARTING)).toBe(placeKey('north-para', STARTING));
    expect(placeKey('শিবপুর', STARTING)).not.toBe(placeKey('সিবপুর', STARTING));
  });
});
