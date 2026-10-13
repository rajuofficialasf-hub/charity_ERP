import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RegistrationEvent } from '../../src/notifications/registration-events';
import { jpeg } from '../support/images';
import { makeScope, NO_INSTANCES } from '../../src/access/scope';
import type { Principal } from '../../src/auth/principal';
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
import { DUMMY_CODE } from './support/registration';

// Edit requests after approval and contact changes (BR-031 as amended by DECISION_LOG D-085; plan
// docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md, unit U8).
const events: RegistrationEvent[] = [];
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);

beforeAll(async () => {
  h = await authHarness({
    overrides: { registrationEvents: { emit: (event) => void events.push(event) } },
  });
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
});
afterAll(async () => h.close());

/** An approved volunteer living in a division (Dhaka by default). */
async function approvedVolunteer(tree = world.dhaka) {
  const a = await account(h.db, { kind: 'volunteer', role: 'volunteer_general' });
  const volunteerId = await f.volunteer(h.db, tree, a.id, {
    approved_at: new Date(),
    education: 'এসএসসি',
  });
  return { account: a, volunteerId, session: await login(h, a) };
}

const ask = (s: Session, body: object) =>
  api().post('/api/v1/me/change-requests').set(bearer(s)).send(body);
const decide = (s: Session, id: string, body: object) =>
  api().post(`/api/v1/edit-requests/${id}/decision`).set(bearer(s)).send(body);

