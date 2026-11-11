import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SeedContext } from '../../seed/context.js';
import { seedReferenceLists } from '../../seed/sets/base/reference-lists.js';
import { seedWorkflows } from '../../seed/sets/base/workflows.js';
import { accessWorld } from './support/access-fixtures.js';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  type Session,
} from './support/auth-app.js';
import { applicationRow } from './support/applications.js';
import { notificationsOf } from './support/notifications.js';
import * as f from './support/fixtures.js';

// A volunteer's own projects and the consent to their rules: no project access without accepting
// the current rules, a rules change asks again, and a team member consents on their own.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
const at = (s: Session, method: 'get' | 'post' | 'put', path: string) =>
  api()[method](`/api/v1${path}`).set(bearer(s));
const text = (bn: string) => ({ bn, en: `${bn} (en)` });
const three = {
  volunteer_duties: text('দায়িত্ব'),
  implementation_process: text('প্রক্রিয়া'),
  misconduct: text('অনিয়ম'),
};
const PARTS = ['volunteer_duties', 'implementation_process', 'misconduct'];

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
});
afterAll(async () => h.close());

/** An active project of the PM's program with saved rules (version 1). */
async function activeProject() {
  const p = await f.project(h.db, { program_id: world.a1.program });
  const saved = await at(await as(world.users.pm), 'put', `/projects/${p.id}/rules`).send(three);
  expect(saved.status).toBe(200);
  await h.db.query(`UPDATE projects SET status = 'active' WHERE id = $1`, [p.id]);
  return p.id;
}
/** A new volunteer with a login, of a type and its role. */
async function newVolunteer(type = 'general') {
  const a = await account(h.db, { kind: 'volunteer', role: `volunteer_${type}` });
  accounts.set(a.id, a);
  const volunteerId = await f.volunteer(h.db, world.dhaka, a.id, { type });
  return { userId: a.id, volunteerId };
}
async function assign(projectId: string, volunteerId: string, consent = 'pending') {
  const id = randomUUID();
  await h.db.query(
    `INSERT INTO project_volunteers (id, project_id, volunteer_id, region_location_id, permission_set, assigned_by, consent_status)
     VALUES ($1, $2, $3, $4, 'application_distribution', $5, $6)`,
    [id, projectId, volunteerId, world.dhaka.division, world.users.rpmDhaka, consent],
  );
  return id;
}
const accept = (s: Session, projectId: string, rulesVersion = 1, parts = PARTS) =>
  at(s, 'post', `/me/projects/${projectId}/consent`).send({
    rulesVersion,
    decision: 'accepted',
    parts,
  });
/** Whether the caller reaches the project: 200, or a refusal (403 without any project, else 404). */
async function reaches(s: Session, projectId: string): Promise<boolean> {
  const { status } = await at(s, 'get', `/projects/${projectId}`);
  expect([200, 403, 404]).toContain(status);
  return status === 200;
}
async function consents(projectId: string, volunteerId: string) {
  const { rows } = await h.db.query<{ decision: string; rules_version: number; parts: string[] }>(
    `SELECT decision, rules_version, parts FROM project_consents
     WHERE project_id = $1 AND volunteer_id = $2 ORDER BY created_at`,
    [projectId, volunteerId],
  );
  return rows;
}

