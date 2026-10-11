import { describe, expect, it } from 'vitest';
import { convertOwnerLocations, locationsToCsv } from './convert';
import { parseCsv, parseCsvRecords, toCsv } from './csv';

const sample = {
  divisions: [
    {
      division_en: 'khulna',
      division_bn: 'খুলনা',
      districts: [
        {
          district_en: 'Khulna',
          district_bn: 'খুলনা',
          upazilas: [
            {
              upazila_en: 'City corporation',
              upazila_bn: 'সিটি কর্পোরেশন',
              unions: [{ union_en: 'kotwali', union_bn: 'কোতোয়ালী' }],
            },
            {
              upazila_en: 'Dumuria',
              upazila_bn: 'ডুমুরিয়া',
              unions: [
                { union_en: 'Dumuria Pourashava', union_bn: 'ডুমুরিয়া পৌরসভা' },
                { union_en: 'Atlia ', union_bn: 'আটলিয়া  ' },
                { union_en: 'Ward No. 1', union_bn: '১ নং ওয়ার্ড' },
                { union_en: 'emakre', union_bn: 'রেমাক্রী' },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe('convertOwnerLocations (D-061)', () => {
  const { rows, fixes } = convertOwnerLocations(sample);

  it('detects city corporations, thanas and pourosovas', () => {
    expect(rows.map((r) => [r.upazila_kind, r.union_en, r.union_kind])).toEqual([
      ['city_corporation', 'Kotwali', 'thana'],
      ['upazila', 'Dumuria Pourashava', 'pourosova'],
      ['upazila', 'Atlia', 'union'],
      ['upazila', 'Remakri', 'union'],
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
      'L-01-01-02-001',
      'L-01-01-02-002',
      'L-01-01-02-003',
    ]);
  });

  it('applies and reports only mechanical fixes; drops ward entries (O-09)', () => {
    expect(rows.find((r) => r.union_en === 'Atlia')?.union_bn).toBe('আটলিয়া');
    expect(rows[0]?.division_en).toBe('Khulna');
    expect(rows[0]?.upazila_en).toBe('City Corporation');
    expect(rows.some((r) => /Ward/.test(r.union_en))).toBe(false);
    expect(fixes.join('\n')).toMatch(/ward entry dropped/);
    expect(fixes.join('\n')).toMatch(/spelling "emakre" → "Remakri"/);
    expect(rows.every((r) => r.verified === 'no')).toBe(true);
  });

  it('keeps existing codes and gives new places the next free number', () => {
    const csv = locationsToCsv(rows);
    const changed = structuredClone(sample);
    changed.divisions[0]!.districts[0]!.upazilas[1]!.unions.unshift({
      union_en: 'Gutudia',
      union_bn: 'গুটুদিয়া',
    });
    const again = convertOwnerLocations(changed, csv).rows;
    expect(again.find((r) => r.union_en === 'Atlia')?.union_code).toBe('L-01-01-02-002');
    expect(again.find((r) => r.union_en === 'Gutudia')?.union_code).toBe('L-01-01-02-004');
  });
});

describe('csv', () => {
  it('round-trips quotes, commas and Bengali text', () => {
    const rows = [
      ['a', 'b'],
      ['কক্সবাজার, সদর', 'He said "hi"'],
    ];
    const text = toCsv(rows);
    expect(parseCsv(text)).toEqual(rows);
    expect(parseCsvRecords('x,y\n1,2\n')).toEqual([{ x: '1', y: '2' }]);
  });
});
