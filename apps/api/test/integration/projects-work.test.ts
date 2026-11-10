import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type Account,
  account,
  authHarness,
  type AuthHarness,
  bearer,
  login,
} from './support/auth-app.js';
import * as f from './support/fixtures.js';

// An official's projects by year and the figures of their work there, and who may see them
// (docs/DECISION_LOG.md, the official's own profile of 2026-11-02; docs/BUSINESS_RULES.md,
// "An official's projects" and the rules after it).
let h: AuthHarness;
const api = () => request(h.server());

type Tree = Awaited<ReturnType<typeof f.locationTree>>;
type Project = Awaited<ReturnType<typeof f.project>>;
type Work = {
  id: string;
  roles: { key: string }[];
  areas: { id: string }[];
  wholeProject: boolean;
  figures: {
    area: Record<string, number>;
    mine: Record<string, number | null>;
  };
};

beforeAll(async () => {
  h = await authHarness();
  for (const role of ['project_executive', 'finance_team'])
    await h.db.query(
      `INSERT INTO roles (key, name_bn, name_en, kind, global_scope) VALUES ($1, $1, $1, 'official', false) ON CONFLICT DO NOTHING`,
      [role],
    );
});
afterAll(async () => h.close());

const own = async (who: Account) =>
  api()
    .get('/api/v1/me/projects-work')
    .set(bearer(await login(h, who)));
const of = async (who: Account, userId: string) =>
  api()
    .get(`/api/v1/users/${userId}/projects-work`)
    .set(bearer(await login(h, who)));
const projectsOf = (body: { data: { years: { projects: Work[] }[] } }) =>
  body.data.years.flatMap((y) => y.projects);

const area = (project: Project, location: string, rpm: string) =>
  h.db.query(
    'INSERT INTO project_areas (id, project_id, location_id, rpm_user_id) VALUES ($1, $2, $3, $4)',
    [randomUUID(), project.id, location, rpm],
  );

/** An application with its person, stamped as the engine's columns record a decision. */
const app = async (project: Project, tree: Tree, over: Record<string, unknown> = {}) =>
  f.application(
    h.db,
    { project, loc: tree },
    { beneficiary_id: await f.beneficiary(h.db, tree), ...over },
  );

/** The audit entry the engine writes when an official rejects or waitlists an application. */
const decided = (applicationId: string, actor: string, status: string, at: string) =>
  h.db.query(
    `INSERT INTO audit_log (id, created_at, action, entity_type, entity_id, actor_user_id, new)
     VALUES ($1, $2, $3, 'application', $4, $5, $6)`,
    [
      randomUUID(),
      at,
      `application.${status === 'rejected' ? 'reject' : 'waitlist'}`,
      applicationId,
      actor,
      JSON.stringify({ status, action: status === 'rejected' ? 'reject' : 'waitlist' }),
    ],
  );

const assignVolunteer = async (project: Project, tree: Tree, rpm: string) => {
  const user = await f.volunteerUser(h.db);
  const volunteer = await f.volunteer(h.db, tree, user);
  await h.db.query(
    `INSERT INTO project_volunteers (id, project_id, volunteer_id, region_location_id, permission_set, assigned_by, consent_status)
     VALUES ($1, $2, $3, $4, 'application_distribution', $5, 'accepted')`,
    [randomUUID(), project.id, volunteer, tree.division, rpm],
  );
};

