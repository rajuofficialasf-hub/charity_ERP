import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RegistrationEvent } from '../../src/notifications/registration-events';
import { jpeg, png } from '../support/images';
import {
  account,
  authHarness,
  type AuthHarness,
  bearer,
  login,
  PASSWORD,
} from './support/auth-app';
import * as f from './support/fixtures';
import { TOKEN_HEADER, verifiedDraft, verifyContacts } from './support/registration';

// Submit and the pending account (AUTH.md 2, 7; DECISION_LOG D-081, D-086; plan
// docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md, unit U6).
const events: RegistrationEvent[] = [];
let h: AuthHarness;
let loc: Awaited<ReturnType<typeof f.locationTree>>;
let programId: string;

beforeAll(async () => {
  h = await authHarness({
    overrides: { registrationEvents: { emit: (event) => void events.push(event) } },
  });
  loc = await f.locationTree(h.db);
  programId = (await f.project(h.db)).program;
});
afterAll(async () => h.close());

type Draft = Awaited<ReturnType<typeof verifiedDraft>>;

const volunteerForm = (d: Pick<Draft, 'registrationId'>, over: Record<string, unknown> = {}) => ({
  kind: 'volunteer',
  registrationId: d.registrationId,
  password: PASSWORD,
  name: 'নমুনা স্বেচ্ছাসেবক',
  fatherName: 'নমুনা পিতা',
  motherName: 'নমুনা মাতা',
  nid: f.fakeNid(),
  type: 'general',
  divisionId: loc.division,
  districtId: loc.district,
  upazilaId: loc.upazila,
  unionId: loc.union,
  whatsapp: f.fakeMobile(),
  education: 'স্নাতক',
  bank: { bankName: 'Test Bank', accountName: 'নমুনা', accountNumber: '0000111122223333' },
  ...over,
});

const staffForm = (d: Pick<Draft, 'registrationId'>, over: Record<string, unknown> = {}) => ({
  kind: 'staff',
  registrationId: d.registrationId,
  password: PASSWORD,
  name: 'নমুনা কর্মকর্তা',
  designation: 'Project Officer',
  homeProgramId: programId,
  homeDivisionId: loc.division,
  ...over,
});

const submit = (token: string | undefined, body: Record<string, unknown>) => {
  const req = request(h.server()).post('/api/v1/auth/register/submit');
  if (token) req.set(TOKEN_HEADER, token);
  return req.send(body);
};

const photo = (d: Draft, slot: string, bytes: Buffer, type: string) =>
  request(h.server())
    .post(`/api/v1/auth/register/photos/${slot}?registrationId=${d.registrationId}`)
    .set(TOKEN_HEADER, d.token)
    .set('Content-Type', type)
    .send(bytes);

