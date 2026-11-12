import { describe, expect, it } from 'vitest';
import { mobileOwnerOf } from './mobile-owner.js';

describe('what a profile keeps about whose number the mobile is', () => {
  const MOBILE = '01712345678';

  it('keeps the owner and, for someone else than the person, that person’s name', () => {
    expect(mobileOwnerOf(MOBILE, 'neighbour', ' Karim Mia ')).toEqual({
      code: 'neighbour',
      name: 'Karim Mia',
    });
    expect(mobileOwnerOf(MOBILE, 'family', undefined)).toEqual({ code: 'family', name: null });
    expect(mobileOwnerOf(MOBILE, 'other', '   ')).toEqual({ code: 'other', name: null });
  });

  it('keeps no name beside the person’s own number', () => {
    expect(mobileOwnerOf(MOBILE, 'own', 'Karim Mia')).toEqual({ code: 'own', name: null });
  });

  it('keeps neither without a mobile, and no name without an owner', () => {
    for (const none of [null, undefined, ''])
      expect(mobileOwnerOf(none, 'neighbour', 'Karim Mia')).toEqual({ code: null, name: null });
    for (const none of [null, undefined, ''])
      expect(mobileOwnerOf(MOBILE, none, 'Karim Mia')).toEqual({ code: null, name: null });
  });
});
