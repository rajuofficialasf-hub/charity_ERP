import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SeedContext } from '../../seed/context';
import { seedReferenceLists } from '../../seed/sets/base/reference-lists';
import { seedWorkflows } from '../../seed/sets/base/workflows';
import { accessWorld } from './support/access-fixtures';
import { applicationProject, applicationRow } from './support/applications';
import {
  account,
  type Account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  type Session,
} from './support/auth-app';
import * as f from './support/fixtures';

// The offline data set a volunteer's phone pulls (docs/architecture/OFFLINE_SYNC.md "What is
// cached on the device"): the consented projects, their published forms as the volunteer sees
// them, the own applications by delta with the full id list, and nothing of anyone else.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
const snapshot = (s: Session, query = '', headers: Record<string, string> = {}) =>
  api().get(`/api/v1/sync/snapshot${query}`).set(bearer(s)).set(headers);

let project: string;
let versionId: string;
let generalVolunteer: string;
let rangpurVolunteer: string;
let teamVolunteer: string;

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
  await f.volunteer(h.db, world.dhaka, world.users.team, { type: 'team_member' });
  const made = await api()
    .post('/api/v1/projects')
    .set(bearer(await as(world.users.pm)))
    .send({
      programId: world.a1.program,
      code: 'SNAP',
      year: 2026,
      name: { bn: 'স্ন্যাপশট', en: 'Snapshot' },
      source: { kind: 'workflow', workflowKey: 'distribution' },
    });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  project = made.body.data.id as string;
  ({ versionId } = await applicationProject(h, await as(world.users.monitoring), project));
  const volunteers = await h.db.query<{ id: string; user_id: string }>(
    'SELECT id, user_id FROM volunteers WHERE user_id = ANY($1::uuid[])',
    [[world.users.general, world.users.team, world.users.rangpurVolunteer]],
  );
  const volunteerOf = (userId: string) => volunteers.rows.find((v) => v.user_id === userId)!.id;
  generalVolunteer = volunteerOf(world.users.general);
  teamVolunteer = volunteerOf(world.users.team);
  rangpurVolunteer = volunteerOf(world.users.rangpurVolunteer);
  await h.db.query(
    `INSERT INTO project_areas (id, project_id, location_id, rpm_user_id) VALUES ($1, $2, $3, $4)`,
    [randomUUID(), project, world.dhaka.division, world.users.rpmDhaka],
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

const row = (ownerVolunteerId: string, createdByUserId: string, over = {}) =>
  applicationRow(h.db, {
    projectId: project,
    versionId,
    loc: world.dhaka,
    ownerVolunteerId,
    createdByUserId,
    ...over,
  });

describe('GET /sync/snapshot', () => {
  it('gives a volunteer their consented projects, the forms they see, their own applications and the id list, never a number', async () => {
    const mine = await row(generalVolunteer, world.users.general);
    const bySomeoneElse = await row(rangpurVolunteer, world.users.rangpurVolunteer);
    const s = await as(world.users.general);
    const res = await snapshot(s).expect(200);
    const data = res.body.data;
    expect(data.serverTime).toEqual(expect.any(String));
    expect(data.projects.map((p: { projectId: string }) => p.projectId)).toEqual([project]);
    expect(data.projects[0]).toMatchObject({ consentStatus: 'accepted', via: 'assignment' });
    expect(data.formVersions).toHaveLength(1);
    expect(data.formVersions[0].id).toBe(versionId);
    // the volunteer's definition: no official-only section, and no points
    const sections = data.formVersions[0].sections as { visibility?: string; fields: unknown[] }[];
    expect(sections.some((sec) => sec.visibility === 'official')).toBe(false);
    expect(data.formVersions[0].scoring).toBeUndefined();
    const ids = data.applications.map((a: { id: string }) => a.id);
    expect(ids).toContain(mine);
    expect(ids).not.toContain(bySomeoneElse);
    expect(data.applicationIds).toContain(mine);
    expect(data.applicationIds).not.toContain(bySomeoneElse);
    const summary = data.applications.find((a: { id: string }) => a.id === mine);
    expect(summary).toMatchObject({
      projectId: project,
      status: 'draft',
      etag: expect.any(String),
    });
    // the score is the office's (the mask drops it) and the identity number is never part of the summary
    expect(summary).not.toHaveProperty('totalScore');
    expect(JSON.stringify(res.body)).not.toMatch(/"nid"|"nidNumber"|"birthReg"/);
    expect(data.locationsVersion).toEqual(expect.any(String));
    expect(res.headers.etag).toMatch(/^"[A-Za-z0-9_-]+"$/);
  });

  it('answers only what changed since the given time, and 304 for the same state', async () => {
    const s = await as(world.users.general);
    // the rows are stamped by the database clock, so the delta is asked from its latest change
    const latest = await h.db.query<{ at: Date }>(
      'SELECT max(updated_at) AS at FROM applications WHERE owner_volunteer_id = $1',
      [generalVolunteer],
    );
    // the database keeps microseconds and the phone's time has milliseconds: ask from the next one
    const sinceBefore = new Date(latest.rows[0]!.at.getTime() + 1).toISOString();
    const fresh = await row(generalVolunteer, world.users.general);
    const delta = await snapshot(s, `?since=${encodeURIComponent(sinceBefore)}`).expect(200);
    expect(delta.body.data.applications.map((a: { id: string }) => a.id)).toEqual([fresh]);
    // the id list is always whole
    expect(delta.body.data.applicationIds.length).toBeGreaterThan(1);
    const unchanged = await snapshot(s, `?since=${encodeURIComponent(sinceBefore)}`, {
      'If-None-Match': delta.headers.etag as string,
    });
    expect(unchanged.status).toBe(304);
    await snapshot(s, '?since=yesterday').expect(422);
  });

  it('drops a project whose consent was reset and an application that left the volunteer', async () => {
    const s = await as(world.users.general);
    const moved = await row(generalVolunteer, world.users.general);
    expect((await snapshot(s).expect(200)).body.data.applicationIds).toContain(moved);
    await h.db.query('UPDATE applications SET owner_volunteer_id = $2 WHERE id = $1', [
      moved,
      rangpurVolunteer,
    ]);
    const after = await snapshot(s).expect(200);
    expect(after.body.data.applicationIds).not.toContain(moved);
    await h.db.query(
      `UPDATE project_volunteers SET consent_status = 'pending' WHERE project_id = $1 AND volunteer_id = $2`,
      [project, generalVolunteer],
    );
    const reset = await snapshot(s).expect(200);
    expect(reset.body.data.projects).toEqual([]);
    expect(reset.body.data.formVersions).toEqual([]);
    await h.db.query(
      `UPDATE project_volunteers SET consent_status = 'accepted' WHERE project_id = $1 AND volunteer_id = $2`,
      [project, generalVolunteer],
    );
  });

  it('gives a team member the lead’s project and the drafts they made', async () => {
    const draft = await row(generalVolunteer, world.users.team);
    const s = await as(world.users.team);
    const res = await snapshot(s).expect(200);
    expect(res.body.data.projects[0]).toMatchObject({ projectId: project, via: 'team' });
    expect(res.body.data.applicationIds).toContain(draft);
  });

  it('gives an official who holds the permission empty arrays, and refuses one who does not', async () => {
    const rpm = await snapshot(await as(world.users.rpmDhaka)).expect(200);
    expect(rpm.body.data).toMatchObject({
      projects: [],
      formVersions: [],
      applications: [],
      applicationIds: [],
    });
    const finance = await account(h.db, { kind: 'staff', role: 'finance_team' });
    await snapshot(await login(h, finance)).expect(403);
  });
});
