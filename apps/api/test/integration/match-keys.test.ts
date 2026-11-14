import { randomUUID } from 'node:crypto';
import { startingNameVariantRows } from '@css/shared/beneficiaries';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Principal } from '../../src/auth/principal.js';
import { NAME_KEYS_QUEUE, NAME_KEYS_SINGLETON, NameKeysJob } from '../../src/jobs/name-keys.js';
import { raiseVariantsVersion } from '../../src/services/match-keys.js';
import { accessWorld } from './support/access-fixtures.js';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
} from './support/auth-app.js';
import * as f from './support/fixtures.js';

// The name keys stored with each person: every write of a name, a father's or husband's name or a
// village stores them with the version of the spelling variants list; the key job fills what is
// missing and computes them again after the list changes, in batches, and only once.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);

interface KeyRow {
  name_key: string | null;
  guardian_key: string | null;
  village_key: string | null;
  match_keys_version: number | null;
  updated_at: Date;
}
const keysOf = async (id: string) =>
  (
    await h.db.query(
      'SELECT name_key, guardian_key, village_key, match_keys_version, updated_at FROM beneficiaries WHERE id = $1',
      [id],
    )
  ).rows[0] as KeyRow;
/** One query at a time: the test's database client takes no parallel queries. */
const allKeys = async (ids: string[]) => {
  const rows: KeyRow[] = [];
  for (const id of ids) rows.push(await keysOf(id));
  return rows;
};
const memberKeysOf = async (id: string) =>
  (
    await h.db.query(
      'SELECT name_key, match_keys_version FROM beneficiary_family_members WHERE id = $1',
      [id],
    )
  ).rows[0] as { name_key: string | null; match_keys_version: number | null };
const version = async () =>
  (await h.db.query('SELECT version FROM name_variants_version WHERE id = 1')).rows[0]
    .version as number;
/** Adds spellings to the list and raises its version, as a change of the list does. */
async function addVariants(rows: { variant: string; canonical: string }[]) {
  for (const row of rows)
    await h.db.query(
      'INSERT INTO name_variants (id, variant, canonical) VALUES ($1, $2, $3) ON CONFLICT (variant) DO NOTHING',
      [randomUUID(), row.variant, row.canonical],
    );
  return h.container.prisma.$transaction((tx) =>
    raiseVariantsVersion(tx, h.container.jobs, world.users.head),
  );
}
/** The key job on the test database, counting its transactions. */
function keyJob(batchSize = 2) {
  const counted = { transactions: 0 };
  const prisma = {
    $transaction: ((...args: Parameters<typeof h.container.prisma.$transaction>) => {
      counted.transactions++;
      return h.container.prisma.$transaction(...args);
    }) as typeof h.container.prisma.$transaction,
  };
  const job = new NameKeysJob(prisma, h.container.matchKeys, { info: () => undefined }, batchSize);
  return { job, counted };
}
/** Brings every key of the database to the current list, so a test counts only its own rows. */
const settle = () => keyJob(500).job.run();

beforeAll(async () => {
  h = await authHarness();
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
  await addVariants(startingNameVariantRows());
  await f.referenceCode(h.db, 'gender', 'female');
});
afterAll(async () => h.close());

async function applicant(over: Record<string, unknown> = {}) {
  const id = await f.beneficiary(h.db, world.dhaka, over);
  await f.application(h.db, { project: world.a1, loc: world.dhaka }, { beneficiary_id: id });
  return id;
}

