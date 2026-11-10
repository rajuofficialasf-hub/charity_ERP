import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { jpeg } from '../support/images.js';
import { accessWorld } from './support/access-fixtures.js';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  PASSWORD,
  type Session,
} from './support/auth-app.js';
import { notificationsOf } from './support/notifications.js';
import * as f from './support/fixtures.js';
import { pendingStaffRegistration, TOKEN_HEADER, verifiedDraft } from './support/registration.js';

// Approval, rejection and correction requests.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
let sylhet: Awaited<ReturnType<typeof f.locationTree>>;
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
  // a third division where only another program (B1) works
  sylhet = await f.locationTree(h.db);
  await h.db.query(
    'INSERT INTO project_areas (id, project_id, location_id, rpm_user_id) VALUES ($1, $2, $3, $4)',
    [randomUUID(), world.b1.id, sylhet.division, world.users.rpmRangpur],
  );
});
afterAll(async () => h.close());

type Tree = Awaited<ReturnType<typeof f.locationTree>>;

/** A pending volunteer registered through the API at an address. */
async function registerVolunteer(tree: Tree, over: Record<string, unknown> = {}) {
  const d = await verifiedDraft(h);
  const res = await api()
    .post('/api/v1/auth/register/submit')
    .set(TOKEN_HEADER, d.token)
    .send({
      kind: 'volunteer',
      registrationId: d.registrationId,
      password: PASSWORD,
      name: 'নমুনা নিবন্ধন',
      fatherName: 'পিতা',
      motherName: 'মাতা',
      nid: f.fakeNid(),
      divisionId: tree.division,
      districtId: tree.district,
      upazilaId: tree.upazila,
      unionId: tree.union,
      profession: 'student',
      ...over,
    });
  if (res.status !== 201) throw new Error(`submit ${res.status} ${JSON.stringify(res.body)}`);
  return { userId: res.body.data.id as string, mobile: d.mobile };
}

// officials no longer register themselves: a registration left pending from before
const registerStaff = () => pendingStaffRegistration(h);

const list = (s: Session, query = '') => api().get(`/api/v1/registrations${query}`).set(bearer(s));
const approve = (s: Session, userId: string) =>
  api().post(`/api/v1/registrations/${userId}/approve`).set(bearer(s));
const auditOf = async (entityId: string) =>
  (
    await h.db.query(
      'SELECT action, reason FROM audit_log WHERE entity_id = $1 ORDER BY created_at',
      [entityId],
    )
  ).rows as { action: string; reason: string | null }[];