describe("an RPM's own projects", () => {
  it('count the applications of their areas only, and the decisions they made themselves', async () => {
    const mine = await f.locationTree(h.db);
    const other = await f.locationTree(h.db);
    const rpm = await account(h.db, { role: 'regional_program_manager' });
    const colleague = await account(h.db, { role: 'regional_program_manager' });
    const project = await f.project(h.db, { year: 2026, status: 'active' });
    await area(project, mine.division, rpm.id);
    await area(project, other.division, colleague.id);

    const day = (n: number) => new Date(Date.UTC(2026, 9, 1 + n)).toISOString();
    await app(project, mine, { status: 'draft' });
    await app(project, mine, { status: 'submitted', submitted_at: day(0) });
    await app(project, mine, { status: 'under_review', submitted_at: day(0) });
    // reviewed by the RPM in 2 days, approved by the RPM in 4
    await app(project, mine, {
      status: 'approved',
      submitted_at: day(0),
      reviewed_at: day(2),
      reviewed_by: rpm.id,
      approved_at: day(4),
      approved_by: rpm.id,
    });
    // approved by the RPM in 6 days
    await app(project, mine, {
      status: 'approved',
      submitted_at: day(0),
      approved_at: day(6),
      approved_by: rpm.id,
    });
    const rejected = await app(project, mine, { status: 'rejected', submitted_at: day(0) });
    await decided(rejected, rpm.id, 'rejected', day(10));
    const waitlisted = await app(project, mine, { status: 'waitlisted', submitted_at: day(0) });
    await decided(waitlisted, colleague.id, 'waitlisted', day(1));
    // the colleague's region: not in the RPM's area, and the colleague's decision is not theirs
    await app(project, other, {
      status: 'approved',
      submitted_at: day(0),
      approved_at: day(1),
      approved_by: colleague.id,
    });
    await app(project, mine, { status: 'deleted', deleted_at: day(3), submitted_at: day(0) });
    await assignVolunteer(project, mine, rpm.id);
    await assignVolunteer(project, mine, rpm.id);
    await assignVolunteer(project, other, colleague.id);

    const res = await own(rpm);
    expect(res.status).toBe(200);
    expect(res.body.data.everyProject).toBe(false);
    const [work] = projectsOf(res.body);
    expect(work).toMatchObject({
      id: project.id,
      roles: [
        {
          key: 'regional_program_manager',
          name: { bn: 'regional_program_manager', en: 'regional_program_manager' },
        },
      ],
      areas: [{ id: mine.division }],
      wholeProject: false,
    });
    expect(work!.figures.area).toEqual({
      received: 6,
      waiting: 2,
      approved: 2,
      rejected: 1,
      waitlisted: 1,
      volunteers: 2,
    });
    // first decisions after 2, 6 and 10 days: the median is 6
    expect(work!.figures.mine).toEqual({
      reviewed: 1,
      approved: 2,
      rejected: 1,
      waitlisted: 0,
      medianDays: 6,
    });
  });

  it('are grouped by year, newest first, with cancelled projects and ended access left out', async () => {
    const tree = await f.locationTree(h.db);
    const rpm = await account(h.db, { role: 'regional_program_manager' });
    const older = await f.project(h.db, { year: 2024, status: 'closed' });
    const newer = await f.project(h.db, { year: 2026, status: 'active' });
    const cancelled = await f.project(h.db, {
      year: 2026,
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
    });
    for (const p of [older, newer, cancelled]) await area(p, tree.division, rpm.id);
    const executive = await account(h.db, { role: 'project_executive' });
    const ended = await f.project(h.db, { year: 2025 });
    await h.db.query(
      `INSERT INTO project_staff (id, project_id, user_id, role_key, granted_by, ended_at)
       VALUES ($1, $2, $3, 'project_executive', $4, now())`,
      [randomUUID(), ended.id, executive.id, rpm.id],
    );
    await h.db.query(
      `INSERT INTO project_staff (id, project_id, user_id, role_key, granted_by)
       VALUES ($1, $2, $3, 'project_executive', $4)`,
      [randomUUID(), older.id, executive.id, rpm.id],
    );

    const years = (await own(rpm)).body.data.years as { year: number; projects: Work[] }[];
    expect(years.map((y) => [y.year, y.projects.map((p) => p.id)])).toEqual([
      [2026, [newer.id]],
      [2024, [older.id]],
    ]);
    const forExecutive = projectsOf((await own(executive)).body);
    expect(forExecutive.map((p) => [p.id, p.roles.map((r) => r.key), p.wholeProject])).toEqual([
      [older.id, ['project_executive'], true],
    ]);
  });
});

describe('a Program Manager', () => {
  it('works on every project of their program, the whole project as their area', async () => {
    const tree = await f.locationTree(h.db);
    const pm = await account(h.db, { role: 'program_manager' });
    const project = await f.project(h.db, { year: 2026 });
    await h.db.query('UPDATE programs SET pm_user_id = $2 WHERE id = $1', [project.program, pm.id]);
    await app(project, tree, { status: 'submitted' });
    const [work] = projectsOf((await own(pm)).body);
    expect(work).toMatchObject({ id: project.id, wholeProject: true, areas: [] });
    expect(work!.figures.area.received).toBe(1);
  });

  it("sees an official's figures on the program's projects only, and nothing of another program", async () => {
    const tree = await f.locationTree(h.db);
    const pm = await account(h.db, { role: 'program_manager' });
    const inProgram = await f.project(h.db, { year: 2026 });
    const elsewhere = await f.project(h.db, { year: 2026 });
    await h.db.query('UPDATE programs SET pm_user_id = $2 WHERE id = $1', [
      inProgram.program,
      pm.id,
    ]);
    const rpm = await account(h.db, { role: 'regional_program_manager' });
    for (const p of [inProgram, elsewhere]) await area(p, tree.division, rpm.id);
    const stranger = await account(h.db, { role: 'regional_program_manager' });
    await area(elsewhere, tree.division, stranger.id);

    const res = await of(pm, rpm.id);
    expect(res.status).toBe(200);
    expect(projectsOf(res.body).map((p) => p.id)).toEqual([inProgram.id]);
    expect((await of(pm, stranger.id)).status).toBe(404);

    const head = await account(h.db, { role: 'department_head' });
    const all = await of(head, rpm.id);
    expect(
      projectsOf(all.body)
        .map((p) => p.id)
        .sort(),
    ).toEqual([inProgram.id, elsewhere.id].sort());
  });
});

describe('who sees the figures', () => {
  it("refuses another official's figures to an Executive, an RPM and a volunteer", async () => {
    const target = await account(h.db, { role: 'regional_program_manager' });
    for (const who of [
      await account(h.db, { role: 'project_executive' }),
      await account(h.db, { role: 'regional_program_manager' }),
      await account(h.db, { kind: 'volunteer' }),
    ]) {
      const res = await of(who, target.id);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('permission.denied');
    }
  });

  it('finds no official behind a volunteer id, and gives a volunteer no own list', async () => {
    const head = await account(h.db, { role: 'department_head' });
    const volunteer = await account(h.db, { kind: 'volunteer' });
    expect((await of(head, volunteer.id)).status).toBe(404);
    expect((await own(volunteer)).status).toBe(404);
  });

  it('gives a role every project is open to one line instead of a list', async () => {
    for (const role of ['department_head', 'finance_team']) {
      const res = await own(await account(h.db, { role }));
      expect(res.status, role).toBe(200);
      expect(res.body.data).toEqual({ everyProject: true, years: [] });
    }
  });
});
