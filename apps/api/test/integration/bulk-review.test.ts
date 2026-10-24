import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SeedContext } from '../../seed/context';
import { seedReferenceLists } from '../../seed/sets/base/reference-lists';
import { seedWorkflows } from '../../seed/sets/base/workflows';
import { accessWorld } from './support/access-fixtures';
import { applicationProject, applicationRow, IDENTITY_ANSWERS } from './support/applications';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  type Session,
} from './support/auth-app';
import { beneficiary, fakeMobile, fakeNid } from './support/fixtures';

// The review screen in bulk: several applications start their review or take their approval in
// one request, each row on its own, the whole request once per Idempotency-Key.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
const at = (s: Session, method: 'get' | 'post', path: string) =>
  api()[method](`/api/v1${path}`).set(bearer(s));

let project: string;
let versionId: string;
let generalVolunteer: string;
let rangpurVolunteer: string;

const bulk = (s: Session, key: string, body: Record<string, unknown>) =>
  at(s, 'post', `/projects/${project}/bulk/review`).set('Idempotency-Key', key).send(body);
const etagOf = async (s: Session, id: string) =>
  (await at(s, 'get', `/applications/${id}`)).headers.etag as string;
const rows = async (s: Session, ids: string[]) =>
  Promise.all(
    ids.map(async (applicationId) => ({
      clientUuid: randomUUID(),
      applicationId,
      ifMatch: await etagOf(s, applicationId),
    })),
  );
/** A submitted application of the general volunteer for a new person, in Dhaka. */
const submitted = async (over: Record<string, unknown> = {}) => {
  const person = await beneficiary(h.db, world.dhaka, over);
  return applicationRow(h.db, {
    projectId: project,
    versionId,
    loc: world.dhaka,
    status: 'submitted',
    beneficiaryId: person,
    ownerVolunteerId: generalVolunteer,
    createdByUserId: world.users.general,
    submittedBy: world.users.general,
    answers: IDENTITY_ANSWERS(fakeNid(), fakeMobile(), world.dhaka),
    over: { submitted_at: new Date() },
  });
};