describe('my projects and the consent', () => {
  it('shows a pending project with its rules, and no project access until the rules are accepted', async () => {
    const project = await activeProject();
    const v = await newVolunteer();
    await assign(project, v.volunteerId);
    const s = await as(v.userId);

    const mine = await at(s, 'get', '/me/projects');
    expect(mine.status).toBe(200);
    const item = mine.body.data.find((p: { projectId: string }) => p.projectId === project);
    expect(item).toMatchObject({
      consentStatus: 'pending',
      rulesVersion: 1,
      via: 'assignment',
      permissionSet: 'application_distribution',
      applicationsCounted: 0,
      // a General volunteer assigned to the project may build a team
      leadsTeam: true,
    });
    const detail = await at(s, 'get', `/me/projects/${project}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.rules.version).toBe(1);
    expect(detail.body.data.rules.parts.map((p: { part: string }) => p.part)).toEqual(PARTS);

    expect(await reaches(s, project)).toBe(false);
    // a volunteer without an accepted project holds no project permission at all
    expect((await at(s, 'get', '/projects')).status).toBe(403);
  });

  it('accepts with every part of the current version, then the project opens', async () => {
    const project = await activeProject();
    // two areas: only the RPM of the volunteer's area hears of the answer
    for (const [location, rpm] of [
      [world.dhaka.division, world.users.rpmDhaka],
      [world.rangpur.division, world.users.rpmRangpur],
    ])
      await h.db.query(
        'INSERT INTO project_areas (id, project_id, location_id, rpm_user_id) VALUES ($1, $2, $3, $4)',
        [randomUUID(), project, location, rpm],
      );
    const v = await newVolunteer();
    await assign(project, v.volunteerId);
    const s = await as(v.userId);

    const short = await accept(s, project, 1, ['volunteer_duties']);
    expect(short.status).toBe(422);
    const stale = await accept(s, project, 2);
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('project.rules_changed');

    const ok = await accept(s, project);
    expect(ok.status).toBe(200);
    expect(ok.body.data.consentStatus).toBe('accepted');
    expect(await consents(project, v.volunteerId)).toEqual([
      { decision: 'accepted', rules_version: 1, parts: PARTS },
    ]);
    const { rows } = await h.db.query(
      `SELECT new FROM audit_log WHERE action = 'volunteer.consent' AND entity_id = $1`,
      [project],
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(await reaches(s, project)).toBe(true);
    const list = await at(s, 'get', '/projects');
    expect(list.body.data.map((p: { id: string }) => p.id)).toContain(project);
    const ofProject = async (userId: string) =>
      (await notificationsOf(h.db, 'project_consent_result', userId)).filter(
        (n) => n.params.projectId === project,
      );
    const told = await ofProject(world.users.rpmDhaka);
    expect(told).toHaveLength(1);
    expect(told[0]!.params.result).toMatchObject({ en: 'accepted' });
    expect(await ofProject(world.users.rpmRangpur)).toEqual([]);
  });

  it('keeps a refusal pending and logs it', async () => {
    const project = await activeProject();
    const v = await newVolunteer();
    await assign(project, v.volunteerId);
    const s = await as(v.userId);
    const refused = await at(s, 'post', `/me/projects/${project}/consent`).send({
      rulesVersion: 1,
      decision: 'refused',
    });
    expect(refused.status).toBe(200);
    expect(refused.body.data.consentStatus).toBe('pending');
    expect((await consents(project, v.volunteerId)).map((c) => c.decision)).toEqual(['refused']);
    expect(await reaches(s, project)).toBe(false);
  });

  it('asks again after the rules change, and only for the new version', async () => {
    const project = await activeProject();
    const v = await newVolunteer();
    await assign(project, v.volunteerId);
    const s = await as(v.userId);
    expect((await accept(s, project)).status).toBe(200);
    expect(await reaches(s, project)).toBe(true);

    const changed = await at(await as(world.users.pm), 'put', `/projects/${project}/rules`).send({
      ...three,
      misconduct: text('নতুন নিয়ম'),
    });
    expect(changed.body.data.version).toBe(2);
    expect(await reaches(s, project)).toBe(false);
    const mine = await at(s, 'get', '/me/projects');
    expect(
      mine.body.data.find((p: { projectId: string }) => p.projectId === project),
    ).toMatchObject({ consentStatus: 'pending', rulesVersion: 2 });
    expect((await accept(s, project, 1)).status).toBe(409);
    expect((await accept(s, project, 2)).status).toBe(200);
    expect(await reaches(s, project)).toBe(true);
  });

  it('answers 404 for a project the volunteer is not on, or no longer on', async () => {
    const project = await activeProject();
    const v = await newVolunteer();
    const other = await newVolunteer();
    const assignment = await assign(project, v.volunteerId);
    const s = await as(other.userId);
    expect((await accept(s, project)).status).toBe(404);
    expect((await at(s, 'get', `/me/projects/${project}`)).status).toBe(404);
    await h.db.query('UPDATE project_volunteers SET ended_at = now() WHERE id = $1', [assignment]);
    const mine = await as(v.userId);
    expect((await accept(mine, project)).status).toBe(404);
    expect(
      (await at(mine, 'get', '/me/projects')).body.data.map(
        (p: { projectId: string }) => p.projectId,
      ),
    ).not.toContain(project);
  });

  it('does not show a draft project', async () => {
    const p = await f.project(h.db, { program_id: world.a1.program });
    const v = await newVolunteer();
    await assign(p.id, v.volunteerId);
    const s = await as(v.userId);
    expect(
      (await at(s, 'get', '/me/projects')).body.data.map((x: { projectId: string }) => x.projectId),
    ).not.toContain(p.id);
    expect((await accept(s, p.id)).status).toBe(404);
  });
});

describe('the applications left', () => {
  it('counts the live applications of the main volunteer, for the lead and the team member alike', async () => {
    const project = await activeProject();
    const { rows } = await h.db.query<{ id: string }>(
      'SELECT v.id FROM form_versions v JOIN forms f ON f.id = v.form_id WHERE f.project_id = $1 LIMIT 1',
      [project],
    );
    const versionId = rows[0]!.id;
    await h.db.query(`UPDATE projects SET per_volunteer_limit = 5 WHERE id = $1`, [project]);
    const lead = await newVolunteer('general');
    await assign(project, lead.volunteerId, 'accepted');
    const member = await newVolunteer('team_member');
    await h.db.query(
      `INSERT INTO volunteer_teams (id, project_id, lead_volunteer_id, member_volunteer_id, consent_status, consent_at)
       VALUES ($1, $2, $3, $4, 'accepted', now())`,
      [randomUUID(), project, lead.volunteerId, member.volunteerId],
    );
    // a draft of the team member counts for the lead; a rejected and a deleted one do not
    for (const [status, createdBy, over] of [
      ['draft', member.userId, {}],
      ['submitted', lead.userId, { submitted_at: new Date() }],
      ['rejected', lead.userId, {}],
      ['deleted', lead.userId, { deleted_at: new Date() }],
    ] as const)
      await applicationRow(h.db, {
        projectId: project,
        versionId,
        loc: world.dhaka,
        status,
        ownerVolunteerId: lead.volunteerId,
        createdByUserId: createdBy,
        over,
      });
    for (const userId of [lead.userId, member.userId]) {
      const mine = await at(await as(userId), 'get', '/me/projects');
      expect(
        mine.body.data.find((p: { projectId: string }) => p.projectId === project),
      ).toMatchObject({ applicationsCounted: 2, applicationsLeft: 3 });
    }
  });
});

describe('rules that change while the project runs', () => {
  const daee = text('দায়ীর দায়িত্ব');
  const dawahOn = async (projectId: string) => {
    const pm = await as(world.users.pm);
    const list = await at(pm, 'get', `/projects/${projectId}/components`);
    const row = list.body.data.find((c: { componentKey: string }) => c.componentKey === 'dawah');
    return api()
      .patch(`/api/v1/projects/${projectId}/components/dawah`)
      .set(bearer(pm))
      .set('If-Match', row.etag)
      .send({ enabled: true });
  };

  it('switching dawah on needs the Local দায়ী duties and asks everyone to accept again', async () => {
    const project = await activeProject();
    // a running project keeps its photo rule; dawah starts off
    await h.db.query(
      `INSERT INTO project_components (id, project_id, component_key, enabled, settings) VALUES
       ($1, $3, 'distribution', true, '{"rule":"group"}'), ($2, $3, 'dawah', false, '{}')`,
      [randomUUID(), randomUUID(), project],
    );
    const v = await newVolunteer();
    await assign(project, v.volunteerId);
    const s = await as(v.userId);
    expect((await accept(s, project)).status).toBe(200);

    const refused = await dawahOn(project);
    expect(refused.status).toBe(409);
    expect(refused.body.error.details).toMatchObject([
      { path: 'rules:daee_duties', code: 'validation.required' },
    ]);
    expect(refused.body.error.details).toHaveLength(1);
    const pm = await as(world.users.pm);
    const withDaee = await at(pm, 'put', `/projects/${project}/rules`).send({
      ...three,
      daee_duties: daee,
    });
    expect(withDaee.body.data.version).toBe(2);
    expect((await accept(s, project, 2)).status).toBe(200);
    expect((await dawahOn(project)).status).toBe(200);

    // a new version with the same texts: the volunteer reads the Local দায়ী part too
    expect(await reaches(s, project)).toBe(false);
    const detail = await at(s, 'get', `/me/projects/${project}`);
    expect(detail.body.data.rules.version).toBe(3);
    expect(detail.body.data.rules.parts.map((x: { part: string }) => x.part)).toEqual([
      'volunteer_duties',
      'implementation_process',
      'daee_duties',
      'misconduct',
    ]);
    expect((await accept(s, project, 3)).status).toBe(422);
    expect((await accept(s, project, 3, [...PARTS, 'daee_duties'])).status).toBe(200);
    expect(await reaches(s, project)).toBe(true);
  });

  it('a running project keeps every text its volunteers accept', async () => {
    const project = await activeProject();
    const pm = await as(world.users.pm);
    const emptied = await at(pm, 'put', `/projects/${project}/rules`).send({
      volunteer_duties: three.volunteer_duties,
      implementation_process: three.implementation_process,
      misconduct: { bn: ' ', en: 'x' },
    });
    expect(emptied.status).toBe(409);
    expect(emptied.body.error.details).toMatchObject([
      { path: 'rules:misconduct', code: 'validation.required' },
    ]);
    expect(emptied.body.error.details).toHaveLength(1);
  });

  it('refuses an acceptance of rules that are not complete', async () => {
    const project = await activeProject();
    // rules emptied outside the API: nothing can be accepted until they are complete again
    await h.db.query(`UPDATE projects SET rules = '{}' WHERE id = $1`, [project]);
    const v = await newVolunteer();
    await assign(project, v.volunteerId);
    const res = await accept(await as(v.userId), project);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('project.rules_incomplete');
  });
});

describe('a team member', () => {
  it('consents on their own membership and works only while the main volunteer does', async () => {
    const project = await activeProject();
    const lead = await newVolunteer('general');
    const leadAssignment = await assign(project, lead.volunteerId, 'accepted');
    const member = await newVolunteer('team_member');
    await h.db.query(
      `INSERT INTO volunteer_teams (id, project_id, lead_volunteer_id, member_volunteer_id) VALUES ($1, $2, $3, $4)`,
      [randomUUID(), project, lead.volunteerId, member.volunteerId],
    );
    const s = await as(member.userId);
    const mine = await at(s, 'get', '/me/projects');
    expect(
      mine.body.data.find((p: { projectId: string }) => p.projectId === project),
    ).toMatchObject({
      via: 'team',
      consentStatus: 'pending',
      applicationsCounted: 0,
      leadsTeam: false,
    });
    expect(await reaches(s, project)).toBe(false);
    expect((await accept(s, project)).status).toBe(200);
    expect(await reaches(s, project)).toBe(true);

    // a rules change asks the member again too
    await at(await as(world.users.pm), 'put', `/projects/${project}/rules`).send({
      ...three,
      volunteer_duties: text('নতুন দায়িত্ব'),
    });
    expect(await reaches(s, project)).toBe(false);
    expect((await accept(s, project, 2)).status).toBe(200);
    // the main volunteer must accept again as well before the team works
    expect(await reaches(s, project)).toBe(false);
    expect((await accept(await as(lead.userId), project, 2)).status).toBe(200);
    expect(await reaches(s, project)).toBe(true);

    // without the main volunteer's assignment the team stops
    await h.db.query('UPDATE project_volunteers SET ended_at = now() WHERE id = $1', [
      leadAssignment,
    ]);
    expect(await reaches(s, project)).toBe(false);
    expect(
      (await at(s, 'get', '/me/projects')).body.data.map((p: { projectId: string }) => p.projectId),
    ).not.toContain(project);
  });
});

describe('who may use the own routes', () => {
  it('refuses an official and an anonymous caller', async () => {
    const project = await activeProject();
    expect((await api().get('/api/v1/me/projects')).status).toBe(401);
    const rpm = await as(world.users.rpmDhaka);
    expect((await at(rpm, 'get', '/me/projects')).status).toBe(403);
    expect((await accept(rpm, project)).status).toBe(403);
  });
});
