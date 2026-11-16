import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SeedContext } from '../../seed/context.js';
import { seedReferenceLists } from '../../seed/sets/base/reference-lists.js';
import { seedWorkflows } from '../../seed/sets/base/workflows.js';
import { accessWorld } from './support/access-fixtures.js';
import { applicationProject, IDENTITY_ANSWERS } from './support/applications.js';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  type Session,
} from './support/auth-app.js';
import { fakeMobile, fakeNid, volunteer } from './support/fixtures.js';
import { notificationsOf } from './support/notifications.js';
import { draftProject } from './support/projects.js';

// The application transfer: the RPM hands all or chosen applications of one volunteer to another
// on the project, with a reason. The new volunteer takes the owner's place and the old one, with
// their team unless it moves too, no longer reaches the applications; each move is on the
// application's timeline and in the audit log, and the two volunteers are told how many moved.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
const at = (s: Session, method: 'get' | 'post' | 'patch' | 'put', path: string) =>
  api()[method](`/api/v1${path}`).set(bearer(s));
let makeVolunteerUser: (role: string) => Promise<string>;

let project: string;
let versionId: string;
let volunteerA: string;
let volunteerB: string;
/** The volunteer the applications go to: a general volunteer of Dhaka. */
let userB: string;

const toAnswers = (record: Record<string, unknown>) =>
  Object.entries(record).map(([fieldKey, value]) => ({ fieldKey, value }));