describe('the pending list and approval in scope', () => {
  it('the Dhaka RPM lists and approves a Dhaka registration and gets 404 for a Rangpur one', async () => {
    const dhaka = await registerVolunteer(world.dhaka);
    const rangpur = await registerVolunteer(world.rangpur);
    const rpm = await as(world.users.rpmDhaka);
    const ids = (await list(rpm)).body.data.map((r: { userId: string }) => r.userId);
    expect(ids).toContain(dhaka.userId);
    expect(ids).not.toContain(rangpur.userId);
    const detail = await api().get(`/api/v1/registrations/${dhaka.userId}`).set(bearer(rpm));
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({
      userId: dhaka.userId,
      kind: 'volunteer',
      status: 'awaiting_review',
    });
    expect(detail.body.data.volunteer.nid).toMatch(/^\d+$/);
    expect(
      (await api().get(`/api/v1/registrations/${rangpur.userId}`).set(bearer(rpm))).status,
    ).toBe(404);
    expect((await approve(rpm, rangpur.userId)).status).toBe(404);

    const res = await approve(rpm, dhaka.userId);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ userId: dhaka.userId, state: 'active', type: 'general' });
    const user = (await h.db.query('SELECT state FROM users WHERE id = $1', [dhaka.userId]))
      .rows[0];
    expect(user.state).toBe('active');
    const v = (
      await h.db.query('SELECT approved_by, approved_at FROM volunteers WHERE user_id = $1', [
        dhaka.userId,
      ])
    ).rows[0];
    expect(v.approved_by).toBe(world.users.rpmDhaka);
    expect(v.approved_at).not.toBeNull();
    const roles = await h.db.query(
      'SELECT role_key FROM user_roles WHERE user_id = $1 AND revoked_at IS NULL',
      [dhaka.userId],
    );
    expect(roles.rows).toEqual([{ role_key: 'volunteer_general' }]);
    expect((await auditOf(dhaka.userId)).map((a) => a.action)).toContain('auth.approved');
    expect(await notificationsOf(h.db, 'registration_approved', dhaka.userId)).toHaveLength(1);
    // approved once: a second approval is a conflict
    expect((await approve(rpm, dhaka.userId)).status).toBe(404);
    // the refused second approval tells nobody
    expect(await notificationsOf(h.db, 'registration_approved', dhaka.userId)).toHaveLength(1);
  });

  it("the PM approves in the divisions of the program's projects only", async () => {
    const dhaka = await registerVolunteer(world.dhaka);
    const elsewhere = await registerVolunteer(sylhet);
    const pm = await as(world.users.pm);
    expect((await approve(pm, elsewhere.userId)).status).toBe(404);
    expect((await approve(pm, dhaka.userId)).status).toBe(200);
  });

  it('the Project Executive approves in the region; a volunteer and Finance get 403', async () => {
    const dhaka = await registerVolunteer(world.dhaka);
    const executive = await as(world.users.executive);
    expect((await approve(executive, dhaka.userId)).status).toBe(200);
    expect((await list(await as(world.users.general))).status).toBe(403);
    const finance = await account(h.db, { role: 'finance_team' });
    expect((await list(await login(h, finance))).status).toBe(403);
  });

  it('a blocklisted registration cannot be approved', async () => {
    const dhaka = await registerVolunteer(world.dhaka);
    const volunteerId = (
      await h.db.query('SELECT id FROM volunteers WHERE user_id = $1', [dhaka.userId])
    ).rows[0].id;
    await h.db.query(
      `INSERT INTO blocklist (id, subject_type, subject_id, reason, blocked_by) VALUES ($1, 'volunteer', $2, 'test block', $3)`,
      [randomUUID(), volunteerId, world.users.head],
    );
    const res = await approve(await as(world.users.rpmDhaka), dhaka.userId);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('registration.blocklisted');
  });
});

describe('decisions at the same time', () => {
  it('an approval and a rejection at once leave one consistent outcome', async () => {
    const dhaka = await registerVolunteer(world.dhaka);
    const rpm = await as(world.users.rpmDhaka);
    const executive = await as(world.users.executive);
    const [approved, rejected] = await Promise.all([
      approve(rpm, dhaka.userId),
      api()
        .post(`/api/v1/registrations/${dhaka.userId}/reject`)
        .set(bearer(executive))
        .send({ reason: 'একই সময়ে' }),
    ]);
    // exactly one decision wins; the other finds no pending registration
    expect([approved.status, rejected.status].sort()).toEqual(
      approved.status === 200 ? [200, 404] : [204, 404],
    );
    const user = (await h.db.query('SELECT state FROM users WHERE id = $1', [dhaka.userId]))
      .rows[0];
    const roles = await h.db.query(
      'SELECT 1 FROM user_roles WHERE user_id = $1 AND revoked_at IS NULL',
      [dhaka.userId],
    );
    expect(user.state).toBe(approved.status === 200 ? 'active' : 'deactivated');
    expect(roles.rowCount).toBe(approved.status === 200 ? 1 : 0);
  });
});

