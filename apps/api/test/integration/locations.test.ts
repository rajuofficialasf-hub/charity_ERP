import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { prismaClientFor } from '../../src/core/prisma.service';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { type LocationRow } from '../../src/locations/convert';
import { parseCsvRecords } from '../../src/locations/csv';
import { loadLocations } from '../../src/locations/load';
import { cloneTemplate } from './support/db';

// Locations master loader: it writes through Prisma, the checks read through the test's own client.
let db: Client;
let prisma: PrismaClient;
let drop: () => Promise<void>;
beforeAll(async () => {
  const clone = await cloneTemplate(inject('templateDb'));
  ({ client: db, drop } = clone);
  prisma = prismaClientFor(clone.url);
});
afterAll(async () => {
  await prisma.$disconnect();
  await drop();
});

const row = (over: Partial<LocationRow>): LocationRow => ({
  division_code: 'L-90',
  division_bn: 'পরীক্ষা বিভাগ',
  division_en: 'Test Division',
  district_code: 'L-90-01',
  district_bn: 'পরীক্ষা জেলা',
  district_en: 'Test District',
  upazila_code: 'L-90-01-01',
  upazila_bn: 'পরীক্ষা উপজেলা',
  upazila_en: 'Test Upazila',
  upazila_kind: 'upazila',
  upazila_post_code: '1000',
  union_code: 'L-90-01-01-001',
  union_bn: 'পরীক্ষা ইউনিয়ন',
  union_en: 'Test Union',
  union_kind: 'union',
  post_code: '1001',
  post_code_own: 'yes',
  verified: 'no',
  ...over,
});

