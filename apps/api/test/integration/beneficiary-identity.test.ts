import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Principal } from '../../src/auth/principal';
import { type ApiError } from '../../src/i18n/api-error';
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

// The identity of a beneficiary: the lookup of the application form with its auto-fill and locked
// fields, the search by BEN number and by a retired profile's numbers, and the creation of a
// profile with every identity check.
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

const person = (tree: Tree, over: Record<string, unknown> = {}) => f.beneficiary(h.db, tree, over);
const row = async (id: string) =>
  (await h.db.query('SELECT nid, birth_reg, ben_no, mobile FROM beneficiaries WHERE id = $1', [id]))
    .rows[0] as { nid: string | null; birth_reg: string | null; ben_no: number; mobile: string };
const lookup = (s: Session, body: Record<string, unknown>) =>
  api().post('/api/v1/beneficiaries/lookup').set(bearer(s)).send(body);
const list = (s: Session, q: string) =>
  api().get('/api/v1/beneficiaries').query({ q }).set(bearer(s));
const ids = (res: request.Response) => (res.body.data as { id: string }[]).map((r) => r.id);
const lookupAudits = async (actor: string) =>
  (
    await h.db.query(
      `SELECT entity_id, new FROM audit_log WHERE action = 'beneficiary.looked_up' AND actor_user_id = $1 ORDER BY created_at, id`,
      [actor],
    )
  ).rows as { entity_id: string | null; new: Record<string, unknown> }[];
const retire = (retired: string, kept: string) =>
  h.db.query('UPDATE beneficiaries SET merged_into_id = $2 WHERE id = $1', [retired, kept]);

