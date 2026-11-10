import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SeedContext } from '../../seed/context';
import { seedReferenceLists } from '../../seed/sets/base/reference-lists';
import { seedWorkflows } from '../../seed/sets/base/workflows';
import { accessWorld } from './support/access-fixtures';
import {
  applicationProject,
  applicationRow,
  IDENTITY_ANSWERS,
  statusOf,
} from './support/applications';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  PASSWORD,
  type Session,
} from './support/auth-app';
import { beneficiary, fakeMobile, fakeNid, insert, volunteer } from './support/fixtures';

// The application service: a volunteer, a team member or an official creates a draft on the
// project's form with the person resolved from the identity number, edits it with If-Match,
// deletes it and lists what the scope reaches; the office sees the public entries with their
// flags, and a decision's office reason never reaches the volunteer.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
const at = (s: Session, method: 'get' | 'post' | 'patch', path: string) =>
  api()[method](`/api/v1${path}`).set(bearer(s));

let project: string;
let versionId: string;
let generalVolunteer: string;
let teamVolunteer: string;
let rangpurVolunteer: string;

/** The answers of the fixture form as the request carries them. */
const toAnswers = (record: Record<string, unknown>) =>
  Object.entries(record).map(([fieldKey, value]) => ({ fieldKey, value }));
const identity = (nid = fakeNid(), mobile = fakeMobile()) =>
  toAnswers(IDENTITY_ANSWERS(nid, mobile, world.dhaka));
const createBody = (answers: unknown[], over: Record<string, unknown> = {}) => ({
  clientUuid: randomUUID(),
  projectId: project,
  formVersionId: versionId,
  answers,
  ...over,
});
const create = async (s: Session, body: Record<string, unknown>) =>
  at(s, 'post', `/projects/${project}/applications`).send(body);
const answerOf = (
  body: { data: { answers: { fieldKey: string; value: unknown }[] } },
  key: string,
) => body.data.answers.find((a) => a.fieldKey === key)?.value;
/** A workflow action with the version the caller last read, as the screen sends it. */
const act = async (s: Session, id: string, action: string, body: Record<string, unknown> = {}) => {
  const read = await at(s, 'get', `/applications/${id}`);
  return at(s, 'post', `/applications/${id}/actions/${action}`)
    .set('If-Match', (read.headers.etag as string | undefined) ?? '"none"')
    .send(body);
};