describe('loadLocations', () => {
  const fixture = [
    row({}),
    row({
      union_code: 'L-90-01-01-002',
      union_bn: 'পরীক্ষা পৌরসভা',
      union_en: 'Test Pourashava',
      union_kind: 'pourosova',
      post_code: '1000',
      post_code_own: 'no',
    }),
  ];

  it('inserts the hierarchy once and is idempotent', async () => {
    expect(await loadLocations(prisma, fixture)).toEqual({
      inserted: 5,
      updated: 0,
      unchanged: 0,
      deactivated: 0,
    });
    expect(await loadLocations(prisma, fixture)).toEqual({
      inserted: 0,
      updated: 0,
      unchanged: 5,
      deactivated: 0,
    });
    const { rows } = await db.query(
      `SELECT c.level, c.kind, p.code AS parent FROM locations c LEFT JOIN locations p ON p.id = c.parent_id WHERE c.code = 'L-90-01-01-002'`,
    );
    expect(rows[0]).toEqual({ level: 'union', kind: 'pourosova', parent: 'L-90-01-01' });
    const { rows: codes } = await db.query(
      `SELECT code, post_code FROM locations WHERE code LIKE 'L-90%' ORDER BY code`,
    );
    expect(codes).toEqual([
      { code: 'L-90', post_code: null },
      { code: 'L-90-01', post_code: null },
      { code: 'L-90-01-01', post_code: '1000' },
      { code: 'L-90-01-01-001', post_code: '1001' },
      { code: 'L-90-01-01-002', post_code: '1000' },
    ]);
  });

  it('renames with a version bump and deactivates a code missing from the CSV, never deleting it', async () => {
    const renamed = [row({ union_bn: 'নতুন নাম', union_en: 'New Name' })];
    expect(await loadLocations(prisma, renamed)).toEqual({
      inserted: 0,
      updated: 1,
      unchanged: 3,
      deactivated: 1,
    });
    const { rows } = await db.query(
      `SELECT code, name_en, version, active FROM locations WHERE code IN ('L-90-01-01-001', 'L-90-01-01-002') ORDER BY code`,
    );
    expect(rows).toEqual([
      { code: 'L-90-01-01-001', name_en: 'New Name', version: 2, active: true },
      { code: 'L-90-01-01-002', name_en: 'Test Pourashava', version: 2, active: false },
    ]);
    // reappearing in the CSV reactivates it
    expect((await loadLocations(prisma, [...renamed, fixture[1]!])).updated).toBe(1);
  });

  it('updates a changed post code with a version bump', async () => {
    // the union renamed above goes back to its name and gets a new code: one update
    const recoded = [row({ post_code: '1002' }), fixture[1]!];
    expect((await loadLocations(prisma, recoded)).updated).toBe(1);
    const { rows } = await db.query(
      `SELECT post_code, version FROM locations WHERE code = 'L-90-01-01-001'`,
    );
    expect(rows[0]).toEqual({ post_code: '1002', version: 3 });
    expect((await loadLocations(prisma, fixture)).updated).toBe(1);
  });

  it('refuses one code for two different places and rolls back', async () => {
    const before = (await db.query('SELECT count(*)::int AS n FROM locations')).rows[0].n;
    await expect(
      loadLocations(prisma, [
        row({ upazila_code: 'L-91-01-01', union_code: 'L-91-01-01-001' }),
        row({ upazila_code: 'L-91-01-01', upazila_en: 'Other', union_code: 'L-91-01-01-002' }),
      ]),
    ).rejects.toThrow(/two different places/);
    expect((await db.query('SELECT count(*)::int AS n FROM locations')).rows[0].n).toBe(before);
  });

  it('rolls back the levels it wrote when the database refuses a later one', async () => {
    const before = (await db.query('SELECT count(*)::int AS n FROM locations')).rows[0].n;
    // the division, district and upazila are new and valid; the union's post code is refused
    await expect(
      loadLocations(prisma, [
        row({
          division_code: 'L-92',
          district_code: 'L-92-01',
          upazila_code: 'L-92-01-01',
          union_code: 'L-92-01-01-001',
          post_code: '12',
        }),
      ]),
    ).rejects.toThrow(/locations_post_code_check/);
    expect((await db.query('SELECT count(*)::int AS n FROM locations')).rows[0].n).toBe(before);
  });

  it('loads the committed bd-locations.csv: 8 divisions, 64 districts, 500 upazilas and 12 city corporations, with their post codes', async () => {
    const csv = readFileSync(
      join(__dirname, '../../../../docs/source/data/bd-locations.csv'),
      'utf8',
    );
    await loadLocations(prisma, parseCsvRecords(csv) as LocationRow[]);
    const { rows } = await db.query(
      `SELECT level, kind, count(*)::int AS n FROM locations WHERE active AND code NOT LIKE 'L-9_%' GROUP BY level, kind ORDER BY level, kind`,
    );
    expect(rows).toEqual([
      { level: 'district', kind: 'district', n: 64 },
      { level: 'division', kind: 'division', n: 8 },
      { level: 'union', kind: 'other', n: 13 },
      { level: 'union', kind: 'pourosova', n: 327 },
      { level: 'union', kind: 'thana', n: 102 },
      { level: 'union', kind: 'union', n: 4587 },
      { level: 'upazila', kind: 'city_corporation', n: 12 },
      { level: 'upazila', kind: 'upazila', n: 500 },
    ]);
    const { rows: codes } = await db.query(
      `SELECT level, kind, count(*) FILTER (WHERE post_code IS NOT NULL)::int AS with_code, count(*)::int AS n
       FROM locations WHERE active AND code NOT LIKE 'L-9_%' GROUP BY level, kind ORDER BY level, kind`,
    );
    // every union-level place has a code; one upazila (Osmaninagar) has none of its own
    expect(codes.filter((r) => r.level === 'union').every((r) => r.with_code === r.n)).toBe(true);
    expect(codes.find((r) => r.kind === 'upazila')).toEqual({
      level: 'upazila',
      kind: 'upazila',
      with_code: 499,
      n: 500,
    });
    expect(codes.find((r) => r.kind === 'city_corporation')?.with_code).toBe(0);
  });
});