describe('the keys every write stores', () => {
  const create = (over: Record<string, unknown> = {}) =>
    h.container.prisma.$transaction((tx) =>
      h.container.beneficiaryIdentity.createProfile(
        tx,
        { userId: world.users.rpmDhaka } as Principal,
        {
          nid: f.fakeNid(),
          name: 'মোছাঃ রাহিমা বেগম',
          fatherOrHusbandName: 'মোঃ আকতার হোসাইন',
          mobile: f.fakeMobile(),
          genderCode: 'female',
          divisionId: world.dhaka.division,
          districtId: world.dhaka.district,
          upazilaId: world.dhaka.upazila,
          unionId: world.dhaka.union,
          village: ' উত্তর-পাড়া ',
          ...over,
        },
      ),
    );

  it('stores the keys of a new profile with a document, with the current version', async () => {
    const { id } = await create();
    expect(await keysOf(id)).toMatchObject({
      name_key: 'রহিমা',
      guardian_key: 'আক্তারহোসেন',
      village_key: 'উত্তরপাড়া',
      match_keys_version: await version(),
    });
  });

  it('stores the keys of a new profile without a document', async () => {
    const { id } = await create({ nid: undefined, mobile: undefined, documentOptional: true });
    expect(await keysOf(id)).toMatchObject({
      name_key: 'রহিমা',
      guardian_key: 'আক্তারহোসেন',
      village_key: 'উত্তরপাড়া',
      match_keys_version: await version(),
    });
  });

  it('stores new keys with a decided correction of the name and of the father’s name', async () => {
    const id = await applicant({ name: 'ভুল নাম', father_or_husband_name: 'ভুল পিতা' });
    const rpm = await as(world.users.rpmDhaka);
    const pm = await as(world.users.pm);
    for (const [field, newValue] of [
      ['name', 'মোঃ করিম'],
      ['father_or_husband_name', 'হাজী আব্দুর রাহমান'],
    ] as const) {
      const asked = await api()
        .post(`/api/v1/beneficiaries/${id}/correction-requests`)
        .set(bearer(rpm))
        .send({ field, newValue, reason: 'জাতীয় পরিচয়পত্রের বানান' });
      expect(asked.status, JSON.stringify(asked.body)).toBe(201);
      const decided = await api()
        .post(`/api/v1/beneficiary-corrections/${asked.body.data.id}/decision`)
        .set(bearer(pm))
        .send({ decision: 'approve' });
      expect(decided.status, JSON.stringify(decided.body)).toBe(200);
    }
    expect(await keysOf(id)).toMatchObject({
      name_key: 'করিম',
      guardian_key: 'আব্দুররহমান',
      village_key: 'নমুনাগ্রাম',
      match_keys_version: await version(),
    });
  });

  it('stores new keys with a contact change of the village', async () => {
    const id = await applicant({ name: 'মোঃ করিম', village: 'পুরনো গ্রাম' });
    const rpm = await as(world.users.rpmDhaka);
    const tag = (await api().get(`/api/v1/beneficiaries/${id}`).set(bearer(rpm)).expect(200))
      .headers.etag as string;
    const before = await keysOf(id);
    expect(before.match_keys_version).toBeNull();
    const res = await api()
      .patch(`/api/v1/beneficiaries/${id}/contact`)
      .set(bearer(rpm))
      .set('If-Match', tag)
      .send({ village: 'নতুন-গ্রাম' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const after = await keysOf(id);
    expect(after).toMatchObject({
      name_key: 'করিম',
      village_key: 'নতুনগ্রাম',
      match_keys_version: await version(),
    });
    // a contact change is an edit: its stamp moves, unlike the key job's
    expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
  });

  it('stores the keys of both profiles at a merge and at its revert', async () => {
    const kept = await f.beneficiary(h.db, world.dhaka, { name: 'মোসাঃ রহিমা খাতুন' });
    const retired = await f.beneficiary(h.db, world.dhaka, { name: 'রাহিমা' });
    await f.application(h.db, { project: world.a1, loc: world.dhaka }, { beneficiary_id: kept });
    await f.application(h.db, { project: world.a2, loc: world.dhaka }, { beneficiary_id: retired });
    const head = await as(world.users.head);
    const merged = await api()
      .post('/api/v1/beneficiary-merges/direct')
      .set(bearer(head))
      .send({ keptId: kept, mergedId: retired, reason: 'একই মানুষ, দুইবার নিবন্ধন হয়েছিল' });
    expect(merged.status, JSON.stringify(merged.body)).toBe(201);
    const current = await version();
    for (const id of [kept, retired])
      expect(await keysOf(id)).toMatchObject({ name_key: 'রহিমা', match_keys_version: current });
    await h.db.query(
      'UPDATE beneficiaries SET name_key = NULL, match_keys_version = NULL WHERE id = ANY($1::uuid[])',
      [[kept, retired]],
    );
    const reverted = await api()
      .post(`/api/v1/beneficiary-merges/${merged.body.data.id}/revert`)
      .set(bearer(head))
      .send({ reason: 'ভুল করে মার্জ হয়েছিল' });
    expect(reverted.status, JSON.stringify(reverted.body)).toBe(200);
    for (const id of [kept, retired])
      expect(await keysOf(id)).toMatchObject({ name_key: 'রহিমা', match_keys_version: current });
  });
});

describe('the key job', () => {
  it('fills the keys of rows that have none, in batches, keeping their update stamps', async () => {
    await settle();
    const names = ['মোঃ করিম', 'করিম', 'আকতার হোসাইন', 'আক্তার হোসেন', 'শেখ ফরিদ'];
    const ids = [];
    for (const name of names) ids.push(await f.beneficiary(h.db, world.dhaka, { name }));
    const member = await f.insert(h.db, 'beneficiary_family_members', {
      id: randomUUID(),
      beneficiary_id: ids[0],
      name: 'মোছাঃ রাহিমা বেগম',
    });
    const stamps = (await allKeys(ids)).map((k) => k.updated_at);
    const { job, counted } = keyJob(2);
    expect(await job.hasStale()).toBe(true);
    const result = await job.run();
    expect(result).toEqual({ version: await version(), profiles: 5, members: 1 });
    // the check, then five profiles two at a time and one member: each batch its own transaction
    expect(counted.transactions).toBe(5);
    const keys = await allKeys(ids);
    expect(keys.map((k) => k.name_key)).toEqual([
      'করিম',
      'করিম',
      'আক্তারহোসেন',
      'আক্তারহোসেন',
      'শেখফরিদ',
    ]);
    expect(keys.every((k) => k.match_keys_version === result.version)).toBe(true);
    expect(keys.every((k) => k.guardian_key && k.village_key === 'নমুনাগ্রাম')).toBe(true);
    expect(keys.map((k) => k.updated_at)).toEqual(stamps);
    expect(await memberKeysOf(member)).toEqual({
      name_key: 'রহিমা',
      match_keys_version: result.version,
    });
    expect(await job.hasStale()).toBe(false);
  });

  it('writes nothing on a second run', async () => {
    await f.beneficiary(h.db, world.dhaka, { name: 'নতুন নাম' });
    await settle();
    // every write gives a row version a new xmin
    const versions = async () =>
      (
        await h.db.query(
          `SELECT id, xmin::text AS x FROM beneficiaries
           UNION ALL SELECT id, xmin::text FROM beneficiary_family_members ORDER BY id`,
        )
      ).rows;
    const before = await versions();
    expect(await settle()).toEqual({ version: await version(), profiles: 0, members: 0 });
    expect(await versions()).toEqual(before);
  });

  it('computes every key again after the list changes, and the change queues it', async () => {
    await settle();
    const id = await f.beneficiary(h.db, world.dhaka, { name: 'কারিম' });
    const fresh = await f.beneficiary(h.db, world.dhaka, { name: 'করিম' });
    await settle();
    expect((await keysOf(id)).name_key).toBe('কারিম');
    const before = await version();
    const boss = await h.container.jobs.instance();
    await boss.deleteQueuedJobs(NAME_KEYS_QUEUE);
    const raised = await addVariants([
      { variant: 'করিম', canonical: 'করিম' },
      { variant: 'কারিম', canonical: 'করিম' },
    ]);
    expect(raised).toBe(before + 1);
    expect(await version()).toBe(raised);
    const waiting = await boss.findJobs(NAME_KEYS_QUEUE, { queued: true });
    expect(waiting).toHaveLength(1);
    expect(waiting[0]!.singletonKey).toBe(NAME_KEYS_SINGLETON);
    // one run at a time: a second change while one waits queues no second job
    await h.container.prisma.$transaction((tx) =>
      raiseVariantsVersion(tx, h.container.jobs, world.users.head),
    );
    expect(await boss.findJobs(NAME_KEYS_QUEUE, { queued: true })).toHaveLength(1);
    const current = await version();
    expect(current).toBe(raised + 1);
    const { job } = keyJob(3);
    expect(await job.hasStale()).toBe(true);
    const result = await job.run();
    expect(result.version).toBe(current);
    expect(result.profiles).toBeGreaterThanOrEqual(2);
    expect(await keysOf(id)).toMatchObject({ name_key: 'করিম', match_keys_version: current });
    expect(await keysOf(fresh)).toMatchObject({ name_key: 'করিম', match_keys_version: current });
    expect(await job.run()).toEqual({ version: current, profiles: 0, members: 0 });
  });

  it('leaves a row whose name changed since its keys were computed for the next run', async () => {
    await settle();
    const id = await f.beneficiary(h.db, world.dhaka, { name: 'প্রথম নাম' });
    // the name changes between the job's read and its update (inside the job's own transaction,
    // since a write from elsewhere waits for the batch's row lock): the keys the job computed are
    // of the old name, so the compare-and-set leaves the row
    const { job } = keyJob(500);
    const prisma = h.container.prisma;
    const racing = new NameKeysJob(
      {
        $transaction: ((work: (tx: typeof prisma) => Promise<unknown>, options: unknown) =>
          prisma.$transaction(async (tx) => {
            const proxy = new Proxy(tx, {
              get(target, key, receiver) {
                if (key !== '$executeRaw') return Reflect.get(target, key, receiver);
                return async (...args: unknown[]) => {
                  const sql = args[0] as TemplateStringsArray;
                  if (sql.join('').includes('UPDATE beneficiaries AS b'))
                    await target.$executeRaw`UPDATE beneficiaries SET name = 'দ্বিতীয় নাম' WHERE id = ${id}::uuid`;
                  return (target.$executeRaw as (...a: unknown[]) => unknown)(...args);
                };
              },
            });
            return work(proxy as typeof prisma);
          }, options as never)) as unknown as typeof prisma.$transaction,
      },
      h.container.matchKeys,
      { info: () => undefined },
      500,
    );
    expect((await racing.run()).profiles).toBe(0);
    expect((await keysOf(id)).match_keys_version).toBeNull();
    await job.run();
    expect(await keysOf(id)).toMatchObject({
      name_key: 'দ্বিতীয়নাম',
      match_keys_version: await version(),
    });
  });

  it('waits for a write in progress on a row and computes the keys of the name it wrote', async () => {
    await settle();
    const id = await f.beneficiary(h.db, world.dhaka, { name: 'প্রথম নাম' });
    await h.db.query('BEGIN');
    try {
      await h.db.query(`UPDATE beneficiaries SET name = 'মোঃ তৃতীয় নাম' WHERE id = $1`, [id]);
      const running = keyJob(500).job.run();
      // the batch reaches the row and waits for its lock
      await new Promise((resolve) => setTimeout(resolve, 500));
      await h.db.query('COMMIT');
      expect((await running).profiles).toBeGreaterThanOrEqual(1);
    } catch (error) {
      await h.db.query('ROLLBACK');
      throw error;
    }
    expect(await keysOf(id)).toMatchObject({
      name_key: 'তৃতীয়নাম',
      match_keys_version: await version(),
    });
  });
});

describe('the indexes of the pair queries', () => {
  const plan = async (sql: string) => {
    await h.db.query('BEGIN');
    try {
      await h.db.query('SET LOCAL enable_seqscan = off');
      const rows = (await h.db.query(`EXPLAIN ${sql}`)).rows as { 'QUERY PLAN': string }[];
      return rows.map((r) => r['QUERY PLAN']).join('\n');
    } finally {
      await h.db.query('ROLLBACK');
    }
  };

  it('finds the same name and father’s or husband’s name in a union through its index', async () => {
    for (let i = 0; i < 40; i++)
      await f.beneficiary(h.db, i % 2 ? world.dhaka : world.rangpur, {
        name: `নাম ${i}`,
        village: `গ্রাম ${i % 7}`,
      });
    await settle();
    await h.db.query('ANALYZE beneficiaries');
    const union = world.dhaka.union;
    expect(
      await plan(
        `SELECT id FROM beneficiaries WHERE union_id = '${union}' AND name_key = 'নাম১' AND guardian_key = 'নমুনাপিতা' AND merged_into_id IS NULL`,
      ),
    ).toContain('beneficiaries_union_id_name_key_guardian_key_idx');
    expect(
      await plan(
        `SELECT id FROM beneficiaries WHERE union_id = '${union}' AND village_key = 'গ্রাম১' AND merged_into_id IS NULL`,
      ),
    ).toContain('beneficiaries_union_id_village_key_idx');
  });

  it('finds the rows whose keys are missing or older than the list through their index', async () => {
    await settle();
    await h.db.query('ANALYZE beneficiaries');
    await h.db.query('ANALYZE beneficiary_family_members');
    const current = await version();
    for (const table of ['beneficiaries', 'beneficiary_family_members']) {
      const index = `${table}_match_keys_version_idx`;
      // the two probes of the check at the worker's start, each a condition of the index
      const missing = await plan(`SELECT 1 FROM ${table} WHERE match_keys_version IS NULL`);
      expect(missing).toContain(index);
      expect(missing).toContain('Index Cond: (match_keys_version IS NULL)');
      const older = await plan(`SELECT 1 FROM ${table} WHERE match_keys_version < ${current}`);
      expect(older).toContain(index);
      expect(older).toContain(`Index Cond: (match_keys_version < ${current})`);
    }
    // the job's read of a batch when no row is stale, on the table with rows enough to choose by
    expect(
      await plan(
        `SELECT id FROM beneficiaries WHERE id > '00000000-0000-0000-0000-000000000000'
         AND (match_keys_version IS NULL OR match_keys_version < ${current})
         ORDER BY id LIMIT 2000 FOR UPDATE`,
      ),
    ).toContain('beneficiaries_match_keys_version_idx');
  });

  it('finds a family member by the key of the name through its index', async () => {
    expect(
      await plan(`SELECT id FROM beneficiary_family_members WHERE name_key = 'রহিমা'`),
    ).toContain('beneficiary_family_members_name_key_idx');
  });
});