beforeAll(async () => {
  h = await authHarness();
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
  const ctx = new SeedContext(h.container.prisma);
  await seedWorkflows(ctx);
  await seedReferenceLists(ctx);
  // a gender code the form offers when it is published and the list later loses, as an older form
  // version's own option codes are missing from the list
  await h.db.query(
    `INSERT INTO reference_lists (id, list_key, code, label_bn, label_en) VALUES ($1, 'gender', 'retired_code', 'পুরনো', 'Old')`,
    [randomUUID()],
  );
  await volunteer(h.db, world.dhaka, world.users.team, { type: 'team_member' });
  const made = await at(await as(world.users.pm), 'post', '/projects').send({
    programId: world.a1.program,
    code: 'APP',
    year: 2026,
    name: { bn: 'আবেদন', en: 'Applications' },
    source: { kind: 'workflow', workflowKey: 'distribution' },
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  project = made.body.data.id as string;
  ({ versionId } = await applicationProject(h, await as(world.users.monitoring), project, {
    limit: 3,
  }));
  const volunteers = await h.db.query<{ id: string; user_id: string }>(
    'SELECT id, user_id FROM volunteers WHERE user_id = ANY($1::uuid[])',
    [[world.users.general, world.users.team, world.users.rangpurVolunteer]],
  );
  const volunteerOf = (userId: string) => volunteers.rows.find((v) => v.user_id === userId)!.id;
  generalVolunteer = volunteerOf(world.users.general);
  teamVolunteer = volunteerOf(world.users.team);
  rangpurVolunteer = volunteerOf(world.users.rangpurVolunteer);
  // the Dhaka RPM and executive on the project's Dhaka area; two volunteers with consent, each
  // in their region; the team member under the general volunteer
  await h.db.query(
    `INSERT INTO project_areas (id, project_id, location_id, rpm_user_id) VALUES ($1, $2, $3, $4)`,
    [randomUUID(), project, world.dhaka.division, world.users.rpmDhaka],
  );
  await h.db.query(
    `INSERT INTO project_staff (id, project_id, user_id, role_key, area_location_id, extra_permissions, granted_by)
     VALUES ($1, $2, $3, 'project_executive', $4, '{}', $5)`,
    [randomUUID(), project, world.users.executive, world.dhaka.division, world.users.rpmDhaka],
  );
  for (const [volunteerId, region] of [
    [generalVolunteer, world.dhaka.division],
    [rangpurVolunteer, world.rangpur.division],
  ] as const)
    await h.db.query(
      `INSERT INTO project_volunteers (id, project_id, volunteer_id, region_location_id, permission_set, extra_permissions, assigned_by, consent_status)
       VALUES ($1, $2, $3, $4, 'application_distribution', '{}', $5, 'accepted')`,
      [randomUUID(), project, volunteerId, region, world.users.rpmDhaka],
    );
  await h.db.query(
    `INSERT INTO volunteer_teams (id, project_id, lead_volunteer_id, member_volunteer_id, consent_status, consent_at, created_by)
     VALUES ($1, $2, $3, $4, 'accepted', now(), $5)`,
    [randomUUID(), project, generalVolunteer, teamVolunteer, world.users.general],
  );
});
afterAll(async () => h.close());

describe('creating a draft', () => {
  it('creates a draft for a person the lookup does not find, with an ETag, and replays the same client id', async () => {
    const s = await as(world.users.general);
    const body = createBody(identity());
    const made = await create(s, body);
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    expect(made.headers.etag).toBeDefined();
    expect(made.body.data).toMatchObject({
      projectId: project,
      status: 'draft',
      appNo: null,
      beneficiaryId: null,
      ownerVolunteerId: generalVolunteer,
      flags: [],
    });
    expect(made.body.data.availableActions).toEqual(expect.arrayContaining(['submit', 'delete']));
    const again = await create(s, body);
    expect(again.status).toBe(200);
    expect(again.headers['idempotent-replay']).toBe('true');
    expect(again.body.data.id).toBe(made.body.data.id);
    const audit = await h.db.query(
      `SELECT action FROM audit_log WHERE entity_type = 'application' AND entity_id = $1`,
      [made.body.data.id],
    );
    expect(audit.rows.map((r) => r.action)).toEqual(['application.create']);
  });

  it('binds a known person by the number and locks the identity answers to the profile, whatever beneficiaryId the client sends', async () => {
    const nid = fakeNid();
    const person = await beneficiary(h.db, world.dhaka, { nid, name: 'আসল নাম' });
    const other = await beneficiary(h.db, world.dhaka);
    const s = await as(world.users.general);
    const made = await create(
      s,
      createBody(
        toAnswers({
          ...IDENTITY_ANSWERS(nid, fakeMobile(), world.dhaka),
          q_name: { t: 'short_text', v: 'অন্য নাম' },
        }),
        { beneficiaryId: other },
      ),
    );
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    expect(made.body.data.beneficiaryId).toBe(person);
    expect(made.body.data.identityKind).toBe('nid');
    expect(answerOf(made.body, 'q_name')).toEqual({ t: 'short_text', v: 'আসল নাম' });
    // one application per person per project
    const second = await create(s, createBody(identity(nid)));
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('beneficiary.already_applied');
  });

  it('refuses a blocked person, the volunteer’s own mobile and a second draft for the same new number', async () => {
    const s = await as(world.users.general);
    const blockedNid = fakeNid();
    await beneficiary(h.db, world.dhaka, { nid: blockedNid, is_blocked: true });
    const blocked = await create(s, createBody(identity(blockedNid)));
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('beneficiary.blocked');
    const own = await create(
      s,
      createBody(identity(fakeNid(), accounts.get(world.users.general)!.mobile)),
    );
    expect(own.status).toBe(409);
    expect(own.body.error.code).toBe('beneficiary.mobile_is_volunteer_mobile');
    const nid = fakeNid();
    expect((await create(s, createBody(identity(nid)))).status).toBe(201);
    const twice = await create(s, createBody(identity(nid)));
    expect(twice.status).toBe(409);
    expect(twice.body.error.code).toBe('application.number_in_project');
  });

  it('refuses a draft without the address, beyond the limit and outside the window', async () => {
    const s = await as(world.users.general);
    const answers = identity().filter((a) => a.fieldKey !== 'q_address');
    const noAddress = await create(s, createBody(answers));
    expect(noAddress.status).toBe(422);
    expect(noAddress.body.error.details[0].code).toBe('validation.address_incomplete');
    await h.db.query(`UPDATE projects SET per_volunteer_limit = 1 WHERE id = $1`, [project]);
    try {
      const over = await create(s, createBody(identity()));
      expect(over.status).toBe(409);
      expect(over.body.error.code).toBe('workflow.guard.limit_not_exceeded');
    } finally {
      await h.db.query(`UPDATE projects SET per_volunteer_limit = 50 WHERE id = $1`, [project]);
    }
    await h.db.query(`UPDATE projects SET apply_to = '2026-01-02' WHERE id = $1`, [project]);
    try {
      const late = await create(s, createBody(identity()));
      expect(late.status).toBe(409);
      expect(late.body.error.code).toBe('workflow.guard.deadline_open');
    } finally {
      await h.db.query(`UPDATE projects SET apply_to = '2099-12-31' WHERE id = $1`, [project]);
    }
  });

  it('takes applications again once the PM extends a closed window with a reason', async () => {
    const s = await as(world.users.general);
    const pm = await as(world.users.pm);
    await h.db.query(`UPDATE projects SET apply_to = '2026-01-02' WHERE id = $1`, [project]);
    try {
      const late = await create(s, createBody(identity()));
      expect(late.status).toBe(409);
      expect(late.body.error.code).toBe('workflow.guard.deadline_open');
      const read = await at(pm, 'get', `/projects/${project}`);
      const extended = await at(pm, 'post', `/projects/${project}/extend-deadline`)
        .set('If-Match', read.headers.etag as string)
        .send({ newApplyTo: '2099-12-31', reason: 'শীত বেশি, আরও আবেদন আসছে' });
      expect(extended.status, JSON.stringify(extended.body)).toBe(200);
      const again = await create(s, createBody(identity()));
      expect(again.status, JSON.stringify(again.body)).toBe(201);
      await at(s, 'post', `/applications/${again.body.data.id}/actions/delete`)
        .set('If-Match', again.headers.etag as string)
        .send({});
    } finally {
      await h.db.query(`UPDATE projects SET apply_to = '2099-12-31' WHERE id = $1`, [project]);
    }
  });

  it('refuses a new draft from a blocked volunteer, whose session ends with the block', async () => {
    const s = await as(world.users.general);
    const block = randomUUID();
    await h.db.query(
      `INSERT INTO blocklist (id, subject_type, subject_id, reason, blocked_by) VALUES ($1, 'volunteer', $2, 'test', $3)`,
      [block, generalVolunteer, world.users.rpmDhaka],
    );
    try {
      const blocked = await create(s, createBody(identity()));
      expect(blocked.status, JSON.stringify(blocked.body)).toBe(401);
      expect(blocked.body.error.code).toBe('auth.token_stale');
      const fresh = await api()
        .post('/api/v1/auth/login')
        .send({
          loginId: accounts.get(world.users.general)!.loginId,
          password: PASSWORD,
          device: { name: 'Test device', platform: 'android', appVersion: '1.0.0' },
        });
      expect(fresh.status, JSON.stringify(fresh.body)).toBe(403);
      expect(fresh.body.error.code).toBe('auth.account_blocked');
    } finally {
      await h.db.query(
        `UPDATE blocklist SET active = false, released_by = $2, released_at = now(), release_reason = 'test' WHERE id = $1`,
        [block, world.users.rpmDhaka],
      );
    }
  });

  it('refuses a photo another user uploaded, and takes the caller’s own', async () => {
    const s = await as(world.users.general);
    const file = async (uploadedBy: string) =>
      insert(h.db, 'files', {
        id: randomUUID(),
        bucket: 'photos',
        object_key: `test/${randomUUID()}`,
        kind: 'form_photo',
        mime: 'image/jpeg',
        size_bytes: 1000,
        sha256: 'a'.repeat(64),
        project_id: project,
        uploaded_by: uploadedBy,
        source: 'gallery',
      });
    const theirs = await file(world.users.rangpurVolunteer);
    const refused = await create(
      s,
      createBody([...identity(), { fieldKey: 'q_photo', value: { t: 'photo', v: [theirs] } }]),
    );
    expect(refused.status).toBe(422);
    expect(refused.body.error.details).toMatchObject([
      { path: 'q_photo', code: 'application.upload_not_own' },
    ]);
    const mine = await file(world.users.general);
    const taken = await create(
      s,
      createBody([...identity(), { fieldKey: 'q_photo', value: { t: 'photo', v: [mine] } }]),
    );
    expect(taken.status, JSON.stringify(taken.body)).toBe(201);
    expect(answerOf(taken.body, 'q_photo')).toEqual({ t: 'photo', v: [mine] });
  });
});

describe('sending an answer that is no longer in its list', () => {
  it('names the question and the way out, and makes no profile', async () => {
    const s = await as(world.users.general);
    const nid = fakeNid();
    const answers = identity(nid).map((a: { fieldKey: string; value: unknown }) =>
      a.fieldKey === 'q_gender' ? { ...a, value: { t: 'single_select', v: 'retired_code' } } : a,
    );
    const made = await create(s, createBody(answers));
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const id = made.body.data.id as string;
    await h.db.query(
      `DELETE FROM reference_lists WHERE list_key = 'gender' AND code = 'retired_code'`,
    );

    const bn = await act(s, id, 'submit');
    expect(bn.status, JSON.stringify(bn.body)).toBe(422);
    expect(bn.body.error).toMatchObject({
      code: 'application.answer_not_in_list',
      params: { question: 'প্রশ্ন' },
      details: [{ path: 'answers.q_gender', code: 'validation.option_unknown' }],
    });
    expect(bn.body.error.message).toContain('প্রশ্ন');
    const read = await at(s, 'get', `/applications/${id}`);
    const en = await at(s, 'post', `/applications/${id}/actions/submit`)
      .set('If-Match', read.headers.etag as string)
      .set('Accept-Language', 'en')
      .send({});
    expect(en.body.error.params).toEqual({ question: 'Question' });
    expect(en.body.error.message).toContain('Question');

    const profile = await h.db.query('SELECT 1 FROM beneficiaries WHERE nid = $1', [nid]);
    expect(profile.rowCount).toBe(0);
    expect(await statusOf(h.db, id)).toBe('draft');
  });
});

describe('reading, editing and deleting', () => {
  it('edits with If-Match, refuses a stale one, and hides the draft from another volunteer', async () => {
    const s = await as(world.users.general);
    const made = await create(s, createBody(identity()));
    expect(made.status).toBe(201);
    const id = made.body.data.id as string;
    const etag = made.headers.etag as string;
    const edited = await at(s, 'patch', `/applications/${id}`)
      .set('If-Match', etag)
      .send({
        answers: toAnswers({
          ...IDENTITY_ANSWERS(fakeNid(), fakeMobile(), world.dhaka),
          q_village: { t: 'short_text', v: 'নতুন গ্রাম' },
        }),
      });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    expect(answerOf(edited.body, 'q_village')).toEqual({ t: 'short_text', v: 'নতুন গ্রাম' });
    const stale = await at(s, 'patch', `/applications/${id}`)
      .set('If-Match', etag)
      .send({ answers: identity() });
    expect(stale.status).toBe(412);
    const read = await at(s, 'get', `/applications/${id}`);
    expect(read.status).toBe(200);
    expect(read.headers.etag).not.toBe(etag);
    const other = await as(world.users.rangpurVolunteer);
    expect((await at(other, 'get', `/applications/${id}`)).status).toBe(404);
    expect(
      (await at(other, 'patch', `/applications/${id}`).set('If-Match', etag).send({ answers: [] }))
        .status,
    ).toBe(404);
  });

  it('lets a team member create a draft under the lead, read it, but neither submit nor delete it', async () => {
    const member = await as(world.users.team);
    const made = await create(member, createBody(identity()));
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    expect(made.body.data.ownerVolunteerId).toBe(generalVolunteer);
    expect(made.body.data.availableActions).toEqual([]);
    const id = made.body.data.id as string;
    expect((await at(member, 'get', `/applications/${id}`)).status).toBe(200);
    const submit = await act(member, id, 'submit');
    expect(submit.status).toBe(403);
    expect(submit.body.error.code).toBe('permission.denied');
    expect((await act(member, id, 'delete')).status).toBe(403);
    // the lead reads and deletes it
    const lead = await as(world.users.general);
    const read = await at(lead, 'get', `/applications/${id}`);
    expect(read.status).toBe(200);
    expect(read.body.data.availableActions).toEqual(expect.arrayContaining(['submit', 'delete']));
    // without the version the caller saw, nothing moves
    expect((await at(lead, 'post', `/applications/${id}/actions/delete`).send({})).status).toBe(
      412,
    );
    const deleted = await act(lead, id, 'delete');
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(200);
    expect(deleted.body.data.status).toBe('deleted');
    expect((await at(lead, 'get', `/applications/${id}`)).body.data.status).toBe('deleted');
  });

  it('shows the official section to the office only, and the family warning at review', async () => {
    const mobile = fakeMobile();
    const first = await beneficiary(h.db, world.dhaka, { mobile });
    await applicationRow(h.db, {
      projectId: project,
      versionId,
      loc: world.dhaka,
      status: 'submitted',
      beneficiaryId: first,
      ownerVolunteerId: rangpurVolunteer,
    });
    const nid = fakeNid();
    await beneficiary(h.db, world.dhaka, { nid, mobile });
    const s = await as(world.users.general);
    const made = await create(s, createBody(identity(nid, mobile)));
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const id = made.body.data.id as string;
    const mine = await at(s, 'get', `/applications/${id}`);
    expect(mine.body.data.familyDuplicateWarnings).toEqual([]);
    expect(mine.body.data.answers.map((a: { fieldKey: string }) => a.fieldKey)).not.toContain(
      'q_official',
    );
    const rpm = await as(world.users.rpmDhaka);
    const theirs = await at(rpm, 'get', `/applications/${id}`);
    expect(theirs.status).toBe(200);
    // every fixture person shares the village and the father's name, so other matches may join
    expect(theirs.body.data.familyDuplicateWarnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          beneficiaryId: first,
          matchedOn: expect.arrayContaining(['mobile']),
        }),
      ]),
    );
    // the official writes the official section; the volunteer never reads it back
    const edited = await at(rpm, 'patch', `/applications/${id}`)
      .set('If-Match', theirs.headers.etag as string)
      .send({
        answers: [
          ...identity(nid, mobile),
          { fieldKey: 'q_official', value: { t: 'short_text', v: 'অফিসের নোট' } },
        ],
      });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    expect(answerOf(edited.body, 'q_official')).toEqual({ t: 'short_text', v: 'অফিসের নোট' });
    const after = await at(s, 'get', `/applications/${id}`);
    expect(after.body.data.answers.map((a: { fieldKey: string }) => a.fieldKey)).not.toContain(
      'q_official',
    );
    // under review, the official's edit is logged question by question: one answer added, one removed
    {
      const submitted = await act(s, id, 'submit');
      expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);
    }
    const reviewing = await act(rpm, id, 'review');
    expect(reviewing.status, JSON.stringify(reviewing.body)).toBe(200);
    const reviewed = await at(rpm, 'patch', `/applications/${id}`)
      .set('If-Match', reviewing.headers.etag as string)
      .send({
        answers: [
          ...identity(nid, mobile),
          { fieldKey: 'q_note', value: { t: 'long_text', v: 'পর্যালোচনার নোট' } },
        ],
      });
    expect(reviewed.status, JSON.stringify(reviewed.body)).toBe(200);
    const changes = await h.db.query<{ field: string; old_value: unknown; new_value: unknown }>(
      `SELECT field, old_value, new_value FROM field_changes WHERE entity_type = 'application' AND entity_id = $1 AND kind = 'review_edit' ORDER BY field`,
      [id],
    );
    expect(changes.rows).toEqual([
      { field: 'q_note', old_value: null, new_value: { t: 'long_text', v: 'পর্যালোচনার নোট' } },
      { field: 'q_official', old_value: { t: 'short_text', v: 'অফিসের নোট' }, new_value: null },
    ]);
    // the volunteer's edit is refused under review
    const volunteerEdit = await at(s, 'patch', `/applications/${id}`)
      .set('If-Match', reviewed.headers.etag as string)
      .send({ answers: identity(nid, mobile) });
    expect(volunteerEdit.status).toBe(403);
  });

  it('keeps the office reason of a rejection from the volunteer, who reads the message only', async () => {
    const s = await as(world.users.general);
    // a known person: a new one gets their profile at submission, which the cycle unit builds
    const nid = fakeNid();
    await beneficiary(h.db, world.dhaka, { nid });
    const made = await create(s, createBody(identity(nid)));
    const id = made.body.data.id as string;
    {
      const submitted = await act(s, id, 'submit');
      expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);
    }
    const executive = await as(world.users.executive);
    expect((await act(executive, id, 'review')).status).toBe(200);
    expect((await act(executive, id, 'send_for_approval')).status).toBe(200);
    // a volunteer holds no approval
    const approve = await act(s, id, 'approve');
    expect(approve.status).toBe(403);
    const rpm = await as(world.users.rpmDhaka);
    const rejected = await act(rpm, id, 'reject', {
      reason: 'আয় সীমার উপরে',
      message: 'এবার সম্ভব হলো না',
    });
    expect(rejected.status, JSON.stringify(rejected.body)).toBe(200);
    expect(rejected.body.data).toMatchObject({
      status: 'rejected',
      decisionComment: 'আয় সীমার উপরে',
      rejectionMessage: 'এবার সম্ভব হলো না',
    });
    const mine = await at(s, 'get', `/applications/${id}`);
    expect(mine.body.data.rejectionMessage).toBe('এবার সম্ভব হলো না');
    expect(mine.body.data).not.toHaveProperty('decisionComment');
    expect(JSON.stringify(mine.body)).not.toContain('আয় সীমার উপরে');
  });

  it('gives a paid volunteer of the project another volunteer’s application without the identity number, the mobile or the message', async () => {
    const paidAccount = await account(h.db, { kind: 'volunteer', role: 'volunteer_paid' });
    accounts.set(paidAccount.id, paidAccount);
    const paidVolunteer = await volunteer(h.db, world.dhaka, paidAccount.id, { type: 'paid' });
    await h.db.query(
      `INSERT INTO project_volunteers (id, project_id, volunteer_id, region_location_id, permission_set, extra_permissions, assigned_by, consent_status)
       VALUES ($1, $2, $3, $4, 'work_progress', '{}', $5, 'accepted')`,
      [randomUUID(), project, paidVolunteer, world.dhaka.division, world.users.rpmDhaka],
    );
    const s = await as(world.users.general);
    const nid = fakeNid();
    const mobile = fakeMobile();
    await beneficiary(h.db, world.dhaka, { nid });
    const made = await create(s, createBody(identity(nid, mobile)));
    const id = made.body.data.id as string;
    expect((await act(s, id, 'submit')).status).toBe(200);
    const executive = await as(world.users.executive);
    expect((await act(executive, id, 'review')).status).toBe(200);
    expect((await act(executive, id, 'send_for_approval')).status).toBe(200);
    const rpm = await as(world.users.rpmDhaka);
    const rejected = await act(rpm, id, 'reject', { reason: 'কারণ', message: 'এবার হলো না' });
    expect(rejected.status, JSON.stringify(rejected.body)).toBe(200);
    const theirs = await at(await as(paidAccount.id), 'get', `/applications/${id}`);
    expect(theirs.status, JSON.stringify(theirs.body)).toBe(200);
    expect(answerOf(theirs.body, 'q_id')).toBeUndefined();
    expect(answerOf(theirs.body, 'q_mobile')).toBeUndefined();
    expect(theirs.body.data.rejectionMessage).toBeNull();
    expect(JSON.stringify(theirs.body)).not.toContain(nid);
    expect(JSON.stringify(theirs.body)).not.toContain(mobile);
    // the volunteer who brought it and the office still read both
    const own = await at(s, 'get', `/applications/${id}`);
    expect(answerOf(own.body, 'q_id')).toMatchObject({ v: nid });
    expect(answerOf(own.body, 'q_mobile')).toMatchObject({ v: mobile });
    expect(own.body.data.rejectionMessage).toBe('এবার হলো না');
    const office = await at(rpm, 'get', `/applications/${id}`);
    expect(answerOf(office.body, 'q_id')).toMatchObject({ v: nid });
  });

  it('answers 404 by number for a draft, and for the record and the list to another region’s RPM', async () => {
    const s = await as(world.users.general);
    const made = await create(s, createBody(identity()));
    const id = made.body.data.id as string;
    const rpm = await as(world.users.rpmDhaka);
    expect((await at(rpm, 'get', '/application-numbers/APP-2026-99999')).status).toBe(404);
    const away = await as(world.users.rpmRangpur);
    expect((await at(away, 'get', `/applications/${id}`)).status).toBe(404);
    expect((await at(away, 'get', `/projects/${project}/applications`)).status).toBe(404);
    // the PM reads everything of the program
    const pm = await as(world.users.pm);
    expect((await at(pm, 'get', `/applications/${id}`)).status).toBe(200);
  });
});

