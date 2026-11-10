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
