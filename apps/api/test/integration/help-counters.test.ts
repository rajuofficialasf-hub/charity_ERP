import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HELPED_IF_DELIVERED_STATES, HELPED_STATES, NOT_DELIVERED_OUTCOMES } from '@css/shared';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HelpCountersJob } from '../../src/jobs/help-counters.js';
import { helpCountsSql, recountHelp } from '../../src/services/help-history.js';
import { accessWorld } from './support/access-fixtures.js';
import { account, type AuthHarness, authHarness } from './support/auth-app.js';
import { MIGRATIONS_DIR } from './support/db.js';
import * as f from './support/fixtures.js';

// The times each person was helped, kept on the profile (docs/database/DATABASE_SCHEMA.md,
// "beneficiaries"): the nightly recount repairs what a write missed and leaves the profile's
// version alone, a chain of merges hands a left-behind application up to the live profile, and the
// migration's backfill counts by the shared rule.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const quiet = pino({ level: 'silent' });

beforeAll(async () => {
  h = await authHarness();
  world = await accessWorld(h.db, {
    staff: async (role) => (await account(h.db, { kind: 'staff', role })).id,
    volunteerUser: async (role) => (await account(h.db, { kind: 'volunteer', role })).id,
  });
});
afterAll(async () => h.close());

const person = () => f.beneficiary(h.db, world.dhaka);
const approvedIn = (project: Awaited<ReturnType<typeof f.project>>, beneficiaryId: string) =>
  f.application(
    h.db,
    { project, loc: world.dhaka },
    { beneficiary_id: beneficiaryId, status: 'approved', approved_at: new Date().toISOString() },
  );
const kept = async (id: string) =>
  (
    await h.db.query<{ help_count: number; max_helps_in_year: number; updated_at: Date }>(
      'SELECT help_count, max_helps_in_year, updated_at FROM beneficiaries WHERE id = $1',
      [id],
    )
  ).rows[0]!;
const fresh = async (id: string) => {
  const [row] = await h.container.prisma.$queryRaw<
    { help_count: number; max_helps_in_year: number }[]
  >(helpCountsSql([id]));
  return { help_count: row!.help_count, max_helps_in_year: row!.max_helps_in_year };
};

describe('the nightly recount', () => {
  it('repairs a wrong counter without changing the profile version, and a second run writes nothing', async () => {
    const someone = await person();
    // two projects of one year and one of another
    await approvedIn(await f.project(h.db, { year: 2025 }), someone);
    await approvedIn(await f.project(h.db, { year: 2025 }), someone);
    await approvedIn(await f.project(h.db, { year: 2026 }), someone);
    const job = new HelpCountersJob(h.container.prisma, quiet, { batchSize: 3 });
    await job.run();
    const before = await kept(someone);
    expect(before).toMatchObject({ help_count: 3, max_helps_in_year: 2 });
    // a write path that missed its recount
    await h.db.query(
      'UPDATE beneficiaries SET help_count = 7, max_helps_in_year = 7 WHERE id = $1',
      [someone],
    );
    const injected = await kept(someone);
    const result = await job.run();
    expect(result.repaired).toBeGreaterThanOrEqual(1);
    expect(result.checked).toBeGreaterThanOrEqual(1);
    const after = await kept(someone);
    expect(after).toMatchObject({ help_count: 3, max_helps_in_year: 2 });
    expect(after).toMatchObject(await fresh(someone));
    // the counters alone never stamp the row: an official's open edit stays current
    expect(after.updated_at.toISOString()).toBe(injected.updated_at.toISOString());
    expect((await job.run()).repaired).toBe(0);
  });

  it('is registered in the container the worker reads', () => {
    expect(h.container.helpCounters).toBeInstanceOf(HelpCountersJob);
  });
});

describe('a write of the profile beside the recount', () => {
  it('still stamps the row when the same transaction changes the person after a recount', async () => {
    const someone = await person();
    await approvedIn(await f.project(h.db, { year: 2026 }), someone);
    const before = await kept(someone);
    await h.container.prisma.$transaction(async (tx) => {
      await recountHelp(tx, [someone]);
      await tx.beneficiary.update({ where: { id: someone }, data: { village: 'অন্য গ্রাম' } });
    });
    const after = await kept(someone);
    expect(after).toMatchObject({ help_count: 1, max_helps_in_year: 1 });
    expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
  });
});

describe('a chain of merges', () => {
  it('counts an application left on a retired profile for every profile above it', async () => {
    const [top, middle, bottom] = [await person(), await person(), await person()];
    const project = await f.project(h.db, { year: 2026 });
    const left = await approvedIn(project, bottom);
    await approvedIn(project, middle);
    // bottom was retired into middle with its application left behind, then middle into top
    for (const [keptId, mergedId, leftBehind] of [
      [middle, bottom, [left]],
      [top, middle, []],
    ] as const) {
      await f.insert(h.db, 'profile_merges', {
        id: randomUUID(),
        kept_id: keptId,
        merged_id: mergedId,
        status: 'merged',
        reason: 'একই মানুষ',
        proposed_by: world.users.head,
        merged_by: world.users.head,
        merged_at: new Date(),
        snapshot: JSON.stringify({ moved: {}, leftBehind }),
      });
      await h.db.query('UPDATE beneficiaries SET merged_into_id = $1 WHERE id = $2', [
        keptId,
        mergedId,
      ]);
    }
    // a recount of the bottom profile reaches the live one at the top
    await h.container.prisma.$transaction((tx) => recountHelp(tx, [bottom]));
    expect(await kept(top)).toMatchObject({ help_count: 1, max_helps_in_year: 1 });
    expect(await kept(middle)).toMatchObject({ help_count: 2, max_helps_in_year: 2 });
    expect(await kept(bottom)).toMatchObject({ help_count: 1, max_helps_in_year: 1 });
    for (const id of [top, middle, bottom]) expect(await kept(id)).toMatchObject(await fresh(id));
  });
});

describe('the backfill of the migration', () => {
  it('counts the states and outcomes of the shared rule', () => {
    const sql = readFileSync(
      join(MIGRATIONS_DIR, '20261115120000_beneficiary_help_counters', 'migration.sql'),
      'utf8',
    );
    const list = (values: readonly string[]) => values.map((v) => `'${v}'`).join(', ');
    expect(sql).toContain(`a.status IN (${list(HELPED_STATES)})`);
    expect(sql).toContain(`a.status IN (${list(HELPED_IF_DELIVERED_STATES)})`);
    expect(sql).toContain(`a.outcome NOT IN (${list(NOT_DELIVERED_OUTCOMES)})`);
  });
});
