import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { jpeg } from '../support/images.js';
import { makeScope, NO_INSTANCES } from '../../src/access/scope.js';
import type { Principal } from '../../src/auth/principal.js';
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
import { notificationsOf } from './support/notifications.js';
import * as f from './support/fixtures.js';
import { DUMMY_CODE } from './support/registration.js';

// Edit requests after approval and contact changes.
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
    // the request names the person it is about as well as the volunteer
    const stored = await h.db.query(
      'SELECT user_id, volunteer_id FROM volunteer_change_requests WHERE id = $1',
      [created.body.data.id],
    );
    expect(stored.rows[0]).toEqual({ user_id: v.account.id, volunteer_id: v.volunteerId });
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
    // the RPM of the region was told of the request, the volunteer of the decision
    const asked = await notificationsOf(h.db, 'edit_request_submitted', world.users.rpmDhaka);
    expect(asked.length).toBeGreaterThan(0);
    const told = await notificationsOf(h.db, 'edit_request_approved', v.account.id);
    expect(told).toHaveLength(1);
    expect(told[0]!.params.field_name).toMatchObject({ en: expect.any(String) });
  });

  it('an official’s waiting request stays out of the volunteer requests, even for the Department Head', async () => {
    const head = await as(world.users.head);
    const pendingCount = async () =>
      (
        (await api().get('/api/v1/me/attention').set(bearer(head))).body.data as {
          kind: string;
          count: number;
        }[]
      ).find((i) => i.kind === 'edit_requests_pending')?.count ?? 0;
    const before = await pendingCount();
    const official = await f.user(h.db);
    const id = randomUUID();
    await h.db.query(
      `INSERT INTO volunteer_change_requests (id, user_id, kind, field, new_value, requested_by, status)
       VALUES ($1, $2, 'profile_edit', 'designation', 'সিনিয়র অফিসার', $2, 'submitted')`,
      [id, official],
    );
    const listed = await api().get('/api/v1/edit-requests').set(bearer(head));
    expect(listed.status).toBe(200);
    expect(listed.body.data.map((r: { id: string }) => r.id)).not.toContain(id);
    expect(await pendingCount()).toBe(before);
    expect((await decide(head, id, { decision: 'approve' })).status).toBe(404);
    const kept = await h.db.query('SELECT status FROM volunteer_change_requests WHERE id = $1', [
      id,
    ]);
    expect(kept.rows[0].status).toBe('submitted');
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
    // the approver decides on this photo: a second upload cannot swap it
    const again = await api()
      .post(`/api/v1/me/photos/photo?requestId=${created.body.data.id}&source=camera`)
      .set(bearer(v.session))
      .set('Content-Type', 'image/jpeg')
      .send(jpeg());
    expect(again.status).toBe(404);
    const rpm = await as(world.users.rpmDhaka);
    expect((await decide(rpm, created.body.data.id, { decision: 'approve' })).status).toBe(200);
    const saved = await h.db.query('SELECT photo_file_id FROM volunteers WHERE id = $1', [
      v.volunteerId,
    ]);
    expect(saved.rows[0].photo_file_id).toBe(upload.body.data.fileId);
  });

  it('a new photo request closes one that never got its photo', async () => {
    const v = await approvedVolunteer();
    const abandoned = await ask(v.session, { field: 'photo' });
    const fresh = await ask(v.session, { field: 'photo' });
    expect(fresh.status).toBe(201);
    const closed = await h.db.query('SELECT status FROM volunteer_change_requests WHERE id = $1', [
      abandoned.body.data.id,
    ]);
    expect(closed.rows[0].status).toBe('closed');
  });

  it('the bank details with a branch are added later through a request, and only the bank class sees them', async () => {
    const v = await approvedVolunteer();
    const bank = {
      bankName: 'Test Bank',
      accountName: 'নমুনা',
      accountNumber: '0000111122223333',
      branchName: 'Savar Branch',
    };
    const created = await ask(v.session, { field: 'bank', newValue: bank });
    expect(created.status).toBe(201);
    // the volunteer sees their own details, the registration holds no bank
    const before = await h.db.query('SELECT bank_branch_name FROM volunteers WHERE id = $1', [
      v.volunteerId,
    ]);
    expect(before.rows[0].bank_branch_name).toBeNull();
    const rpm = await as(world.users.rpmDhaka);
    const pending = await api().get('/api/v1/edit-requests').set(bearer(rpm));
    expect(
      pending.body.data.find((r: { id: string }) => r.id === created.body.data.id).newValue,
    ).toEqual(bank);
    // a branch name over 100 characters is refused
    const long = await ask(v.session, {
      field: 'bank',
      newValue: { ...bank, branchName: 'x'.repeat(101) },
    });
    expect(long.status).toBe(422);
    expect((await decide(rpm, created.body.data.id, { decision: 'approve' })).status).toBe(200);
    const saved = await h.db.query(
      'SELECT bank_name, bank_account_number, bank_branch_name FROM volunteers WHERE id = $1',
      [v.volunteerId],
    );
    expect(saved.rows[0]).toEqual({
      bank_name: 'Test Bank',
      bank_account_number: '0000111122223333',
      bank_branch_name: 'Savar Branch',
    });
    const me = await api().get('/api/v1/volunteers/me').set(bearer(v.session));
    expect(me.body.data.bank).toMatchObject({ branchName: 'Savar Branch' });
    // the audit entries name the field, never the values
    const audit = await h.db.query(
      `SELECT new FROM audit_log WHERE entity_id = $1 AND action IN ('auth.edit_requested', 'auth.edit_request_decided')`,
      [created.body.data.id],
    );
    expect(JSON.stringify(audit.rows)).not.toContain('Savar Branch');
    expect(JSON.stringify(audit.rows)).not.toContain('0000111122223333');
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

describe('the personal, profession, education and address fields', () => {
  const columnsOf = async (volunteerId: string) =>
    (
      await h.db.query(
        `SELECT to_char(date_of_birth, 'YYYY-MM-DD') AS dob, blood_group, tshirt_size, volunteering_area,
                profession, profession_details, interest_areas, vehicle, can_swim, availability,
                emergency_full_time, education_details, permanent_address, facebook_id
           FROM volunteers WHERE id = $1`,
        [volunteerId],
      )
    ).rows[0];

  it('each new field is asked for, approved by the Dhaka RPM and written', async () => {
    const v = await approvedVolunteer();
    const rpm = await as(world.users.rpmDhaka);
    const place = await f.locationTree(h.db);
    const permanent = {
      divisionId: place.division,
      districtId: place.district,
      upazilaId: place.upazila,
      unionId: place.union,
      addressLine: 'নমুনা গ্রাম',
    };
    const education = {
      highestQualification: 'bachelor',
      institutionName: 'নমুনা কলেজ',
      subject: 'বাংলা',
      passingYear: 2016,
      result: 'GPA 4.50',
      status: 'completed',
    };
    const cases: [string, unknown][] = [
      ['bloodGroup', 'AB-'],
      ['dateOfBirth', '1992-03-04'],
      ['tshirtSize', 'XL'],
      ['volunteeringArea', 'own_district'],
      [
        'profession',
        {
          profession: 'businessman',
          details: { businessName: 'নমুনা স্টোর', businessType: 'retail' },
        },
      ],
      [
        'skills',
        {
          interestAreas: ['survey', 'media'],
          vehicle: 'bicycle',
          canSwim: false,
          availability: 'holidays',
          emergencyFullTime: true,
        },
      ],
      ['educationDetails', education],
      ['permanentAddress', permanent],
      ['facebookId', 'https://www.facebook.com/nomuna.name'],
    ];
    for (const [field, newValue] of cases) {
      const created = await ask(v.session, { field, newValue });
      expect(created.status, field).toBe(201);
      expect((await decide(rpm, created.body.data.id, { decision: 'approve' })).status, field).toBe(
        200,
      );
    }
    expect(await columnsOf(v.volunteerId)).toEqual({
      dob: '1992-03-04',
      blood_group: 'AB-',
      tshirt_size: 'XL',
      volunteering_area: 'own_district',
      profession: 'businessman',
      profession_details: { businessName: 'নমুনা স্টোর', businessType: 'retail' },
      interest_areas: ['survey', 'media'],
      vehicle: 'bicycle',
      can_swim: false,
      availability: 'holidays',
      emergency_full_time: true,
      education_details: education,
      permanent_address: permanent,
      facebook_id: 'https://www.facebook.com/nomuna.name',
    });
  });

  it('a new profession replaces the old details, none of them stays', async () => {
    const v = await approvedVolunteer();
    await h.db.query(
      `UPDATE volunteers SET profession = 'imam', profession_details = '{"mosqueName":"Old","role":"khatib"}' WHERE id = $1`,
      [v.volunteerId],
    );
    const created = await ask(v.session, {
      field: 'profession',
      newValue: { profession: 'teacher', details: { designation: 'প্রভাষক' } },
    });
    expect(created.status).toBe(201);
    const rpm = await as(world.users.rpmDhaka);
    expect((await decide(rpm, created.body.data.id, { decision: 'approve' })).status).toBe(200);
    expect(await columnsOf(v.volunteerId)).toMatchObject({
      profession: 'teacher',
      profession_details: { designation: 'প্রভাষক' },
    });
  });

  it('refuses a bad value or a detail of another profession with 422, and a second open request with 409', async () => {
    const v = await approvedVolunteer();
    const place = await f.locationTree(h.db);
    for (const body of [
      { field: 'bloodGroup', newValue: 'Z+' },
      { field: 'dateOfBirth', newValue: '2999-01-01' },
      { field: 'skills', newValue: { vehicle: 'car' } },
      { field: 'skills', newValue: { emergencyFullTime: 'yes' } },
      { field: 'profession', newValue: { profession: 'imam', details: { sector: 'x' } } },
      { field: 'profession', newValue: { profession: '__proto__', details: {} } },
      { field: 'educationDetails', newValue: { highestQualification: 'everything' } },
      { field: 'educationDetails', newValue: { passingYear: 1900 } },
      { field: 'facebookId', newValue: 'https://evil.example/www.facebook.com' },
      { field: 'emergencyContact', newValue: { name: 'অভিভাবক' } },
      {
        field: 'permanentAddress',
        newValue: {
          divisionId: place.division,
          districtId: place.upazila,
          upazilaId: place.upazila,
          unionId: place.union,
        },
      },
    ])
      expect((await ask(v.session, body)).status, JSON.stringify(body)).toBe(422);
    expect((await ask(v.session, { field: 'tshirtSize', newValue: 'M' })).status).toBe(201);
    expect((await ask(v.session, { field: 'tshirtSize', newValue: 'L' })).status).toBe(409);
  });

  it('the decision shows a protected value only to an approver with the identity class', async () => {
    const principal = { userId: world.users.rpmDhaka } as Principal;
    const scope = makeScope(world.users.rpmDhaka, 'edit_request.approve', 'volunteer', {
      ...NO_INSTANCES,
      global: true,
    });
    const values: [string, unknown][] = [
      ['bloodGroup', 'B+'],
      ['dateOfBirth', '1991-01-01'],
      ['tshirtSize', 'S'],
      ['educationDetails', { institutionName: 'নমুনা কলেজ' }],
    ];
    const protectedFields = new Set(['bloodGroup', 'dateOfBirth']);
    const reject = async (field: string, newValue: unknown, classes: Set<string>) => {
      const v = await approvedVolunteer();
      const created = await ask(v.session, { field, newValue });
      return h.container.changeRequests.decide(
        principal,
        scope,
        created.body.data.id,
        { decision: 'reject', reason: 'যাচাই করা যায়নি' },
        classes,
      );
    };
    for (const [field, newValue] of values) {
      const without = await reject(field, newValue, new Set<string>());
      expect(Object.hasOwn(without, 'newValue'), `${field} without the class`).toBe(
        !protectedFields.has(field),
      );
      const withClass = await reject(field, newValue, new Set(['volunteer.identity']));
      expect(withClass.newValue, `${field} with the class`).toEqual(newValue);
    }
  });

  it('the own profile returns the new data to its volunteer', async () => {
    const v = await approvedVolunteer();
    await h.db.query(
      `UPDATE volunteers SET blood_group = 'A-', date_of_birth = '1988-12-31', tshirt_size = 'M',
              volunteering_area = 'anywhere', profession = 'student', profession_details = '{"institutionName":"নমুনা"}',
              interest_areas = '["media","first_aid"]', vehicle = 'none', can_swim = true,
              availability = 'anytime', emergency_full_time = false,
              education_details = '{"highestQualification":"hsc","passingYear":2012}',
              permanent_address = $2,
              facebook_id = 'https://www.facebook.com/nomuna'
        WHERE id = $1`,
      [
        v.volunteerId,
        JSON.stringify({
          divisionId: world.dhaka.division,
          districtId: world.dhaka.district,
          upazilaId: world.dhaka.upazila,
          unionId: world.dhaka.union,
          addressLine: 'নমুনা গ্রাম',
        }),
      ],
    );
    const res = await api().get('/api/v1/volunteers/me').set(bearer(v.session));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      bloodGroup: 'A-',
      dateOfBirth: '1988-12-31',
      tshirtSize: 'M',
      volunteeringArea: 'anywhere',
      profession: 'student',
      professionDetails: { institutionName: 'নমুনা' },
      interestAreas: ['media', 'first_aid'],
      vehicle: 'none',
      canSwim: true,
      availability: 'anytime',
      emergencyFullTime: false,
      educationDetails: { highestQualification: 'hsc', passingYear: 2012 },
      permanentAddress: { unionId: world.dhaka.union, addressLine: 'নমুনা গ্রাম' },
      facebookId: 'https://www.facebook.com/nomuna',
    });
    expect(res.body.data).not.toHaveProperty('emergencyContact');
  });
});
