import { describe, expect, it } from 'vitest';
import { MATCH_KEY_CASES } from './match-key.cases.js';
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
