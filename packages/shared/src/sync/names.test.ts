import { describe, expect, it } from 'vitest';
import { namesMatch, normalizeName } from './names';

describe('matching a typed name with a profile’s', () => {
  it('ignores case, trimming, double spaces and punctuation', () => {
    expect(namesMatch('  Md.  Rahim   Uddin ', 'md rahim uddin')).toBe(true);
    expect(namesMatch('আব্দুল করিম', 'আব্দুল   করিম।')).toBe(true);
  });

  it('reads Bengali digits as English ones', () => {
    expect(namesMatch('রহিম ২', 'রহিম 2')).toBe(true);
  });

  it('folds composed and decomposed Bengali letters', () => {
    expect(namesMatch('ড়', 'ড়')).toBe(true);
  });

  it('refuses a different name', () => {
    expect(namesMatch('আব্দুল করিম', 'আব্দুল রহিম')).toBe(false);
    expect(namesMatch('Rahim', 'Rahima')).toBe(false);
  });

  it('refuses an empty side', () => {
    expect(namesMatch('', 'Rahim')).toBe(false);
    expect(namesMatch('Rahim', null)).toBe(false);
  });

  it('normalises to one canonical form', () => {
    expect(normalizeName(' Md.  Rahim ')).toBe('md rahim');
  });
});
