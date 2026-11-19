import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { jpeg } from '../support/images.js';
import {
  account,
  authHarness,
  type AuthHarness,
  bearer,
  login,
  type Session,
} from './support/auth-app.js';
import { notificationsOf } from './support/notifications.js';
import * as f from './support/fixtures.js';
import { DUMMY_CODE } from './support/registration.js';

// An official's requests to change their own details, decided by the Department Head or the
// Monitoring Team (docs/DECISION_LOG.md, the official's own profile of 2026-11-02;
// docs/BUSINESS_RULES.md, "An official asks for a change").
let h: AuthHarness;
const api = () => request(h.server());

beforeAll(async () => {
  h = await authHarness();
  await h.db.query(
    `INSERT INTO roles (key, name_bn, name_en, kind, global_scope)
     VALUES ('project_executive', 'project_executive', 'project_executive', 'official', false)
     ON CONFLICT DO NOTHING`,
  );
});
afterAll(async () => h.close());

const ask = (s: Session, body: Record<string, unknown>) =>
  api().post('/api/v1/me/staff-change-requests').set(bearer(s)).send(body);
const waiting = (s: Session) => api().get('/api/v1/staff-edit-requests').set(bearer(s));
const decide = (s: Session, id: string, body: Record<string, unknown>) =>
  api().post(`/api/v1/staff-edit-requests/${id}/decision`).set(bearer(s)).send(body);

async function official(role = 'regional_program_manager') {
  const a = await account(h.db, { role });
  return { account: a, session: await login(h, a) };
}
let headSession: Session | undefined;
const head = async () =>
  (headSession ??= await login(h, await account(h.db, { role: 'department_head' })));

const userRow = async (id: string) =>
  (await h.db.query('SELECT * FROM users WHERE id = $1', [id])).rows[0] as Record<string, unknown>;

