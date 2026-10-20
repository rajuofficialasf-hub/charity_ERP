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
  divisionId: loc.division,
  districtId: loc.district,
  upazilaId: loc.upazila,
  unionId: loc.union,
  whatsapp: f.fakeMobile(),
  profession: 'student',
  ...over,
});

const staffForm = (d: Pick<Draft, 'registrationId'>, over: Record<string, unknown> = {}) => ({
  kind: 'staff',
  registrationId: d.registrationId,
  password: PASSWORD,
  name: 'নমুনা কর্মকর্তা',
  designation: 'Project Officer',
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
    // the account keeps the language the person registered in (here the request default)
    expect(user).toMatchObject({
      mobile: d.mobile,
      email: d.email,
      state: 'pending',
      language: 'bn',
    });
    expect(user.password_hash).toMatch(/^\$argon2id\$/);
    const v = (await h.db.query('SELECT * FROM volunteers WHERE user_id = $1', [userId])).rows[0];
    expect(v).toMatchObject({
      nid: form.nid,
      type: 'general',
      father_name: form.fatherName,
      union_id: loc.union,
      bank_account_number: null,
      reference_volunteer_id: null,
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

  it('refuses the submit of a staff draft left open from before and creates nothing (D-097)', async () => {
    const d = await verifiedDraft(h, 'staff');
    const res = await submit(d.token, staffForm(d));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('registration.staff_by_invitation');
    expect((await h.db.query('SELECT 1 FROM users WHERE email = $1', [d.email])).rowCount).toBe(0);
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
      code: 'validation.password_uppercase_digit',
    });
  });

  it('keeps the language the person registered in', async () => {
    const d = await verifiedDraft(h);
    await photo(d, 'photo', jpeg(), 'image/jpeg');
    await photo(d, 'nid_photo', png(), 'image/png');
    await photo(d, 'nid_photo_back', jpeg(), 'image/jpeg');
    const res = await request(h.server())
      .post('/api/v1/auth/register/submit')
      .set(TOKEN_HEADER, d.token)
      .set('Accept-Language', 'en')
      .send(volunteerForm(d));
    expect(res.status).toBe(201);
    const { rows } = await h.db.query('SELECT language FROM users WHERE id = $1', [
      res.body.data.id,
    ]);
    expect(rows[0].language).toBe('en');
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

  it('takes a password with the own mobile number or email in it, and names the rule of a refused one', async () => {
    const d = await verifiedDraft(h);
    const weak = await submit(d.token, volunteerForm(d, { password: `a${d.mobile}` }));
    expect(weak.status).toBe(422);
    expect(weak.body.error.details[0]).toMatchObject({
      path: 'password',
      code: 'validation.password_uppercase_digit',
    });
    const short = await submit(d.token, volunteerForm(d, { password: 'Ab1' }));
    expect(short.body.error.details[0].code).toBe('validation.password_too_short');
    const ok = await submit(d.token, volunteerForm(d, { password: `A${d.mobile}` }));
    expect(ok.status).toBe(201);
    const other = await verifiedDraft(h);
    const withEmail = await submit(
      other.token,
      volunteerForm(other, { password: `${other.email.split('@')[0]!.replace(/^./, 'R')}1` }),
    );
    expect(withEmail.status).toBe(201);
  });

  it('refuses the fields the owner removed: type, reference, bank, program and workplace', async () => {
    const d = await verifiedDraft(h);
    for (const extra of [
      { type: 'paid' },
      { type: 'general' },
      { referenceNid: f.fakeNid() },
      { bank: { bankName: 'Test Bank' } },
    ])
      expect((await submit(d.token, volunteerForm(d, extra))).status).toBe(422);
    const staff = await verifiedDraft(h, 'staff');
    for (const extra of [{ homeProgramId: programId }, { homeDivisionId: loc.division }])
      expect((await submit(staff.token, staffForm(staff, extra))).status).toBe(422);
    // nothing was created
    expect((await h.db.query('SELECT 1 FROM users WHERE mobile = $1', [d.mobile])).rowCount).toBe(
      0,
    );
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
    // the earlier form held a bank account, a reference, a home program and the new personal data;
    // none of it may survive
    await h.db.query(
      `UPDATE volunteers SET bank_name = 'Old Bank', bank_account_number = '999', bank_branch_name = 'Old', reference_nid = $2,
              blood_group = 'A+', date_of_birth = '1980-01-01', tshirt_size = 'XL', volunteering_area = 'anywhere',
              profession = 'imam', profession_details = '{"mosqueName":"Old"}', interest_areas = '["media"]',
              vehicle = 'bicycle', can_swim = true, availability = 'anytime',
              emergency_full_time = true, education_details = '{"institutionName":"Old"}',
              permanent_address = '{"addressLine":"Old"}', facebook_id = 'https://www.facebook.com/old'
        WHERE user_id = $1`,
      [userId, f.fakeNid()],
    );
    await h.db.query('UPDATE users SET home_program_id = $2 WHERE id = $1', [userId, programId]);
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
    const cleared = (
      await h.db.query(
        `SELECT v.bank_name, v.bank_account_number, v.bank_branch_name, v.reference_nid, v.type, u.home_program_id,
                v.blood_group, v.date_of_birth, v.tshirt_size, v.volunteering_area, v.profession,
                v.profession_details, v.interest_areas, v.vehicle, v.can_swim, v.availability,
                v.emergency_full_time, v.education_details, v.permanent_address, v.facebook_id
           FROM volunteers v JOIN users u ON u.id = v.user_id WHERE u.id = $1`,
        [userId],
      )
    ).rows[0];
    expect(cleared).toEqual({
      bank_name: null,
      bank_account_number: null,
      bank_branch_name: null,
      reference_nid: null,
      type: 'general',
      home_program_id: null,
      blood_group: null,
      date_of_birth: null,
      tshirt_size: null,
      volunteering_area: null,
      // the second form chose a student again, with no details
      profession: 'student',
      profession_details: {},
      interest_areas: [],
      vehicle: null,
      can_swim: null,
      availability: null,
      emergency_full_time: null,
      education_details: {},
      permanent_address: null,
      facebook_id: null,
    });
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

describe('the personal, profession, education and address data', () => {
  // the locations exist only after the setup has run, so the data are built when a test asks
  const place = () => ({
    divisionId: loc.division,
    districtId: loc.district,
    upazilaId: loc.upazila,
    unionId: loc.union,
  });
  const full = () => ({
    dateOfBirth: '1990-05-17',
    bloodGroup: 'O+',
    tshirtSize: 'L',
    volunteeringArea: 'own_upazila',
    profession: 'teacher',
    professionDetails: {
      institutionType: 'madrasa',
      institutionNameAddress: 'নমুনা মাদ্রাসা, সাভার',
      designation: 'মুদাররিস',
    },
    interestAreas: ['field_relief', 'first_aid'],
    vehicle: 'motorcycle',
    canSwim: true,
    availability: 'on_call',
    emergencyFullTime: true,
    facebookId: 'https://www.facebook.com/nomuna.name',
    educationDetails: {
      highestQualification: 'masters',
      institutionName: 'নমুনা বিশ্ববিদ্যালয়',
      subject: 'ইতিহাস',
      passingYear: 2018,
      result: 'CGPA 3.80',
      status: 'completed',
    },
    permanentAddress: { ...place(), addressLine: 'নমুনা গ্রাম' },
  });
  const columnsOf = async (userId: string) =>
    (
      await h.db.query(
        `SELECT to_char(date_of_birth, 'YYYY-MM-DD') AS dob, blood_group, tshirt_size, volunteering_area,
                profession, profession_details, interest_areas, vehicle, can_swim, availability,
                emergency_full_time, facebook_id, education_details, permanent_address
           FROM volunteers WHERE user_id = $1`,
        [userId],
      )
    ).rows[0];

  it('stores every new field, the profession details as one object', async () => {
    const d = await verifiedDraft(h);
    const res = await submit(d.token, volunteerForm(d, full()));
    expect(res.status).toBe(201);
    expect(await columnsOf(res.body.data.id)).toEqual({
      dob: '1990-05-17',
      blood_group: 'O+',
      tshirt_size: 'L',
      volunteering_area: 'own_upazila',
      profession: 'teacher',
      profession_details: full().professionDetails,
      interest_areas: ['field_relief', 'first_aid'],
      vehicle: 'motorcycle',
      can_swim: true,
      availability: 'on_call',
      emergency_full_time: true,
      facebook_id: 'https://www.facebook.com/nomuna.name',
      education_details: full().educationDetails,
      permanent_address: full().permanentAddress,
    });
  });

  it('accepts the minimum: only the profession, nothing else of the new data', async () => {
    const d = await verifiedDraft(h);
    const res = await submit(d.token, volunteerForm(d));
    expect(res.status).toBe(201);
    expect(await columnsOf(res.body.data.id)).toEqual({
      dob: null,
      blood_group: null,
      tshirt_size: null,
      volunteering_area: null,
      profession: 'student',
      profession_details: {},
      interest_areas: [],
      vehicle: null,
      can_swim: null,
      availability: null,
      emergency_full_time: null,
      facebook_id: null,
      education_details: {},
      permanent_address: null,
    });
  });

  it('refuses a detail of another profession, a missing profession and a bad value, and creates nothing', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [
        { profession: 'student', professionDetails: { designation: 'প্রভাষক' } },
        'professionDetails',
      ],
      [{ profession: 'constructor' }, 'profession'],
      [{ profession: undefined }, 'profession'],
      [{ bloodGroup: 'Z+' }, 'bloodGroup'],
      [{ dateOfBirth: '2999-01-01' }, 'dateOfBirth'],
      [{ facebookId: 'nomuna.name' }, 'facebookId'],
      [{ facebookId: 'https://facebook.com@evil.example/x' }, 'facebookId'],
      [
        { educationDetails: { highestQualification: 'everything' } },
        'educationDetails.highestQualification',
      ],
      [{ educationDetails: { grade: 'A' } }, 'educationDetails.grade'],
      [
        { permanentAddress: { ...place(), districtId: loc.upazila } },
        'permanentAddress.districtId',
      ],
      [{ interestAreas: ['media', 'media'] }, 'interestAreas'],
      // no longer asked: covered by the profession (O-65), the education section or dropped (O-66)
      [{ experience: 'পুরনো ফিল্ড' }, 'experience'],
      [{ education: 'স্নাতক' }, 'education'],
      [{ previousProjects: 'আগের প্রজেক্ট' }, 'previousProjects'],
      [{ emergencyContact: { name: 'অভিভাবক' } }, 'emergencyContact'],
    ];
    for (const [over, path] of cases) {
      const d = await verifiedDraft(h);
      const res = await submit(d.token, volunteerForm(d, over));
      expect(res.status, JSON.stringify(over)).toBe(422);
      expect(
        res.body.error.details.map((x: { path: string }) => x.path),
        JSON.stringify(over),
      ).toContain(path);
      const users = await h.db.query('SELECT 1 FROM users WHERE mobile = $1', [d.mobile]);
      expect(users.rowCount, JSON.stringify(over)).toBe(0);
    }
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

  it('stops a draft after 5 refused submits', async () => {
    const holder = await verifiedDraft(h);
    const nid = f.fakeNid();
    expect((await submit(holder.token, volunteerForm(holder, { nid }))).status).toBe(201);
    const d = await verifiedDraft(h);
    for (let i = 0; i < 5; i += 1)
      expect((await submit(d.token, volunteerForm(d, { nid }))).status).toBe(409);
    expect((await submit(d.token, volunteerForm(d))).status).toBe(429);
  });
});

describe('the pending account', () => {
  async function pendingVolunteer() {
    const d = await verifiedDraft(h);
    const form = volunteerForm(d);
    const res = await submit(d.token, form);
    return { d, form, userId: res.body.data.id as string };
  }

  it('logs in, reads the own profile with the full NID and no bank details yet, and nothing else', async () => {
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
      type: 'general',
      bank: {},
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
