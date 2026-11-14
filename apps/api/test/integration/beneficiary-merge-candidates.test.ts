import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  beneficiaryScopeSql,
  beneficiaryWhere,
  makeScope,
  type Scope,
} from '../../src/access/scope.js';
import { Prisma } from '../../src/generated/prisma/client.js';
import { accessWorld } from './support/access-fixtures.js';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  type Session,
} from './support/auth-app.js';
import * as f from './support/fixtures.js';
import { encodeCursor } from '../../src/core/pagination.js';
import { testEnv } from '../support/env.js';
import {
  MOBILE_GROUP_LIMIT,
  refreshPairsOf,
} from '../../src/services/beneficiary-merge-candidates.js';
import { addVariantGroup, storeKeys } from './support/name-keys.js';

// The suggested duplicate profiles: pairs by name, father's or husband's name and mobile; by name,
// date of birth and union; by name, father's or husband's name and village in one union; or by
// one mobile; each with its level; in the caller's scope, and a pair marked as two different
// people leaves the suggestions until the mark is lifted. Names and villages compare through the
// stored keys, which the fixtures' direct inserts lack: the helpers store them as a write would.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
type Tree = Awaited<ReturnType<typeof f.locationTree>>;

beforeAll(async () => {
  h = await authHarness();
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
});
afterAll(async () => h.close());

let counter = 0;
/** Two profiles of one made-up person: unique names, so pairs of other tests never mix in. */
async function pair(
  tree: Tree,
  rule: 'name_father_mobile' | 'name_dob_union' | 'same_mobile',
  other: Tree = tree,
) {
  const n = ++counter;
  const name = `যাচাই ব্যক্তি ${n}`;
  const father = `যাচাই পিতা ${n}`;
  const mobile = `0155${String(1_000_000 + n).slice(-7)}`;
  const dob = '1980-01-01';
  const a = await f.beneficiary(h.db, tree, {
    name,
    father_or_husband_name: father,
    mobile,
    dob: rule === 'name_dob_union' ? dob : null,
  });
  const b = await f.beneficiary(h.db, other, {
    name: rule === 'same_mobile' ? `অন্য নাম ${n}` : ` ${name.replace(' ', '  ')}`,
    father_or_husband_name: rule === 'name_dob_union' ? `অন্য পিতা ${n}` : father,
    mobile: rule === 'name_dob_union' ? `0166${String(1_000_000 + n).slice(-7)}` : mobile,
    dob: rule === 'name_dob_union' ? dob : null,
  });
  // the fixtures insert rows directly, so the pairs are recomputed as a service write would
  await refresh(a, b);
  return [a, b].sort() as [string, string];
}
const refresh = async (...ids: string[]) => {
  await storeKeys(h.container, ids);
  await h.container.prisma.$transaction((tx) =>
    h.container.beneficiaryMergeCandidates.refreshFor(tx, ids),
  );
};
/** The nightly run, after the keys of the given fixture rows are stored. */
const refreshAll = async (...ids: string[]) => {
  await storeKeys(h.container, ids);
  return h.container.beneficiaryMergeCandidates.refreshAll();
};
const stored = async ([low, high]: [string, string]) =>
  (
    await h.db.query(
      'SELECT rules, active FROM beneficiary_merge_candidates WHERE low_id = $1 AND high_id = $2',
      [low, high],
    )
  ).rows[0] as { rules: string[]; active: boolean } | undefined;
const candidates = (s: Session, query: Record<string, string> = {}) =>
  api()
    .get('/api/v1/beneficiaries/merge-candidates')
    .query({ limit: '100', ...query })
    .set(bearer(s));
const pairsOf = (res: request.Response) =>
  (
    res.body.data as { beneficiaryId: string; otherBeneficiaryId: string; matchedOn: string[] }[]
  ).map((r) => [r.beneficiaryId, r.otherBeneficiaryId, r.matchedOn]);
const levelOf = (res: request.Response, [low, high]: [string, string]) =>
  (res.body.data as { beneficiaryId: string; otherBeneficiaryId: string; level: string }[]).find(
    (r) => r.beneficiaryId === low && r.otherBeneficiaryId === high,
  )?.level;
const has = (res: request.Response, [low, high]: [string, string]) =>
  pairsOf(res).find(([a, b]) => a === low && b === high);
const dismiss = (s: Session, [a, b]: [string, string], reason = 'আলাদা মানুষ, ভিন্ন গ্রাম') =>
  api()
    .post('/api/v1/beneficiaries/merge-dismissals')
    .set(bearer(s))
    .send({ beneficiaryId: b, otherBeneficiaryId: a, reason });

