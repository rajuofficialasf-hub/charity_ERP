import { parseCsvRecords, toCsv } from './csv';

/**
 * Converts the owner's locations file (bd_location.json, 2026-10-11) into the committed CSV
 * docs/source/data/bd-locations.csv (D-061). Only automatic, mechanical fixes are applied and every
 * fix is reported; content corrections wait for the owner's review sheet.
 */
export type UpazilaKind = 'upazila' | 'city_corporation';
export type UnionKind = 'union' | 'pourosova' | 'thana';

interface OwnerFile {
  divisions: {
    division_en: string;
    division_bn: string;
    districts: {
      district_en: string;
      district_bn: string;
      upazilas: {
        upazila_en: string;
        upazila_bn: string;
        unions: { union_en: string; union_bn: string }[];
      }[];
    }[];
  }[];
}

export const CSV_COLUMNS = [
  'division_code',
  'division_bn',
  'division_en',
  'district_code',
  'district_bn',
  'district_en',
  'upazila_code',
  'upazila_bn',
  'upazila_en',
  'upazila_kind',
  'union_code',
  'union_bn',
  'union_en',
  'union_kind',
  'verified',
] as const;
export type LocationRow = Record<(typeof CSV_COLUMNS)[number], string>;

/** Typos found in the 2026-10-11 review (only unambiguous ones). */
const TYPO_FIXES: Record<string, string> = { emakre: 'Remakri', joyasreeup: 'Joyasree' };
const WARD_ENTRY = /^Ward No\.\s*\d+$/i;
// i18n-allow-bengali: the next two patterns match place-type words in the owner's location data.
const POUROSOVA = /pourashava|pourosova|paurashava|pourashova|municipality|পৌরসভা/i; // i18n-allow-bengali
const CITY_CORPORATION = /city corporation|সিটি কর্পোরেশন/i; // i18n-allow-bengali

export interface ConversionResult {
  rows: LocationRow[];
  fixes: string[];
}

function cleanText(value: string, path: string, fixes: string[]): string {
  const cleaned = value.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (cleaned !== value)
    fixes.push(`${path}: whitespace or Unicode normalisation ("${value}" → "${cleaned}")`);
  return cleaned;
}

function cleanEnglish(value: string, path: string, fixes: string[]): string {
  let v = cleanText(value, path, fixes);
  const typo = TYPO_FIXES[v.toLowerCase()];
  if (typo && typo !== v) {
    fixes.push(`${path}: spelling "${v}" → "${typo}"`);
    v = typo;
  }
  // first letter upper case ("kotwali"), and "City corporation" written like the other eleven
  const titled = (v.charAt(0).toUpperCase() + v.slice(1)).replace(/\bcorporation\b/, 'Corporation');
  if (titled !== v) {
    fixes.push(`${path}: capitalisation "${v}" → "${titled}"`);
    v = titled;
  }
  return v;
}

const pathKey = (...names: string[]) => names.map((n) => n.toLowerCase()).join('>');

/** Existing codes from a previous CSV, so that re-running the converter never changes a code. */
function existingCodes(previousCsv?: string): Map<string, string> {
  const codes = new Map<string, string>();
  if (!previousCsv) return codes;
  for (const r of parseCsvRecords(previousCsv)) {
    codes.set(pathKey(r.division_en ?? ''), r.division_code ?? '');
    codes.set(pathKey(r.division_en ?? '', r.district_en ?? ''), r.district_code ?? '');
    codes.set(
      pathKey(r.division_en ?? '', r.district_en ?? '', r.upazila_en ?? ''),
      r.upazila_code ?? '',
    );
    codes.set(
      pathKey(r.division_en ?? '', r.district_en ?? '', r.upazila_en ?? '', r.union_en ?? ''),
      r.union_code ?? '',
    );
  }
  return codes;
}

/** Hands out L- codes: existing ones are kept, new ones take the next free number under the parent. */
class CodeAllocator {
  private readonly used = new Set<string>();
  constructor(private readonly existing: Map<string, string>) {
    for (const code of existing.values()) this.used.add(code);
  }
  code(key: string, parentCode: string, width: number): string {
    const known = this.existing.get(key);
    if (known) return known;
    for (let n = 1; ; n++) {
      const candidate = `${parentCode}-${String(n).padStart(width, '0')}`;
      if (!this.used.has(candidate)) {
        this.used.add(candidate);
        this.existing.set(key, candidate);
        return candidate;
      }
    }
  }
}

export function convertOwnerLocations(file: OwnerFile, previousCsv?: string): ConversionResult {
  const fixes: string[] = [];
  const codes = new CodeAllocator(existingCodes(previousCsv));
  const rows: LocationRow[] = [];
  for (const dv of file.divisions) {
    const divEn = cleanEnglish(dv.division_en, `division ${dv.division_en}`, fixes);
    const divBn = cleanText(dv.division_bn, `division ${divEn} (bn)`, fixes);
    const divCode = codes.code(pathKey(divEn), 'L', 2);
    for (const ds of dv.districts) {
      const disEn = cleanEnglish(ds.district_en, `${divEn} > ${ds.district_en}`, fixes);
      const disBn = cleanText(ds.district_bn, `${divEn} > ${disEn} (bn)`, fixes);
      const disCode = codes.code(pathKey(divEn, disEn), divCode, 2);
      for (const u of ds.upazilas) {
        const upaPath = `${disEn} > ${u.upazila_en}`;
        const upaEn = cleanEnglish(u.upazila_en, upaPath, fixes);
        const upaBn = cleanText(u.upazila_bn, `${disEn} > ${upaEn} (bn)`, fixes);
        const upaKind: UpazilaKind = CITY_CORPORATION.test(`${upaEn} ${upaBn}`)
          ? 'city_corporation'
          : 'upazila';
        const upaCode = codes.code(pathKey(divEn, disEn, upaEn), disCode, 2);
        for (const un of u.unions) {
          const rawEn = un.union_en.trim();
          if (WARD_ENTRY.test(rawEn)) {
            fixes.push(
              `${disEn} > ${upaEn} > ${rawEn}: ward entry dropped (O-09, owner decision 2026-10-11)`,
            );
            continue;
          }
          const uniEn = cleanEnglish(un.union_en, `${disEn} > ${upaEn} > ${un.union_en}`, fixes);
          const uniBn = cleanText(un.union_bn, `${disEn} > ${upaEn} > ${uniEn} (bn)`, fixes);
          const uniKind: UnionKind =
            upaKind === 'city_corporation'
              ? 'thana'
              : POUROSOVA.test(`${uniEn} ${uniBn}`)
                ? 'pourosova'
                : 'union';
          const uniCode = codes.code(pathKey(divEn, disEn, upaEn, uniEn), upaCode, 3);
          rows.push({
            division_code: divCode,
            division_bn: divBn,
            division_en: divEn,
            district_code: disCode,
            district_bn: disBn,
            district_en: disEn,
            upazila_code: upaCode,
            upazila_bn: upaBn,
            upazila_en: upaEn,
            upazila_kind: upaKind,
            union_code: uniCode,
            union_bn: uniBn,
            union_en: uniEn,
            union_kind: uniKind,
            verified: 'no',
          });
        }
      }
    }
  }
  return { rows, fixes };
}

export function locationsToCsv(rows: LocationRow[]): string {
  // eslint-disable-next-line security/detect-object-injection -- fixed column names
  return toCsv([[...CSV_COLUMNS], ...rows.map((r) => CSV_COLUMNS.map((column) => r[column]))]);
}
