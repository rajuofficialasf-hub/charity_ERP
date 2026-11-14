import { describe, expect, it } from 'vitest';
import { personKeysOf } from './beneficiary-identity.js';

const UNION = '0190a1b2-0000-7000-8000-000000000001';

describe('the keys a person without a document is compared by', () => {
  it('are the name, the father’s or husband’s name, the union and the village, trimmed', () => {
    expect(
      personKeysOf({
        name: ' আব্দুর রহিম ',
        father_or_husband_name: 'আব্দুল করিম',
        union_id: UNION,
        village: 'চর নিকলী ',
        mobile: '01700005001',
      }),
    ).toEqual({
      name: 'আব্দুর রহিম',
      fatherOrHusbandName: 'আব্দুল করিম',
      unionId: UNION,
      village: 'চর নিকলী',
      guardianRelationCode: null,
    });
  });

  it('carry whether the name beside the person is the father’s or the husband’s, where the answers say', () => {
    expect(
      personKeysOf({
        name: 'রহিমা',
        father_or_husband_name: 'করিম',
        union_id: UNION,
        village: 'চর নিকলী',
        guardian_relation_code: 'husband',
      })?.guardianRelationCode,
    ).toBe('husband');
  });

  it('are none when a part is missing, empty or no text: a comparison on less would match strangers', () => {
    const whole = {
      name: 'আব্দুর রহিম',
      father_or_husband_name: 'আব্দুল করিম',
      union_id: UNION,
      village: 'চর নিকলী',
    };
    for (const column of Object.keys(whole) as (keyof typeof whole)[]) {
      const { [column]: _dropped, ...rest } = whole;
      expect(personKeysOf(rest), column).toBeNull();
      expect(personKeysOf({ ...whole, [column]: '   ' }), column).toBeNull();
      expect(personKeysOf({ ...whole, [column]: 7 }), column).toBeNull();
    }
  });
});