describe('the lookup of the application form', () => {
  it('fills in the known details by NID with the identity fields locked, and never the other number', async () => {
    const id = await person(world.dhaka, {
      name: 'নমুনা রহিমা',
      father_or_husband_name: 'নমুনা করিম',
      mother_name: 'নমুনা আমেনা',
      birth_reg: '20261020000000011',
    });
    const { nid } = await row(id);
    const volunteer = await as(world.users.general);
    const res = await lookup(volunteer, { nid, projectId: world.a1.id }).expect(200);
    const data = res.body.data;
    expect(data).toMatchObject({ found: true, blocked: false, alreadyAppliedInProject: false });
    expect(data.autofill).toMatchObject({
      beneficiaryId: id,
      benNo: (await row(id)).ben_no,
      name: 'নমুনা রহিমা',
      fatherOrHusbandName: 'নমুনা করিম',
      motherName: 'নমুনা আমেনা',
      village: 'নমুনা গ্রাম',
      unionId: world.dhaka.union,
    });
    expect([...data.autofill.lockedFields].sort()).toEqual(
      ['birth_reg', 'father_or_husband_name', 'name', 'nid'].sort(),
    );
    expect(JSON.stringify(data)).not.toContain('20261020000000011');
    expect(data.autofill).not.toHaveProperty('nid');
    expect(data.autofill).not.toHaveProperty('birthReg');
  });

  it('finds a child by birth registration only', async () => {
    const id = await person(world.dhaka, { nid: null, birth_reg: '20261020000000012' });
    const rpm = await as(world.users.rpmDhaka);
    const res = await lookup(rpm, { birthReg: '20261020000000012', projectId: world.a1.id });
    expect(res.status).toBe(200);
    expect(res.body.data.autofill.beneficiaryId).toBe(id);
  });

  it('answers not found for an unknown number, and audits every lookup without the number', async () => {
    const volunteer = await as(world.users.general);
    const res = await lookup(volunteer, { nid: '1999999999', projectId: world.a1.id }).expect(200);
    expect(res.body.data).toEqual({ found: false });
    const audits = await lookupAudits(world.users.general);
    expect(audits.at(-1)).toMatchObject({ entity_id: null, new: { found: false } });
    expect(JSON.stringify(audits)).not.toContain('1999999999');
  });

  it('says a blocked person is blocked, without the reason', async () => {
    const id = await person(world.dhaka);
    await h.db.query(
      `INSERT INTO blocklist (id, subject_type, subject_id, reason, blocked_by) VALUES (gen_random_uuid(), 'beneficiary', $1, 'গোপন কারণ লেখা', $2)`,
      [id, world.users.rpmDhaka],
    );
    const volunteer = await as(world.users.general);
    const res = await lookup(volunteer, { nid: (await row(id)).nid, projectId: world.a1.id });
    expect(res.body.data).toMatchObject({ found: true, blocked: true });
    expect(JSON.stringify(res.body)).not.toContain('গোপন কারণ');
  });

  it('says whether the person already applied in the project', async () => {
    const id = await person(world.dhaka);
    await f.application(h.db, { project: world.a1, loc: world.dhaka }, { beneficiary_id: id });
    const volunteer = await as(world.users.general);
    const { nid } = await row(id);
    expect(
      (await lookup(volunteer, { nid, projectId: world.a1.id })).body.data.alreadyAppliedInProject,
    ).toBe(true);
    expect(
      (await lookup(volunteer, { nid, projectId: world.a2.id })).body.data.alreadyAppliedInProject,
    ).toBe(false);
  });

  it("leads a retired profile's number to the kept profile", async () => {
    const kept = await person(world.dhaka);
    const retired = await person(world.dhaka);
    await retire(retired, kept);
    const volunteer = await as(world.users.general);
    const res = await lookup(volunteer, { nid: (await row(retired)).nid, projectId: world.a1.id });
    expect(res.body.data.autofill.beneficiaryId).toBe(kept);
    expect(res.body.data.mergedInto).toEqual({ benNo: (await row(kept)).ben_no });
  });

  it("tells the volunteer when the profile's mobile is the volunteer's own", async () => {
    const own = accounts.get(world.users.general)!.mobile;
    const id = await person(world.dhaka);
    // the database refuses the volunteer's mobile only on an application of that volunteer
    await h.db.query('UPDATE beneficiaries SET mobile = $2 WHERE id = $1', [id, own]);
    const volunteer = await as(world.users.general);
    const res = await lookup(volunteer, { nid: (await row(id)).nid, projectId: world.a1.id });
    expect(res.body.data.mobileIsCallerOwn).toBe(true);
    const rpm = await as(world.users.rpmDhaka);
    const other = await lookup(rpm, { nid: (await row(id)).nid, projectId: world.a1.id });
    expect(other.body.data.mobileIsCallerOwn).toBe(false);
  });

  it('fills in a profile of another region and marks its audit row as outside the region', async () => {
    const id = await person(world.rangpur);
    const rpm = await as(world.users.rpmDhaka);
    const res = await lookup(rpm, { nid: (await row(id)).nid, projectId: world.a1.id });
    expect(res.body.data.autofill.beneficiaryId).toBe(id);
    const audit = (await lookupAudits(world.users.rpmDhaka)).at(-1)!;
    expect(audit).toMatchObject({
      entity_id: id,
      new: { found: true, outsideScope: true, projectId: world.a1.id },
    });
  });

  it('stops filling in profiles of other regions after 20 a day, and goes on inside the region', async () => {
    const rpm = await as(world.users.rpmRangpur);
    const outside = await person(world.dhaka);
    const inside = await person(world.rangpur);
    const today = h.clock.now();
    for (let i = 0; i < 20; i++)
      await h.db.query(
        `INSERT INTO audit_log (id, created_at, actor_user_id, action, entity_type, entity_id, new)
         VALUES (gen_random_uuid(), $1, $2, 'beneficiary.looked_up', 'beneficiary', $3, '{"found": true, "outsideScope": true}')`,
        [today, world.users.rpmRangpur, outside],
      );
    const refused = await lookup(rpm, { nid: (await row(outside)).nid, projectId: world.a1.id });
    expect(refused.status).toBe(429);
    expect(refused.body.error.code).toBe('beneficiary.lookup_outside_limit');
    expect(JSON.stringify(refused.body)).not.toContain((await row(outside)).mobile);
    const audit = (await lookupAudits(world.users.rpmRangpur)).at(-1)!;
    expect(audit).toMatchObject({ entity_id: outside, new: { limited: true, outsideScope: true } });
    const allowed = await lookup(rpm, { nid: (await row(inside)).nid, projectId: world.a1.id });
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.autofill.beneficiaryId).toBe(inside);
  });

  it('refuses a project the caller does not work on, a caller without the permission, and no token', async () => {
    const nid = (await row(await person(world.dhaka))).nid;
    const volunteer = await as(world.users.general);
    expect((await lookup(volunteer, { nid, projectId: world.b1.id })).status).toBe(404);
    expect(
      (await lookup(volunteer, { nid, projectId: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b' })).status,
    ).toBe(404);
    const rpm = await as(world.users.rpmDhaka);
    expect((await lookup(rpm, { nid, projectId: world.b1.id })).status).toBe(404);
    const media = await login(h, await account(h.db, { role: 'media_team' }));
    expect((await lookup(media, { nid, projectId: world.a1.id })).status).toBe(403);
    expect(
      (await api().post('/api/v1/beneficiaries/lookup').send({ nid, projectId: world.a1.id }))
        .status,
    ).toBe(401);
  });

  it('refuses a number in a wrong format, none, or both', async () => {
    const volunteer = await as(world.users.general);
    const bad = await lookup(volunteer, { nid: '12345', projectId: world.a1.id });
    expect(bad.status).toBe(422);
    expect(bad.body.error.details[0].code).toBe('validation.nid_format');
    expect((await lookup(volunteer, { projectId: world.a1.id })).status).toBe(422);
    expect(
      (
        await lookup(volunteer, {
          nid: '1999999998',
          birthReg: '20261020000000013',
          projectId: world.a1.id,
        })
      ).status,
    ).toBe(422);
  });
});

describe('the search of the beneficiary tab', () => {
  it('finds a profile by its BEN number in any typed form', async () => {
    const id = await person(world.dhaka);
    const { ben_no } = await row(id);
    const head = await as(world.users.head);
    for (const typed of [`BEN-${String(ben_no).padStart(7, '0')}`, `ben-${ben_no}`, `BEN${ben_no}`])
      expect(ids(await list(head, typed)), typed).toEqual([id]);
  });

  it("finds the kept profile by a retired profile's NID and BEN number", async () => {
    const kept = await person(world.dhaka);
    const retired = await person(world.dhaka);
    await retire(retired, kept);
    const rpm = await as(world.users.rpmDhaka);
    expect(ids(await list(rpm, (await row(retired)).nid!))).toEqual([kept]);
    expect(ids(await list(rpm, `BEN-${(await row(retired)).ben_no}`))).toEqual([kept]);
  });

  it("finds a retired profile's kept profile only when the caller's list reaches that one", async () => {
    // the Procurement Team sees the beneficiaries of its house-construction projects only
    const team = await account(h.db, { role: 'procurement_team' });
    const house = await f.project(h.db);
    await h.db.query(`UPDATE workflow_definitions SET key = 'construction' WHERE id = $1`, [
      house.workflow,
    ]);
    await h.db.query(
      `INSERT INTO project_staff (id, project_id, user_id, role_key, granted_by)
       VALUES (gen_random_uuid(), $1, $2, 'procurement_team', $2)`,
      [house.id, team.id],
    );
    const procurement = await login(h, team);
    const elsewhere = await person(world.rangpur);
    const retiredElsewhere = await person(world.dhaka);
    await retire(retiredElsewhere, elsewhere);
    const applicant = await person(world.dhaka);
    const retiredApplicant = await person(world.dhaka);
    await retire(retiredApplicant, applicant);
    await f.application(h.db, { project: house, loc: world.dhaka }, { beneficiary_id: applicant });
    const benOf = async (id: string) => `BEN-${(await row(id)).ben_no}`;
    expect(ids(await list(procurement, await benOf(retiredElsewhere)))).toEqual([]);
    expect(ids(await list(procurement, await benOf(retiredApplicant)))).toEqual([applicant]);
  });
});

describe('the creation of a profile', () => {
  const principal = (userId: string) => ({ userId }) as Principal;
  const create = (actor: string, over: Record<string, unknown> = {}) =>
    h.container.prisma.$transaction((tx) =>
      h.container.beneficiaryIdentity.createProfile(tx, principal(actor), {
        nid: f.fakeNid(),
        name: 'নতুন উপকারভোগী',
        fatherOrHusbandName: 'নতুন পিতা',
        mobile: f.fakeMobile(),
        genderCode: 'female',
        divisionId: world.dhaka.division,
        districtId: world.dhaka.district,
        upazilaId: world.dhaka.upazila,
        unionId: world.dhaka.union,
        village: 'নতুন গ্রাম',
        ...over,
      }),
    );
  const refusal = async (work: Promise<unknown>) => {
    try {
      await work;
    } catch (e) {
      return e as ApiError;
    }
    throw new Error('expected a refusal');
  };

  it('gives the new profile the next BEN number', async () => {
    const first = await create(world.users.rpmDhaka);
    const second = await create(world.users.rpmDhaka);
    expect(second.benNo).toBeGreaterThan(first.benNo);
    expect((await row(second.id)).ben_no).toBe(second.benNo);
  });

  it('refuses a used NID, naming the holder only to a caller who sees that profile', async () => {
    const dhaka = await person(world.dhaka);
    const { nid, ben_no } = await row(dhaka);
    const seen = await refusal(create(world.users.rpmDhaka, { nid }));
    expect(seen).toMatchObject({ code: 'beneficiary.identity_taken', status: 409 });
    expect(seen.details?.[0]?.params).toEqual({ benNo: `BEN-${String(ben_no).padStart(7, '0')}` });
    const unseen = await refusal(create(world.users.general, { nid }));
    expect(unseen).toMatchObject({ code: 'beneficiary.identity_taken', status: 409 });
    expect(unseen.details?.[0]?.params).toBeUndefined();
  });

  it('creates a profile by birth registration and refuses one another profile holds', async () => {
    const birthReg = '20261020000000099';
    const created = await create(world.users.rpmDhaka, { nid: undefined, birthReg });
    expect(await row(created.id)).toMatchObject({ nid: null, birth_reg: birthReg });
    const e = await refusal(create(world.users.rpmDhaka, { nid: undefined, birthReg }));
    expect(e).toMatchObject({ code: 'beneficiary.identity_taken', status: 409 });
    expect(e.details?.[0]?.path).toBe('birthReg');
  });

  it('refuses a number in a wrong format with the format message', async () => {
    const e = await refusal(create(world.users.rpmDhaka, { nid: '12345' }));
    expect(e).toMatchObject({ code: 'validation.nid_format', status: 422 });
    const none = await refusal(create(world.users.rpmDhaka, { nid: undefined }));
    expect(none).toMatchObject({ code: 'beneficiary.identity_missing', status: 422 });
  });

  it("refuses the caller's own mobile and the owner volunteer's mobile", async () => {
    const own = accounts.get(world.users.general)!.mobile;
    const e = await refusal(create(world.users.general, { mobile: own }));
    expect(e).toMatchObject({ code: 'beneficiary.mobile_is_volunteer_mobile', status: 409 });
    const forOwner = await refusal(
      create(world.users.rpmDhaka, { mobile: own, ownerUserId: world.users.general }),
    );
    expect(forOwner).toMatchObject({ code: 'beneficiary.mobile_is_volunteer_mobile' });
  });

  it('saves a mobile that another profile has, with a warning naming that profile', async () => {
    const other = await person(world.dhaka);
    const { mobile, ben_no } = await row(other);
    const created = await create(world.users.rpmDhaka, { mobile });
    expect(created.warnings).toEqual([
      {
        code: 'beneficiary.mobile_shared',
        count: 1,
        benNos: [`BEN-${String(ben_no).padStart(7, '0')}`],
      },
    ]);
  });

  it('counts a shared mobile but names no profile the caller cannot see', async () => {
    const other = await person(world.rangpur);
    const { mobile } = await row(other);
    const created = await create(world.users.general, { mobile });
    expect(created.warnings).toEqual([{ code: 'beneficiary.mobile_shared', count: 1, benNos: [] }]);
  });

  it("refuses a mobile in another spelling than the stored one, so a volunteer's own number cannot slip through", async () => {
    const own = accounts.get(world.users.general)!.mobile;
    for (const mobile of [`+88${own}`, `88${own}`, `${own.slice(0, 5)}-${own.slice(5)}`]) {
      const e = await refusal(create(world.users.general, { mobile }));
      expect(e, mobile).toMatchObject({ code: 'validation.mobile_format', status: 422 });
    }
  });

  it('fails loudly on a merge chain that does not end, instead of answering not found', async () => {
    const a = await person(world.dhaka);
    const b = await person(world.dhaka);
    // a loop, as broken data would make it
    await retire(a, b);
    await retire(b, a);
    await expect(h.container.beneficiaryIdentity.liveOf(h.container.prisma, a)).rejects.toThrow(
      /does not end/,
    );
    await h.db.query('UPDATE beneficiaries SET merged_into_id = NULL WHERE id IN ($1, $2)', [a, b]);
  });
});
