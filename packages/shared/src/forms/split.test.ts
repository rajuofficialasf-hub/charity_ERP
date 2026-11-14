import { describe, expect, it } from 'vitest';
import {
  coreAnswers,
  definitionWith,
  DISTRICT,
  DIVISION,
  field,
  FILE_ID,
  option,
  UNION,
  UPAZILA,
  yesNo,
} from '../../test/forms-fixture.js';
import { identityColumn, split, SplitError, type Answer } from './index.js';

// Which answers go to the beneficiary profile and which stay with the application.
const answer = (fieldKey: string, value: Answer['value'], repeatIndex?: number): Answer =>
  repeatIndex === undefined ? { fieldKey, value } : { fieldKey, repeatIndex, value };

describe('the split', () => {
  it('sends the name and the address to the profile and a project question to the answers', () => {
    const definition = definitionWith([yesNo('prior_business')]);
    const result = split(definition, [
      ...coreAnswers(),
      answer('prior_business', { t: 'radio', v: 'yes' }),
    ]);
    expect(result.standard).toEqual({
      nid: '1234567890',
      mobile: '01712345678',
      name: 'Rahima Khatun',
      father_or_husband_name: 'Abdul Karim',
      gender_code: 'female',
      division_id: DIVISION,
      district_id: DISTRICT,
      upazila_id: UPAZILA,
      union_id: UNION,
      village: 'Charpara',
    });
    expect(result.custom).toEqual([answer('prior_business', { t: 'radio', v: 'yes' })]);
    expect(result.familyMembers).toEqual([]);
  });

  it('sends whose number the mobile is and the owner’s name to their two profile columns', () => {
    const definition = definitionWith([
      field('q_owner', 'single_select', {
        standardColumn: 'mobile_owner_code',
        options: [option('own'), option('neighbour')],
      }),
      field('q_owner_name', 'short_text', { standardColumn: 'mobile_owner_name' }),
    ]);
    const result = split(definition, [
      ...coreAnswers(),
      answer('q_owner', { t: 'single_select', v: 'neighbour' }),
      answer('q_owner_name', { t: 'short_text', v: 'Karim Mia' }),
    ]);
    expect(result.standard).toMatchObject({
      mobile: '01712345678',
      mobile_owner_code: 'neighbour',
      mobile_owner_name: 'Karim Mia',
    });
    // neither stays behind as an application answer of its own
    expect(result.custom).toEqual([]);
    // a form without the two questions gives the profile neither column
    const without = split(definitionWith(), coreAnswers());
    expect(Object.keys(without.standard)).not.toContain('mobile_owner_code');
    expect(Object.keys(without.standard)).not.toContain('mobile_owner_name');
  });

  it('sends whether the name beside the person is the father’s or the husband’s to its profile column', () => {
    const definition = definitionWith([
      field('q_relation', 'single_select', {
        standardColumn: 'guardian_relation_code',
        options: [option('father'), option('husband')],
      }),
    ]);
    const result = split(definition, [
      ...coreAnswers(),
      answer('q_relation', { t: 'single_select', v: 'husband' }),
    ]);
    expect(result.standard).toMatchObject({
      father_or_husband_name: 'Abdul Karim',
      guardian_relation_code: 'husband',
    });
    expect(result.custom).toEqual([]);
    // a form without the question, or the question left empty, gives the profile no relation
    expect(Object.keys(split(definition, coreAnswers()).standard)).not.toContain(
      'guardian_relation_code',
    );
    expect(Object.keys(split(definitionWith(), coreAnswers()).standard)).not.toContain(
      'guardian_relation_code',
    );
  });

  it('files a 10 or 13 digit number as an NID and anything else as a birth registration', () => {
    expect(identityColumn('1000000001')).toBe('nid');
    expect(identityColumn('1000000000123')).toBe('nid');
    expect(identityColumn('20261011000000001')).toBe('nid');
    expect(identityColumn('x')).toBe('birth_reg');
  });

  it('spreads a location over its three columns, keeps the first photo and the other text', () => {
    const definition = definitionWith([
      field('gps', 'gps', { standardColumn: 'latitude,longitude,gps_accuracy_m' }),
      field('photo', 'photo', { standardColumn: 'photo_file_id' }),
      field('beneficiary_class', 'single_select', {
        standardColumn: 'class_code',
        options: [option('widow'), option('other', { allowsOtherText: true })],
      }),
    ]);
    const result = split(definition, [
      answer('gps', { t: 'gps', lat: 23.8, lng: 90.4 }),
      answer('photo', { t: 'photo', v: [FILE_ID] }),
      answer('beneficiary_class', { t: 'single_select', v: 'other', other: 'landless' }),
    ]);
    expect(result.standard).toEqual({
      latitude: 23.8,
      longitude: 90.4,
      gps_accuracy_m: null,
      photo_file_id: FILE_ID,
      class_code: 'other',
      class_other_text: 'landless',
    });
  });

  it('marks the rows of a group whose setting says they are not earners, apart from the earners', () => {
    const definition = definitionWith([
      field('members', 'repeat_group', {
        standardColumn: 'beneficiary_family_members',
        settings: { repeat: { earner: false } },
      }),
      field('member_name', 'short_text', {
        standardColumn: 'name',
        settings: { repeat: { group: 'members' } },
      }),
      field('member_age', 'number', {
        standardColumn: 'age_years',
        settings: { repeat: { group: 'members' } },
      }),
      field('earners', 'repeat_group', { standardColumn: 'beneficiary_family_members' }),
      field('earner_name', 'short_text', {
        standardColumn: 'name',
        settings: { repeat: { group: 'earners' } },
      }),
    ]);
    const result = split(definition, [
      ...coreAnswers(),
      answer('member_name', { t: 'short_text', v: 'Rahim' }, 0),
      answer('member_age', { t: 'number', v: 12 }, 0),
      answer('earner_name', { t: 'short_text', v: 'Karim' }, 0),
    ]);
    expect(result.familyMembers).toEqual([
      { group: 'earners', repeatIndex: 0, columns: { name: 'Karim' }, isEarner: true },
      {
        group: 'members',
        repeatIndex: 0,
        columns: { name: 'Rahim', age_years: 12 },
        isEarner: false,
      },
    ]);
  });

  it('turns the earners group into family-member rows by the members own columns', () => {
    const definition = definitionWith([
      field('earners', 'repeat_group', { standardColumn: 'beneficiary_family_members' }),
      field('earner_name', 'short_text', {
        standardColumn: 'name',
        settings: { repeat: { group: 'earners' } },
      }),
      field('earner_income', 'money', {
        standardColumn: 'monthly_income',
        settings: { repeat: { group: 'earners' } },
      }),
      field('earner_note', 'short_text', { settings: { repeat: { group: 'earners' } } }),
    ]);
    const result = split(definition, [
      answer('earner_name', { t: 'short_text', v: 'Karim' }, 0),
      answer('earner_income', { t: 'money', v: '3000.00' }, 0),
      answer('earner_name', { t: 'short_text', v: 'Salma' }, 1),
      answer('earner_note', { t: 'short_text', v: 'part time' }, 1),
    ]);
    expect(result.familyMembers).toEqual([
      {
        group: 'earners',
        repeatIndex: 0,
        columns: { name: 'Karim', monthly_income: '3000.00' },
        isEarner: true,
      },
      { group: 'earners', repeatIndex: 1, columns: { name: 'Salma' }, isEarner: true },
    ]);
    expect(result.custom).toEqual([answer('earner_note', { t: 'short_text', v: 'part time' }, 1)]);
  });

  it('keeps every calculated value and every unknown key with the application', () => {
    const definition = definitionWith([
      field('total_members', 'calculation', {
        standardColumn: 'total_members',
        calculation: { expr: 1 },
      }),
    ]);
    const result = split(definition, [
      answer('total_members', { t: 'calculation', v: 5 }),
      answer('stray', { t: 'short_text', v: 'x' }),
    ]);
    expect(result.standard).toEqual({});
    expect(result.custom.map((a) => a.fieldKey)).toEqual(['total_members', 'stray']);
  });
});

describe('the second line of defence', () => {
  it('refuses to split a definition whose field names a column outside the allowlist', () => {
    const definition = definitionWith([field('x', 'short_text', { standardColumn: 'is_blocked' })]);
    expect(() => split(definition, [answer('x', { t: 'short_text', v: 'true' })])).toThrow(
      SplitError,
    );
    const members = definitionWith([
      field('earners', 'repeat_group', { standardColumn: 'beneficiary_family_members' }),
      field('earner_flag', 'short_text', {
        standardColumn: 'active',
        settings: { repeat: { group: 'earners' } },
      }),
    ]);
    expect(() => split(members, [answer('earner_flag', { t: 'short_text', v: 'x' }, 0)])).toThrow(
      /form.standard_column_unknown/u,
    );
  });
});
