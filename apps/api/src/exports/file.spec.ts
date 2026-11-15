import { bn, en } from '@css/shared/i18n';
import { describe, expect, it } from 'vitest';
import { personCells } from './file.js';
import { profileHtml, type ProfileForPdf } from './pdf/profile.js';

describe('the mobile and the identity numbers of a person in a file', () => {
  it('print the numbers a person has, and leave the other identity cell empty', () => {
    expect(personCells({ mobile: '01700005001', nid: '1000005001', birthReg: null }, 'bn')).toEqual(
      { mobile: '01700005001', nid: '1000005001', birth_reg: null },
    );
    expect(
      personCells({ mobile: '01700005001', nid: null, birthReg: '20261112000000017' }, 'en'),
    ).toEqual({ mobile: '01700005001', nid: null, birth_reg: '20261112000000017' });
  });

  it('print the screens’ words for a missing mobile and a missing document, in the file’s language', () => {
    const light = { mobile: null, nid: null, birthReg: null };
    expect(personCells(light, 'bn')).toEqual({
      mobile: bn.common.person.through_volunteer,
      nid: bn.common.person.no_document,
      birth_reg: bn.common.person.no_document,
    });
    expect(personCells(light, 'en')).toEqual({
      mobile: 'Contact through the volunteer',
      nid: 'No identity document',
      birth_reg: 'No identity document',
    });
    expect(bn.common.person.no_document).not.toBe(en.common.person.no_document);
  });
});

describe('the profile PDF of a person without a document or a mobile', () => {
  const profile: ProfileForPdf = {
    benNo: 42,
    name: 'রহিমা বেগম',
    status: 'active',
    divisionId: 'd',
    districtId: 'e',
    upazilaId: 'u',
    projectsByYear: [],
  };
  const html = (over: Partial<ProfileForPdf>, locale: 'bn' | 'en' = 'bn') =>
    profileHtml({ locale, profile: { ...profile, ...over }, places: new Map(), date: new Date() });

  it('prints the two texts in the place of the numbers and never the word null', () => {
    const page = html({ mobile: null, hasDocument: false, nid: null, birthReg: null });
    expect(page).toContain(bn.common.person.through_volunteer);
    expect(page).toContain(bn.common.person.no_document);
    expect(page).not.toContain('null');
    const english = html({ mobile: null, hasDocument: false }, 'en');
    expect(english).toContain('Contact through the volunteer');
    expect(english).toContain('No identity document');
  });

  it('prints neither for a person who has both, nor where the export may not say', () => {
    const full = html({ mobile: '01700005001', hasDocument: true, nid: '1000005001' });
    expect(full).toContain('01700005001');
    expect(full).not.toContain(bn.common.person.through_volunteer);
    expect(full).not.toContain(bn.common.person.no_document);
    // the masked export carries neither field: nothing is said about them
    const masked = html({});
    expect(masked).not.toContain(bn.common.person.through_volunteer);
    expect(masked).not.toContain(bn.common.person.no_document);
  });
});

describe('the family on the profile PDF', () => {
  const base: ProfileForPdf = {
    benNo: 42,
    name: 'নমুনা',
    status: 'active',
    divisionId: 'd',
    districtId: 'e',
    upazilaId: 'u',
    projectsByYear: [],
  };
  const page = (over: Partial<ProfileForPdf>) =>
    profileHtml({
      locale: 'bn',
      profile: { ...base, ...over },
      places: new Map(),
      date: new Date(),
    });

  it('prints the members with the profile each probably is, the family that holds the person, and what the family received', () => {
    const html = page({
      familyMembers: [
        {
          name: 'সালাম',
          relationshipCode: 'son',
          relationship: { bn: 'ছেলে', en: 'son' },
          ageYears: 20,
          monthlyIncome: 3000,
          profile: { beneficiaryId: 'p1', benNo: 'BEN-0000007', name: 'সালাম' },
        },
        {
          name: 'নাসির',
          relationshipCode: null,
          ageYears: null,
          monthlyIncome: null,
          profile: null,
        },
      ],
      memberOf: [
        {
          head: { beneficiaryId: 'p2', benNo: 'BEN-0000003', name: 'রহিম' },
          relationships: [{ code: 'son', name: { bn: 'ছেলে', en: 'son' } }],
        },
      ],
      familyHelp: {
        total: 3,
        people: 2,
        notShown: 1,
        years: [
          {
            year: 2025,
            count: 2,
            projects: [{ id: 'x', nameBn: 'শীতবস্ত্র', nameEn: 'Winter', count: 1 }],
            unnamed: 1,
          },
        ],
      },
    });
    expect(html).toContain('ছেলে');
    expect(html).toContain('সম্ভবত সালাম (BEN-0000007)');
    expect(html).toContain('সম্ভবত রহিম (BEN-0000003)');
    expect(html).toContain('এই পরিবার যা পেয়েছে');
    expect(html).toContain('শীতবস্ত্র');
    expect(html).toContain('অন্য প্রকল্প');
    expect(html).toContain('আরও 1 জন দেখানো হয়নি');
    expect(html).not.toContain('null');
  });

  it('prints no family help where the export may not carry it', () => {
    expect(page({ familyMembers: [] })).not.toContain('এই পরিবার যা পেয়েছে');
  });
});