describe("an official's own request", () => {
  it('reaches the Department Head with the current value, and an approval writes it', async () => {
    const s = await head();
    const rpm = await official();
    await h.db.query(`UPDATE users SET designation = 'মাঠ কর্মকর্তা' WHERE id = $1`, [
      rpm.account.id,
    ]);
    const created = await ask(rpm.session, {
      field: 'designation',
      newValue: 'আঞ্চলিক ব্যবস্থাপক',
      note: 'নতুন দায়িত্ব',
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      userId: rpm.account.id,
      volunteerId: null,
      field: 'designation',
      status: 'submitted',
    });
    const id = created.body.data.id as string;
    // the deciders are told
    const headId = (await api().get('/api/v1/auth/me').set(bearer(s))).body.data.id as string;
    expect(await notificationsOf(h.db, 'edit_request_submitted', headId)).toHaveLength(1);

    const row = (await waiting(s)).body.data.find((r: { id: string }) => r.id === id);
    expect(row).toMatchObject({
      personName: expect.any(String),
      newValue: 'আঞ্চলিক ব্যবস্থাপক',
      currentValue: 'মাঠ কর্মকর্তা',
    });
    const decided = await decide(s, id, { decision: 'approve' });
    expect(decided.status).toBe(200);
    expect(decided.body.data.status).toBe('approved');
    expect((await userRow(rpm.account.id)).designation).toBe('আঞ্চলিক ব্যবস্থাপক');
    const audit = await h.db.query(
      `SELECT new FROM audit_log WHERE action = 'auth.edit_request_decided' AND entity_id = $1`,
      [rpm.account.id],
    );
    expect(audit.rows[0].new).toMatchObject({ field: 'designation', decision: 'approve' });
    // the profile shows the new designation, and the person is told
    const profile = await api().get('/api/v1/me/profile').set(bearer(rpm.session));
    expect(profile.body.data.designation).toBe('আঞ্চলিক ব্যবস্থাপক');
    expect(await notificationsOf(h.db, 'edit_request_approved', rpm.account.id)).toHaveLength(1);
    // a second request of the same field may follow once this one is decided
    expect((await ask(rpm.session, { field: 'designation', newValue: 'অন্য পদবি' })).status).toBe(
      201,
    );
  });

  it('refuses an unchanged value, a second open request, a bad workplace and a supervisor', async () => {
    const rpm = await official();
    await h.db.query(`UPDATE users SET designation = 'পদবি' WHERE id = $1`, [rpm.account.id]);
    expect((await ask(rpm.session, { field: 'designation', newValue: 'পদবি' })).status).toBe(422);
    expect((await ask(rpm.session, { field: 'designation', newValue: 'নতুন' })).status).toBe(201);
    const again = await ask(rpm.session, { field: 'designation', newValue: 'আরও নতুন' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('registration.request_open');
    const unit = await ask(rpm.session, {
      field: 'workplace',
      newValue: { affiliation: 'external', affiliationUnit: null },
    });
    expect(unit.status).toBe(422);
    // the supervisor is changed by the deciders on the staff page, never asked for
    const supervisor = await ask(rpm.session, {
      field: 'supervisorUserId',
      newValue: rpm.account.id,
    });
    expect(supervisor.status).toBe(422);
    const program = await ask(rpm.session, {
      field: 'homeProgramId',
      newValue: '00000000-0000-7000-8000-000000000000',
    });
    expect(program.status).toBe(422);
  });

  it('moves the permission version on a new program and keeps the version on a new name', async () => {
    const rpm = await official();
    const { program } = await f.project(h.db);
    const before = (await userRow(rpm.account.id)).permission_version as number;
    const s = await head();
    const name = await ask(rpm.session, { field: 'displayName', newValue: 'নতুন নাম' });
    await decide(s, name.body.data.id, { decision: 'approve' });
    expect((await userRow(rpm.account.id)).permission_version).toBe(before);
    expect((await userRow(rpm.account.id)).display_name).toBe('নতুন নাম');

    const moved = await ask(rpm.session, { field: 'homeProgramId', newValue: program });
    expect(moved.status).toBe(201);
    const listed = (await waiting(s)).body.data.find(
      (r: { id: string }) => r.id === moved.body.data.id,
    );
    expect(listed.names[program]).toEqual({ bn: 'প্রোগ্রাম', en: 'Program' });
    expect((await decide(s, moved.body.data.id, { decision: 'approve' })).status).toBe(200);
    const after = await userRow(rpm.account.id);
    expect(after.home_program_id).toBe(program);
    expect(after.permission_version).toBe(before + 1);
  });

  it('is refused with a reason, which leaves the details as they were', async () => {
    const rpm = await official();
    const created = await ask(rpm.session, { field: 'designation', newValue: 'অন্য' });
    const s = await head();
    expect((await decide(s, created.body.data.id, { decision: 'reject' })).status).toBe(422);
    const res = await decide(s, created.body.data.id, {
      decision: 'reject',
      reason: 'এই পদবি অনুমোদিত নয়',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('rejected');
    expect((await userRow(rpm.account.id)).designation).toBeNull();
    expect(await notificationsOf(h.db, 'edit_request_closed', rpm.account.id)).toHaveLength(1);
  });
});

describe('the program choices', () => {
  it('list every active program for an official, and nothing for a volunteer', async () => {
    const { program } = await f.project(h.db);
    const retired = (await f.project(h.db)).program;
    await h.db.query('UPDATE programs SET active = false WHERE id = $1', [retired]);
    const rpm = await official();
    const res = await api()
      .get('/api/v1/me/staff-change-requests/choices')
      .set(bearer(rpm.session));
    expect(res.status).toBe(200);
    const ids = (res.body.data.programs as { id: string }[]).map((p) => p.id);
    expect(ids).toContain(program);
    expect(ids).not.toContain(retired);
    const volunteer = await login(h, await account(h.db, { kind: 'volunteer' }));
    expect(
      (await api().get('/api/v1/me/staff-change-requests/choices').set(bearer(volunteer))).status,
    ).toBe(403);
  });
});

describe('who decides', () => {
  it('is an Admin or the Department Head: the Monitoring Team, an RPM and an Executive are refused', async () => {
    const asking = await official();
    const created = await ask(asking.session, { field: 'designation', newValue: 'নতুন' });
    for (const role of [
      'monitoring_team',
      'regional_program_manager',
      'project_executive',
      'program_manager',
    ]) {
      const other = await official(role);
      expect((await waiting(other.session)).status, role).toBe(403);
      expect(
        (await decide(other.session, created.body.data.id, { decision: 'approve' })).status,
      ).toBe(403);
    }
    const admin = await official('admin');
    expect(
      (await decide(admin.session, created.body.data.id, { decision: 'approve' })).status,
    ).toBe(200);
  });

  it("never the person who asked: the Head's own request waits for an Admin", async () => {
    const own = await official('department_head');
    const created = await ask(own.session, { field: 'designation', newValue: 'বিভাগীয় প্রধান' });
    expect(created.status).toBe(201);
    const refused = await decide(own.session, created.body.data.id, { decision: 'approve' });
    expect(refused.status).toBe(403);
    const admin = await official('admin');
    expect(
      (await decide(admin.session, created.body.data.id, { decision: 'approve' })).status,
    ).toBe(200);
  });

  it('refuses to apply a detail that is no longer asked for, and lets it be refused', async () => {
    const rpm = await official();
    const [row] = (
      await h.db.query(
        `INSERT INTO volunteer_change_requests (id, user_id, kind, field, new_value, requested_by, status)
         VALUES (gen_random_uuid(), $1, 'profile_edit', 'supervisorUserId', 'null', $1, 'submitted')
         RETURNING id`,
        [rpm.account.id],
      )
    ).rows as { id: string }[];
    const s = await head();
    const approved = await decide(s, row!.id, { decision: 'approve' });
    expect(approved.status).toBe(409);
    const refused = await decide(s, row!.id, { decision: 'reject', reason: 'আর চাওয়া যায় না' });
    expect(refused.status).toBe(200);
  });

  it("keeps an official's request out of the volunteer path, and a volunteer out of this one", async () => {
    const rpm = await official();
    const created = await ask(rpm.session, { field: 'designation', newValue: 'নতুন' });
    const s = await head();
    const volunteerPath = await api()
      .post(`/api/v1/edit-requests/${created.body.data.id}/decision`)
      .set(bearer(s))
      .send({ decision: 'approve' });
    expect(volunteerPath.status).toBe(404);
    const volunteer = await login(h, await account(h.db, { kind: 'volunteer' }));
    expect((await ask(volunteer, { field: 'designation', newValue: 'নতুন' })).status).toBe(403);
  });
});

describe('a new email and a new photo', () => {
  const sendCode = (s: Session, id: string) =>
    api().post(`/api/v1/me/staff-change-requests/${id}/otp`).set(bearer(s));
  const verifyCode = (s: Session, id: string, code = DUMMY_CODE) =>
    api().post(`/api/v1/me/staff-change-requests/${id}/otp/verify`).set(bearer(s)).send({ code });

  it('reaches the deciders only after its code, and ends the sessions on approval', async () => {
    const rpm = await official();
    const email = `new.${Date.now()}@example.org`;
    const created = await ask(rpm.session, { field: 'email', newValue: email });
    expect(created.body.data).toMatchObject({ status: 'open', contactVerified: false });
    const id = created.body.data.id as string;
    const s = await head();
    const ids = async () => (await waiting(s)).body.data.map((r: { id: string }) => r.id);
    expect(await ids()).not.toContain(id);
    expect((await sendCode(rpm.session, id)).status).toBe(204);
    expect((await verifyCode(rpm.session, id)).status).toBe(204);
    expect(await ids()).toContain(id);
    expect((await decide(s, id, { decision: 'approve' })).status).toBe(200);
    expect((await userRow(rpm.account.id)).email).toBe(email);
    expect((await api().get('/api/v1/me/profile').set(bearer(rpm.session))).status).toBe(401);
    await expect(login(h, email)).resolves.toBeTruthy();
  });

  it('is uploaded with the request, and the approval makes it the photo everywhere', async () => {
    const rpm = await official();
    const created = await ask(rpm.session, { field: 'photo' });
    expect(created.body.data.status).toBe('open');
    const uploaded = await api()
      .post(`/api/v1/me/photos/photo?requestId=${created.body.data.id}&source=camera`)
      .set(bearer(rpm.session))
      .set('Content-Type', 'image/jpeg')
      .send(jpeg());
    expect(uploaded.status).toBe(201);
    const fileId = uploaded.body.data.fileId as string;
    // the own list shows the request waiting
    const own = await api().get('/api/v1/me/change-requests').set(bearer(rpm.session));
    expect(own.body.data).toEqual([
      expect.objectContaining({ id: created.body.data.id, status: 'submitted', newValue: fileId }),
    ]);
    const s = await head();
    expect((await decide(s, created.body.data.id, { decision: 'approve' })).status).toBe(200);
    const me = await api().get('/api/v1/auth/me').set(bearer(rpm.session));
    expect(me.body.data.photoFileId).toBe(fileId);
  });

  it('is fixed once uploaded, and a new request replaces one that never got its photo', async () => {
    const rpm = await official();
    const upload = (id: string) =>
      api()
        .post(`/api/v1/me/photos/photo?requestId=${id}&source=camera`)
        .set(bearer(rpm.session))
        .set('Content-Type', 'image/jpeg')
        .send(jpeg());
    const abandoned = await ask(rpm.session, { field: 'photo' });
    const fresh = await ask(rpm.session, { field: 'photo' });
    expect(fresh.status).toBe(201);
    const closed = await h.db.query('SELECT status FROM volunteer_change_requests WHERE id = $1', [
      abandoned.body.data.id,
    ]);
    expect(closed.rows[0].status).toBe('closed');
    expect((await upload(fresh.body.data.id)).status).toBe(201);
    // the deciders see this photo: a second upload cannot swap it
    expect((await upload(fresh.body.data.id)).status).toBe(404);
  });
});
