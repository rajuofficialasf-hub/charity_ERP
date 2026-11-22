import { describe, expect, it } from 'vitest';
import { convertOwnerLocations, locationsToCsv, type OwnerFile } from './convert.js';
import { parseCsv, parseCsvLines, parseCsvRecords, toCsv } from './csv.js';

const place = (
  name_en: string,
  name_native: string,
  postcode?: string,
  own_postcode?: boolean,
) => ({
  name_en,
  name_native,
  ...(postcode === undefined ? {} : { postcode }),
  ...(own_postcode === undefined ? {} : { own_postcode }),
});

/** A division with one district of two upazilas and one city corporation, as the owner's file is. */
const sample: OwnerFile = {
  divisions: [
    {
      name_en: 'Khulna',
      name_native: 'খুলনা বিভাগ',
      districts: [
        {
          name_en: 'Khulna',
          name_native: 'খুলনা জেলা',
          subdistricts: [
            {
              ...place('Dumuria', 'ডুমুরিয়া  উপজেলা', '9250'),
              unions: [
                place('Atlia ', 'আটলিয়া ইউনিয়ন', '9250', false),
                place('Magurkhali', 'মাগুরখালী ইউনিয়ন', '9252', true),
              ],
              municipalities: [place('Dumuria', 'ডুমুরিয়া')],
              other: [place('Nalian Range', 'নলিয়ান রেঞ্জ')],
            },
            {
              ...place('Dacope', 'দাকোপ উপজেলা', null as unknown as string),
              unions: [place('Bajua', 'বাজুয়া ইউনিয়ন', '9271', true)],
              municipalities: [],
              other: [],
            },
          ],
        },
      ],
      city_corporations: [
        {
          name_en: 'Khulna',
          name_native: 'খুলনা সিটি কর্পোরেশন',
          district: 'Khulna',
          city_districts: [place('Kotwali', 'কোতোয়ালী থানা', '9100')],
        },
      ],
    },
  ],
};

