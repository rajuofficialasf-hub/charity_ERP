import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { beneficiaryScopeSql, beneficiaryWhere } from '../../src/access/scope';
import { Prisma } from '../../src/generated/prisma/client';
import { accessWorld } from './support/access-fixtures';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  type Session,
} from './support/auth-app';
import * as f from './support/fixtures';
import { encodeCursor } from '../../src/core/pagination';
import { testEnv } from '../support/env';

// The suggested duplicate profiles: pairs by name, father's or husband's name and mobile; by name,
// date of birth and union; or by one mobile; in the caller's scope, and a pair marked as two
// different people leaves the suggestions until the mark is lifted.
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
const refresh = (...ids: string[]) =>
  h.container.prisma.$transaction((tx) =>
    h.container.beneficiaryMergeCandidates.refreshFor(tx, ids),
  );
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
    const byName = await pair(world.dhaka, 'name_father_mobile');
    const byDob = await pair(world.dhaka, 'name_dob_union');
    const byMobile = await pair(world.dhaka, 'same_mobile');
    const res = await candidates(await as(world.users.rpmDhaka));
    expect(res.status).toBe(200);
    expect(has(res, byName)?.[2]).toEqual(['name_father_mobile', 'same_mobile']);
    expect(has(res, byDob)?.[2]).toEqual(['name_dob_union']);
    expect(has(res, byMobile)?.[2]).toEqual(['same_mobile']);
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
    const binding = `beneficiaries.mergeCandidates|${world.users.rpmDhaka}`;
    const secret = testEnv().CURSOR_SECRET;
    const backward = encodeCursor(secret, binding, { v: ['x', 'y'], d: 'prev' });
    const malformed = encodeCursor(secret, binding, { v: ['not-a-uuid', 'x'], d: 'next' });
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
  it('finds a pair when one profile gets the mobile of another, and drops it when it changes back', async () => {
    const a = await f.beneficiary(h.db, world.dhaka, { mobile: '01577000001' });
    const b = await f.beneficiary(h.db, world.dhaka, { mobile: '01577000002' });
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
    await h.container.beneficiaryMergeCandidates.refreshAll();
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
        rules: ['name_father_mobile'],
      },
    ]);
  });

  it('recomputes every pair nightly, finding new ones and marking gone ones inactive', async () => {
    const a = await f.beneficiary(h.db, world.dhaka, { mobile: '01577000020' });
    const b = await f.beneficiary(h.db, world.dhaka, { mobile: '01577000020' });
    const key = [a, b].sort() as [string, string];
    expect(await stored(key)).toBeUndefined();
    await h.container.beneficiaryMergeCandidates.refreshAll();
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
