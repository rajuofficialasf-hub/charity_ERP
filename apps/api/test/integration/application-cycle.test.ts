import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SeedContext } from '../../seed/context.js';
import { seedReferenceLists } from '../../seed/sets/base/reference-lists.js';
import { seedWorkflows } from '../../seed/sets/base/workflows.js';
import { accessWorld } from './support/access-fixtures.js';
import {
  applicationProject,
  applicationRow,
  IDENTITY_ANSWERS,
  setIdentityRules,
} from './support/applications.js';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  type Session,
} from './support/auth-app.js';
import { beneficiary, fakeMobile, fakeNid } from './support/fixtures.js';
import { draftProject } from './support/projects.js';

// The application through the common cycle on the API: the submission gives the number and the
// person, the office reviews, edits, sends for approval and decides, a rejection can be returned,
// a public entry is verified or refused, and the timeline and the change log read as each
// audience may.
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

const toAnswers = (record: Record<string, unknown>) =>
  Object.entries(record).map(([fieldKey, value]) => ({ fieldKey, value }));
const identity = (nid = fakeNid(), mobile = fakeMobile()) =>
  toAnswers(IDENTITY_ANSWERS(nid, mobile, world.dhaka));
const create = async (s: Session, answers: unknown[]) => {
  const made = await at(s, 'post', `/projects/${project}/applications`).send({
    clientUuid: randomUUID(),
    projectId: project,
    formVersionId: versionId,
    answers,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body.data.id as string;
};
/** A workflow action with the version the caller last read, as the screen sends it. */
const act = async (s: Session, id: string, action: string, body: Record<string, unknown> = {}) => {
  const read = await at(s, 'get', `/applications/${id}`);
  return at(s, 'post', `/applications/${id}/actions/${action}`)
    .set('If-Match', (read.headers.etag as string | undefined) ?? '"none"')
    .send(body);
};
const moved = async (s: Session, id: string, action: string, body?: Record<string, unknown>) => {
  const res = await act(s, id, action, body);
  expect(res.status, `${action}: ${JSON.stringify(res.body)}`).toBe(200);
  return res;
};
const refused = async (s: Session, id: string, action: string, body?: Record<string, unknown>) => {
  const res = await act(s, id, action, body);
  return { status: res.status, code: res.body.error?.code as string | undefined };
};
const auditActions = async (id: string) =>
  (
    await h.db.query<{ action: string }>(
      `SELECT action FROM audit_log WHERE entity_type = 'application' AND entity_id = $1 ORDER BY created_at, id`,
      [id],
    )
  ).rows.map((r) => r.action);

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
  const made = await draftProject(h, await as(world.users.pm), {
    programId: world.a1.program,
    code: 'CYC',
    year: 2026,
    name: { bn: 'চক্র', en: 'Cycle' },
    source: { kind: 'workflow', workflowKey: 'distribution' },
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  project = made.body.data.id as string;
  ({ versionId } = await applicationProject(h, await as(world.users.monitoring), project));
  const volunteers = await h.db.query<{ id: string; user_id: string }>(
    'SELECT id, user_id FROM volunteers WHERE user_id = ANY($1::uuid[])',
    [[world.users.general, world.users.rangpurVolunteer]],
  );
  generalVolunteer = volunteers.rows.find((v) => v.user_id === world.users.general)!.id;
  const rangpurVolunteer = volunteers.rows.find(
    (v) => v.user_id === world.users.rangpurVolunteer,
  )!.id;
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
});
afterAll(async () => h.close());

describe('the submission', () => {
  it('numbers the application in the order received and creates the profile of a new person', async () => {
    const s = await as(world.users.general);
    const nid = fakeNid();
    const mobile = fakeMobile();
    const id = await create(s, identity(nid, mobile));
    const submitted = await moved(s, id, 'submit');
    expect(submitted.body.data).toMatchObject({
      status: 'submitted',
      appNo: 'CYC-2026-00001',
      identityKind: 'nid',
    });
    const beneficiaryId = submitted.body.data.beneficiaryId as string;
    expect(beneficiaryId).toBeTruthy();
    const profile = await h.db.query(
      'SELECT nid, name, mobile, village, created_by FROM beneficiaries WHERE id = $1',
      [beneficiaryId],
    );
    expect(profile.rows[0]).toEqual({
      nid,
      name: 'নমুনা আবেদনকারী',
      mobile,
      village: 'নমুনা গ্রাম',
      created_by: world.users.general,
    });
    expect(await auditActions(id)).toEqual([
      'application.create',
      'application.person_bound',
      'application.submit',
      'application.numbered',
    ]);
    // the number finds the application for the volunteer who owns it
    const byNumber = await at(s, 'get', '/application-numbers/CYC-2026-00001');
    expect(byNumber.status, JSON.stringify(byNumber.body)).toBe(200);
    expect(byNumber.body.data).toMatchObject({ id, appNo: 'CYC-2026-00001' });
    // the next one of the project, brought by the RPM for a known person, takes the next number
    const rpm = await as(world.users.rpmDhaka);
    const known = await beneficiary(h.db, world.dhaka, { nid: fakeNid() });
    const knownNid = (
      await h.db.query<{ nid: string }>('SELECT nid FROM beneficiaries WHERE id = $1', [known])
    ).rows[0]!.nid;
    const newMobile = fakeMobile();
    const second = await create(rpm, identity(knownNid, newMobile));
    const theirs = await moved(rpm, second, 'submit');
    expect(theirs.body.data).toMatchObject({ appNo: 'CYC-2026-00002', beneficiaryId: known });
    // the known person's mobile changed through the application, with its change log
    const contact = await h.db.query<{ mobile: string }>(
      'SELECT mobile FROM beneficiaries WHERE id = $1',
      [known],
    );
    expect(contact.rows[0]!.mobile).toBe(newMobile);
    const log = await h.db.query<{ field: string; kind: string }>(
      `SELECT field, kind FROM field_changes WHERE entity_type = 'beneficiary' AND entity_id = $1`,
      [known],
    );
    expect(log.rows).toEqual([{ field: 'mobile', kind: 'contact_update' }]);
    // a volunteer's answers never rewrite a known person's profile: the application keeps the
    // new mobile for the office, the profile keeps its own
    const kept = await beneficiary(h.db, world.dhaka, { nid: fakeNid() });
    const keptNid = (
      await h.db.query<{ nid: string }>('SELECT nid FROM beneficiaries WHERE id = $1', [kept])
    ).rows[0]!.nid;
    const keptMobile = (
      await h.db.query<{ mobile: string }>('SELECT mobile FROM beneficiaries WHERE id = $1', [kept])
    ).rows[0]!.mobile;
    const third = await create(s, identity(keptNid, fakeMobile()));
    const bound = await moved(s, third, 'submit');
    expect(bound.body.data).toMatchObject({ appNo: 'CYC-2026-00003', beneficiaryId: kept });
    const untouched = await h.db.query<{ mobile: string }>(
      'SELECT mobile FROM beneficiaries WHERE id = $1',
      [kept],
    );
    expect(untouched.rows[0]!.mobile).toBe(keptMobile);
  });

  it('binds a profile that appeared after the draft', async () => {
    const s = await as(world.users.general);
    const nid = fakeNid();
    const id = await create(s, identity(nid));
    // the person got a profile meanwhile (another project, a public entry): the draft binds it
    const later = await beneficiary(h.db, world.dhaka, { nid });
    const submitted = await moved(s, id, 'submit');
    expect(submitted.body.data.beneficiaryId).toBe(later);
  });

  it('refuses a submission without the identity number where the project requires it, with a stale version, and twice', async () => {
    const s = await as(world.users.general);
    const answers = identity().filter((a) => a.fieldKey !== 'q_id');
    const noId = await create(s, answers);
    // a distribution project starts with the document asked "if they have one"; this one requires it
    await setIdentityRules(h.db, project, { document: 'required' });
    try {
      expect(await refused(s, noId, 'submit')).toEqual({
        status: 409,
        code: 'workflow.guard.identity_present',
      });
    } finally {
      await setIdentityRules(h.db, project, { document: 'optional' });
    }
    const id = await create(s, identity());
    const stale = await at(s, 'post', `/applications/${id}/actions/submit`)
      .set('If-Match', '"stale"')
      .send({});
    expect(stale.status).toBe(412);
    await moved(s, id, 'submit');
    expect(await refused(s, id, 'submit')).toEqual({
      status: 409,
      code: 'workflow.transition_not_allowed',
    });
    // a submitted one is deleted by its volunteer
    expect((await moved(s, id, 'delete')).body.data.status).toBe('deleted');
  });
});

describe('the review and the decision', () => {
  it('runs review, approval and the move into implementation, refusing the wrong hands', async () => {
    const s = await as(world.users.general);
    const executive = await as(world.users.executive);
    const rpm = await as(world.users.rpmDhaka);
    const id = await create(s, identity());
    await moved(s, id, 'submit');
    expect(await refused(s, id, 'review')).toEqual({ status: 403, code: 'permission.denied' });
    await moved(executive, id, 'review');
    await moved(executive, id, 'send_for_approval');
    // the executive's approval was granted on another project only, so this one stays out of
    // reach; the RPM holds it here
    expect(await refused(executive, id, 'approve')).toEqual({
      status: 404,
      code: 'permission.not_found',
    });
    const approved = await moved(rpm, id, 'approve');
    expect(approved.body.data.status).toBe('implementation');
    expect(await auditActions(id)).toEqual([
      'application.create',
      'application.person_bound',
      'application.submit',
      'application.numbered',
      'application.review_started',
      'application.reviewed',
      'application.approve',
      'application.implementation_started',
    ]);
  });

  it('sends a submitted application for approval in one press, recording both steps', async () => {
    const s = await as(world.users.general);
    const executive = await as(world.users.executive);
    const id = await create(s, identity());
    await moved(s, id, 'submit');
    // the volunteer holds no review permission; the office sees the one press
    expect(await refused(s, id, 'send_for_approval')).toEqual({
      status: 403,
      code: 'permission.denied',
    });
    const offered = await at(executive, 'get', `/applications/${id}`);
    expect(offered.body.data.availableActions).toContain('send_for_approval');
    const sent = await moved(executive, id, 'send_for_approval');
    expect(sent.body.data.status).toBe('reviewed');
    expect(await auditActions(id)).toEqual([
      'application.create',
      'application.person_bound',
      'application.submit',
      'application.numbered',
      'application.review_started',
      'application.reviewed',
    ]);
    const steps = await at(executive, 'get', `/applications/${id}/timeline`);
    expect(steps.body.data.map((e: { to: string }) => e.to)).toEqual([
      'draft',
      'submitted',
      'under_review',
      'reviewed',
    ]);
    // a stale version refuses the whole press, and nothing of it stays
    const other = await create(s, identity());
    await moved(s, other, 'submit');
    const stale = await at(executive, 'post', `/applications/${other}/actions/send_for_approval`)
      .set('If-Match', '"stale"')
      .send({});
    expect(stale.status).toBe(412);
    expect((await at(executive, 'get', `/applications/${other}`)).body.data.status).toBe(
      'submitted',
    );
  });

  it('starts the review with an official’s first edit of a submitted application', async () => {
    const s = await as(world.users.general);
    const executive = await as(world.users.executive);
    const nid = fakeNid();
    const mobile = fakeMobile();
    const id = await create(s, identity(nid, mobile));
    await moved(s, id, 'submit');
    const read = await at(executive, 'get', `/applications/${id}`);
    const edited = await at(executive, 'patch', `/applications/${id}`)
      .set('If-Match', read.headers.etag as string)
      .send({
        answers: [
          ...identity(nid, mobile),
          { fieldKey: 'q_note', value: { t: 'long_text', v: 'যাচাই করা হয়েছে' } },
        ],
      });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    expect(edited.body.data.status).toBe('under_review');
    expect((await auditActions(id)).slice(-2)).toEqual([
      'application.review_started',
      'application.update',
    ]);
    // the edit is logged question by question, as one under review is
    const changes = await at(executive, 'get', `/applications/${id}/changes`);
    expect(changes.body.data).toEqual([
      expect.objectContaining({ field: 'q_note', kind: 'review_edit' }),
    ]);
    // the volunteer's own edit of a submitted application leaves it submitted
    const ownNid = fakeNid();
    const ownMobile = fakeMobile();
    const mine = await create(s, identity(ownNid, ownMobile));
    await moved(s, mine, 'submit');
    const own = await at(s, 'get', `/applications/${mine}`);
    const ownEdit = await at(s, 'patch', `/applications/${mine}`)
      .set('If-Match', own.headers.etag as string)
      .send({
        answers: toAnswers({
          ...IDENTITY_ANSWERS(ownNid, ownMobile, world.dhaka),
          q_village: { t: 'short_text', v: 'নতুন গ্রাম' },
        }),
      });
    expect(ownEdit.status, JSON.stringify(ownEdit.body)).toBe(200);
    expect(ownEdit.body.data.status).toBe('submitted');
  });

  it('lets a blocked person’s draft be edited but not sent, and the submitted application go on', async () => {
    const s = await as(world.users.general);
    const executive = await as(world.users.executive);
    const rpm = await as(world.users.rpmDhaka);
    const draftNid = fakeNid();
    await beneficiary(h.db, world.dhaka, { nid: draftNid });
    const draft = await create(s, identity(draftNid));
    const sentNid = fakeNid();
    const sent = await create(s, identity(sentNid));
    await moved(s, sent, 'submit');
    await h.db.query(`UPDATE beneficiaries SET is_blocked = true WHERE nid = ANY($1::text[])`, [
      [draftNid, sentNid],
    ]);

    // the draft is a new application: it may still be put right, never sent
    const read = await at(s, 'get', `/applications/${draft}`);
    const edited = await at(s, 'patch', `/applications/${draft}`)
      .set('If-Match', read.headers.etag as string)
      .send({
        answers: toAnswers({
          ...IDENTITY_ANSWERS(draftNid, fakeMobile(), world.dhaka),
          q_village: { t: 'short_text', v: 'নতুন গ্রাম' },
        }),
      });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    expect(await refused(s, draft, 'submit')).toEqual({
      status: 409,
      code: 'workflow.guard.beneficiary_not_blocked',
    });

    // a draft not yet tied to anyone whose number then names a blocked person is refused as a
    // new application, since tying it would show the volunteer that person's names
    const laterNid = fakeNid();
    const later = await create(s, identity(laterNid));
    await beneficiary(h.db, world.dhaka, { nid: laterNid, is_blocked: true });
    const laterRead = await at(s, 'get', `/applications/${later}`);
    const laterEdit = await at(s, 'patch', `/applications/${later}`)
      .set('If-Match', laterRead.headers.etag as string)
      .send({ answers: identity(laterNid) });
    expect(laterEdit.status).toBe(409);
    expect(laterEdit.body.error.code).toBe('beneficiary.blocked');

    // the application sent before the block goes on: the office edits, reviews and decides it
    await moved(executive, sent, 'review');
    const before = await at(executive, 'get', `/applications/${sent}`);
    const changed = await at(executive, 'patch', `/applications/${sent}`)
      .set('If-Match', before.headers.etag as string)
      .send({
        answers: [
          ...identity(sentNid),
          { fieldKey: 'q_note', value: { t: 'long_text', v: 'যাচাই করা হয়েছে' } },
        ],
      });
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    await moved(executive, sent, 'send_for_approval');
    const approved = await moved(rpm, sent, 'approve');
    expect(approved.body.data.status).toBe('implementation');
  });

  it('keeps the decision away from the official who brought the application, also after a return', async () => {
    const rpm = await as(world.users.rpmDhaka);
    const monitoring = await as(world.users.monitoring);
    const id = await create(rpm, identity());
    await moved(rpm, id, 'submit');
    await moved(rpm, id, 'review');
    await moved(rpm, id, 'send_for_approval');
    expect(await refused(rpm, id, 'approve')).toEqual({
      status: 409,
      code: 'workflow.guard.actor_not_creator',
    });
    await moved(monitoring, id, 'reject', { reason: 'ভুল এলাকা', message: 'এবার নয়' });
    expect(await refused(rpm, id, 'return_to_review', { reason: 'ভুল করে' })).toEqual({
      status: 409,
      code: 'workflow.guard.actor_not_creator',
    });
    expect(await refused(monitoring, id, 'return_to_review')).toEqual({
      status: 422,
      code: 'workflow.reason_required',
    });
    const back = await moved(monitoring, id, 'return_to_review', { reason: 'ভুল করে বাতিল' });
    expect(back.body.data).toMatchObject({ status: 'reviewed', rejectionMessage: null });
  });

  it('lets the region’s executive refuse a public entry with a reason, and nobody else', async () => {
    const entry = await applicationRow(h.db, {
      projectId: project,
      versionId,
      loc: world.dhaka,
      status: 'needs_verification',
      answers: IDENTITY_ANSWERS(fakeNid(), fakeMobile(), world.dhaka),
      over: { flags: ['public_entry'], submitted_at: new Date() },
    });
    const s = await as(world.users.general);
    expect(await refused(s, entry, 'reject_unverified', { reason: 'x' })).toMatchObject({
      status: 403,
    });
    const away = await as(world.users.rpmRangpur);
    expect(await refused(away, entry, 'reject_unverified', { reason: 'x' })).toEqual({
      status: 404,
      code: 'permission.not_found',
    });
    const executive = await as(world.users.executive);
    expect(await refused(executive, entry, 'reject_unverified')).toEqual({
      status: 422,
      code: 'workflow.reason_required',
    });
    const done = await moved(executive, entry, 'reject_unverified', { reason: 'অজানা ব্যক্তি' });
    expect(done.body.data).toMatchObject({ status: 'rejected', decisionComment: 'অজানা ব্যক্তি' });
  });
});

describe('the timeline and the change log', () => {
  it('shows the office every step with the actor and the reason, the volunteer the states and the message only', async () => {
    const s = await as(world.users.general);
    const executive = await as(world.users.executive);
    const rpm = await as(world.users.rpmDhaka);
    const nid = fakeNid();
    const mobile = fakeMobile();
    const id = await create(s, identity(nid, mobile));
    await moved(s, id, 'submit');
    await moved(executive, id, 'review');
    // the executive's edit under review is logged question by question
    const read = await at(executive, 'get', `/applications/${id}`);
    const edited = await at(executive, 'patch', `/applications/${id}`)
      .set('If-Match', read.headers.etag as string)
      .send({
        answers: [
          ...identity(nid, mobile),
          { fieldKey: 'q_note', value: { t: 'long_text', v: 'যাচাই করা হয়েছে' } },
        ],
      });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    await moved(executive, id, 'send_for_approval');
    await moved(rpm, id, 'reject', { reason: 'আয় সীমার উপরে', message: 'এবার সম্ভব হলো না' });

    const office = await at(rpm, 'get', `/applications/${id}/timeline`);
    expect(office.status, JSON.stringify(office.body)).toBe(200);
    expect(office.body.data.map((e: { action: string }) => e.action)).toEqual([
      'application.create',
      'application.submit',
      'application.review_started',
      'application.reviewed',
      'application.reject',
    ]);
    const decision = office.body.data.at(-1);
    expect(decision).toMatchObject({
      from: 'reviewed',
      to: 'rejected',
      automatic: false,
      reason: 'আয় সীমার উপরে',
      message: 'এবার সম্ভব হলো না',
    });
    expect(decision.actor).toMatchObject({ id: world.users.rpmDhaka });
    expect(typeof decision.actor.name).toBe('string');

    const mine = await at(s, 'get', `/applications/${id}/timeline`);
    expect(mine.status).toBe(200);
    expect(mine.body.data.map((e: { to: string }) => e.to)).toEqual([
      'draft',
      'submitted',
      'under_review',
      'reviewed',
      'rejected',
    ]);
    expect(mine.body.data.at(-1)).toMatchObject({ message: 'এবার সম্ভব হলো না' });
    expect(mine.body.data.at(-1)).not.toHaveProperty('reason');
    expect(mine.body.data.at(-1)).not.toHaveProperty('actor');
    expect(JSON.stringify(mine.body)).not.toContain('আয় সীমার উপরে');

    // the change log is the office's; the volunteer and a team member hold no permission for it,
    // another region's RPM does not reach the application
    const changes = await at(rpm, 'get', `/applications/${id}/changes`);
    expect(changes.status, JSON.stringify(changes.body)).toBe(200);
    expect(changes.body.data).toEqual([
      expect.objectContaining({
        field: 'q_note',
        kind: 'review_edit',
        oldValue: null,
        newValue: { t: 'long_text', v: 'যাচাই করা হয়েছে' },
      }),
    ]);
    expect((await at(s, 'get', `/applications/${id}/changes`)).status).toBe(403);
    expect(
      (await at(await as(world.users.team), 'get', `/applications/${id}/changes`)).status,
    ).toBe(403);
    const away = await as(world.users.rpmRangpur);
    expect((await at(away, 'get', `/applications/${id}/changes`)).status).toBe(404);
    expect((await at(away, 'get', `/applications/${id}/timeline`)).status).toBe(404);
    const other = await as(world.users.rangpurVolunteer);
    expect((await at(other, 'get', `/applications/${id}/timeline`)).status).toBe(404);
  });
});

describe('the numbers of a new session', () => {
  it('counts from one again under the session’s own year, beside the numbers of the year before', async () => {
    const pm = await as(world.users.pm);
    const { rows: before } = await h.db.query<{ series_id: string; taken: number }>(
      `SELECT p.series_id, (SELECT count(*)::int FROM applications a WHERE a.project_id = p.id AND a.app_no LIKE 'CYC-2026-%') AS taken
         FROM projects p WHERE p.id = $1`,
      [project],
    );
    expect(before[0]!.taken).toBeGreaterThan(0);
    // next year's session of the same project, a copy of this one
    const made = await at(pm, 'post', `/project-series/${before[0]!.series_id}/sessions`)
      .set('Idempotency-Key', randomUUID())
      .send({ periodFrom: '2027-01', periodTo: '2027-12' });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    expect(made.body.data).toMatchObject({ code: 'CYC', year: 2027, sessionLabel: '2027' });
    const session = made.body.data.id as string;
    // its form came as a draft: published, then the session opened as the first one was
    const draft = (
      await h.db.query<{ id: string }>(
        `SELECT v.id FROM form_versions v JOIN forms f ON f.id = v.form_id WHERE f.project_id = $1`,
        [session],
      )
    ).rows[0]!.id;
    const builder = await as(world.users.monitoring);
    const version = await at(builder, 'get', `/form-versions/${draft}`);
    const published = await at(builder, 'post', `/form-versions/${draft}/publish`).set(
      'If-Match',
      String(version.headers.etag),
    );
    expect(published.status, JSON.stringify(published.body)).toBe(200);
    await h.db.query(
      `UPDATE projects n SET status = 'active', apply_from = o.apply_from, apply_to = o.apply_to,
              per_volunteer_limit = o.per_volunteer_limit, workflow_snapshot = o.workflow_snapshot,
              activated_at = now()
         FROM projects o WHERE n.id = $1 AND o.id = $2`,
      [session, project],
    );
    await h.db.query(
      `INSERT INTO project_areas (id, project_id, location_id, rpm_user_id) VALUES ($1, $2, $3, $4)`,
      [randomUUID(), session, world.dhaka.division, world.users.rpmDhaka],
    );
    await h.db.query(
      `INSERT INTO project_volunteers (id, project_id, volunteer_id, region_location_id, permission_set, extra_permissions, assigned_by, consent_status)
       VALUES ($1, $2, $3, $4, 'application_distribution', '{}', $5, 'accepted')`,
      [randomUUID(), session, generalVolunteer, world.dhaka.division, world.users.rpmDhaka],
    );
    const s = await as(world.users.general);
    const entry = await at(s, 'post', `/projects/${session}/applications`).send({
      clientUuid: randomUUID(),
      projectId: session,
      formVersionId: draft,
      answers: identity(),
    });
    expect(entry.status, JSON.stringify(entry.body)).toBe(201);
    const read = await at(s, 'get', `/applications/${entry.body.data.id}`);
    const submitted = await at(s, 'post', `/applications/${entry.body.data.id}/actions/submit`)
      .set('If-Match', String(read.headers.etag))
      .send({});
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);
    expect(submitted.body.data.appNo).toBe('CYC-2027-00001');
    // the numbers of the first session stay as they were
    const { rows: after } = await h.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM applications WHERE project_id = $1 AND app_no LIKE 'CYC-2026-%'`,
      [project],
    );
    expect(after[0]!.n).toBe(before[0]!.taken);
  });
});
