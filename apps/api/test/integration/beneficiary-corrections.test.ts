import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

// The correction of a locked field of a beneficiary: one official requests it with a reason,
// another one decides; an approval changes the field in the same transaction, logged and audited.
// A profile without a document gets one from an official who compared the two, in one write.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);

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

async function applicant(over: Record<string, unknown> = {}) {
  const id = await f.beneficiary(h.db, world.dhaka, over);
  await f.application(h.db, { project: world.a1, loc: world.dhaka }, { beneficiary_id: id });
  return id;
}
const requestCorrection = (s: Session, id: string, body: Record<string, unknown>) =>
  api().post(`/api/v1/beneficiaries/${id}/correction-requests`).set(bearer(s)).send(body);
const decide = (s: Session, requestId: string, body: Record<string, unknown>) =>
  api().post(`/api/v1/beneficiary-corrections/${requestId}/decision`).set(bearer(s)).send(body);
const profileRow = async (id: string) =>
  (await h.db.query('SELECT name, nid FROM beneficiaries WHERE id = $1', [id])).rows[0] as {
    name: string;
    nid: string;
  };
const audits = async (action: string, entityId: string) =>
  (
    await h.db.query(
      'SELECT actor_user_id, old, new, reason FROM audit_log WHERE action = $1 AND entity_id = $2',
      [action, entityId],
    )
  ).rows;
const NAME = {
  field: 'name',
  newValue: 'সংশোধিত রহিমা খাতুন',
  reason: 'জাতীয় পরিচয়পত্রের বানান',
};