describe('edit requests', () => {
  it('the new address applies at once when the Dhaka RPM approves it', async () => {
    const v = await approvedVolunteer();
    const other = await f.locationTree(h.db);
    const address = {
      divisionId: other.division,
      districtId: other.district,
      upazilaId: other.upazila,
      unionId: other.union,
    };
    const created = await ask(v.session, { field: 'address', newValue: address, note: 'বাসা বদল' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      kind: 'profile_edit',
      field: 'address',
      status: 'submitted',
    });
    const rpm = await as(world.users.rpmDhaka);
    const pending = await api().get('/api/v1/edit-requests').set(bearer(rpm));
    expect(pending.body.data.map((r: { id: string }) => r.id)).toContain(created.body.data.id);
    // the approver sees who asked (the volunteer's name), the owner's own list does not need it
    const name = await h.db.query('SELECT display_name FROM users WHERE id = $1', [v.account.id]);
    expect(
      pending.body.data.find((r: { id: string }) => r.id === created.body.data.id).volunteerName,
    ).toBe(name.rows[0].display_name);
    const res = await decide(rpm, created.body.data.id, { decision: 'approve' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
    const row = await h.db.query('SELECT union_id FROM volunteers WHERE id = $1', [v.volunteerId]);
    expect(row.rows[0].union_id).toBe(other.union);
    expect(events).toContainEqual({ type: 'registration.edit_decided', userId: v.account.id });
  });

  it('a refusal needs a reason and changes nothing', async () => {
    const v = await approvedVolunteer();
    const created = await ask(v.session, { field: 'education', newValue: 'স্নাতক' });
    const rpm = await as(world.users.rpmDhaka);
    expect((await decide(rpm, created.body.data.id, { decision: 'reject' })).status).toBe(422);
    const res = await decide(rpm, created.body.data.id, {
      decision: 'reject',
      reason: 'প্রমাণ নেই',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('rejected');
    const row = await h.db.query('SELECT education FROM volunteers WHERE id = $1', [v.volunteerId]);
    expect(row.rows[0].education).toBe('এসএসসি');
  });

  it('refuses a field that is not editable, a bad value and a second open request for a field', async () => {
    const v = await approvedVolunteer();
    expect((await ask(v.session, { field: 'category', newValue: 'A' })).status).toBe(422);
    expect((await ask(v.session, { field: 'nid', newValue: '123' })).status).toBe(422);
    expect((await ask(v.session, { field: 'education', newValue: 'স্নাতক' })).status).toBe(201);
    const again = await ask(v.session, { field: 'education', newValue: 'স্নাতকোত্তর' });
    expect(again.status).toBe(409);
  });

  it('a pending registrant cannot use edit requests (403)', async () => {
    const pending = await account(h.db, { kind: 'volunteer', state: 'pending' });
    await h.db.query('DELETE FROM user_roles WHERE user_id = $1', [pending.id]);
    const s = await login(h, pending);
    const res = await ask(s, { field: 'education', newValue: 'স্নাতক' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('auth.account_pending');
  });

  it('an RPM of another region gets 404 on the decision', async () => {
    const v = await approvedVolunteer();
    const created = await ask(v.session, { field: 'education', newValue: 'স্নাতক' });
    const rangpur = await as(world.users.rpmRangpur);
    expect((await decide(rangpur, created.body.data.id, { decision: 'approve' })).status).toBe(404);
    const list = await api().get('/api/v1/edit-requests').set(bearer(rangpur));
    expect(list.body.data.map((r: { id: string }) => r.id)).not.toContain(created.body.data.id);
  });

  it('the decision returns an NID value only to an approver with the identity class', async () => {
    const v = await approvedVolunteer();
    const created = await ask(v.session, { field: 'nid', newValue: f.fakeNid() });
    const scope = makeScope(world.users.rpmDhaka, 'edit_request.approve', 'volunteer', {
      ...NO_INSTANCES,
      global: true,
    });
    const principal = { userId: world.users.rpmDhaka } as Principal;
    const decided = await h.container.changeRequests.decide(
      principal,
      scope,
      created.body.data.id,
      { decision: 'reject', reason: 'যাচাই করা যায়নি' },
      new Set<string>(),
    );
    expect(decided).not.toHaveProperty('newValue');
  });

  it('the audit entry of an NID change holds the field name and no value', async () => {
    const v = await approvedVolunteer();
    const nid = f.fakeNid();
    const created = await ask(v.session, { field: 'nid', newValue: nid });
    const rpm = await as(world.users.rpmDhaka);
    expect((await decide(rpm, created.body.data.id, { decision: 'approve' })).status).toBe(200);
    const row = await h.db.query('SELECT nid FROM volunteers WHERE id = $1', [v.volunteerId]);
    expect(row.rows[0].nid).toBe(nid);
    const audit = await h.db.query(
      `SELECT action, new, old FROM audit_log WHERE action IN ('auth.edit_requested', 'auth.edit_request_decided') AND entity_id = $1`,
      [v.account.id],
    );
    expect(audit.rows.map((r) => r.action).sort()).toEqual([
      'auth.edit_request_decided',
      'auth.edit_requested',
    ]);
    for (const r of audit.rows) {
      expect(r.new.field).toBe('nid');
      expect(JSON.stringify(r)).not.toContain(nid);
    }
  });

  it('a photo edit is filled by the own upload and applies on approval', async () => {
    const v = await approvedVolunteer();
    const created = await ask(v.session, { field: 'photo' });
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe('open');
    const upload = await api()
      .post(`/api/v1/me/photos/photo?requestId=${created.body.data.id}&source=camera`)
      .set(bearer(v.session))
      .set('Content-Type', 'image/jpeg')
      .send(jpeg());
    expect(upload.status).toBe(201);
    const mine = await api().get('/api/v1/me/change-requests').set(bearer(v.session));
    const row = mine.body.data.find((r: { id: string }) => r.id === created.body.data.id);
    expect(row).toMatchObject({ status: 'submitted', newValue: upload.body.data.fileId });
    const rpm = await as(world.users.rpmDhaka);
    expect((await decide(rpm, created.body.data.id, { decision: 'approve' })).status).toBe(200);
    const saved = await h.db.query('SELECT photo_file_id FROM volunteers WHERE id = $1', [
      v.volunteerId,
    ]);
    expect(saved.rows[0].photo_file_id).toBe(upload.body.data.fileId);
  });

  it('the second page of the NID card is a photo edit of its own', async () => {
    const v = await approvedVolunteer();
    const created = await ask(v.session, { field: 'nid_photo_back' });
    expect(created.status).toBe(201);
    const upload = await api()
      .post(`/api/v1/me/photos/nid_photo_back?requestId=${created.body.data.id}&source=camera`)
      .set(bearer(v.session))
      .set('Content-Type', 'image/jpeg')
      .send(jpeg());
    expect(upload.status).toBe(201);
    const rpm = await as(world.users.rpmDhaka);
    // the approver holds the identity class, so the value is shown
    const pending = await api().get('/api/v1/edit-requests').set(bearer(rpm));
    expect(
      pending.body.data.find((r: { id: string }) => r.id === created.body.data.id).newValue,
    ).toBe(upload.body.data.fileId);
    expect((await decide(rpm, created.body.data.id, { decision: 'approve' })).status).toBe(200);
    const saved = await h.db.query(
      'SELECT nid_photo_back_file_id, photo_file_id FROM volunteers WHERE id = $1',
      [v.volunteerId],
    );
    expect(saved.rows[0]).toMatchObject({
      nid_photo_back_file_id: upload.body.data.fileId,
      photo_file_id: null,
    });
  });
});

describe('contact changes', () => {
  const sendCode = (s: Session, id: string) =>
    api().post(`/api/v1/me/change-requests/${id}/otp`).set(bearer(s));
  const verifyCode = (s: Session, id: string, code = DUMMY_CODE) =>
    api().post(`/api/v1/me/change-requests/${id}/otp/verify`).set(bearer(s)).send({ code });

  it('a new mobile reaches the approver only after its code, applies on approval and ends the sessions', async () => {
    const v = await approvedVolunteer();
    const newMobile = f.fakeMobile();
    const created = await ask(v.session, { field: 'mobile', newValue: newMobile });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ status: 'open', contactVerified: false });
    const rpm = await as(world.users.rpmDhaka);
    const listed = async () =>
      (await api().get('/api/v1/edit-requests').set(bearer(rpm))).body.data.map(
        (r: { id: string }) => r.id,
      );
    expect(await listed()).not.toContain(created.body.data.id);
    expect((await decide(rpm, created.body.data.id, { decision: 'approve' })).status).toBe(409);

    expect((await sendCode(v.session, created.body.data.id)).status).toBe(204);
    expect((await verifyCode(v.session, created.body.data.id, '111111')).status).toBe(422);
    expect((await verifyCode(v.session, created.body.data.id)).status).toBe(204);
    expect(await listed()).toContain(created.body.data.id);

    const res = await decide(rpm, created.body.data.id, { decision: 'approve' });
    expect(res.status).toBe(200);
    const user = await h.db.query('SELECT mobile FROM users WHERE id = $1', [v.account.id]);
    expect(user.rows[0].mobile).toBe(newMobile);
    // the volunteer's sessions end; the new mobile logs in
    expect((await api().get('/api/v1/volunteers/me').set(bearer(v.session))).status).toBe(401);
    await expect(login(h, newMobile)).resolves.toBeTruthy();
  });

  it('tells that a mobile belongs to another account only after its code is verified', async () => {
    const v = await approvedVolunteer();
    const other = await account(h.db, { kind: 'volunteer' });
    const created = await ask(v.session, { field: 'mobile', newValue: other.mobile });
    expect(created.status).toBe(201);
    expect((await sendCode(v.session, created.body.data.id)).status).toBe(204);
    const res = await verifyCode(v.session, created.body.data.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('registration.account_exists');
  });

  it('refuses the current mobile and replaces a contact request still waiting for its code', async () => {
    const v = await approvedVolunteer();
    expect((await ask(v.session, { field: 'mobile', newValue: v.account.mobile })).status).toBe(
      422,
    );
    const typo = await ask(v.session, { field: 'mobile', newValue: f.fakeMobile() });
    const fixed = await ask(v.session, { field: 'mobile', newValue: f.fakeMobile() });
    expect(fixed.status).toBe(201);
    const rows = await h.db.query(
      'SELECT id, status FROM volunteer_change_requests WHERE id = ANY($1)',
      [[typo.body.data.id, fixed.body.data.id]],
    );
    const status = Object.fromEntries(rows.rows.map((x) => [x.id, x.status]));
    expect(status).toEqual({ [typo.body.data.id]: 'closed', [fixed.body.data.id]: 'open' });
  });

  it('caps the codes of one account at 5 per hour, also across replaced requests', async () => {
    const v = await approvedVolunteer();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const created = await ask(v.session, { field: 'mobile', newValue: f.fakeMobile() });
      statuses.push((await sendCode(v.session, created.body.data.id)).status);
    }
    expect(statuses).toEqual([204, 204, 204, 204, 204, 429]);
  });

  it("volunteer B cannot see, answer or verify volunteer A's request", async () => {
    const a = await approvedVolunteer();
    const b = await approvedVolunteer();
    const created = await ask(a.session, { field: 'mobile', newValue: f.fakeMobile() });
    const id = created.body.data.id as string;
    expect((await sendCode(b.session, id)).status).toBe(404);
    expect((await verifyCode(b.session, id)).status).toBe(404);
    const patch = await api()
      .patch(`/api/v1/me/change-requests/${id}`)
      .set(bearer(b.session))
      .send({ newValue: f.fakeMobile() });
    expect(patch.status).toBe(404);
    const bList = await api().get('/api/v1/me/change-requests').set(bearer(b.session));
    expect(bList.body.data.map((r: { id: string }) => r.id)).not.toContain(id);
    expect((await sendCode(a.session, randomUUID())).status).toBe(404);
  });
});
