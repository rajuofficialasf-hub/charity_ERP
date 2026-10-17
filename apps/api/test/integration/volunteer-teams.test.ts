import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accessWorld } from './support/access-fixtures';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  type Session,
} from './support/auth-app';
import * as f from './support/fixtures';

// A main volunteer's team on a project: the volunteers registered with the main volunteer as their
// reference, added and removed by the main volunteer, each consenting on their own (plan
// docs/plans/2026-10-17-0905-feat-templates-consent-assignment-plan.md).
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
const at = (s: Session, method: 'get' | 'post' | 'put', path: string) =>
  api()[method](`/api/v1${path}`).set(bearer(s));
const text = (bn: string) => ({ bn, en: `${bn} (en)` });
const RULES = {
  volunteer_duties: text('দায়িত্ব'),
  implementation_process: text('প্রক্রিয়া'),
  misconduct: text('অনিয়ম'),
};

beforeAll(async () => {
  h = await authHarness();
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
});
afterAll(async () => h.close());

async function activeProject() {
  const p = await f.project(h.db, { program_id: world.a1.program });
  expect(
    (await at(await as(world.users.pm), 'put', `/projects/${p.id}/rules`).send(RULES)).status,
  ).toBe(200);
  await h.db.query(`UPDATE projects SET status = 'active' WHERE id = $1`, [p.id]);
  return p.id;
}
async function volunteer(type = 'general', referenceVolunteerId: string | null = null) {
  const a = await account(h.db, { kind: 'volunteer', role: `volunteer_${type}` });
  accounts.set(a.id, a);
  const volunteerId = await f.volunteer(h.db, world.dhaka, a.id, {
    type,
    reference_volunteer_id: referenceVolunteerId,
  });
  return { userId: a.id, volunteerId };
}
async function assign(projectId: string, volunteerId: string, consent = 'accepted') {
  const id = randomUUID();
  await h.db.query(
    `INSERT INTO project_volunteers (id, project_id, volunteer_id, region_location_id, permission_set, assigned_by, consent_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      projectId,
      volunteerId,
      world.dhaka.division,
      'application_distribution',
      world.users.rpmDhaka,
      consent,
    ],
  );
  return id;
}
/** A main volunteer working on a project, with two volunteers registered under them. */
async function leadWithTwo(type = 'general') {
  const project = await activeProject();
  const lead = await volunteer(type);
  await assign(project, lead.volunteerId);
  const one = await volunteer('general', lead.volunteerId);
  const two = await volunteer('general', lead.volunteerId);
  return { project, lead, one, two, s: await as(lead.userId) };
}
const add = (s: Session, projectId: string, ids: string[]) =>
  at(s, 'post', `/me/projects/${projectId}/team`).send({ memberVolunteerIds: ids });

describe('the team of a main volunteer', () => {
  it('lists those registered under the main volunteer, adds them and removes one', async () => {
    const { project, one, two, s } = await leadWithTwo();
    const stranger = await volunteer('general');
    const before = await at(s, 'get', `/me/projects/${project}/team`);
    expect(before.status).toBe(200);
    expect(before.body.data.members).toEqual([]);
    const ids = (before.body.data.candidates as { volunteerId: string }[]).map(
      (c) => c.volunteerId,
    );
    expect(ids.sort()).toEqual([one.volunteerId, two.volunteerId].sort());
    expect(ids).not.toContain(stranger.volunteerId);
    // a candidate carries no contact or identity details
    expect(Object.keys(before.body.data.candidates[0] as object).sort()).toEqual([
      'displayName',
      'type',
      'volunteerId',
    ]);

    const added = await add(s, project, [one.volunteerId, two.volunteerId]);
    expect(added.status).toBe(201);
    expect(
      (added.body.data.members as { volunteerId: string; consentStatus: string }[]).map(
        (m) => m.consentStatus,
      ),
    ).toEqual(['pending', 'pending']);
    expect(added.body.data.candidates).toEqual([]);

    const removed = await at(s, 'post', `/me/projects/${project}/team/${one.volunteerId}/remove`);
    expect(removed.status).toBe(204);
    const after = await at(s, 'get', `/me/projects/${project}/team`);
    expect(
      (after.body.data.members as { volunteerId: string }[]).map((m) => m.volunteerId),
    ).toEqual([two.volunteerId]);
    const { rows } = await h.db.query(
      `SELECT action FROM audit_log WHERE entity_id = $1 AND action LIKE 'volunteer.team_%' ORDER BY created_at`,
      [project],
    );
    expect(rows.map((r) => r.action)).toEqual(['volunteer.team_added', 'volunteer.team_removed']);
  });

  it('lets a দাঈ-স্বেচ্ছাসেবক lead a team, never a Local দায়ী', async () => {
    const both = await leadWithTwo('both');
    expect((await add(both.s, both.project, [both.one.volunteerId])).status).toBe(201);
    const daee = await leadWithTwo('local_daee');
    expect((await add(daee.s, daee.project, [daee.one.volunteerId])).status).toBe(403);
  });

  it('refuses someone registered under another volunteer, and a main volunteer without consent', async () => {
    const { project, s } = await leadWithTwo();
    const other = await volunteer('general');
    const foreign = await volunteer('general', other.volunteerId);
    expect((await add(s, project, [foreign.volunteerId])).status).toBe(422);

    const pending = await activeProject();
    const lead = await volunteer('general');
    await assign(pending, lead.volunteerId, 'pending');
    const mine = await volunteer('general', lead.volunteerId);
    expect((await add(await as(lead.userId), pending, [mine.volunteerId])).status).toBe(403);
  });

  it('keeps a member on one team of a project, and apart from the assigned volunteers', async () => {
    const { project, lead, one, s } = await leadWithTwo();
    expect((await add(s, project, [one.volunteerId])).status).toBe(201);
    // a second main volunteer on the same project with the same member registered under the first
    const second = await volunteer('general');
    await assign(project, second.volunteerId);
    await h.db.query('UPDATE volunteers SET reference_volunteer_id = $1 WHERE id = $2', [
      second.volunteerId,
      one.volunteerId,
    ]);
    const twice = await add(await as(second.userId), project, [one.volunteerId]);
    expect(twice.status).toBe(409);
    expect(twice.body.error.code).toBe('volunteer.already_on_team');
    // a volunteer assigned to the project cannot join a team on it
    const assigned = await volunteer('general', lead.volunteerId);
    await assign(project, assigned.volunteerId);
    const onProject = await add(s, project, [assigned.volunteerId]);
    expect(onProject.status).toBe(409);
    expect(onProject.body.error.code).toBe('volunteer.already_assigned');
  });

  it('lets the member reach the project only after their own consent', async () => {
    const { project, one, s } = await leadWithTwo();
    expect((await add(s, project, [one.volunteerId])).status).toBe(201);
    const member = await as(one.userId);
    expect((await at(member, 'get', `/projects/${project}`)).status).toBe(403);
    const consent = await at(member, 'post', `/me/projects/${project}/consent`).send({
      rulesVersion: 1,
      decision: 'accepted',
      parts: ['volunteer_duties', 'implementation_process', 'misconduct'],
    });
    expect(consent.status).toBe(200);
    expect((await at(member, 'get', `/projects/${project}`)).status).toBe(200);
  });

  it('answers 404 for a project the caller is not on, and a member not on their team', async () => {
    const { project, two, s } = await leadWithTwo();
    const outsider = await volunteer('general');
    const elsewhere = await activeProject();
    await assign(elsewhere, outsider.volunteerId);
    const o = await as(outsider.userId);
    expect((await at(o, 'get', `/me/projects/${project}/team`)).status).toBe(404);
    expect((await add(o, project, [two.volunteerId])).status).toBe(404);
    expect(
      (await at(s, 'post', `/me/projects/${project}/team/${two.volunteerId}/remove`)).status,
    ).toBe(404);
  });
});