describe('rejection', () => {
  it('an approver outside the region gets 404, a volunteer 403, and the account stays pending', async () => {
    const dhaka = await registerVolunteer(world.dhaka);
    const reject = (s: Session) =>
      api()
        .post(`/api/v1/registrations/${dhaka.userId}/reject`)
        .set(bearer(s))
        .send({ reason: 'বাইরে' });
    expect((await reject(await as(world.users.rpmRangpur))).status).toBe(404);
    expect((await reject(await as(world.users.general))).status).toBe(403);
    const user = (await h.db.query('SELECT state FROM users WHERE id = $1', [dhaka.userId]))
      .rows[0];
    expect(user.state).toBe('pending');
  });

  it('needs a reason, deactivates the account and ends its sessions', async () => {
    const dhaka = await registerVolunteer(world.dhaka);
    const own = await login(h, dhaka.mobile);
    const rpm = await as(world.users.rpmDhaka);
    const reject = (body: object) =>
      api().post(`/api/v1/registrations/${dhaka.userId}/reject`).set(bearer(rpm)).send(body);
    expect((await reject({})).status).toBe(422);
    expect((await reject({ reason: 'তথ্য মেলেনি' })).status).toBe(204);
    const user = (await h.db.query('SELECT state FROM users WHERE id = $1', [dhaka.userId]))
      .rows[0];
    expect(user.state).toBe('deactivated');
    expect(await auditOf(dhaka.userId)).toContainEqual({
      action: 'auth.rejected',
      reason: 'তথ্য মেলেনি',
    });
    const rejected = await notificationsOf(h.db, 'registration_rejected', dhaka.userId);
    expect(rejected.map((n) => n.params)).toEqual([{ reason: 'তথ্য মেলেনি' }]);
    const me = await api().get('/api/v1/volunteers/me').set(bearer(own));
    expect(me.status).toBe(401);
  });
});

describe('the new personal, profession and skills data in the registration', () => {
  const FULL = {
    dateOfBirth: '1990-05-17',
    bloodGroup: 'O+',
    tshirtSize: 'M',
    volunteeringArea: 'own_union',
    profession: 'imam',
    professionDetails: { role: 'imam', mosqueName: 'নমুনা মসজিদ', mosqueType: 'jame' },
    interestAreas: ['data_entry'],
    vehicle: 'none',
    canSwim: false,
    availability: 'holidays',
    emergencyFullTime: false,
    facebookId: 'https://www.facebook.com/nomuna',
    educationDetails: {
      highestQualification: 'hsc',
      institutionName: 'নমুনা কলেজ',
      passingYear: 2012,
    },
  };

  it('the Dhaka RPM sees the data in the registration detail', async () => {
    const dhaka = await registerVolunteer(world.dhaka, FULL);
    const rpm = await as(world.users.rpmDhaka);
    const detail = await api().get(`/api/v1/registrations/${dhaka.userId}`).set(bearer(rpm));
    expect(detail.status).toBe(200);
    expect(detail.body.data.volunteer).toMatchObject({
      dateOfBirth: '1990-05-17',
      bloodGroup: 'O+',
      tshirtSize: 'M',
      volunteeringArea: 'own_union',
      profession: 'imam',
      professionDetails: FULL.professionDetails,
      interestAreas: ['data_entry'],
      vehicle: 'none',
      canSwim: false,
      availability: 'holidays',
      emergencyFullTime: false,
      facebookId: 'https://www.facebook.com/nomuna',
      educationDetails: {
        highestQualification: 'hsc',
        institutionName: 'নমুনা কলেজ',
        passingYear: 2012,
      },
    });
  });

  it('a correction asks for a new field and the answer is written on approval', async () => {
    const dhaka = await registerVolunteer(world.dhaka, FULL);
    const rpm = await as(world.users.rpmDhaka);
    const own = await login(h, dhaka.mobile);
    const created = await api()
      .post(`/api/v1/registrations/${dhaka.userId}/correction-requests`)
      .set(bearer(rpm))
      .send({ fields: ['bloodGroup', 'profession'], note: 'রক্তের গ্রুপ ও পেশা ঠিক করুন' });
    expect(created.status).toBe(201);
    const rows = (await api().get('/api/v1/me/change-requests').set(bearer(own))).body.data as {
      id: string;
      field: string;
    }[];
    const byField = Object.fromEntries(rows.map((r) => [r.field, r.id]));
    const answer = (id: string, newValue: unknown) =>
      api().patch(`/api/v1/me/change-requests/${id}`).set(bearer(own)).send({ newValue });
    expect((await answer(byField.bloodGroup!, 'AB+')).status).toBe(200);
    expect(
      (
        await answer(byField.profession!, {
          profession: 'student',
          details: { institutionName: 'নমুনা বিদ্যালয়' },
        })
      ).status,
    ).toBe(200);
    expect((await api().post('/api/v1/me/registration/resubmit').set(bearer(own))).status).toBe(
      204,
    );
    expect((await approve(rpm, dhaka.userId)).status).toBe(200);
    const saved = await h.db.query(
      'SELECT blood_group, profession, profession_details FROM volunteers WHERE user_id = $1',
      [dhaka.userId],
    );
    expect(saved.rows[0]).toEqual({
      blood_group: 'AB+',
      profession: 'student',
      profession_details: { institutionName: 'নমুনা বিদ্যালয়' },
    });
  });
});