describe('the form and the own list', () => {
  it('gives a volunteer the project form without its official section, and nothing off their projects', async () => {
    const s = await as(world.users.general);
    const form = await at(s, 'get', `/projects/${project}/application-form`);
    expect(form.status, JSON.stringify(form.body)).toBe(200);
    expect(form.body.data).toMatchObject({ id: versionId, status: 'published' });
    const keys = form.body.data.sections.flatMap((x: { fields: { fieldKey: string }[] }) =>
      x.fields.map((f) => f.fieldKey),
    );
    expect(keys).toContain('q_id');
    expect(keys).not.toContain('q_official');
    const rpm = await as(world.users.rpmDhaka);
    const office = await at(rpm, 'get', `/projects/${project}/application-form`);
    expect(office.body.data.sections).toHaveLength(2);
    const elsewhere = await as(world.users.daee);
    expect((await at(elsewhere, 'get', `/projects/${project}/application-form`)).status).toBe(404);
  });

  it('lists a volunteer’s own applications across their projects', async () => {
    const s = await as(world.users.general);
    const made = await create(s, createBody(identity()));
    const mine = await at(s, 'get', '/me/applications?status=draft');
    expect(mine.status, JSON.stringify(mine.body)).toBe(200);
    expect(mine.body.data.map((r: { id: string }) => r.id)).toContain(made.body.data.id);
    expect(
      mine.body.data.every(
        (r: { ownerVolunteerId: string }) => r.ownerVolunteerId === generalVolunteer,
      ),
    ).toBe(true);
    expect(mine.body.data[0]).toHaveProperty('etag');
    // an official's "own" list holds what they created, not the region's applications
    const rpm = await as(world.users.rpmDhaka);
    const theirs = await at(rpm, 'get', '/me/applications');
    expect(theirs.status).toBe(200);
    expect(
      (theirs.body.data as { createdByUserId?: string; id: string }[]).map((r) => r.id),
    ).not.toContain(made.body.data.id);
  });
});