beforeAll(async () => {
  h = await authHarness();
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
  const ctx = new SeedContext(h.db);
  await seedWorkflows(ctx);
  await seedReferenceLists(ctx);
  const made = await at(await as(world.users.pm), 'post', '/projects').send({
    programId: world.a1.program,
    code: 'BLK',
    year: 2026,
    name: { bn: 'গুচ্ছ', en: 'Bulk' },
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
  rangpurVolunteer = volunteers.rows.find((v) => v.user_id === world.users.rangpurVolunteer)!.id;
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

describe('the review screen in bulk', () => {
  it('starts the review of several applications, each row on its own, and replays the same key', async () => {
    const executive = await as(world.users.executive);
    const ids = await Promise.all([
      submitted(),
      submitted(),
      submitted(),
      submitted(),
      submitted(),
    ]);
    // one of another region: the executive's scope misses it
    const away = await applicationRow(h.db, {
      projectId: project,
      versionId,
      loc: world.rangpur,
      status: 'submitted',
      ownerVolunteerId: rangpurVolunteer,
      over: { submitted_at: new Date() },
    });
    const body = { action: 'review', rows: await rows(executive, [...ids, away]) };
    const key = randomUUID();
    const res = await bulk(executive, key, body);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const results = res.body.data.results as {
      clientUuid: string;
      result: string;
      code: string | null;
      status: string | null;
    }[];
    expect(results).toHaveLength(6);
    for (const row of body.rows.slice(0, 5))
      expect(results.find((r) => r.clientUuid === row.clientUuid)).toMatchObject({
        result: 'done',
        code: null,
        status: 'under_review',
      });
    expect(results.find((r) => r.clientUuid === body.rows[5]!.clientUuid)).toMatchObject({
      result: 'failed',
      code: 'permission.not_found',
      status: null,
    });
    const states = await h.db.query<{ status: string }>(
      'SELECT status FROM applications WHERE id = ANY($1::uuid[])',
      [ids],
    );
    expect(states.rows.every((r) => r.status === 'under_review')).toBe(true);
    // the same key and rows answer the stored results; other rows under the key are a mistake
    const again = await bulk(executive, key, body);
    expect(again.status).toBe(200);
    expect(again.headers['idempotent-replay']).toBe('true');
    expect(again.body.data.results).toEqual(results);
    const other = await bulk(executive, key, {
      action: 'review',
      rows: [{ clientUuid: randomUUID(), applicationId: ids[0], ifMatch: '"x"' }],
    });
    expect(other.status).toBe(422);
    // another official's request under that key is refused too
    const rpm = await as(world.users.rpmDhaka);
    expect((await bulk(rpm, key, body)).status).toBe(422);
    // an audit entry for the batch, and one per moved row
    const audit = await h.db.query<{ action: string }>(
      `SELECT action FROM audit_log WHERE action = 'application.bulk_review' AND entity_id = $1`,
      [project],
    );
    expect(audit.rows).toHaveLength(1);
  });

  it('approves the reviewed ones, failing a blocked person and a stale row on their own', async () => {
    const executive = await as(world.users.executive);
    const rpm = await as(world.users.rpmDhaka);
    const ids = await Promise.all([submitted(), submitted(), submitted({ is_blocked: true })]);
    await h.db.query(`UPDATE applications SET status = 'reviewed' WHERE id = ANY($1::uuid[])`, [
      ids,
    ]);
    const body = { action: 'approve', rows: await rows(rpm, ids) };
    // the second row's version is stale: the application changed after the list was read
    await h.db.query(
      `UPDATE applications SET updated_at = now() + interval '1 second' WHERE id = $1`,
      [ids[1]],
    );
    const res = await bulk(rpm, randomUUID(), body);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const results = res.body.data.results as {
      clientUuid: string;
      result: string;
      code: string | null;
      status: string | null;
    }[];
    expect(results.find((r) => r.clientUuid === body.rows[0]!.clientUuid)).toMatchObject({
      result: 'done',
      status: 'implementation',
    });
    expect(results.find((r) => r.clientUuid === body.rows[1]!.clientUuid)).toMatchObject({
      result: 'failed',
      code: 'conflict.stale_version',
    });
    expect(results.find((r) => r.clientUuid === body.rows[2]!.clientUuid)).toMatchObject({
      result: 'failed',
      code: 'workflow.guard.beneficiary_not_blocked',
    });
    // the executive's approval reaches another project only: every row of this one fails on
    // its own, the request itself stands
    const refused = await bulk(executive, randomUUID(), { action: 'approve', rows: body.rows });
    expect(refused.status, JSON.stringify(refused.body)).toBe(200);
    expect(
      (refused.body.data.results as { result: string; code: string }[]).every(
        (r) => r.result === 'failed' && r.code === 'permission.not_found',
      ),
    ).toBe(true);
    const volunteer = await as(world.users.general);
    const noPermission = await bulk(volunteer, randomUUID(), { action: 'review', rows: body.rows });
    expect(noPermission.status).toBe(403);
    // more than fifty rows, or no key, is a bad request
    const many = {
      action: 'review',
      rows: Array.from({ length: 51 }, () => ({
        clientUuid: randomUUID(),
        applicationId: ids[0],
        ifMatch: '"x"',
      })),
    };
    expect((await bulk(rpm, randomUUID(), many)).status).toBe(422);
    expect(
      (
        await at(rpm, 'post', `/projects/${project}/bulk/review`).send({
          action: 'review',
          rows: body.rows,
        })
      ).status,
    ).toBe(422);
  });

  it('lists the activities of an application within scope', async () => {
    const rpm = await as(world.users.rpmDhaka);
    const id = await submitted();
    const list = await at(rpm, 'get', `/applications/${id}/activities`);
    expect(list.status, JSON.stringify(list.body)).toBe(200);
    expect(list.body.data).toEqual([]);
    const away = await as(world.users.rpmRangpur);
    expect((await at(away, 'get', `/applications/${id}/activities`)).status).toBe(404);
  });
});