describe('POST /auth/register/submit', () => {
  it('creates a pending volunteer with the volunteer row and the photos', async () => {
    const d = await verifiedDraft(h);
    const photoId = (await photo(d, 'photo', jpeg(), 'image/jpeg')).body.data.fileId as string;
    const nidPhotoId = (await photo(d, 'nid_photo', png(), 'image/png')).body.data.fileId as string;
    const nidBackId = (await photo(d, 'nid_photo_back', jpeg(), 'image/jpeg')).body.data
      .fileId as string;
    const form = volunteerForm(d);
    const res = await submit(d.token, form);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      displayName: form.name,
      kind: 'volunteer',
      state: 'pending',
      roles: [],
    });
    const userId = res.body.data.id as string;
    const user = (await h.db.query('SELECT * FROM users WHERE id = $1', [userId])).rows[0];
    expect(user).toMatchObject({ mobile: d.mobile, email: d.email, state: 'pending' });
    expect(user.password_hash).toMatch(/^\$argon2id\$/);
    const v = (await h.db.query('SELECT * FROM volunteers WHERE user_id = $1', [userId])).rows[0];
    expect(v).toMatchObject({
      nid: form.nid,
      type: 'general',
      father_name: form.fatherName,
      union_id: loc.union,
      bank_account_number: '0000111122223333',
      photo_file_id: photoId,
      nid_photo_file_id: nidPhotoId,
      nid_photo_back_file_id: nidBackId,
      approved_at: null,
    });
    expect(res.body.data.volunteerId).toBe(v.id);
    const draft = (
      await h.db.query('SELECT * FROM registration_drafts WHERE id = $1', [d.registrationId])
    ).rows[0];
    expect(draft).toMatchObject({ submitted_user_id: userId, token_hash: null });
    expect(draft.submitted_at).not.toBeNull();
    const audit = (
      await h.db.query(
        `SELECT new FROM audit_log WHERE action = 'auth.registered' AND entity_id = $1`,
        [userId],
      )
    ).rows;
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit[0].new)).not.toContain(form.nid);
    expect(events).toContainEqual({ type: 'registration.submitted', userId });
    // the draft token is spent
    expect((await submit(d.token, volunteerForm(d))).status).toBe(401);
  });

  it('creates a pending official with designation, program and region and no volunteer row', async () => {
    const d = await verifiedDraft(h, 'staff');
    const photoId = (await photo(d, 'photo', jpeg(), 'image/jpeg')).body.data.fileId as string;
    const res = await submit(d.token, staffForm(d));
    expect(res.status).toBe(201);
    const userId = res.body.data.id as string;
    const user = (await h.db.query('SELECT * FROM users WHERE id = $1', [userId])).rows[0];
    expect(user).toMatchObject({
      kind: 'staff',
      state: 'pending',
      designation: 'Project Officer',
      home_program_id: programId,
      home_division_id: loc.division,
    });
    expect(
      (await h.db.query('SELECT 1 FROM volunteers WHERE user_id = $1', [userId])).rowCount,
    ).toBe(0);
    const link = await h.db.query(
      `SELECT file_id FROM file_links WHERE entity_type = 'user' AND entity_id = $1 AND slot = 'photo'`,
      [userId],
    );
    expect(link.rows).toEqual([{ file_id: photoId }]);
  });

  it('refuses the form of the other kind, a broken address and a weak password (422)', async () => {
    const d = await verifiedDraft(h);
    expect((await submit(d.token, staffForm(d))).status).toBe(422);
    const other = await f.locationTree(h.db);
    const broken = await submit(d.token, volunteerForm(d, { upazilaId: other.upazila }));
    expect(broken.status).toBe(422);
    expect(broken.body.error.details[0].path).toBe('upazilaId');
    const weak = await submit(d.token, volunteerForm(d, { password: 'aaaaaaaaaa' }));
    expect(weak.status).toBe(422);
    expect(weak.body.error.details[0]).toMatchObject({
      path: 'password',
      code: 'validation.password_letter_digit',
    });
  });

  it('refuses a duplicate NID (409)', async () => {
    const nid = f.fakeNid();
    const first = await verifiedDraft(h);
    expect((await submit(first.token, volunteerForm(first, { nid }))).status).toBe(201);
    const second = await verifiedDraft(h);
    const res = await submit(second.token, volunteerForm(second, { nid }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('registration.nid_exists');
  });

  it('links a team member to the active main volunteer and refuses an unknown reference', async () => {
    const main = await account(h.db, { kind: 'volunteer' });
    const mainNid = f.fakeNid();
    const mainId = await f.volunteer(h.db, loc, main.id, { nid: mainNid });
    const d = await verifiedDraft(h);
    const unknown = await submit(
      d.token,
      volunteerForm(d, { type: 'team_member', referenceNid: f.fakeNid() }),
    );
    expect(unknown.status).toBe(422);
    expect(unknown.body.error.details[0].path).toBe('referenceNid');
    const ok = await submit(
      d.token,
      volunteerForm(d, { type: 'team_member', referenceNid: mainNid }),
    );
    expect(ok.status).toBe(201);
    const v = await h.db.query('SELECT reference_volunteer_id FROM volunteers WHERE user_id = $1', [
      ok.body.data.id,
    ]);
    expect(v.rows[0].reference_volunteer_id).toBe(mainId);
  });

  it('refuses an expired draft (410), a missing token and another draft token (401)', async () => {
    const a = await verifiedDraft(h);
    const b = await verifiedDraft(h);
    expect((await submit(undefined, volunteerForm(a))).status).toBe(401);
    expect((await submit(b.token, volunteerForm(a))).status).toBe(401);
    await h.db.query(
      `UPDATE registration_drafts SET expires_at = now() - interval '1 minute' WHERE id = $1`,
      [a.registrationId],
    );
    expect((await submit(a.token, volunteerForm(a))).status).toBe(410);
  });

  it('a rejected, never-approved volunteer registers again and returns to pending', async () => {
    const d = await verifiedDraft(h);
    const first = await submit(d.token, volunteerForm(d, { name: 'প্রথম নাম' }));
    const userId = first.body.data.id as string;
    await h.db.query(
      `UPDATE users SET state = 'deactivated', deactivated_at = now() WHERE id = $1`,
      [userId],
    );
    // the same person starts again with the same mobile and email
    const again = await verifyContacts(h, { mobile: d.mobile, email: d.email });
    const registrationId = again.registrationId;
    expect(again.res.status).toBe(200);
    const res = await submit(
      again.token,
      volunteerForm({ registrationId }, { name: 'দ্বিতীয় নাম' }),
    );
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(userId);
    const user = (
      await h.db.query('SELECT state, display_name, deactivated_at FROM users WHERE id = $1', [
        userId,
      ])
    ).rows[0];
    expect(user).toEqual({ state: 'pending', display_name: 'দ্বিতীয় নাম', deactivated_at: null });
    expect(
      (await h.db.query('SELECT 1 FROM volunteers WHERE user_id = $1', [userId])).rowCount,
    ).toBe(1);
    const audit = (
      await h.db.query(
        `SELECT old, new FROM audit_log WHERE action = 'auth.registered' AND entity_id = $1 ORDER BY created_at`,
        [userId],
      )
    ).rows;
    expect(audit).toHaveLength(2);
    expect(audit[1].old).toMatchObject({ state: 'deactivated', displayName: 'প্রথম নাম' });
  });
});

