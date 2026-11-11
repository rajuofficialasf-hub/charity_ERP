import { parseCsvRecords, toCsv } from './csv.js';

/**
 * Converts the owner's locations file (bangladesh-admin.json, 2026-11-07) into the committed CSV
 * docs/source/data/bd-locations.csv. The file lists the divisions, their districts with the
 * upazilas (each with its unions, pourashavas and other places) and the city corporations with
 * their thanas, every place with a post code where the file knows one. Only mechanical fixes are
 * applied and every fix is reported; the rules of the conversion are in docs/source/data/README.md.
 */
export type UpazilaKind = 'upazila' | 'city_corporation';
export type UnionKind = 'union' | 'pourosova' | 'thana' | 'other';

interface OwnerPlace {
  name_en: string;
  name_native: string | null;
  postcode?: string | null;
  own_postcode?: boolean;
}

export interface OwnerFile {
  divisions: {
    name_en: string;
    name_native: string | null;
    districts: {
      name_en: string;
      name_native: string | null;
      subdistricts: (OwnerPlace & {
        unions: OwnerPlace[];
        municipalities: OwnerPlace[];
        other: OwnerPlace[];
      })[];
    }[];
    city_corporations: {
      name_en: string;
      name_native: string | null;
      /** The English name of the district the city belongs to. */
      district: string;
      city_districts: OwnerPlace[];
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
  'upazila_post_code',
  'union_code',
  'union_bn',
  'union_en',
  'union_kind',
  'post_code',
  'post_code_own',
  'verified',
] as const;
export type LocationRow = Record<(typeof CSV_COLUMNS)[number], string>;

/** The level word the file writes after a Bengali name; the CSV keeps the bare name. */
// i18n-allow-bengali: the pattern matches place-type words in the owner's location data.
const LEVEL_WORD = /\s*(বিভাগ|জেলা|উপজেলা|ইউনিয়ন|থানা)$/u; // i18n-allow-bengali
const POST_CODE = /^[0-9]{4}$/u;

export interface ConversionResult {
  rows: LocationRow[];
  fixes: string[];
}

function cleanText(value: string | null, path: string, fixes: string[]): string {
  const given = value ?? '';
  const cleaned = given.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (cleaned !== given)
    fixes.push(`${path}: whitespace or Unicode normalisation ("${given}" → "${cleaned}")`);
  if (cleaned === '') fixes.push(`${path}: name missing`);
  return cleaned;
}

/** The Bengali name without its level word ("আমতলী উপজেলা" → "আমতলী"). */
function bareBengali(value: string | null, path: string, fixes: string[]): string {
  return cleanText(value, path, fixes).replace(LEVEL_WORD, '');
}

function postCodeOf(place: OwnerPlace, path: string, fixes: string[]): string {
  const code = (place.postcode ?? '').trim();
  if (code === '') return '';
  if (!POST_CODE.test(code)) {
    fixes.push(`${path}: post code "${code}" is not four digits and is left out`);
    return '';
  }
  return code;
}

const pathKey = (...names: string[]) => names.map((n) => n.toLowerCase()).join('>');

/**
 * Existing codes from a previous CSV, by the English and by the Bengali names along the path, so
 * that re-running the converter keeps a place's code when either name still matches.
 */
function existingCodes(previousCsv?: string): Map<string, string> {
  const codes = new Map<string, string>();
  if (!previousCsv) return codes;
  for (const r of parseCsvRecords(previousCsv)) {
    for (const lang of ['en', 'bn'] as const) {
      const [dv, ds, up, un] = [
        r[`division_${lang}`] ?? '',
        r[`district_${lang}`] ?? '',
        r[`upazila_${lang}`] ?? '',
        r[`union_${lang}`] ?? '',
      ];
      codes.set(pathKey(lang, dv), r.division_code ?? '');
      codes.set(pathKey(lang, dv, ds), r.district_code ?? '');
      codes.set(pathKey(lang, dv, ds, up), r.upazila_code ?? '');
      codes.set(pathKey(lang, dv, ds, up, un), r.union_code ?? '');
    }
  }
  return codes;
}

/**
 * Hands out L- codes: a place whose English or Bengali path is known keeps its code, a new place
 * takes the next free number under its parent. A code is handed out once per run, so two places
 * that both match one old row never share it.
 */
class CodeAllocator {
  private readonly used = new Set<string>();
  private readonly handed = new Set<string>();
  constructor(private readonly existing: Map<string, string>) {
    for (const code of existing.values()) this.used.add(code);
  }
  /** The code of the first key found, or a new one; every key then names it. */
  code(keys: string[], parentCode: string, width: number): string {
    let found: string | undefined;
    for (const key of keys) {
      const known = this.existing.get(key);
      if (known && !this.handed.has(known)) {
        found = known;
        break;
      }
    }
    if (!found) {
      for (let n = 1; ; n++) {
        const candidate = `${parentCode}-${String(n).padStart(width, '0')}`;
        if (!this.used.has(candidate)) {
          found = candidate;
          break;
        }
      }
    }
    this.used.add(found);
    this.handed.add(found);
    for (const key of keys) this.existing.set(key, found);
    return found;
  }
}

/** The English and Bengali path keys of a place, with any earlier names the previous CSV used. */
const keysOf = (en: string[], bn: string[], legacyEn: string[][] = []) => [
  pathKey('en', ...en),
  pathKey('bn', ...bn),
  ...legacyEn.map((names) => pathKey('en', ...names)),
];

interface Parent {
  code: string;
  en: string[];
  bn: string[];
  legacyEn: string[][];
}

export function convertOwnerLocations(file: OwnerFile, previousCsv?: string): ConversionResult {
  const fixes: string[] = [];
  const codes = new CodeAllocator(existingCodes(previousCsv));
  const rows: LocationRow[] = [];
  const emptyRows: string[] = [];
  const add = (
    division: Parent & { nameBn: string; nameEn: string },
    district: Parent & { nameBn: string; nameEn: string },
    upazila: Parent & { nameBn: string; nameEn: string; kind: UpazilaKind; postCode: string },
    place: OwnerPlace,
    kind: UnionKind,
    nameEn: string,
    nameBn: string,
    inherited: boolean,
  ) => {
    const path = `${district.nameEn} > ${upazila.nameEn} > ${nameEn}`;
    // a union without a post office of its own already carries its upazila's code in the file; a
    // pourashava or another place gets none there and takes the upazila's here
    const given = inherited ? '' : postCodeOf(place, path, fixes);
    const isOwn = given !== '' && place.own_postcode !== false;
    const postCode = given || upazila.postCode;
    const uniCode = codes.code(
      keysOf(
        [...upazila.en, nameEn],
        [...upazila.bn, nameBn],
        upazila.legacyEn.map((names) => [...names, nameEn]),
      ),
      upazila.code,
      3,
    );
    rows.push({
      division_code: division.code,
      division_bn: division.nameBn,
      division_en: division.nameEn,
      district_code: district.code,
      district_bn: district.nameBn,
      district_en: district.nameEn,
      upazila_code: upazila.code,
      upazila_bn: upazila.nameBn,
      upazila_en: upazila.nameEn,
      upazila_kind: upazila.kind,
      upazila_post_code: upazila.postCode,
      union_code: uniCode,
      union_bn: nameBn,
      union_en: nameEn,
      union_kind: kind,
      post_code: postCode,
      post_code_own: postCode === '' ? '' : isOwn ? 'yes' : 'no',
      verified: 'no',
    });
  };

  for (const dv of file.divisions) {
    const divEn = cleanText(dv.name_en, `division ${dv.name_en}`, fixes);
    const divBn = bareBengali(dv.name_native, `division ${divEn} (bn)`, fixes);
    const divCode = codes.code(keysOf([divEn], [divBn]), 'L', 2);
    const division = {
      code: divCode,
      en: [divEn],
      bn: [divBn],
      legacyEn: [],
      nameBn: divBn,
      nameEn: divEn,
    };
    const districts = new Map<string, Parent & { nameBn: string; nameEn: string }>();
    for (const ds of dv.districts) {
      const disEn = cleanText(ds.name_en, `${divEn} > ${ds.name_en}`, fixes);
      const disBn = bareBengali(ds.name_native, `${divEn} > ${disEn} (bn)`, fixes);
      const disCode = codes.code(keysOf([divEn, disEn], [divBn, disBn]), divCode, 2);
      const district = {
        code: disCode,
        en: [divEn, disEn],
        bn: [divBn, disBn],
        legacyEn: [],
        nameBn: disBn,
        nameEn: disEn,
      };
      districts.set(disEn.toLowerCase(), district);
      for (const sd of ds.subdistricts) {
        const upaEn = cleanText(sd.name_en, `${disEn} > ${sd.name_en}`, fixes);
        const upaBn = bareBengali(sd.name_native, `${disEn} > ${upaEn} (bn)`, fixes);
        const upaPath = `${disEn} > ${upaEn}`;
        const upaCode = codes.code(
          keysOf([divEn, disEn, upaEn], [divBn, disBn, upaBn]),
          disCode,
          2,
        );
        const postCode = postCodeOf(sd, upaPath, fixes);
        if (postCode === '') fixes.push(`${upaPath}: no post code of its own in the file`);
        const upazila = {
          code: upaCode,
          en: [divEn, disEn, upaEn],
          bn: [divBn, disBn, upaBn],
          legacyEn: [],
          nameBn: upaBn,
          nameEn: upaEn,
          kind: 'upazila' as const,
          postCode,
        };
        for (const u of sd.unions) {
          const en = cleanText(u.name_en, `${upaPath} > ${u.name_en}`, fixes);
          add(
            division,
            district,
            upazila,
            u,
            'union',
            en,
            bareBengali(u.name_native, `${upaPath} > ${en} (bn)`, fixes),
            false,
          );
        }
        // a pourashava keeps its level word in both names, as the earlier file wrote it; the
        // file gives it no post code, so it takes the upazila's
        for (const m of sd.municipalities) {
          const en = `${cleanText(m.name_en, `${upaPath} > ${m.name_en}`, fixes)} Pourashava`;
          const bn = `${bareBengali(m.name_native, `${upaPath} > ${en} (bn)`, fixes)} পৌরসভা`; // i18n-allow-bengali
          add(division, district, upazila, m, 'pourosova', en, bn, true);
        }
        for (const o of sd.other) {
          const en = cleanText(o.name_en, `${upaPath} > ${o.name_en}`, fixes);
          add(
            division,
            district,
            upazila,
            o,
            'other',
            en,
            cleanText(o.name_native, `${upaPath} > ${en} (bn)`, fixes),
            true,
          );
        }
        if (sd.unions.length + sd.municipalities.length + sd.other.length === 0)
          emptyRows.push(upaPath);
      }
    }
    // a city corporation sits under its district at upazila level, named after the city;
    // the file of 2026-10-11 named it "City Corporation" alone ("North" and "South" in Dhaka)
    for (const cc of dv.city_corporations) {
      const cityEn = cleanText(cc.name_en, `${divEn} > ${cc.name_en}`, fixes);
      const district = districts.get(
        cleanText(cc.district, `${divEn} > ${cityEn} (district)`, fixes).toLowerCase(),
      );
      if (!district) {
        fixes.push(
          `${divEn} > ${cityEn}: district "${cc.district}" not in the division; city corporation left out`,
        );
        continue;
      }
      const upaEn = `${cityEn} City Corporation`;
      const upaBn = cleanText(cc.name_native, `${district.nameEn} > ${upaEn} (bn)`, fixes);
      const side = /\bnorth\b/i.test(cityEn) ? 'North ' : /\bsouth\b/i.test(cityEn) ? 'South ' : '';
      const legacy = [[divEn, district.nameEn, `${side}City Corporation`]];
      const upaCode = codes.code(
        keysOf([divEn, district.nameEn, upaEn], [divBn, district.nameBn, upaBn], legacy),
        district.code,
        2,
      );
      const upazila = {
        code: upaCode,
        en: [divEn, district.nameEn, upaEn],
        bn: [divBn, district.nameBn, upaBn],
        legacyEn: legacy,
        nameBn: upaBn,
        nameEn: upaEn,
        kind: 'city_corporation' as const,
        postCode: '',
      };
      for (const th of cc.city_districts) {
        const path = `${district.nameEn} > ${upaEn}`;
        const en = cleanText(th.name_en, `${path} > ${th.name_en}`, fixes);
        add(
          division,
          district,
          upazila,
          th,
          'thana',
          en,
          bareBengali(th.name_native, `${path} > ${en} (bn)`, fixes),
          false,
        );
      }
      if (cc.city_districts.length === 0) emptyRows.push(`${district.nameEn} > ${upaEn}`);
    }
  }
  for (const path of emptyRows)
    fixes.push(`${path}: no union-level place in the file; not in the CSV`);
  return { rows, fixes };
}

export function locationsToCsv(rows: LocationRow[]): string {
  // eslint-disable-next-line security/detect-object-injection -- fixed column names
  return toCsv([[...CSV_COLUMNS], ...rows.map((r) => CSV_COLUMNS.map((column) => r[column]))]);
}