const read = (s: Session, id: string) => at(s, 'get', `/applications/${id}`);
const act = async (s: Session, id: string, action: string, body: Record<string, unknown> = {}) => {
  const before = await read(s, id);
  return at(s, 'post', `/applications/${id}/actions/${action}`)
    .set('If-Match', before.headers.etag as string)
    .send(body);
};
/** A draft made by the person of this session; answers its id. */
async function draft(s: Session): Promise<string> {
  const made = await at(s, 'post', `/projects/${project}/applications`).send({
    clientUuid: randomUUID(),
    projectId: project,
    formVersionId: versionId,
    answers: toAnswers(IDENTITY_ANSWERS(fakeNid(), fakeMobile(), world.dhaka)),
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body.data.id as string;
}
const transfer = (s: Session, body: Record<string, unknown>, key = randomUUID()) =>
  at(s, 'post', `/projects/${project}/transfers`)
    .set('Idempotency-Key', key)
    .send({
      fromVolunteerId: volunteerA,
      toVolunteerId: volunteerB,
      reason: 'স্বেচ্ছাসেবক এলাকা ছেড়েছেন',
      ...body,
    });
const volunteerOf = async (userId: string) =>
  (await h.db.query<{ id: string }>('SELECT id FROM volunteers WHERE user_id = $1', [userId]))
    .rows[0]!.id;
const assign = (volunteerId: string) =>
  h.db.query(
    `INSERT INTO project_volunteers (id, project_id, volunteer_id, region_location_id, permission_set, extra_permissions, assigned_by, consent_status)
     VALUES ($1, $2, $3, $4, 'application_distribution', '{}', $5, 'accepted')`,
    [randomUUID(), project, volunteerId, world.dhaka.division, world.users.rpmDhaka],
  );

beforeAll(async () => {
  h = await authHarness();
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  makeVolunteerUser = make('volunteer');
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
  await volunteer(h.db, world.dhaka, world.users.team, { type: 'team_member' });
  const ctx = new SeedContext(h.container.prisma);
  await seedWorkflows(ctx);
  await seedReferenceLists(ctx);
  const made = await draftProject(h, await as(world.users.pm), {
    programId: world.a1.program,
    code: 'TRF',
    year: 2026,
    name: { bn: 'হস্তান্তর', en: 'Transfer' },
    source: { kind: 'workflow', workflowKey: 'distribution' },
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  project = made.body.data.id as string;
  ({ versionId } = await applicationProject(h, await as(world.users.monitoring), project, {
    limit: 3,
  }));
  volunteerA = await volunteerOf(world.users.general);
  userB = await makeVolunteerUser('volunteer_general');
  volunteerB = await volunteer(h.db, world.dhaka, userB);
  await h.db.query(
    `INSERT INTO project_areas (id, project_id, location_id, rpm_user_id) VALUES ($1, $2, $3, $4)`,
    [randomUUID(), project, world.dhaka.division, world.users.rpmDhaka],
  );
  await h.db.query(
    `INSERT INTO project_staff (id, project_id, user_id, role_key, area_location_id, extra_permissions, granted_by)
     VALUES ($1, $2, $3, 'project_executive', $4, '{}', $5)`,
    [randomUUID(), project, world.users.executive, world.dhaka.division, world.users.rpmDhaka],
  );
  await assign(volunteerA);
  await assign(volunteerB);
  teamVolunteer = await volunteerOf(world.users.team);
});
afterAll(async () => h.close());
let teamVolunteer: string;
beforeEach(async () => {
  await h.db.query(
    `UPDATE applications SET status = 'deleted', deleted_at = now() WHERE project_id = $1 AND status <> 'deleted'`,
    [project],
  );
  await h.db.query(
    `UPDATE volunteer_teams SET removed_at = now() WHERE project_id = $1 AND removed_at IS NULL`,
    [project],
  );
  await h.db.query(
    `INSERT INTO volunteer_teams (id, project_id, lead_volunteer_id, member_volunteer_id, consent_status, consent_at, created_by)
     VALUES ($1, $2, $3, $4, 'accepted', now(), $5)`,
    [randomUUID(), project, volunteerA, teamVolunteer, world.users.general],
  );
});

describe('a transfer', () => {
  it('hands two of three applications to another volunteer, who works on them while the old one reaches none', async () => {
    const a = await as(world.users.general);
    const member = await as(world.users.team);
    const own = await draft(a);
    const kept = await draft(a);
    const memberMade = await draft(member);
    const rpm = await as(world.users.rpmDhaka);
    const res = await transfer(rpm, { applicationIds: [own, memberMade] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ teamMoved: 0, overLimit: false });
    expect(new Set(res.body.data.moved)).toEqual(new Set([own, memberMade]));
    // the new volunteer reads, edits by state and sends them
    const b = await as(userB);
    expect((await read(b, own)).status).toBe(200);
    const sent = await act(b, memberMade, 'submit');
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    // the old volunteer and the team member who did not move reach none of them
    expect((await read(a, own)).status).toBe(404);
    expect((await at(a, 'get', `/applications/${own}/timeline`)).status).toBe(404);
    expect((await read(member, memberMade)).status).toBe(404);
    const mine = await at(a, 'get', '/me/applications');
    const ids = (mine.body.data as { id: string }[]).map((r) => r.id);
    expect(ids).toContain(kept);
    expect(ids).not.toContain(own);
    // the office reads who moved it, from whom to whom and why; the volunteer only that it came
    const office = await at(rpm, 'get', `/applications/${own}/timeline`);
    expect(office.body.data).toContainEqual(
      expect.objectContaining({
        action: 'application.transferred',
        reason: 'স্বেচ্ছাসেবক এলাকা ছেড়েছেন',
        actor: expect.objectContaining({ id: world.users.rpmDhaka }),
      }),
    );
    const theirs = await at(b, 'get', `/applications/${own}/timeline`);
    const step = (theirs.body.data as { action: string; reason?: string }[]).find(
      (e) => e.action === 'application.transferred',
    );
    expect(step).toBeDefined();
    expect(step!.reason).toBeUndefined();
    const rows = await h.db.query<{ transfer_batch: string }>(
      'SELECT transfer_batch FROM application_transfers WHERE application_id = ANY($1)',
      [[own, memberMade]],
    );
    expect(rows.rows.map((r) => r.transfer_batch)).toEqual([
      res.body.data.batchId,
      res.body.data.batchId,
    ]);
    const batch = await h.db.query(
      `SELECT 1 FROM audit_log WHERE entity_id = $1 AND action = 'application.transfer'`,
      [project],
    );
    expect(batch.rowCount).toBe(1);
    // each volunteer hears how many moved; the old one never which
    const toB = await notificationsOf(h.db, 'application_transferred', userB);
    const toA = await notificationsOf(h.db, 'application_transferred_away', world.users.general);
    expect(toB.at(-1)!.params).toMatchObject({ count: 2 });
    expect(toA.at(-1)!.params).toMatchObject({ count: 2 });
    expect(JSON.stringify(toA)).not.toContain(own);
  });

  it('moves the team when asked, counts toward the new limit with a warning, and answers a repeat the same', async () => {
    const a = await as(world.users.general);
    const member = await as(world.users.team);
    await draft(a);
    await draft(a);
    const left = await draft(member);
    // the new volunteer already holds one, so three more take them over the limit of three
    await draft(await as(userB));
    const rpm = await as(world.users.rpmDhaka);
    const key = randomUUID();
    // every remaining application of the old volunteer moves, the team with them
    const res = await transfer(rpm, { moveTeam: true }, key);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.teamMoved).toBe(1);
    expect(res.body.data.moved).toContain(left);
    expect(res.body.data.overLimit).toBe(true);
    const again = await transfer(rpm, { moveTeam: true }, key);
    expect(again.headers['idempotent-replay']).toBe('true');
    expect(again.body.data.batchId).toBe(res.body.data.batchId);
    // the team member keeps what they created, now under the new volunteer
    expect((await read(member, left)).status).toBe(200);
    expect((await read(a, left)).status).toBe(404);
    // the new volunteer is over the limit and makes no new application until back under it
    const b = await as(userB);
    const refused = await at(b, 'post', `/projects/${project}/applications`).send({
      clientUuid: randomUUID(),
      projectId: project,
      formVersionId: versionId,
      answers: toAnswers(IDENTITY_ANSWERS(fakeNid(), fakeMobile(), world.dhaka)),
    });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('workflow.guard.limit_not_exceeded');
  });

  it('refuses to move the team while applications stay with the old volunteer', async () => {
    const a = await as(world.users.general);
    const moved = await draft(a);
    await draft(a);
    const res = await transfer(await as(world.users.rpmDhaka), {
      applicationIds: [moved],
      moveTeam: true,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.details).toEqual([
      expect.objectContaining({ code: 'application.transfer_team_partial' }),
    ]);
    expect((await read(a, moved)).status).toBe(200);
  });

  it('takes the files of a moved application from the old volunteer', async () => {
    const a = await as(world.users.general);
    const id = await draft(a);
    const fileId = randomUUID();
    await h.db.query(
      `INSERT INTO files (id, bucket, storage_driver, object_key, kind, mime, size_bytes, sha256, project_id, uploaded_by, source, virus_scan)
       VALUES ($1, 'photos', 'nas', $2, 'form_photo', 'image/jpeg', 10, $3, $4, $5, 'camera', 'skipped')`,
      [
        fileId,
        `applications/${fileId}.jpg`,
        createHash('sha256').update(fileId).digest('hex'),
        project,
        world.users.general,
      ],
    );
    await h.db.query(
      `INSERT INTO file_links (id, file_id, entity_type, entity_id, slot) VALUES ($1, $2, 'application', $3, 'house_photo')`,
      [randomUUID(), fileId, id],
    );
    const files = (s: Session) => at(s, 'get', `/files?entityType=application&entityId=${id}`);
    expect((await files(a)).status).toBe(200);
    expect((await transfer(await as(world.users.rpmDhaka), { applicationIds: [id] })).status).toBe(
      200,
    );
    const after = await files(a);
    expect(after.status, JSON.stringify(after.body)).toBe(404);
    expect((await at(a, 'get', `/files/${fileId}`)).status).toBe(404);
    const theirs = await files(await as(userB));
    expect(theirs.status, JSON.stringify(theirs.body)).toBe(200);
    expect((theirs.body.data as { id: string }[]).map((f) => f.id)).toContain(fileId);
  });

  it('hands an open unlock of a moved application to the new volunteer', async () => {
    const a = await as(world.users.general);
    const id = await draft(a);
    const rpm = await as(world.users.rpmDhaka);
    for (const [s, action] of [
      [a, 'submit'],
      [rpm, 'review'],
      [rpm, 'send_for_approval'],
      [rpm, 'approve'],
    ] as const) {
      const moved = await act(s, id, action);
      expect(moved.status, `${action}: ${JSON.stringify(moved.body)}`).toBe(200);
    }
    const opened = await at(rpm, 'post', `/applications/${id}/unlocks`).send({
      fieldKey: 'q_village',
      reason: 'গ্রামের নাম ভুল',
    });
    expect(opened.status, JSON.stringify(opened.body)).toBe(201);
    const unlockId = opened.body.data.id as string;
    expect((await transfer(rpm, { applicationIds: [id] })).status).toBe(200);
    const value = { value: { t: 'short_text', v: 'নতুন গ্রাম' } };
    expect((await at(a, 'put', `/application-unlocks/${unlockId}/value`).send(value)).status).toBe(
      404,
    );
    const b = await as(userB);
    expect((await at(b, 'put', `/application-unlocks/${unlockId}/value`).send(value)).status).toBe(
      200,
    );
  });

  it('assigns a volunteer not yet on the project in the same request', async () => {
    const a = await as(world.users.general);
    const id = await draft(a);
    const newcomerUser = await makeVolunteerUser('volunteer_general');
    const newcomer = await volunteer(h.db, world.dhaka, newcomerUser);
    const rpm = await as(world.users.rpmDhaka);
    const unassigned = await transfer(rpm, { applicationIds: [id], toVolunteerId: newcomer });
    expect(unassigned.status).toBe(422);
    expect(unassigned.body.error.details).toEqual([
      expect.objectContaining({ code: 'application.transfer_target_not_assigned' }),
    ]);
    // a refused transfer assigns nobody
    const refused = await transfer(rpm, {
      applicationIds: [randomUUID()],
      toVolunteerId: newcomer,
      assign: true,
    });
    expect(refused.status).toBe(404);
    const none = await h.db.query(
      'SELECT 1 FROM project_volunteers WHERE project_id = $1 AND volunteer_id = $2',
      [project, newcomer],
    );
    expect(none.rowCount).toBe(0);
    const res = await transfer(rpm, {
      applicationIds: [id],
      toVolunteerId: newcomer,
      assign: true,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const onProject = await h.db.query(
      'SELECT 1 FROM project_volunteers WHERE project_id = $1 AND volunteer_id = $2 AND ended_at IS NULL',
      [project, newcomer],
    );
    expect(onProject.rowCount).toBe(1);
  });
});

describe('a blocked volunteer', () => {
  it('keeps their applications as they were, and a new volunteer takes them over by a transfer', async () => {
    const a = await as(world.users.general);
    const sent = await draft(a);
    expect((await act(a, sent, 'submit')).status).toBe(200);
    const open = await draft(a);
    const rpm = await as(world.users.rpmDhaka);
    const blocked = await at(rpm, 'post', `/volunteers/${volunteerA}/block`).send({
      reason: 'নিয়ম ভেঙেছেন',
    });
    expect(blocked.status, JSON.stringify(blocked.body)).toBe(201);
    try {
      // the block changes nothing on the applications themselves
      expect((await read(rpm, sent)).body.data.status).toBe('submitted');
      expect((await read(rpm, open)).body.data.status).toBe('draft');
      const res = await transfer(rpm, { applicationIds: [sent, open] });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(new Set(res.body.data.moved)).toEqual(new Set([sent, open]));
      const b = await as(userB);
      expect((await read(b, sent)).body.data.status).toBe('submitted');
      expect((await act(b, open, 'submit')).status).toBe(200);
    } finally {
      const lifted = await at(rpm, 'post', `/volunteers/${volunteerA}/unblock`).send({
        reason: 'পরীক্ষা শেষ',
      });
      expect(lifted.status, JSON.stringify(lifted.body)).toBe(200);
    }
  });
});

describe('what a transfer refuses', () => {
  it('is refused to an RPM of another region, an executive without the grant, and a volunteer', async () => {
    const id = await draft(await as(world.users.general));
    const outside = await transfer(await as(world.users.rpmRangpur), { applicationIds: [id] });
    expect(outside.status).toBe(404);
    const executive = await transfer(await as(world.users.executive), { applicationIds: [id] });
    expect(executive.status).toBe(403);
    expect(executive.body.error.code).toBe('permission.denied');
    expect((await transfer(await as(world.users.general), { applicationIds: [id] })).status).toBe(
      403,
    );
    // an in-flow assignment needs the assignment permission too
    expect(
      (await transfer(await as(world.users.executive), { applicationIds: [id], assign: true }))
        .status,
    ).toBe(403);
    expect((await read(await as(world.users.general), id)).status).toBe(200);
  });

  it('refuses a blocked target, an application of someone else, the same volunteer, and a project that does not run', async () => {
    const id = await draft(await as(world.users.general));
    const rpm = await as(world.users.rpmDhaka);
    const block = randomUUID();
    await h.db.query(
      `INSERT INTO blocklist (id, subject_type, subject_id, reason, blocked_by) VALUES ($1, 'volunteer', $2, 'test', $3)`,
      [block, volunteerB, world.users.rpmDhaka],
    );
    try {
      const blocked = await transfer(rpm, { applicationIds: [id] });
      expect(blocked.status).toBe(422);
      expect(blocked.body.error.details).toEqual([
        expect.objectContaining({ code: 'application.transfer_target_unfit' }),
      ]);
    } finally {
      await h.db.query(
        `UPDATE blocklist SET active = false, released_by = $2, released_at = now(), release_reason = 'test' WHERE id = $1`,
        [block, world.users.rpmDhaka],
      );
    }
    const foreign = await transfer(rpm, {
      applicationIds: [id],
      fromVolunteerId: volunteerB,
      toVolunteerId: volunteerA,
    });
    // the chosen application is not the named volunteer's: not found, as outside the scope
    expect(foreign.status).toBe(404);
    expect((await transfer(rpm, { applicationIds: [id], toVolunteerId: volunteerA })).status).toBe(
      422,
    );
    await h.db.query(`UPDATE projects SET status = 'closing' WHERE id = $1`, [project]);
    try {
      const closing = await transfer(rpm, { applicationIds: [id] });
      expect(closing.status).toBe(409);
    } finally {
      await h.db.query(`UPDATE projects SET status = 'active' WHERE id = $1`, [project]);
    }
  });

  it('lists the applications a transfer may pick, inside the caller scope', async () => {
    const id = await draft(await as(world.users.general));
    const listed = await at(
      await as(world.users.rpmDhaka),
      'get',
      `/projects/${project}/volunteers/${volunteerA}/applications`,
    );
    expect(listed.status).toBe(200);
    expect((listed.body.data as { id: string }[]).map((r) => r.id)).toContain(id);
    const outside = await at(
      await as(world.users.rpmRangpur),
      'get',
      `/projects/${project}/volunteers/${volunteerA}/applications`,
    );
    expect(outside.body.data).toEqual([]);
  });
});