describe('submit refusals', () => {
  /** Starts and verifies a draft for given contacts (the helper makes fresh ones). */
  const verifyFor = (mobile: string, email: string, kind: 'volunteer' | 'staff' = 'volunteer') =>
    verifyContacts(h, { mobile, email }, kind);

  it('answers 409 when the mobile became an account after verification, and changes nothing', async () => {
    const d = await verifiedDraft(h);
    const other = await account(h.db, { kind: 'volunteer', state: 'pending' });
    await h.db.query('UPDATE users SET mobile = $1 WHERE id = $2', [d.mobile, other.id]);
    const res = await submit(d.token, volunteerForm(d));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('registration.account_exists');
    const users = await h.db.query('SELECT id FROM users WHERE mobile = $1', [d.mobile]);
    expect(users.rows).toEqual([{ id: other.id }]);
  });

  it('reports a rejected account of the other kind at verification', async () => {
    const rejected = await account(h.db, { kind: 'volunteer', state: 'deactivated' });
    await f.volunteer(h.db, loc, rejected.id);
    const { res } = await verifyFor(
      rejected.mobile,
      `kind${randomUUID().slice(0, 8)}@example.org`,
      'staff',
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('registration.account_exists');
  });

  it('refuses an unknown program or division for an official (422)', async () => {
    const d = await verifiedDraft(h, 'staff');
    const program = await submit(d.token, staffForm(d, { homeProgramId: randomUUID() }));
    expect(program.status).toBe(422);
    expect(program.body.error.details[0].path).toBe('homeProgramId');
    const division = await submit(d.token, staffForm(d, { homeDivisionId: loc.district }));
    expect(division.status).toBe(422);
    expect(division.body.error.details[0].path).toBe('homeDivisionId');
  });

  it('a team member reference to a closed volunteer is unknown, and every reference is counted', async () => {
    const closed = await account(h.db, { kind: 'volunteer', state: 'deactivated' });
    const closedNid = f.fakeNid();
    await f.volunteer(h.db, loc, closed.id, { nid: closedNid });
    const d = await verifiedDraft(h);
    const first = await submit(
      d.token,
      volunteerForm(d, { type: 'team_member', referenceNid: closedNid }),
    );
    expect(first.status).toBe(422);
    expect(first.body.error.details[0].path).toBe('referenceNid');
    for (let i = 0; i < 4; i += 1)
      expect(
        (
          await submit(
            d.token,
            volunteerForm(d, { type: 'team_member', referenceNid: f.fakeNid() }),
          )
        ).status,
      ).toBe(422);
    const lookups = await h.db.query(
      `SELECT count(*)::int AS n FROM audit_log WHERE action = 'auth.reference_lookup' AND entity_id = $1`,
      [d.registrationId],
    );
    expect(lookups.rows[0].n).toBe(5);
    const sixth = await submit(
      d.token,
      volunteerForm(d, { type: 'team_member', referenceNid: f.fakeNid() }),
    );
    expect(sixth.status).toBe(429);
  });

  it('stops a draft after 5 refused submits', async () => {
    const holder = await verifiedDraft(h);
    const nid = f.fakeNid();
    expect((await submit(holder.token, volunteerForm(holder, { nid }))).status).toBe(201);
    const d = await verifiedDraft(h);
    for (let i = 0; i < 5; i += 1)
      expect((await submit(d.token, volunteerForm(d, { nid }))).status).toBe(409);
    expect((await submit(d.token, volunteerForm(d))).status).toBe(429);
  });

  it("replaces a returning official's photo link instead of adding one", async () => {
    const d = await verifiedDraft(h, 'staff');
    const firstPhoto = (await photo(d, 'photo', jpeg(), 'image/jpeg')).body.data.fileId as string;
    const userId = (await submit(d.token, staffForm(d))).body.data.id as string;
    await h.db.query(`UPDATE users SET state = 'deactivated' WHERE id = $1`, [userId]);
    const again = await verifyFor(d.mobile, d.email, 'staff');
    expect(again.res.status).toBe(200);
    const draft = { ...d, registrationId: again.registrationId, token: again.token! };
    const secondPhoto = (await photo(draft, 'photo', png(), 'image/png')).body.data
      .fileId as string;
    expect((await submit(draft.token, staffForm(draft))).status).toBe(201);
    const links = await h.db.query(
      `SELECT file_id FROM file_links WHERE entity_type = 'user' AND entity_id = $1 AND slot = 'photo'`,
      [userId],
    );
    expect(links.rows).toEqual([{ file_id: secondPhoto }]);
    // the earlier photo stays with the earlier submitted registration (BD-46)
    expect((await h.db.query('SELECT 1 FROM files WHERE id = $1', [firstPhoto])).rowCount).toBe(1);
  });
});

describe('the pending account', () => {
  async function pendingVolunteer() {
    const d = await verifiedDraft(h);
    const form = volunteerForm(d);
    const res = await submit(d.token, form);
    return { d, form, userId: res.body.data.id as string };
  }

  it('logs in, reads the own profile with the full NID and bank details, and nothing else', async () => {
    const { d, form, userId } = await pendingVolunteer();
    const s = await login(h, d.mobile);
    const me = await request(h.server()).get('/api/v1/volunteers/me').set(bearer(s));
    expect(me.status).toBe(200);
    expect(me.body.data).toMatchObject({
      userId,
      state: 'pending',
      displayName: form.name,
      mobile: d.mobile,
      email: d.email,
      inAnyProject: false,
      nid: form.nid,
      bank: { bankName: 'Test Bank', accountName: 'নমুনা', accountNumber: '0000111122223333' },
      divisionId: loc.division,
    });
    expect(me.body.data).toHaveProperty('nidPhotoBackFileId', null);
    expect(me.body.data).not.toHaveProperty('category');
    const users = await request(h.server()).get('/api/v1/users').set(bearer(s));
    expect(users.status).toBe(403);
    expect(users.body.error.code).toBe('auth.account_pending');
  });

  it('another volunteer reads only their own profile', async () => {
    const a = await pendingVolunteer();
    const b = await pendingVolunteer();
    const s = await login(h, b.d.mobile);
    const me = await request(h.server()).get('/api/v1/volunteers/me').set(bearer(s));
    expect(me.body.data.userId).toBe(b.userId);
    expect(JSON.stringify(me.body)).not.toContain(a.form.nid);
  });

  it('/volunteers/me needs a login', async () => {
    const res = await request(h.server()).get('/api/v1/volunteers/me');
    expect(res.status).toBe(401);
    expect(res.body.data).toBeUndefined();
  });

  it('an official without a volunteer profile gets 404 on /volunteers/me', async () => {
    const official = await account(h.db, { role: 'program_manager' });
    const s = await login(h, official);
    expect((await request(h.server()).get('/api/v1/volunteers/me').set(bearer(s))).status).toBe(
      404,
    );
  });
});

describe('unknown draft', () => {
  it('answers 401 for a draft id nobody verified', async () => {
    const d = { registrationId: randomUUID() };
    expect((await submit('x'.repeat(43), volunteerForm(d))).status).toBe(401);
  });
});