describe('correction requests', () => {
  const correct = (s: Session, userId: string, body: object) =>
    api().post(`/api/v1/registrations/${userId}/correction-requests`).set(bearer(s)).send(body);

  it('two fields open two rows; the volunteer answers, resubmits, and only then the approval works', async () => {
    const dhaka = await registerVolunteer(world.dhaka);
    const rpm = await as(world.users.rpmDhaka);
    const own = await login(h, dhaka.mobile);
    const created = await correct(rpm, dhaka.userId, {
      fields: ['name', 'education'],
      note: 'নাম ও শিক্ষাগত যোগ্যতা ঠিক করুন',
    });
    expect(created.status).toBe(201);
    expect(created.body.data.map((r: { field: string }) => r.field).sort()).toEqual([
      'education',
      'name',
    ]);
    expect(created.body.data.every((r: { status: string }) => r.status === 'open')).toBe(true);

    // hidden from the default list, shown under the in_correction filter
    const ids = async (q = '') =>
      (await list(rpm, q)).body.data.map((r: { userId: string }) => r.userId);
    expect(await ids()).not.toContain(dhaka.userId);
    expect(await ids('?status=in_correction')).toContain(dhaka.userId);

    const mine = await api().get('/api/v1/me/change-requests').set(bearer(own));
    expect(mine.status).toBe(200);
    const rows = mine.body.data as { id: string; field: string }[];
    expect(rows).toHaveLength(2);
    const byField = Object.fromEntries(rows.map((r) => [r.field, r.id]));

    const answer = (id: string, newValue: unknown) =>
      api().patch(`/api/v1/me/change-requests/${id}`).set(bearer(own)).send({ newValue });
    const resubmit = () => api().post('/api/v1/me/registration/resubmit').set(bearer(own));

    expect((await answer(byField.name!, 'সংশোধিত নাম')).status).toBe(200);
    const early = await resubmit();
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('registration.open_corrections');
    expect((await approve(rpm, dhaka.userId)).body.error.code).toBe(
      'registration.open_corrections',
    );
    expect((await answer(byField.education!, 'স্নাতকোত্তর')).status).toBe(200);
    const notYet = await approve(rpm, dhaka.userId);
    expect(notYet.status).toBe(409);
    expect(notYet.body.error.code).toBe('registration.not_resubmitted');
    expect((await resubmit()).status).toBe(204);
    expect(await ids()).toContain(dhaka.userId);
    expect((await approve(rpm, dhaka.userId)).status).toBe(200);

    const profile = await h.db.query(
      'SELECT u.display_name, v.education FROM users u JOIN volunteers v ON v.user_id = u.id WHERE u.id = $1',
      [dhaka.userId],
    );
    expect(profile.rows[0]).toEqual({ display_name: 'সংশোধিত নাম', education: 'স্নাতকোত্তর' });
    const actions = (await auditOf(dhaka.userId)).map((a) => a.action);
    for (const action of ['auth.correction_requested', 'auth.correction_resubmitted'])
      expect(actions).toContain(action);
    const asked = await notificationsOf(h.db, 'registration_correction_requested', dhaka.userId);
    expect(asked).toHaveLength(1);
    expect(asked[0]!.params.field_name).toMatchObject({ bn: expect.any(String) });
    // the corrected registration waits for the RPM of its region again
    const again = await notificationsOf(h.db, 'registration_pending', world.users.rpmDhaka);
    expect(again.map((n) => n.params.userId)).toContain(dhaka.userId);
  });

  it('checks the value of an answer by its field', async () => {
    const dhaka = await registerVolunteer(world.dhaka);
    const rpm = await as(world.users.rpmDhaka);
    const own = await login(h, dhaka.mobile);
    const created = await correct(rpm, dhaka.userId, {
      fields: ['nid', 'address'],
      note: 'ঠিক করুন',
    });
    const byField = Object.fromEntries(
      (created.body.data as { id: string; field: string }[]).map((r) => [r.field, r.id]),
    );
    const answer = (id: string, newValue: unknown) =>
      api().patch(`/api/v1/me/change-requests/${id}`).set(bearer(own)).send({ newValue });
    expect((await answer(byField.nid!, '12345')).status).toBe(422);
    const other = await f.locationTree(h.db);
    expect(
      (
        await answer(byField.address!, {
          divisionId: world.dhaka.division,
          districtId: world.dhaka.district,
          upazilaId: other.upazila,
          unionId: other.union,
        })
      ).status,
    ).toBe(422);
    const nid = f.fakeNid();
    expect((await answer(byField.nid!, nid)).status).toBe(200);
    const v = await h.db.query('SELECT nid FROM volunteers WHERE user_id = $1', [dhaka.userId]);
    expect(v.rows[0].nid).toBe(nid);
  });

  it('counts refused answers within the hour only, so old mistakes never lock the answer', async () => {
    const dhaka = await registerVolunteer(world.dhaka);
    const rpm = await as(world.users.rpmDhaka);
    const own = await login(h, dhaka.mobile);
    const created = await correct(rpm, dhaka.userId, { fields: ['nid'], note: 'ঠিক করুন' });
    const rowId = (created.body.data as { id: string }[])[0]!.id;
    const answer = (newValue: unknown) =>
      api().patch(`/api/v1/me/change-requests/${rowId}`).set(bearer(own)).send({ newValue });
    const refusals = (ageMs: number) =>
      h.db.query(
        `INSERT INTO audit_log (id, action, entity_type, entity_id, created_at)
         SELECT gen_random_uuid(), 'auth.correction_refused', 'user', $1, now() - make_interval(secs => $2)
         FROM generate_series(1, 10)`,
        [dhaka.userId, ageMs / 1000],
      );
    // ten refusals two hours ago: the answer is still taken
    await refusals(2 * 3_600_000);
    expect((await answer('12345')).status).toBe(422);
    // ten more within the hour: the eleventh answer waits
    await refusals(60_000);
    expect((await answer(f.fakeNid())).status).toBe(429);
  });

  it('answers a photo row only with the file the own upload stored on it', async () => {
    const dhaka = await registerVolunteer(world.dhaka);
    const rpm = await as(world.users.rpmDhaka);
    const own = await login(h, dhaka.mobile);
    const created = await correct(rpm, dhaka.userId, {
      fields: ['photo'],
      note: 'ছবি পরিষ্কার নয়',
    });
    const requestId = created.body.data[0].id as string;
    const answer = (newValue: string) =>
      api().patch(`/api/v1/me/change-requests/${requestId}`).set(bearer(own)).send({ newValue });
    expect((await answer(randomUUID())).status).toBe(422);
    const uploaded = await api()
      .post(`/api/v1/me/photos/photo?requestId=${requestId}`)
      .set(bearer(own))
      .set('Content-Type', 'image/jpeg')
      .send(jpeg());
    expect(uploaded.status).toBe(201);
    const fileId = uploaded.body.data.fileId as string;
    expect((await answer(fileId)).status).toBe(200);
    const v = await h.db.query('SELECT photo_file_id FROM volunteers WHERE user_id = $1', [
      dhaka.userId,
    ]);
    expect(v.rows[0].photo_file_id).toBe(fileId);
  });

  it('refuses the NID of another volunteer in an answer (409)', async () => {
    const holder = await registerVolunteer(world.dhaka);
    const holderNid = (
      await h.db.query('SELECT nid FROM volunteers WHERE user_id = $1', [holder.userId])
    ).rows[0].nid as string;
    const dhaka = await registerVolunteer(world.dhaka);
    const rpm = await as(world.users.rpmDhaka);
    const own = await login(h, dhaka.mobile);
    const created = await correct(rpm, dhaka.userId, { fields: ['nid'], note: 'এনআইডি ঠিক করুন' });
    const res = await api()
      .patch(`/api/v1/me/change-requests/${created.body.data[0].id}`)
      .set(bearer(own))
      .send({ newValue: holderNid });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('registration.nid_exists');
  });

  it('refuses unknown fields and a registration that is already approved', async () => {
    const dhaka = await registerVolunteer(world.dhaka);
    const rpm = await as(world.users.rpmDhaka);
    expect(
      (await correct(rpm, dhaka.userId, { fields: ['password'], note: 'ঠিক করুন' })).status,
    ).toBe(422);
    expect((await approve(rpm, dhaka.userId)).status).toBe(200);
    expect((await correct(rpm, dhaka.userId, { fields: ['name'], note: 'ঠিক করুন' })).status).toBe(
      404,
    );
  });

  it("volunteer B cannot answer or read volunteer A's correction", async () => {
    const a = await registerVolunteer(world.dhaka);
    const b = await registerVolunteer(world.dhaka);
    const rpm = await as(world.users.rpmDhaka);
    const created = await correct(rpm, a.userId, { fields: ['name'], note: 'ঠিক করুন' });
    const requestId = created.body.data[0].id as string;
    const bSession = await login(h, b.mobile);
    const res = await api()
      .patch(`/api/v1/me/change-requests/${requestId}`)
      .set(bearer(bSession))
      .send({ newValue: 'অন্য নাম' });
    expect(res.status).toBe(404);
    const bList = await api().get('/api/v1/me/change-requests').set(bearer(bSession));
    expect(bList.body.data).toEqual([]);
  });
});

