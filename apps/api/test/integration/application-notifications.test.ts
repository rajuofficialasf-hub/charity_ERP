import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SeedContext } from '../../seed/context';
import { seedNotificationTemplates } from '../../seed/sets/base/notifications';
import { seedReferenceLists } from '../../seed/sets/base/reference-lists';
import { seedWorkflows } from '../../seed/sets/base/workflows';
import { accessWorld } from './support/access-fixtures';
import { applicationProject, IDENTITY_ANSWERS } from './support/applications';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  type Session,
} from './support/auth-app';
import { beneficiary, fakeMobile, fakeNid, volunteer } from './support/fixtures';

// The application events of the notification matrix (docs/architecture/NOTIFICATIONS.md, 4.3):
// the region's reviewers hear of a submission, the approvers of a review, the owner volunteer and
// the creating team member of a decision, with the message written for them and never the
// office's reason.
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

const toAnswers = (record: Record<string, unknown>) =>
  Object.entries(record).map(([fieldKey, value]) => ({ fieldKey, value }));
const create = async (s: Session, nid = fakeNid()) => {
  const made = await at(s, 'post', `/projects/${project}/applications`).send({
    clientUuid: randomUUID(),
    projectId: project,
    formVersionId: versionId,
    answers: toAnswers(IDENTITY_ANSWERS(nid, fakeMobile(), world.dhaka)),
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body.data.id as string;
};
const act = async (s: Session, id: string, action: string, body: Record<string, unknown> = {}) => {
  const read = await at(s, 'get', `/applications/${id}`);
  const res = await at(s, 'post', `/applications/${id}/actions/${action}`)
    .set('If-Match', read.headers.etag as string)
    .send(body);
  expect(res.status, `${action}: ${JSON.stringify(res.body)}`).toBe(200);
  return res;
};
const rowsOf = async (key: string, about?: string) =>
  (
    await h.db.query<{ user_id: string; count: number; params: Record<string, unknown> }>(
      `SELECT user_id, count, params FROM notifications WHERE template_key = $1
         AND ($2::text IS NULL OR coalesce_key LIKE $2) ORDER BY created_at`,
      [key, about ? `%${about}%` : null],
    )
  ).rows;

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
  await seedNotificationTemplates(ctx);
  await volunteer(h.db, world.dhaka, world.users.team, { type: 'team_member' });
  const made = await at(await as(world.users.pm), 'post', '/projects').send({
    programId: world.a1.program,
    code: 'NTF',
    year: 2026,
    name: { bn: 'বার্তা', en: 'Messages' },
    source: { kind: 'workflow', workflowKey: 'distribution' },
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  project = made.body.data.id as string;
  ({ versionId } = await applicationProject(h, await as(world.users.monitoring), project));
  const volunteers = await h.db.query<{ id: string; user_id: string }>(
    'SELECT id, user_id FROM volunteers WHERE user_id = ANY($1::uuid[])',
    [[world.users.general, world.users.team]],
  );
  generalVolunteer = volunteers.rows.find((v) => v.user_id === world.users.general)!.id;
  const teamVolunteer = volunteers.rows.find((v) => v.user_id === world.users.team)!.id;
  await h.db.query(
    `INSERT INTO project_areas (id, project_id, location_id, rpm_user_id) VALUES ($1, $2, $3, $4)`,
    [randomUUID(), project, world.dhaka.division, world.users.rpmDhaka],
  );
  await h.db.query(
    `INSERT INTO project_staff (id, project_id, user_id, role_key, area_location_id, extra_permissions, granted_by)
     VALUES ($1, $2, $3, 'project_executive', $4, '{}', $5)`,
    [randomUUID(), project, world.users.executive, world.dhaka.division, world.users.rpmDhaka],
  );
  await h.db.query(
    `INSERT INTO project_volunteers (id, project_id, volunteer_id, region_location_id, permission_set, extra_permissions, assigned_by, consent_status)
     VALUES ($1, $2, $3, $4, 'application_distribution', '{}', $5, 'accepted')`,
    [randomUUID(), project, generalVolunteer, world.dhaka.division, world.users.rpmDhaka],
  );
  await h.db.query(
    `INSERT INTO volunteer_teams (id, project_id, lead_volunteer_id, member_volunteer_id, consent_status, consent_at, created_by)
     VALUES ($1, $2, $3, $4, 'accepted', now(), $5)`,
    [randomUUID(), project, generalVolunteer, teamVolunteer, world.users.general],
  );
});
afterAll(async () => h.close());

describe('the application events', () => {
  it('tells the region’s reviewers of a submission, once per volunteer within the hour', async () => {
    const s = await as(world.users.general);
    const first = await create(s);
    await act(s, first, 'submit');
    const second = await create(s);
    await act(s, second, 'submit');
    const rows = await rowsOf('application_submitted', generalVolunteer);
    const readers = rows.map((r) => r.user_id).sort();
    expect(readers).toEqual([world.users.executive, world.users.rpmDhaka].sort());
    // two submissions of one volunteer collapse into one entry per reader
    expect(rows.every((r) => r.count === 2)).toBe(true);
    expect(rows[0]!.params).toMatchObject({ projectId: project });
    expect(readers).not.toContain(world.users.rpmRangpur);
  });

  it('tells the approvers of a review, and the volunteer of the decision with the message only', async () => {
    const s = await as(world.users.general);
    const executive = await as(world.users.executive);
    const rpm = await as(world.users.rpmDhaka);
    const id = await create(s);
    await act(s, id, 'submit');
    await act(executive, id, 'review');
    await act(executive, id, 'send_for_approval');
    const reviewed = await rowsOf('application_reviewed', generalVolunteer);
    expect(reviewed.map((r) => r.user_id)).toEqual([world.users.rpmDhaka]);
    await act(rpm, id, 'reject', { reason: 'আয় সীমার উপরে', message: 'এবার সম্ভব হলো না' });
    const rejected = await rowsOf('application_rejected', id);
    expect(rejected.map((r) => r.user_id)).toEqual([world.users.general]);
    expect(rejected[0]!.params).toMatchObject({ message: 'এবার সম্ভব হলো না' });
    expect(JSON.stringify(rejected[0]!.params)).not.toContain('আয় সীমার উপরে');
    await act(rpm, id, 'return_to_review', { reason: 'ভুল করে বাতিল' });
    const reopened = await rowsOf('application_reopened', id);
    expect(reopened.map((r) => r.user_id)).toEqual([world.users.general]);
    expect(JSON.stringify(reopened[0]!.params)).not.toContain('ভুল করে বাতিল');
    await act(rpm, id, 'approve');
    const approved = await rowsOf('application_approved', id);
    expect(approved.map((r) => r.user_id)).toEqual([world.users.general]);
  });

  it('tells the lead and the team member who created the application of its approval', async () => {
    const member = await as(world.users.team);
    const lead = await as(world.users.general);
    const executive = await as(world.users.executive);
    const rpm = await as(world.users.rpmDhaka);
    const nid = fakeNid();
    await beneficiary(h.db, world.dhaka, { nid });
    const id = await create(member, nid);
    await act(lead, id, 'submit');
    await act(executive, id, 'review');
    await act(executive, id, 'send_for_approval');
    await act(rpm, id, 'approve');
    const approved = await rowsOf('application_approved', id);
    expect(approved.map((r) => r.user_id).sort()).toEqual(
      [world.users.general, world.users.team].sort(),
    );
  });
});