describe('the scope condition of the raw duplicate queries', () => {
  it('selects exactly the profiles the beneficiary scope filter selects', async () => {
    for (const p of [
      await pair(world.dhaka, 'same_mobile'),
      await pair(world.rangpur, 'same_mobile'),
    ])
      await f.application(h.db, { project: world.a1, loc: world.dhaka }, { beneficiary_id: p[0] });
    for (const user of [world.users.rpmDhaka, world.users.pm, world.users.head]) {
      const scope = await h.container.access.scopeOfUser(
        user,
        'beneficiary.merge.dismiss',
        'beneficiary',
      );
      const viaPrisma = (
        await h.container.prisma.beneficiary.findMany({
          where: beneficiaryWhere(scope),
          select: { id: true },
        })
      )
        .map((r) => r.id)
        .sort();
      const viaSql = (
        await h.container.prisma.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT b.id FROM beneficiaries b WHERE ${beneficiaryScopeSql(scope, 'b')}`,
        )
      )
        .map((r) => r.id)
        .sort();
      expect(viaSql, user).toEqual(viaPrisma);
    }
  });
});

describe('the suggested duplicate pairs', () => {
  it('finds each rule, and names every rule a pair meets', async () => {
    // the same name, father and mobile, in one village: the village rule holds too
    const byName = await pair(world.dhaka, 'name_father_mobile');
    const byDob = await pair(world.dhaka, 'name_dob_union');
    const byMobile = await pair(world.dhaka, 'same_mobile');
    const res = await candidates(await as(world.users.rpmDhaka));
    expect(res.status).toBe(200);
    expect(has(res, byName)?.[2]).toEqual([
      'name_father_mobile',
      'name_father_village',
      'same_mobile',
    ]);
    expect(has(res, byDob)?.[2]).toEqual(['name_dob_union']);
    expect(has(res, byMobile)?.[2]).toEqual(['same_mobile']);
  });

  it('says each pair’s level: probable for a rule that compares a name, check for a shared mobile alone', async () => {
    const byName = await pair(world.dhaka, 'name_father_mobile');
    const byDob = await pair(world.dhaka, 'name_dob_union');
    const byMobile = await pair(world.dhaka, 'same_mobile');
    const res = await candidates(await as(world.users.rpmDhaka));
    expect(levelOf(res, byName)).toBe('probable');
    expect(levelOf(res, byDob)).toBe('probable');
    expect(levelOf(res, byMobile)).toBe('check');
    // the database holds the level to the rules: a stored level that disagrees is refused
    await expect(
      h.db.query(
        `UPDATE beneficiary_merge_candidates SET level = 'probable' WHERE low_id = $1 AND high_id = $2`,
        byMobile,
      ),
    ).rejects.toThrow(/beneficiary_merge_candidates_level_check/);
  });

  it('lists the probable pairs first, and filters by level and by one profile', async () => {
    const probable = await pair(world.dhaka, 'name_dob_union');
    const check = await pair(world.dhaka, 'same_mobile');
    const rpm = await as(world.users.rpmDhaka);
    const all = (await candidates(rpm)).body.data as { level: string }[];
    const firstCheck = all.findIndex((r) => r.level === 'check');
    expect(firstCheck).toBeGreaterThan(0);
    expect(all.slice(firstCheck).every((r) => r.level === 'check')).toBe(true);
    const onlyCheck = await candidates(rpm, { level: 'check' });
    expect(onlyCheck.status).toBe(200);
    expect((onlyCheck.body.data as { level: string }[]).every((r) => r.level === 'check')).toBe(
      true,
    );
    expect(has(onlyCheck, check)).toBeTruthy();
    expect(has(onlyCheck, probable)).toBeUndefined();
    const ofOne = await candidates(rpm, { beneficiaryId: probable[1] });
    expect(pairsOf(ofOne)).toEqual([[probable[0], probable[1], ['name_dob_union']]]);
    expect((await candidates(rpm, { level: 'strong' })).status).toBe(422);
    expect((await candidates(rpm, { beneficiaryId: 'not-a-uuid' })).status).toBe(422);
  });

  it('pages through both levels by a cursor that serves only its own filters', async () => {
    for (let i = 0; i < 2; i++) {
      await pair(world.dhaka, 'name_dob_union');
      await pair(world.dhaka, 'same_mobile');
    }
    const rpm = await as(world.users.rpmDhaka);
    const whole = pairsOf(await candidates(rpm));
    const seen: unknown[] = [];
    let cursor: string | undefined;
    do {
      const res = await candidates(rpm, { limit: '3', ...(cursor ? { cursor } : {}) });
      expect(res.status).toBe(200);
      seen.push(...pairsOf(res));
      cursor = res.body.meta.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toEqual(whole);
    const first = await candidates(rpm, { limit: '1' });
    const elsewhere = await candidates(rpm, {
      limit: '1',
      level: 'check',
      cursor: first.body.meta.nextCursor,
    });
    expect(elsewhere.status).toBe(422);
  });

  it('shows names and BEN numbers, never an identity number or a mobile', async () => {
    const p = await pair(world.dhaka, 'name_father_mobile');
    const res = await candidates(await as(world.users.rpmDhaka));
    const row = (res.body.data as Record<string, unknown>[]).find((r) => r.beneficiaryId === p[0])!;
    expect(Object.keys(row).sort()).toEqual(
      [
        'beneficiaryId',
        'benNo',
        'matchedOn',
        'level',
        'name',
        'otherBenNo',
        'otherBeneficiaryId',
        'otherName',
      ].sort(),
    );
    expect(row.benNo).toMatch(/^BEN-\d{7}$/);
  });

  it('leaves out retired profiles', async () => {
    const p = await pair(world.dhaka, 'same_mobile');
    const kept = await f.beneficiary(h.db, world.dhaka);
    await h.db.query('UPDATE beneficiaries SET merged_into_id = $2 WHERE id = $1', [p[1], kept]);
    expect(has(await candidates(await as(world.users.rpmDhaka)), p)).toBeUndefined();
  });

  it("shows an RPM the pairs of the region only, and a PM those of the program's applicants", async () => {
    const dhaka = await pair(world.dhaka, 'same_mobile');
    const rangpur = await pair(world.rangpur, 'same_mobile');
    const rpm = await candidates(await as(world.users.rpmDhaka));
    expect(has(rpm, dhaka)).toBeTruthy();
    expect(has(rpm, rangpur)).toBeUndefined();
    const applied = await pair(world.rangpur, 'same_mobile');
    for (const id of applied)
      await f.application(h.db, { project: world.a1, loc: world.rangpur }, { beneficiary_id: id });
    const pm = await candidates(await as(world.users.pm));
    expect(has(pm, applied)).toBeTruthy();
    expect(has(pm, rangpur)).toBeUndefined();
  });

  it('pages by a cursor', async () => {
    for (let i = 0; i < 3; i++) await pair(world.dhaka, 'same_mobile');
    const rpm = await as(world.users.rpmDhaka);
    const first = await candidates(rpm, { limit: '2' });
    expect(first.body.data).toHaveLength(2);
    const next = await candidates(rpm, { limit: '2', cursor: first.body.meta.nextCursor });
    expect(next.status).toBe(200);
    // the second page continues after the first one, never repeating a pair of it
    for (const p of pairsOf(next)) expect(pairsOf(first)).not.toContainEqual(p);
    const [low, high] = pairsOf(first)[1]!;
    expect(
      String(pairsOf(next)[0]![0]) + String(pairsOf(next)[0]![1]) > String(low) + String(high),
    ).toBe(true);
  });

  it('refuses a cursor made for another direction or another list', async () => {
    const rpm = await as(world.users.rpmDhaka);
    const binding = `beneficiaries.mergeCandidates|${world.users.rpmDhaka}||`;
    const secret = testEnv().CURSOR_SECRET;
    const backward = encodeCursor(secret, binding, { v: ['probable', 'x', 'y'], d: 'prev' });
    const malformed = encodeCursor(secret, binding, {
      v: ['probable', 'not-a-uuid', 'x'],
      d: 'next',
    });
    expect((await candidates(rpm, { cursor: backward })).status).toBe(422);
    expect((await candidates(rpm, { cursor: malformed })).status).toBe(422);
  });

  it('refuses an executive, a volunteer and no login', async () => {
    expect((await candidates(await as(world.users.executive))).status).toBe(403);
    expect((await candidates(await as(world.users.general))).status).toBe(403);
    expect((await api().get('/api/v1/beneficiaries/merge-candidates')).status).toBe(401);
  });
});

describe('keeping the pairs up to date', () => {
  it('writes no pair, and fails no write, for one name on a mobile more profiles share than the limit', async () => {
    const mobile = '01577000099';
    const crowd = [];
    for (let i = 0; i <= MOBILE_GROUP_LIMIT; i += 1)
      crowd.push(await f.beneficiary(h.db, world.dhaka, { mobile, name: `ভিড় ${i}` }));
    const a = await f.beneficiary(h.db, world.dhaka, {
      mobile,
      name: 'একই নাম',
      father_or_husband_name: 'পিতা ক',
    });
    const b = await f.beneficiary(h.db, world.dhaka, {
      mobile,
      name: 'একই নাম',
      father_or_husband_name: 'পিতা খ',
    });
    await refresh(a, b, ...crowd);
    expect(await stored([a, b].sort() as [string, string])).toBeUndefined();
  });

  it('finds a pair when one profile gets the mobile of another, and drops it when it changes back', async () => {
    // two villages, so only the mobile can make them a pair
    const father = { father_or_husband_name: 'নমুনা পিতা' };
    const a = await f.beneficiary(h.db, world.dhaka, {
      ...father,
      mobile: '01577000001',
      village: 'প্রথম গ্রাম',
    });
    const b = await f.beneficiary(h.db, world.dhaka, {
      ...father,
      mobile: '01577000002',
      village: 'দ্বিতীয় গ্রাম',
    });
    await refresh(a, b);
    const key = [a, b].sort() as [string, string];
    expect(await stored(key)).toBeUndefined();
    const head = await as(world.users.head);
    const edit = async (mobile: string) => {
      const tag = (await api().get(`/api/v1/beneficiaries/${b}`).set(bearer(head))).headers
        .etag as string;
      await api()
        .patch(`/api/v1/beneficiaries/${b}/contact`)
        .set(bearer(head))
        .set('If-Match', tag)
        .send({ mobile })
        .expect(200);
    };
    await edit('01577000001');
    expect(await stored(key)).toEqual({
      rules: ['name_father_mobile', 'same_mobile'],
      active: true,
    });
    await edit('01577000003');
    expect(await stored(key)).toEqual({
      rules: ['name_father_mobile', 'same_mobile'],
      active: false,
    });
  });

  it('finds a new profile that repeats an older one at once', async () => {
    const older = await f.beneficiary(h.db, world.dhaka, { mobile: '01577000010' });
    const created = await h.container.prisma.$transaction((tx) =>
      h.container.beneficiaryIdentity.createProfile(tx, { userId: world.users.rpmDhaka } as never, {
        nid: f.fakeNid(),
        name: 'নতুন করে আসা',
        fatherOrHusbandName: 'নতুন পিতা',
        mobile: '01577000010',
        genderCode: 'female',
        divisionId: world.dhaka.division,
        districtId: world.dhaka.district,
        upazilaId: world.dhaka.upazila,
        unionId: world.dhaka.union,
        village: 'নতুন গ্রাম',
      }),
    );
    expect(await stored([older, created.id].sort() as [string, string])).toMatchObject({
      active: true,
    });
  });

  it('suggests no pairs by a mobile that many profiles share, but still those with the same name', async () => {
    const shared = '01577000099';
    const ids: string[] = [];
    for (let i = 0; i < 25; i++)
      ids.push(
        await f.beneficiary(h.db, world.dhaka, {
          mobile: shared,
          name: i < 2 ? 'একই নামের মানুষ' : `ভিন্ন নাম ${i}`,
          father_or_husband_name: 'একই পিতা',
        }),
      );
    await refreshAll(...ids);
    await refresh(ids[0]!);
    const { rows } = await h.db.query(
      `SELECT low_id, high_id, rules FROM beneficiary_merge_candidates
       WHERE active AND (low_id = ANY($1::uuid[]) OR high_id = ANY($1::uuid[]))`,
      [ids],
    );
    expect(rows).toEqual([
      {
        low_id: [ids[0], ids[1]].sort()[0],
        high_id: [ids[0], ids[1]].sort()[1],
        // one name and father in one village: the village rule holds without the mobile
        rules: ['name_father_mobile', 'name_father_village'],
      },
    ]);
  });

  it('pairs nobody by a missing mobile, at a write and in the nightly run, whatever the names', async () => {
    const n = ++counter;
    const name = `নম্বর ছাড়া ${n}`;
    const father = `নম্বর ছাড়া পিতা ${n}`;
    // the same name and father with no mobile, in two villages (the village rule would pair them
    // in one); a third with another name; none has a document
    const light = { mobile: null, nid: null };
    const a = await f.beneficiary(h.db, world.dhaka, {
      ...light,
      name,
      father_or_husband_name: father,
      village: 'উত্তর গ্রাম',
    });
    const b = await f.beneficiary(h.db, world.dhaka, {
      ...light,
      name,
      father_or_husband_name: father,
      village: 'দক্ষিণ গ্রাম',
    });
    const c = await f.beneficiary(h.db, world.dhaka, { ...light, name: `আরেক জন ${n}` });
    const pairsAmong = async () =>
      (
        await h.db.query(
          `SELECT rules FROM beneficiary_merge_candidates
            WHERE active AND low_id = ANY($1::uuid[]) AND high_id = ANY($1::uuid[])`,
          [[a, b, c]],
        )
      ).rows;
    await refresh(a, b, c);
    expect(await pairsAmong()).toEqual([]);
    await refreshAll(a, b, c);
    expect(await pairsAmong()).toEqual([]);
    // the number is what pairs them: once both hold one mobile, the pair is found
    const mobile = `0177${String(1_000_000 + n).slice(-7)}`;
    await h.db.query('UPDATE beneficiaries SET mobile = $2 WHERE id = ANY($1::uuid[])', [
      [a, b],
      mobile,
    ]);
    await refresh(a, b);
    expect(await pairsAmong()).toEqual([{ rules: ['name_father_mobile', 'same_mobile'] }]);
  });

  it('recomputes every pair nightly, finding new ones and marking gone ones inactive', async () => {
    const father = { father_or_husband_name: 'নমুনা পিতা' };
    const a = await f.beneficiary(h.db, world.dhaka, {
      ...father,
      mobile: '01577000020',
      village: 'পূর্ব গ্রাম',
    });
    const b = await f.beneficiary(h.db, world.dhaka, {
      ...father,
      mobile: '01577000020',
      village: 'পশ্চিম গ্রাম',
    });
    const key = [a, b].sort() as [string, string];
    expect(await stored(key)).toBeUndefined();
    await refreshAll(a, b);
    expect(await stored(key)).toEqual({
      rules: ['name_father_mobile', 'same_mobile'],
      active: true,
    });
    await h.db.query(`UPDATE beneficiaries SET mobile = '01577000021' WHERE id = $1`, [b]);
    await h.container.beneficiaryMergeCandidates.refreshAll();
    expect((await stored(key))?.active).toBe(false);
  });
});

describe('marking a pair as two different people', () => {
  it('takes the pair out of the suggestions until the mark is lifted, each step audited', async () => {
    const p = await pair(world.dhaka, 'same_mobile');
    const rpm = await as(world.users.rpmDhaka);
    const marked = await dismiss(rpm, p);
    expect(marked.status).toBe(201);
    expect(marked.body.data).toMatchObject({ beneficiaryId: p[0], otherBeneficiaryId: p[1] });
    expect(has(await candidates(rpm), p)).toBeUndefined();
    const listed = await api()
      .get('/api/v1/beneficiary-merge-dismissals')
      .set(bearer(rpm))
      .expect(200);
    expect((listed.body.data as { id: string }[]).map((d) => d.id)).toContain(marked.body.data.id);
    const lifted = await api()
      .post(`/api/v1/beneficiary-merge-dismissals/${marked.body.data.id}/lift`)
      .set(bearer(await as(world.users.pm)))
      .send({ reason: 'আবার যাচাই করা দরকার' });
    expect(lifted.status).toBe(404);
    const liftedByRpm = await api()
      .post(`/api/v1/beneficiary-merge-dismissals/${marked.body.data.id}/lift`)
      .set(bearer(rpm))
      .send({ reason: 'আবার যাচাই করা দরকার' });
    expect(liftedByRpm.status).toBe(200);
    expect(has(await candidates(rpm), p)).toBeTruthy();
    const audits = await h.db.query(
      `SELECT action FROM audit_log WHERE entity_type = 'beneficiary' AND entity_id = $1 AND action LIKE 'beneficiary.merge_dismiss%' ORDER BY created_at`,
      [p[0]],
    );
    expect(audits.rows.map((r) => r.action)).toEqual([
      'beneficiary.merge_dismissed',
      'beneficiary.merge_dismissal_lifted',
    ]);
  });

  it('needs a reason, refuses a second mark, and a pair with a profile outside the scope', async () => {
    const p = await pair(world.dhaka, 'same_mobile');
    const rpm = await as(world.users.rpmDhaka);
    expect((await dismiss(rpm, p, '')).status).toBe(422);
    await dismiss(rpm, p).expect(201);
    const again = await dismiss(rpm, p);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('beneficiary.dismissed');
    const mixed = await pair(world.dhaka, 'same_mobile', world.rangpur);
    expect((await dismiss(rpm, mixed)).status).toBe(404);
    expect((await dismiss(await as(world.users.executive), p)).status).toBe(403);
  });

  it('refuses the marks list and the lift to an executive, a volunteer and no login', async () => {
    const p = await pair(world.dhaka, 'same_mobile');
    const marked = await dismiss(await as(world.users.rpmDhaka), p).expect(201);
    const lift = (s?: Session) => {
      const call = api()
        .post(`/api/v1/beneficiary-merge-dismissals/${marked.body.data.id}/lift`)
        .send({ reason: 'আবার যাচাই করা দরকার' });
      return s ? call.set(bearer(s)) : call;
    };
    for (const user of [world.users.executive, world.users.general]) {
      const s = await as(user);
      expect((await api().get('/api/v1/beneficiary-merge-dismissals').set(bearer(s))).status).toBe(
        403,
      );
      expect((await lift(s)).status).toBe(403);
    }
    expect((await api().get('/api/v1/beneficiary-merge-dismissals')).status).toBe(401);
    expect((await lift()).status).toBe(401);
  });
});

describe('the pair by name, father’s or husband’s name and village', () => {
  /** A made-up person of its own, so the pairs of other tests never mix in. */
  const person = () => {
    const n = ++counter;
    return { name: `গ্রামের মানুষ ${n}`, father_or_husband_name: `গ্রামের পিতা ${n}` };
  };
  /** Two profiles (each with its own mobile and document), their keys and pairs computed. */
  async function two(
    a: Record<string, unknown>,
    b: Record<string, unknown>,
    treeB: Tree = world.dhaka,
  ) {
    const x = await f.beneficiary(h.db, world.dhaka, a);
    const y = await f.beneficiary(h.db, treeB, b);
    await refresh(x, y);
    return [x, y].sort() as [string, string];
  }
  beforeAll(async () => {
    await f.referenceCode(h.db, 'guardian_relation', 'father');
    await f.referenceCode(h.db, 'guardian_relation', 'husband');
  });

  it('pairs two profiles whose name, father’s or husband’s name and village give one key in one union, as probable', async () => {
    const p = person();
    const pairKey = await two(
      { ...p, village: 'চর পাড়া' },
      { ...p, name: ` ${p.name} `, village: 'চর-পাড়া' },
    );
    expect(await stored(pairKey)).toEqual({ rules: ['name_father_village'], active: true });
    const res = await candidates(await as(world.users.rpmDhaka));
    expect(has(res, pairKey)?.[2]).toEqual(['name_father_village']);
    expect(levelOf(res, pairKey)).toBe('probable');
  });

  it('pairs nobody in another village, in another union, or with another father', async () => {
    const p = person();
    expect(await stored(await two({ ...p, village: 'এক' }, { ...p, village: 'দুই' }))).toBe(
      undefined,
    );
    expect(
      await stored(await two({ ...p, village: 'এক' }, { ...p, village: 'এক' }, world.rangpur)),
    ).toBeUndefined();
    const q = person();
    expect(
      await stored(
        await two(
          { ...q, village: 'তিন' },
          { ...q, father_or_husband_name: `অন্য ${q.father_or_husband_name}`, village: 'তিন' },
        ),
      ),
    ).toBeUndefined();
  });

  it('never pairs a father’s name with a husband’s, and pairs where one side does not say', async () => {
    const at = (relation: string | null) => ({
      ...person(),
      village: 'সম্পর্ক গ্রাম',
      guardian_relation_code: relation,
    });
    const fatherAndHusband = at('father');
    expect(
      await stored(
        await two(fatherAndHusband, { ...fatherAndHusband, guardian_relation_code: 'husband' }),
      ),
    ).toBeUndefined();
    const unknown = at(null);
    expect(
      await stored(await two(unknown, { ...unknown, guardian_relation_code: 'husband' })),
    ).toEqual({ rules: ['name_father_village'], active: true });
    const husbands = at('husband');
    expect(await stored(await two(husbands, { ...husbands }))).toEqual({
      rules: ['name_father_village'],
      active: true,
    });
    // a shared mobile with the same names but another relation is a mobile pair only
    const mobile = `0188${String(1_000_000 + counter).slice(-7)}`;
    const both = at('father');
    expect(
      await stored(
        await two(
          { ...both, mobile },
          { ...both, mobile, guardian_relation_code: 'husband', village: 'অন্য গ্রাম' },
        ),
      ),
    ).toEqual({ rules: ['same_mobile'], active: true });
  });

  it('pairs a name written with a title and without, and the spellings of one variant group', async () => {
    const n = ++counter;
    const titled = await two(
      { name: `মোঃ করিম ${n}`, father_or_husband_name: `মোঃ রহিম ${n}`, village: 'নাম গ্রাম' },
      { name: `করিম ${n}`, father_or_husband_name: `রহিম ${n}`, village: 'নাম গ্রাম' },
    );
    expect(await stored(titled)).toEqual({ rules: ['name_father_village'], active: true });
    // a family name is no title: শেখ stays
    const family = await two(
      { name: `শেখ ফরিদ ${n}`, father_or_husband_name: `পিতা ${n}`, village: 'নাম গ্রাম' },
      { name: `ফরিদ ${n}`, father_or_husband_name: `পিতা ${n}`, village: 'নাম গ্রাম' },
    );
    expect(await stored(family)).toBeUndefined();
    // two spellings pair only once the list makes them one
    const a = await f.beneficiary(h.db, world.dhaka, {
      name: `তমিজ উদ্দিন ${n}`,
      father_or_husband_name: `পিতা ${n}`,
      village: 'বানান গ্রাম',
    });
    const b = await f.beneficiary(h.db, world.dhaka, {
      name: `তামিজ উদ্দিন ${n}`,
      father_or_husband_name: `পিতা ${n}`,
      village: 'বানান গ্রাম',
    });
    const spelled = [a, b].sort() as [string, string];
    await refresh(a, b);
    expect(await stored(spelled)).toBeUndefined();
    await addVariantGroup(h.db, h.container, ['তমিজ', 'তামিজ'], world.users.head);
    await refresh(a, b);
    expect(await stored(spelled)).toEqual({ rules: ['name_father_village'], active: true });
  });

  it('never raises a pair again that an official marked as two people, at a write or at night', async () => {
    const p = person();
    const marked = await two({ ...p, village: 'চিহ্ন গ্রাম' }, { ...p, village: 'চিহ্ন গ্রাম' });
    const rpm = await as(world.users.rpmDhaka);
    expect(has(await candidates(rpm), marked)).toBeTruthy();
    await dismiss(rpm, marked).expect(201);
    await refresh(...marked);
    await refreshAll(...marked);
    expect(has(await candidates(rpm), marked)).toBeUndefined();
    expect(has(await candidates(rpm, { beneficiaryId: marked[0] }), marked)).toBeUndefined();
  });

  it('shows the pair only to an official whose scope reaches both profiles', async () => {
    const p = person();
    const rangpur = await f.beneficiary(h.db, world.rangpur, { ...p, village: 'দূর গ্রাম' });
    const again = await f.beneficiary(h.db, world.rangpur, { ...p, village: 'দূর গ্রাম' });
    await refresh(rangpur, again);
    const key = [rangpur, again].sort() as [string, string];
    expect(has(await candidates(await as(world.users.rpmRangpur)), key)).toBeTruthy();
    expect(has(await candidates(await as(world.users.rpmDhaka)), key)).toBeUndefined();
    expect(
      has(await candidates(await as(world.users.rpmDhaka), { beneficiaryId: rangpur }), key),
    ).toBeUndefined();
  });

  it('gives the same pairs, rules and levels at a write and in the nightly run', async () => {
    const tree = await f.locationTree(h.db);
    const n = ++counter;
    const mobile = `0199${String(1_000_000 + n).slice(-7)}`;
    const rows: Record<string, unknown>[] = [
      // the village rule, with a title on one side
      { name: `মোঃ সালাম ${n}`, father_or_husband_name: `পিতা ${n}`, village: 'ক' },
      { name: `সালাম ${n}`, father_or_husband_name: `পিতা ${n}`, village: 'ক' },
      // the birth date in the union, another father
      {
        name: `জব্বার ${n}`,
        father_or_husband_name: `পিতা ক ${n}`,
        dob: '1970-05-05',
        village: 'খ',
      },
      {
        name: `জব্বার ${n}`,
        father_or_husband_name: `পিতা খ ${n}`,
        dob: '1970-05-05',
        village: 'গ',
      },
      // one mobile, other names; and the name, father and mobile with another village
      { name: `ভিন্ন এক ${n}`, mobile, village: 'ঘ' },
      { name: `ভিন্ন দুই ${n}`, mobile, village: 'ঙ' },
      { name: `ভিন্ন দুই ${n}`, father_or_husband_name: `পিতা ${n}`, mobile, village: 'চ' },
      // a father against a husband
      {
        name: `সম্পর্ক ${n}`,
        father_or_husband_name: `পিতা ${n}`,
        village: 'ক',
        guardian_relation_code: 'father',
      },
      {
        name: `সম্পর্ক ${n}`,
        father_or_husband_name: `পিতা ${n}`,
        village: 'ক',
        guardian_relation_code: 'husband',
      },
    ];
    const ids: string[] = [];
    for (const row of rows) ids.push(await f.beneficiary(h.db, tree, row));
    const among = async () =>
      (
        await h.db.query(
          `SELECT low_id, high_id, rules, level FROM beneficiary_merge_candidates
            WHERE active AND low_id = ANY($1::uuid[]) AND high_id = ANY($1::uuid[])
            ORDER BY low_id, high_id`,
          [ids],
        )
      ).rows;
    await refreshAll(...ids);
    const nightly = await among();
    // the rows are derived: taken away, the writes find them again one profile at a time
    await h.db.query(
      'DELETE FROM beneficiary_merge_candidates WHERE low_id = ANY($1::uuid[]) OR high_id = ANY($1::uuid[])',
      [ids],
    );
    await refresh(...ids);
    expect(await among()).toEqual(nightly);
    expect(nightly.map((r) => [r.rules, r.level]).sort()).toEqual(
      [
        [['name_dob_union'], 'probable'],
        [['name_father_village'], 'probable'],
        [['same_mobile'], 'check'],
        [['same_mobile'], 'check'],
        [['same_mobile'], 'check'],
      ].sort(),
    );
  });

  it('finds the profiles of one union with the name key through its index at a write', async () => {
    for (let i = 0; i < 40; i++)
      await f.beneficiary(h.db, i % 2 ? world.dhaka : world.rangpur, {
        name: `সূচি ${i}`,
        village: `সূচি গ্রাম ${i % 5}`,
      });
    const id = await f.beneficiary(h.db, world.dhaka, { name: 'সূচি 1' });
    await storeKeys(h.container, [id]);
    await h.container.beneficiaryMergeCandidates.refreshAll();
    await h.db.query('ANALYZE beneficiaries');
    const statement = refreshPairsOf(id);
    await h.db.query('BEGIN');
    try {
      await h.db.query('SET LOCAL enable_seqscan = off');
      const plan = (
        (await h.db.query(`EXPLAIN ${statement.text}`, statement.values)).rows as {
          'QUERY PLAN': string;
        }[]
      )
        .map((r) => r['QUERY PLAN'])
        .join('\n');
      expect(plan).toContain('beneficiaries_union_id_name_key_guardian_key_idx');
    } finally {
      await h.db.query('ROLLBACK');
    }
  });
});

describe('the open probable pairs of one person, at review', () => {
  /** A scope that reaches the profiles with an application in one project, and no other. */
  const projectScope = (projectId: string) =>
    makeScope(world.users.rpmDhaka, 'beneficiary.merge.dismiss', 'beneficiary', {
      global: false,
      self: false,
      programIds: [],
      projectIds: [projectId],
      areas: [],
      volunteerAreas: [],
      revokedProjectIds: [],
      revokedProgramIds: [],
    });
  const openPairs = (id: string, scopes: Scope[] | null) =>
    h.container.prisma.$transaction((tx) =>
      h.container.beneficiaryMergeCandidates.probablePairsOf(tx, id, scopes),
    );

  it('lists the pairs every given scope reaches first, so more than ten others never crowd them out, and counts them all', async () => {
    const n = ++counter;
    const person = {
      name: `পর্যালোচনা ${n}`,
      father_or_husband_name: `পর্যালোচনার পিতা ${n}`,
      village: `পর্যালোচনা গ্রাম ${n}`,
    };
    // twelve other profiles of the person, made first (the lower BEN numbers); only the last of
    // them applied in the project the scope reaches
    const others: string[] = [];
    for (let i = 0; i < 12; i++) others.push(await f.beneficiary(h.db, world.dhaka, person));
    const me = await f.beneficiary(h.db, world.dhaka, person);
    await f.application(
      h.db,
      { project: world.a1, loc: world.dhaka },
      { beneficiary_id: others[11] },
    );
    await refresh(me, ...others);
    const scoped = await openPairs(me, [projectScope(world.a1.id)]);
    expect(scoped.total).toBe(12);
    expect(scoped.rows).toHaveLength(10);
    expect(scoped.rows[0]).toMatchObject({
      beneficiaryId: others[11],
      named: true,
      matchedOn: ['name_father_village'],
    });
    expect(scoped.rows.slice(1).map((p) => [p.beneficiaryId, p.named])).toEqual(
      others.slice(0, 9).map((id) => [id, false]),
    );
    // every scope must reach: a second scope that reaches nobody names nobody
    const nobody = makeScope(world.users.rpmDhaka, 'beneficiary.view_all', 'beneficiary', {
      ...projectScope(world.a1.id).instances,
      projectIds: [],
    });
    const both = await openPairs(me, [projectScope(world.a1.id), nobody]);
    expect(both.rows.some((p) => p.named)).toBe(false);
    // without a scope nobody is named, and the first ten by BEN number are listed
    const blind = await openPairs(me, null);
    expect(blind.total).toBe(12);
    expect(blind.rows.map((p) => p.beneficiaryId)).toEqual(others.slice(0, 10));
  });
});