describe('staff registrations', () => {
  const decide = (s: Session, userId: string, body: object) =>
    api().post(`/api/v1/staff-registrations/${userId}/decision`).set(bearer(s)).send(body);

  it('the Monitoring Team approves with a role; the account becomes active', async () => {
    const staff = await registerStaff();
    const monitoring = await as(world.users.monitoring);
    const res = await decide(monitoring, staff.userId, {
      decision: 'approve',
      roleKey: 'project_executive',
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: staff.userId,
      state: 'active',
      roles: ['project_executive'],
    });
    expect((await auditOf(staff.userId)).map((a) => a.action)).toContain('auth.approved');
    expect(await notificationsOf(h.db, 'registration_approved', staff.userId)).toHaveLength(1);
  });

  it('staff registrations are listed for staff approvers only', async () => {
    const staff = await registerStaff();
    const ids = async (s: Session) =>
      (await list(s, '?kind=staff')).body.data.map((r: { userId: string }) => r.userId);
    expect(await ids(await as(world.users.head))).toContain(staff.userId);
    expect(await ids(await as(world.users.rpmDhaka))).toEqual([]);
  });

  it('an RPM gets 403; the Department Head role cannot be given; a rejection needs a reason', async () => {
    const staff = await registerStaff();
    expect(
      (
        await decide(await as(world.users.rpmDhaka), staff.userId, {
          decision: 'approve',
          roleKey: 'project_executive',
        })
      ).status,
    ).toBe(403);
    const head = await as(world.users.head);
    const owner = await decide(head, staff.userId, {
      decision: 'approve',
      roleKey: 'department_head',
    });
    expect(owner.status).toBe(422);
    expect(
      (await decide(head, staff.userId, { decision: 'approve', roleKey: 'volunteer_general' }))
        .status,
    ).toBe(422);
    expect((await decide(head, staff.userId, { decision: 'reject' })).status).toBe(422);
    expect((await decide(head, staff.userId, { decision: 'approve' })).status).toBe(422);
    const rejected = await decide(head, staff.userId, { decision: 'reject', reason: 'পদ নেই' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.state).toBe('deactivated');
  });

  it('a volunteer registration is not decided as staff, nor a staff one approved as volunteer', async () => {
    const volunteer = await registerVolunteer(world.dhaka);
    const staff = await registerStaff();
    const head = await as(world.users.head);
    expect(
      (await decide(head, volunteer.userId, { decision: 'approve', roleKey: 'project_executive' }))
        .status,
    ).toBe(404);
    expect((await approve(head, staff.userId)).status).toBe(404);
  });
});