describe('the list', () => {
  it('shows a volunteer their own, the office the public entries with their flags, and nothing to a blocked volunteer', async () => {
    const s = await as(world.users.general);
    const made = await create(s, createBody(identity()));
    const id = made.body.data.id as string;
    const mine = await at(s, 'get', `/projects/${project}/applications?include=total`);
    expect(mine.status, JSON.stringify(mine.body)).toBe(200);
    const ids = mine.body.data.map((r: { id: string }) => r.id);
    expect(ids).toContain(id);
    expect(
      mine.body.data.every(
        (r: { ownerVolunteerId: string }) => r.ownerVolunteerId === generalVolunteer,
      ),
    ).toBe(true);
    expect(mine.body.meta.total).toBe(mine.body.data.length);
    const entry = await applicationRow(h.db, {
      projectId: project,
      versionId,
      loc: world.dhaka,
      status: 'needs_verification',
      over: { flags: ['public_entry', 'existing_identity'], submitted_at: new Date() },
    });
    expect(ids).not.toContain(entry);
    const rpm = await as(world.users.rpmDhaka);
    const office = await at(
      rpm,
      'get',
      `/projects/${project}/applications?status=needs_verification`,
    );
    expect(office.status, JSON.stringify(office.body)).toBe(200);
    expect(office.body.data).toEqual([
      expect.objectContaining({
        id: entry,
        status: 'needs_verification',
        flags: ['public_entry', 'existing_identity'],
      }),
    ]);
    await h.db.query(
      `INSERT INTO blocklist (id, subject_type, subject_id, reason, blocked_by) VALUES ($1, 'volunteer', $2, 'test', $3)`,
      [randomUUID(), generalVolunteer, world.users.rpmDhaka],
    );
    try {
      const empty = await at(s, 'get', `/projects/${project}/applications`);
      expect(empty.status).toBe(200);
      expect(empty.body.data).toEqual([]);
      expect((await at(s, 'get', `/applications/${id}`)).status).toBe(404);
    } finally {
      await h.db.query(`DELETE FROM blocklist WHERE subject_id = $1`, [generalVolunteer]);
    }
  });

  it('jumps to a page number inside the counted range and refuses one with a cursor', async () => {
    for (let i = 0; i < 3; i += 1)
      await applicationRow(h.db, {
        projectId: project,
        versionId,
        loc: world.dhaka,
        status: 'submitted',
        over: { submitted_at: new Date(Date.now() - i * 60_000) },
      });
    const rpm = await as(world.users.rpmDhaka);
    const all = await at(rpm, 'get', `/projects/${project}/applications?status=submitted&limit=5`);
    expect(all.status, JSON.stringify(all.body)).toBe(200);
    const ids = all.body.data.map((r: { id: string }) => r.id);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    const second = await at(
      rpm,
      'get',
      `/projects/${project}/applications?status=submitted&limit=2&page=2`,
    );
    expect(second.status, JSON.stringify(second.body)).toBe(200);
    expect(second.body.data.map((r: { id: string }) => r.id)).toEqual(ids.slice(2, 4));
    expect(second.body.meta.prevCursor).not.toBeNull();
    const mixed = await at(
      rpm,
      'get',
      `/projects/${project}/applications?page=2&cursor=${second.body.meta.prevCursor}`,
    );
    expect(mixed.status).toBe(422);
    // a page that is no number, the first page's predecessor, and one past the counted range
    for (const page of ['0', 'x'])
      expect((await at(rpm, 'get', `/projects/${project}/applications?page=${page}`)).status).toBe(
        422,
      );
    expect(
      (await at(rpm, 'get', `/projects/${project}/applications?limit=100&page=101`)).status,
    ).toBe(422);
  });
});