describe('the correction of a locked field', () => {
  it('is requested by one official and approved by another, changing the field with a log', async () => {
    const id = await applicant({ name: 'ভুল রহিমা' });
    const rpm = await as(world.users.rpmDhaka);
    const created = await requestCorrection(rpm, id, NAME);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      beneficiaryId: id,
      field: 'name',
      oldValue: 'ভুল রহিমা',
      newValue: NAME.newValue,
      status: 'submitted',
    });
    expect(await audits('beneficiary.correction_requested', id)).toHaveLength(1);
    expect((await profileRow(id)).name).toBe('ভুল রহিমা');
    const pm = await as(world.users.pm);
    const decided = await decide(pm, created.body.data.id, { decision: 'approve' });
    expect(decided.status).toBe(200);
    expect(decided.body.data.status).toBe('approved');
    expect((await profileRow(id)).name).toBe(NAME.newValue);
    const log = (
      await h.db.query(
        `SELECT field, old_value, new_value, kind, requested_by, approved_by FROM field_changes WHERE entity_id = $1`,
        [id],
      )
    ).rows;
    expect(log).toEqual([
      {
        field: 'name',
        old_value: 'ভুল রহিমা',
        new_value: NAME.newValue,
        kind: 'correction',
        requested_by: world.users.rpmDhaka,
        approved_by: world.users.pm,
      },
    ]);
    expect(await audits('beneficiary.correction_decided', id)).toEqual([
      {
        actor_user_id: world.users.pm,
        old: { name: 'ভুল রহিমা' },
        new: { name: NAME.newValue, decision: 'approve' },
        reason: null,
      },
    ]);
  });

  it('is never decided by the official who requested it', async () => {
    const id = await applicant();
    const rpm = await as(world.users.rpmDhaka);
    const created = await requestCorrection(rpm, id, NAME);
    const own = await decide(rpm, created.body.data.id, { decision: 'approve' });
    expect(own.status).toBe(403);
    expect(own.body.error.code).toBe('beneficiary.correction_own');
  });

  it('waits for one decision per field at a time', async () => {
    const id = await applicant();
    const rpm = await as(world.users.rpmDhaka);
    expect((await requestCorrection(rpm, id, NAME)).status).toBe(201);
    const second = await requestCorrection(await as(world.users.executive), id, NAME);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('beneficiary.correction_pending');
  });

  it('keeps the value on a rejection, which needs a reason', async () => {
    const id = await applicant({ name: 'আসল নাম' });
    const created = await requestCorrection(await as(world.users.rpmDhaka), id, NAME);
    const pm = await as(world.users.pm);
    expect((await decide(pm, created.body.data.id, { decision: 'reject' })).status).toBe(422);
    const rejected = await decide(pm, created.body.data.id, {
      decision: 'reject',
      reason: 'কাগজে নামটি ঠিকই আছে',
    });
    expect(rejected.body.data.status).toBe('rejected');
    expect((await profileRow(id)).name).toBe('আসল নাম');
    expect((await audits('beneficiary.correction_decided', id))[0].reason).toBe(
      'কাগজে নামটি ঠিকই আছে',
    );
    expect((await decide(pm, created.body.data.id, { decision: 'approve' })).status).toBe(409);
  });

  it('refuses an approval when the value changed after the request', async () => {
    const id = await applicant({ name: 'প্রথম নাম' });
    const created = await requestCorrection(await as(world.users.rpmDhaka), id, NAME);
    await h.db.query(`UPDATE beneficiaries SET name = 'অন্যভাবে বদলানো' WHERE id = $1`, [id]);
    const stale = await decide(await as(world.users.pm), created.body.data.id, {
      decision: 'approve',
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('beneficiary.correction_stale');
  });

  it('refuses a new NID another profile holds, at the request and at the approval', async () => {
    const holder = await f.beneficiary(h.db, world.dhaka);
    const taken = (await profileRow(holder)).nid;
    const id = await applicant();
    const rpm = await as(world.users.rpmDhaka);
    const early = await requestCorrection(rpm, id, { ...NAME, field: 'nid', newValue: taken });
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('beneficiary.identity_taken');
    // the holder lies in the requester's region, so its BEN number is named
    const holderBen = (await h.db.query('SELECT ben_no FROM beneficiaries WHERE id = $1', [holder]))
      .rows[0].ben_no as number;
    expect(early.body.error.details[0].params.benNo).toBe(
      `BEN-${String(holderBen).padStart(7, '0')}`,
    );
    const fresh = f.fakeNid();
    const created = await requestCorrection(rpm, id, { ...NAME, field: 'nid', newValue: fresh });
    expect(created.status).toBe(201);
    await f.beneficiary(h.db, world.dhaka, { nid: fresh });
    const late = await decide(await as(world.users.pm), created.body.data.id, {
      decision: 'approve',
    });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('beneficiary.identity_taken');
  });

  it("accepts a request for a number held outside the requester's NID scope, and the approval refuses it", async () => {
    // a Rangpur profile holds the number; the Dhaka RPM cannot see Rangpur NIDs
    const holder = await f.beneficiary(h.db, world.rangpur);
    const taken = (await profileRow(holder)).nid;
    const id = await applicant();
    const created = await requestCorrection(await as(world.users.rpmDhaka), id, {
      ...NAME,
      field: 'nid',
      newValue: taken,
    });
    expect(created.status).toBe(201);
    const late = await decide(await as(world.users.head), created.body.data.id, {
      decision: 'approve',
    });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('beneficiary.identity_taken');
  });

  it('refuses a correction to the value the profile already holds', async () => {
    const id = await applicant({ name: 'একই নাম' });
    const res = await requestCorrection(await as(world.users.rpmDhaka), id, {
      ...NAME,
      newValue: 'একই নাম',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.details[0].path).toBe('newValue');
  });

  it('refuses a new NID in a wrong format', async () => {
    const id = await applicant();
    const res = await requestCorrection(await as(world.users.rpmDhaka), id, {
      ...NAME,
      field: 'nid',
      newValue: '12345',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.details[0].code).toBe('validation.nid_format');
  });

  it('refuses callers outside the scope or without the permission', async () => {
    const id = await applicant();
    const created = await requestCorrection(await as(world.users.rpmDhaka), id, NAME);
    expect(
      (
        await decide(await as(world.users.rpmRangpur), created.body.data.id, {
          decision: 'approve',
        })
      ).status,
    ).toBe(404);
    expect((await requestCorrection(await as(world.users.rpmRangpur), id, NAME)).status).toBe(404);
    expect((await requestCorrection(await as(world.users.general), id, NAME)).status).toBe(403);
    expect(
      (await decide(await as(world.users.executive), created.body.data.id, { decision: 'approve' }))
        .status,
    ).toBe(403);
  });
});

describe('an identity document added to a profile without one', () => {
  /** The profile as the official reads it, with the version a write carries back. */
  const read = (s: Session, id: string) => api().get(`/api/v1/beneficiaries/${id}`).set(bearer(s));
  const add = async (s: Session, id: string, body: Record<string, unknown>, etag?: string) =>
    api()
      .post(`/api/v1/beneficiaries/${id}/identity`)
      .set(bearer(s))
      .set('If-Match', etag ?? ((await read(s, id)).headers.etag as string))
      .send(body);
  const benNoOf = async (id: string) =>
    (await h.db.query('SELECT ben_no FROM beneficiaries WHERE id = $1', [id])).rows[0]
      .ben_no as number;
  const benText = (benNo: number) => `BEN-${String(benNo).padStart(7, '0')}`;

  it('takes a free number from an official in scope; the profile keeps its BEN number and history, and the audit names the actor and the application', async () => {
    const id = await f.beneficiary(h.db, world.dhaka, { nid: null });
    const source = await f.application(
      h.db,
      { project: world.a1, loc: world.dhaka },
      { beneficiary_id: id, identity_kind: 'none' },
    );
    // the person's other applications follow the profile too; a deleted one stays as it was
    const other = await f.application(
      h.db,
      { project: world.a2, loc: world.dhaka },
      { beneficiary_id: id, identity_kind: 'none' },
    );
    const deleted = await f.application(
      h.db,
      { project: world.b1, loc: world.dhaka },
      { beneficiary_id: id, identity_kind: 'none', status: 'deleted', deleted_at: new Date() },
    );
    const benNo = await benNoOf(id);
    const rpm = await as(world.users.rpmDhaka);
    const before = await read(rpm, id);
    expect(before.body.data).toMatchObject({ hasDocument: false, nid: null });
    expect(before.body.data.actions.addIdentity).toBe(true);
    const nid = f.fakeNid();
    const res = await add(rpm, id, { kind: 'nid', number: nid, applicationId: source });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toEqual({ beneficiaryId: id, kind: 'nid' });
    expect(res.headers.etag).toBeTruthy();
    expect(await profileRow(id)).toMatchObject({ nid });
    expect(await benNoOf(id)).toBe(benNo);
    const after = await read(rpm, id);
    expect(after.body.data).toMatchObject({ hasDocument: true, nid });
    expect(after.body.data.actions.addIdentity).toBe(false);
    expect(after.body.data.applications).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: source })]),
    );
    const kinds = await h.db.query<{ id: string; identity_kind: string }>(
      'SELECT id, identity_kind FROM applications WHERE beneficiary_id = $1',
      [id],
    );
    expect(Object.fromEntries(kinds.rows.map((r) => [r.id, r.identity_kind]))).toEqual({
      [source]: 'nid',
      [other]: 'nid',
      [deleted]: 'none',
    });
    expect(await audits('beneficiary.identity_added', id)).toEqual([
      {
        actor_user_id: world.users.rpmDhaka,
        old: { nid: null },
        new: {
          nid: `${'•'.repeat(nid.length - 4)}${nid.slice(-4)}`,
          applicationId: source,
          applicationsBound: 2,
        },
        reason: null,
      },
    ]);
    const log = await h.db.query(
      `SELECT field, old_value, new_value, kind, approved_by FROM field_changes WHERE entity_id = $1`,
      [id],
    );
    expect(log.rows).toEqual([
      {
        field: 'nid',
        old_value: null,
        new_value: nid,
        kind: 'correction',
        approved_by: world.users.rpmDhaka,
      },
    ]);
  });

  it('refuses a number another profile holds, naming that profile for the comparison only to a caller who may see its number', async () => {
    const id = await applicant({ nid: null });
    const holder = await f.beneficiary(h.db, world.dhaka);
    const rpm = await as(world.users.rpmDhaka);
    const taken = await add(rpm, id, { kind: 'nid', number: (await profileRow(holder)).nid });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe('beneficiary.identity_taken');
    expect(taken.body.error.details[0]).toMatchObject({
      path: 'number',
      params: { benNo: benText(await benNoOf(holder)), beneficiaryId: holder },
    });
    // a holder in Rangpur lies outside the Dhaka RPM's NID scope: refused without a name
    const far = await f.beneficiary(h.db, world.rangpur);
    const unnamed = await add(rpm, id, { kind: 'nid', number: (await profileRow(far)).nid });
    expect(unnamed.status).toBe(409);
    expect(unnamed.body.error.details[0].params).toBeUndefined();
    expect((await profileRow(id)).nid).toBeNull();
    expect(await audits('beneficiary.identity_added', id)).toEqual([]);
  });

  it('names a holder merged into a profile outside the caller’s NID scope by neither profile', async () => {
    const id = await applicant({ nid: null });
    // the holder lies in Dhaka, inside the RPM's scope; the profile it was merged into in Rangpur
    const holder = await f.beneficiary(h.db, world.dhaka);
    const kept = await f.beneficiary(h.db, world.rangpur);
    await h.db.query('UPDATE beneficiaries SET merged_into_id = $1 WHERE id = $2', [kept, holder]);
    const rpm = await as(world.users.rpmDhaka);
    const res = await add(rpm, id, { kind: 'nid', number: (await profileRow(holder)).nid });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('beneficiary.identity_taken');
    expect(res.body.error.details[0]).toMatchObject({
      path: 'number',
      code: 'beneficiary.identity_taken',
    });
    expect(res.body.error.details[0].params).toBeUndefined();
    // the Monitoring Team sees both: it is told the holder and the live profile behind it
    const monitoring = await as(world.users.monitoring);
    const named = await add(monitoring, id, {
      kind: 'nid',
      number: (await profileRow(holder)).nid,
    });
    expect(named.status).toBe(409);
    expect(named.body.error.details[0].params).toEqual({
      benNo: benText(await benNoOf(holder)),
      beneficiaryId: kept,
    });
    expect((await profileRow(id)).nid).toBeNull();
  });

  it('is refused to an official who may approve corrections but not see identity numbers, as a profile out of scope, before any number is looked up', async () => {
    // an RPM of Dhaka whose identity-number permission the panel revoked
    const blind = await account(h.db, { kind: 'staff', role: 'regional_program_manager' });
    accounts.set(blind.id, blind);
    await h.db.query(
      `INSERT INTO project_areas (id, project_id, location_id, rpm_user_id) VALUES ($1, $2, $3, $4)`,
      [randomUUID(), world.a1.id, world.dhaka.division, blind.id],
    );
    await h.db.query(
      `INSERT INTO user_permissions (id, user_id, permission_name, effect, scope_type, reason, granted_by)
       VALUES ($1, $2, 'beneficiary.view_nid', 'revoke', 'GLOBAL', 'Test override', $3)`,
      [randomUUID(), blind.id, world.users.head],
    );
    const id = await applicant({ nid: null });
    const s = await as(blind.id);
    const profile = await read(s, id);
    expect(profile.status).toBe(200);
    expect(profile.body.data.actions.addIdentity).toBe(false);
    const etag = profile.headers.etag as string;
    const holder = await f.beneficiary(h.db, world.dhaka);
    const free = await add(s, id, { kind: 'nid', number: f.fakeNid() }, etag);
    const taken = await add(s, id, { kind: 'nid', number: (await profileRow(holder)).nid }, etag);
    for (const res of [free, taken]) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('permission.not_found');
      expect(res.body.error.details ?? []).toEqual([]);
    }
    expect((await profileRow(id)).nid).toBeNull();
    expect(await audits('beneficiary.identity_added', id)).toEqual([]);
    expect(
      (await h.db.query('SELECT 1 FROM field_changes WHERE entity_id = $1', [id])).rows,
    ).toEqual([]);
  });

  it('refuses a profile that has a document, which only a correction changes', async () => {
    const id = await applicant();
    const rpm = await as(world.users.rpmDhaka);
    expect((await read(rpm, id)).body.data.actions.addIdentity).toBe(false);
    const res = await add(rpm, id, { kind: 'nid', number: f.fakeNid() });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('beneficiary.document_present');
  });

  it('refuses a stale version, a number in a wrong format and an application of another person', async () => {
    const id = await applicant({ nid: null });
    const rpm = await as(world.users.rpmDhaka);
    const stale = await add(rpm, id, { kind: 'nid', number: f.fakeNid() }, '"stale"');
    expect(stale.status).toBe(412);
    const format = await add(rpm, id, { kind: 'birth_reg', number: '12345' });
    expect(format.status).toBe(422);
    expect(format.body.error.details[0]).toMatchObject({
      path: 'number',
      code: 'validation.birth_reg_format',
    });
    const other = await applicant();
    const elsewhere = await h.db.query<{ id: string }>(
      'SELECT id FROM applications WHERE beneficiary_id = $1',
      [other],
    );
    const foreign = await add(rpm, id, {
      kind: 'nid',
      number: f.fakeNid(),
      applicationId: elsewhere.rows[0]!.id,
    });
    expect(foreign.status).toBe(422);
    expect(foreign.body.error.details[0].path).toBe('applicationId');
    expect((await profileRow(id)).nid).toBeNull();
  });

  it('refuses a volunteer, an official without the permission and one out of scope', async () => {
    const id = await f.beneficiary(h.db, world.dhaka, { nid: null });
    const etag = (await read(await as(world.users.rpmDhaka), id)).headers.etag as string;
    const body = { kind: 'nid', number: f.fakeNid() };
    expect((await add(await as(world.users.general), id, body, etag)).status).toBe(403);
    expect((await add(await as(world.users.executive), id, body, etag)).status).toBe(403);
    expect((await add(await as(world.users.rpmRangpur), id, body, etag)).status).toBe(404);
    expect((await profileRow(id)).nid).toBeNull();
  });
});
