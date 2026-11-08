import { uuidv7 } from '@css/shared';
import type { Client } from 'pg';
import type { LocationRow } from './convert';

/**
 * Loads the locations master from docs/source/data/bd-locations.csv into `locations` (O-09, D-061).
 * Upsert by the internal code: new codes are inserted, changed names, kinds, post codes or parents are updated
 * with a version bump (the offline snapshot uses the version), and loader-managed codes (prefix L-)
 * missing from the CSV are deactivated, never deleted (BR-228). Runs in one transaction; a second
 * run with the same CSV changes nothing.
 */
export interface LoadResult {
  inserted: number;
  updated: number;
  unchanged: number;
  deactivated: number;
}

type Level = 'division' | 'district' | 'upazila' | 'union';
interface LocationNode {
  code: string;
  parentCode: string | null;
  level: Level;
  kind: string;
  nameBn: string;
  nameEn: string;
  postCode: string | null;
}

const LEVELS: Level[] = ['division', 'district', 'upazila', 'union'];

export function nodesFromRows(rows: LocationRow[]): Map<string, LocationNode> {
  const nodes = new Map<string, LocationNode>();
  const add = (node: LocationNode) => {
    const known = nodes.get(node.code);
    if (!known) {
      nodes.set(node.code, node);
      return;
    }
    if (
      known.nameEn !== node.nameEn ||
      known.nameBn !== node.nameBn ||
      known.parentCode !== node.parentCode ||
      known.kind !== node.kind ||
      known.postCode !== node.postCode
    ) {
      throw new Error(
        `location code ${node.code} is used for two different places (${known.nameEn} / ${node.nameEn})`,
      );
    }
  };
  for (const r of rows) {
    add({
      code: r.division_code,
      parentCode: null,
      level: 'division',
      kind: 'division',
      nameBn: r.division_bn,
      nameEn: r.division_en,
      postCode: null,
    });
    add({
      code: r.district_code,
      parentCode: r.division_code,
      level: 'district',
      kind: 'district',
      nameBn: r.district_bn,
      nameEn: r.district_en,
      postCode: null,
    });
    add({
      code: r.upazila_code,
      parentCode: r.district_code,
      level: 'upazila',
      kind: r.upazila_kind,
      nameBn: r.upazila_bn,
      nameEn: r.upazila_en,
      postCode: r.upazila_post_code || null,
    });
    add({
      code: r.union_code,
      parentCode: r.upazila_code,
      level: 'union',
      kind: r.union_kind,
      nameBn: r.union_bn,
      nameEn: r.union_en,
      postCode: r.post_code || null,
    });
  }
  return nodes;
}

export async function loadLocations(db: Client, rows: LocationRow[]): Promise<LoadResult> {
  const nodes = nodesFromRows(rows);
  const result: LoadResult = { inserted: 0, updated: 0, unchanged: 0, deactivated: 0 };
  await db.query('BEGIN');
  try {
    const idByCode = new Map<string, string>(
      (await db.query<{ id: string; code: string }>('SELECT id, code FROM locations')).rows.map(
        (r) => [r.code, r.id],
      ),
    );
    for (const level of LEVELS) {
      const batch = [...nodes.values()].filter((n) => n.level === level);
      if (batch.length === 0) continue;
      const parentIds = batch.map((n) => {
        if (n.parentCode === null) return null;
        const id = idByCode.get(n.parentCode);
        if (!id) throw new Error(`parent ${n.parentCode} of ${n.code} is missing`);
        return id;
      });
      const res = await db.query<{ id: string; code: string; inserted: boolean }>(
        `INSERT INTO locations (id, parent_id, level, kind, code, name_bn, name_en, post_code)
         SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[])
         ON CONFLICT (code) DO UPDATE SET
           parent_id = EXCLUDED.parent_id, level = EXCLUDED.level, kind = EXCLUDED.kind,
           name_bn = EXCLUDED.name_bn, name_en = EXCLUDED.name_en, post_code = EXCLUDED.post_code,
           active = true, version = locations.version + 1
         WHERE (locations.parent_id, locations.level, locations.kind, locations.name_bn, locations.name_en, locations.post_code, locations.active)
           IS DISTINCT FROM (EXCLUDED.parent_id, EXCLUDED.level, EXCLUDED.kind, EXCLUDED.name_bn, EXCLUDED.name_en, EXCLUDED.post_code, true)
         RETURNING id, code, (xmax = 0) AS inserted`,
        [
          batch.map((n) => idByCode.get(n.code) ?? uuidv7()),
          parentIds,
          batch.map((n) => n.level),
          batch.map((n) => n.kind),
          batch.map((n) => n.code),
          batch.map((n) => n.nameBn),
          batch.map((n) => n.nameEn),
          batch.map((n) => n.postCode),
        ],
      );
      for (const row of res.rows) {
        idByCode.set(row.code, row.id);
        if (row.inserted) result.inserted++;
        else result.updated++;
      }
      result.unchanged += batch.length - res.rowCount!;
    }
    const deactivated = await db.query(
      `UPDATE locations SET active = false, version = version + 1
       WHERE active AND code LIKE 'L-%' AND code <> ALL($1::text[])`,
      [[...nodes.keys()]],
    );
    result.deactivated = deactivated.rowCount ?? 0;
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}