describe('convertOwnerLocations', () => {
  const { rows, fixes } = convertOwnerLocations(sample);

  it('writes one row per union-level place with its kind and the level words taken off', () => {
    expect(
      rows.map((r) => [r.upazila_en, r.upazila_bn, r.union_kind, r.union_en, r.union_bn]),
    ).toEqual([
      ['Dumuria', 'ডুমুরিয়া', 'union', 'Atlia', 'আটলিয়া'],
      ['Dumuria', 'ডুমুরিয়া', 'union', 'Magurkhali', 'মাগুরখালী'],
      ['Dumuria', 'ডুমুরিয়া', 'pourosova', 'Dumuria Pourashava', 'ডুমুরিয়া পৌরসভা'],
      ['Dumuria', 'ডুমুরিয়া', 'other', 'Nalian Range', 'নলিয়ান রেঞ্জ'],
      ['Dacope', 'দাকোপ', 'union', 'Bajua', 'বাজুয়া'],
      ['Khulna City Corporation', 'খুলনা সিটি কর্পোরেশন', 'thana', 'Kotwali', 'কোতোয়ালী'],
    ]);
    expect(rows.map((r) => [r.division_bn, r.district_bn, r.upazila_kind])).toContainEqual([
      'খুলনা',
      'খুলনা',
      'city_corporation',
    ]);
  });

  it('carries the post codes: a place’s own, or the upazila’s for one without', () => {
    expect(
      rows.map((r) => [r.union_en, r.upazila_post_code, r.post_code, r.post_code_own]),
    ).toEqual([
      ['Atlia', '9250', '9250', 'no'],
      ['Magurkhali', '9250', '9252', 'yes'],
      ['Dumuria Pourashava', '9250', '9250', 'no'],
      ['Nalian Range', '9250', '9250', 'no'],
      ['Bajua', '', '9271', 'yes'],
      ['Kotwali', '', '9100', 'yes'],
    ]);
  });

  it('reports the mechanical fixes and the upazila without a post code', () => {
    expect(fixes).toEqual([
      expect.stringMatching(/^Khulna > Dumuria \(bn\): whitespace or Unicode normalisation/),
      expect.stringMatching(/^Khulna > Dumuria > Atlia : whitespace or Unicode normalisation/),
      'Khulna > Dacope: no post code of its own in the file',
    ]);
  });

  it('assigns internal L- codes per level', () => {
    expect(rows[0]).toMatchObject({
      division_code: 'L-01',
      district_code: 'L-01-01',
      upazila_code: 'L-01-01-01',
      union_code: 'L-01-01-01-001',
    });
    expect(rows.map((r) => r.union_code)).toEqual([
      'L-01-01-01-001',
      'L-01-01-01-002',
      'L-01-01-01-003',
      'L-01-01-01-004',
      'L-01-01-02-001',
      'L-01-01-03-001',
    ]);
  });

  it('keeps the codes of an earlier CSV by the English or the Bengali name, and the city corporation by its earlier name', () => {
    const previous = locationsToCsv(
      rows.map((r) => {
        // the earlier file spelt some English names differently and named the city "City Corporation"
        if (r.union_en === 'Atlia') return { ...r, union_en: 'Atlia Old Spelling' };
        if (r.union_en === 'Magurkhali') return { ...r, union_bn: 'অন্য বানান' };
        if (r.upazila_kind === 'city_corporation')
          return { ...r, upazila_en: 'City Corporation', upazila_bn: 'সিটি কর্পোরেশন' };
        return r;
      }),
    );
    const again = convertOwnerLocations(sample, previous);
    expect(again.rows.map((r) => [r.union_en, r.upazila_code, r.union_code])).toEqual(
      rows.map((r) => [r.union_en, r.upazila_code, r.union_code]),
    );
  });

  it('gives a new code to a place the earlier CSV did not have, and never hands one code to two places', () => {
    const previous = locationsToCsv(rows.filter((r) => r.union_en !== 'Magurkhali'));
    const next: OwnerFile = JSON.parse(JSON.stringify(sample));
    // a new union whose Bengali name equals an old one's: the old code goes to the first match only
    next.divisions[0]!.districts[0]!.subdistricts[0]!.unions.push(
      place('Atlia Uttar', 'আটলিয়া ইউনিয়ন', '9250'),
    );
    const again = convertOwnerLocations(next, previous);
    const codes = again.rows.map((r) => [r.union_en, r.union_code]);
    expect(codes).toContainEqual(['Atlia', 'L-01-01-01-001']);
    expect(codes).toContainEqual(['Magurkhali', 'L-01-01-01-002']);
    expect(codes).toContainEqual(['Atlia Uttar', 'L-01-01-01-005']);
    expect(new Set(again.rows.map((r) => r.union_code)).size).toBe(again.rows.length);
  });

  it('refuses a post code that is not four digits and leaves out a city whose district is unknown', () => {
    const odd: OwnerFile = JSON.parse(JSON.stringify(sample));
    odd.divisions[0]!.districts[0]!.subdistricts[1]!.unions[0]!.postcode = '92711';
    odd.divisions[0]!.city_corporations[0]!.district = 'Elsewhere';
    const result = convertOwnerLocations(odd);
    expect(result.rows.find((r) => r.union_en === 'Bajua')?.post_code).toBe('');
    expect(result.rows.some((r) => r.upazila_kind === 'city_corporation')).toBe(false);
    expect(result.fixes).toContainEqual(
      'Khulna > Dacope > Bajua: post code "92711" is not four digits and is left out',
    );
    expect(result.fixes).toContainEqual(
      'Khulna > Khulna: district "Elsewhere" not in the division; city corporation left out',
    );
  });
});

describe('CSV helpers', () => {
  it('round-trips quoted cells, embedded quotes and newlines', () => {
    const text = toCsv([
      ['a', 'b'],
      ['x,y', 'he said "hi"'],
      ['line1\nline2', ''],
    ]);
    expect(parseCsv(text)).toEqual([
      ['a', 'b'],
      ['x,y', 'he said "hi"'],
      ['line1\nline2', ''],
    ]);
    expect(parseCsvRecords(text)).toEqual([
      { a: 'x,y', b: 'he said "hi"' },
      { a: 'line1\nline2', b: '' },
    ]);
  });

  it('strips a byte order mark and ignores empty lines', () => {
    expect(parseCsv('﻿a,b\r\n\r\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('splits on a tab when asked, keeping commas inside a cell', () => {
    expect(parseCsv('a\tb\n1,5\t2\n', '\t')).toEqual([
      ['a', 'b'],
      ['1,5', '2'],
    ]);
  });

  it('gives the line each row starts on, counting empty lines and breaks inside quotes', () => {
    expect(parseCsvLines('a,b\r\n\r\n1,"x\r\ny"\n\n2,z\n')).toEqual([
      { line: 1, cells: ['a', 'b'] },
      { line: 3, cells: ['1', 'x\r\ny'] },
      { line: 6, cells: ['2', 'z'] },
    ]);
  });
});
