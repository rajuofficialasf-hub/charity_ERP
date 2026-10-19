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

// The nationwide beneficiary tab and the 360° profile shell: filters, search, counts, the limited
// views of the Media and Procurement Teams and the NID per record (DECISION_LOG O-67, D-094; plan
// docs/plans/2026-10-15-1030-feat-volunteer-beneficiary-tabs-plan.md).
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
/** The year in Bangladesh by the clock the API itself reads. */
let THIS_YEAR: number;

type Tree = Awaited<ReturnType<typeof f.locationTree>>;
type Project = Awaited<ReturnType<typeof f.project>>;

let procurement: Session;
let house: Project;
let otherAttached: Project;

beforeAll(async () => {
  h = await authHarness();
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
  THIS_YEAR = new Date(h.clock.now().getTime() + 6 * 3_600_000).getUTCFullYear();
  // the Procurement Team on one house-construction project and on one project of another kind
  const team = await account(h.db, { role: 'procurement_team' });
  house = await f.project(h.db, { year: THIS_YEAR });
  await h.db.query(`UPDATE workflow_definitions SET key = 'construction' WHERE id = $1`, [
    house.workflow,
  ]);
  otherAttached = await f.project(h.db, { year: THIS_YEAR });
  for (const p of [house, otherAttached])
    await h.db.query(
      `INSERT INTO project_staff (id, project_id, user_id, role_key, granted_by)
       VALUES ($1, $2, $3, 'procurement_team', $3)`,
      [randomUUID(), p.id, team.id],
    );
  procurement = await login(h, team);
});
afterAll(async () => h.close());

async function staff(role: string) {
  return login(h, await account(h.db, { role }));
}

async function person(tree: Tree, over: Record<string, unknown> = {}) {
  return f.beneficiary(h.db, tree, over);
}

async function applyTo(project: Project, tree: Tree, beneficiaryId: string, status = 'approved') {
  return f.application(h.db, { project, loc: tree }, { beneficiary_id: beneficiaryId, status });
}

const list = (s: Session, query: Record<string, string> = {}) =>
  api().get('/api/v1/beneficiaries').query(query).set(bearer(s));
const statistics = (s: Session, query: Record<string, string> = {}) =>
  api().get('/api/v1/beneficiaries/statistics').query(query).set(bearer(s));
const profile = (s: Session, id: string) => api().get(`/api/v1/beneficiaries/${id}`).set(bearer(s));
const ids = (res: request.Response) => (res.body.data as { id: string }[]).map((r) => r.id);
const nidOf = async (id: string) =>
  (await h.db.query('SELECT nid FROM beneficiaries WHERE id = $1', [id])).rows[0].nid as string;

describe('the beneficiary list', () => {
  it('filters by the area cascade, type, project, year and the blocked flag', async () => {
    const tree = await f.locationTree(h.db);
    const widow = await person(tree, { class_code: 'widow' });
    const blocked = await person(tree, { is_blocked: true });
    const applicant = await person(tree);
    const project = await f.project(h.db, { year: 2024 });
    await applyTo(project, tree, applicant);
    const head = await as(world.users.head);
    expect(ids(await list(head, { districtId: tree.district })).sort()).toEqual(
      [widow, blocked, applicant].sort(),
    );
    for (const [column, value] of [
      ['divisionId', tree.division],
      ['upazilaId', tree.upazila],
      ['unionId', tree.union],
    ] as [string, string][])
      expect(ids(await list(head, { [column]: value })).length, column).toBe(3);
    expect(ids(await list(head, { unionId: tree.union, type: 'widow' }))).toEqual([widow]);
    expect(ids(await list(head, { projectId: project.id }))).toEqual([applicant]);
    expect(ids(await list(head, { unionId: tree.union, year: '2024' }))).toEqual([applicant]);
    expect(ids(await list(head, { unionId: tree.union, blocked: 'true' }))).toEqual([blocked]);
    expect((await list(head, { year: '1999' })).status).toBe(422);
    expect((await list(head, { type: 'Widow!' })).status).toBe(422);
  });

  it('searches by name, by mobile for those who see it, and by NID only inside the NID scope', async () => {
    const dhaka = await person(world.dhaka, { name: 'Sample Amena Begum', mobile: '01911000001' });
    const rangpur = await person(world.rangpur);
    const head = await as(world.users.head);
    expect(ids(await list(head, { q: 'amena' }))).toContain(dhaka);
    expect(ids(await list(head, { q: '01911000001' }))).toEqual([dhaka]);
    const rpm = await as(world.users.rpmDhaka);
    expect(ids(await list(rpm, { q: await nidOf(dhaka) }))).toEqual([dhaka]);
    expect(ids(await list(rpm, { q: await nidOf(rangpur) }))).toEqual([]);
    const media = await staff('media_team');
    expect(ids(await list(media, { q: '01911000001' }))).toEqual([]);
    expect(ids(await list(media, { q: await nidOf(dhaka) }))).toEqual([]);
    expect(ids(await list(media, { q: 'amena' }))).toContain(dhaka);
  });

  it('gives the Media Team the name and area to the upazila only, and refuses its hidden filters', async () => {
    const tree = await f.locationTree(h.db);
    const someone = await person(tree, { is_blocked: true });
    const media = await staff('media_team');
    const row = (await list(media, { upazilaId: tree.upazila })).body.data[0];
    expect(row).toMatchObject({ id: someone, name: expect.any(String), upazilaId: tree.upazila });
    for (const key of [
      'unionId',
      'village',
      'mobile',
      'isBlocked',
      'fatherOrHusbandName',
      'classCode',
    ])
      expect(row, key).not.toHaveProperty(key);
    for (const query of [{ unionId: tree.union }, { blocked: 'true' }, { type: 'widow' }] as Record<
      string,
      string
    >[]) {
      const refused = await list(media, query);
      expect(refused.status).toBe(403);
      expect(refused.body.error.code).toBe('permission.denied');
      expect((await statistics(media, query)).status).toBe(403);
    }
  });

  it('gives the Procurement Team only the beneficiaries of its house-construction projects', async () => {
    const tree = await f.locationTree(h.db);
    const inHouse = await person(tree);
    const inOther = await person(tree);
    await applyTo(house, tree, inHouse);
    await applyTo(otherAttached, tree, inOther);
    const res = await list(procurement, { upazilaId: tree.upazila });
    expect(ids(res)).toEqual([inHouse]);
    expect(res.body.data[0]).toMatchObject({ unionId: tree.union, village: expect.any(String) });
    expect(res.body.data[0]).not.toHaveProperty('mobile');
    expect(res.body.data[0]).not.toHaveProperty('isBlocked');
    expect((await profile(procurement, inOther)).status).toBe(404);
    // its project and year filters stay inside its own projects
    const elsewhere = await f.project(h.db, { year: 2024 });
    await applyTo(elsewhere, tree, inHouse);
    expect(ids(await list(procurement, { projectId: elsewhere.id }))).toEqual([]);
    expect(ids(await list(procurement, { projectId: otherAttached.id }))).toEqual([]);
    expect(ids(await list(procurement, { upazilaId: tree.upazila, year: '2024' }))).toEqual([]);
    expect(ids(await list(procurement, { projectId: house.id }))).toContain(inHouse);
    expect((await statistics(procurement, { projectId: elsewhere.id })).body.data.total).toBe(0);
  });

  it('pages with a cursor without repeating or skipping anyone', async () => {
    const tree = await f.locationTree(h.db);
    for (let i = 0; i < 5; i += 1) await person(tree);
    const head = await as(world.users.head);
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list(head, {
        unionId: tree.union,
        limit: '2',
        ...(cursor ? { cursor } : {}),
      });
      seen.push(...ids(page));
      cursor = page.body.meta.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });

  it('jumps to a page number inside the counted range and refuses one past it', async () => {
    const tree = await f.locationTree(h.db);
    for (let i = 0; i < 5; i += 1) await person(tree);
    const head = await as(world.users.head);
    const all = ids(await list(head, { unionId: tree.union, limit: '5' }));
    const second = await list(head, { unionId: tree.union, limit: '2', page: '2' });
    expect(second.status).toBe(200);
    expect(ids(second)).toEqual(all.slice(2, 4));
    expect(second.body.meta.prevCursor).not.toBeNull();
    expect((await list(head, { page: '2', cursor: second.body.meta.nextCursor })).status).toBe(422);
    expect((await list(head, { limit: '100', page: '101' })).status).toBe(422);
  });

  it('answers 401 without a sign-in and 403 to volunteers', async () => {
    expect((await api().get('/api/v1/beneficiaries')).status).toBe(401);
    const volunteer = await as(world.users.general);
    expect((await list(volunteer)).status).toBe(403);
    expect((await statistics(volunteer)).status).toBe(403);
    expect((await profile(volunteer, randomUUID())).status).toBe(403);
  });
});

describe('the statistics of the beneficiary tab', () => {
  it('count everyone, those assisted this year and the blocked, inside the caller scope', async () => {
    const tree = await f.locationTree(h.db);
    const assisted = await person(tree);
    await person(tree, { is_blocked: true });
    await person(tree);
    await applyTo(house, tree, assisted);
    const head = await as(world.users.head);
    const res = await statistics(head, { districtId: tree.district });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.data).toEqual({ total: 3, assistedThisYear: 1, blocked: 1 });
    const media = await staff('media_team');
    expect((await statistics(media, { districtId: tree.district })).body.data).toEqual({
      total: 3,
      assistedThisYear: 1,
    });
    expect((await statistics(procurement, { districtId: tree.district })).body.data).toEqual({
      total: 1,
      assistedThisYear: 1,
    });
  });
});

describe('the 360° profile', () => {
  it('has every section, empty for a new beneficiary', async () => {
    const someone = await person(world.dhaka);
    const head = await as(world.users.head);
    const res = await profile(head, someone);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: someone,
      nid: expect.any(String),
      projectsByYear: [],
      applications: [],
      distributions: [],
      dawah: { attendance: [], progress: [], exams: [] },
      followUps: { calls: [], evaluations: [] },
      activities: [],
      familyMembers: [],
    });
  });

  it('lists the projects by year and the application history', async () => {
    const someone = await person(world.dhaka);
    const older = await f.project(h.db, { year: 2024 });
    await applyTo(older, world.dhaka, someone, 'completed');
    await applyTo(house, world.dhaka, someone, 'submitted');
    const head = await as(world.users.head);
    const data = (await profile(head, someone)).body.data;
    expect(data.projectsByYear.map((y: { year: number }) => y.year)).toEqual([THIS_YEAR, 2024]);
    expect(data.applications).toHaveLength(2);
  });

  it('sends the NID only inside the NID scope of the caller', async () => {
    const dhaka = await person(world.dhaka);
    const rangpur = await person(world.rangpur);
    const rpm = await as(world.users.rpmDhaka);
    expect((await profile(rpm, dhaka)).body.data).toHaveProperty('nid');
    const there = (await profile(rpm, rangpur)).body.data;
    expect(there).not.toHaveProperty('nid');
    expect(there).not.toHaveProperty('birthReg');
  });

  it('gives the Media Team no contact, care or identity data', async () => {
    const someone = await person(world.dhaka);
    const media = await staff('media_team');
    const data = (await profile(media, someone)).body.data;
    for (const key of [
      'nid',
      'birthReg',
      'mobile',
      'familyMembers',
      'unionId',
      'village',
      'dawah',
      'followUps',
      'activities',
      'isBlocked',
      'fatherOrHusbandName',
      'motherName',
      'genderCode',
      'ageYears',
      'classCode',
      'classOtherText',
      'occupationCode',
      'photoFileId',
      'applications',
    ])
      expect(data, key).not.toHaveProperty(key);
    expect(data).toMatchObject({
      name: expect.any(String),
      upazilaId: world.dhaka.upazila,
      projectsByYear: [],
      distributions: [],
    });
  });

  it('shows the Procurement Team only the rows of its house-construction projects', async () => {
    const someone = await person(world.dhaka);
    await applyTo(house, world.dhaka, someone);
    const elsewhere = await f.project(h.db);
    await applyTo(elsewhere, world.dhaka, someone);
    const data = (await profile(procurement, someone)).body.data;
    expect(data.applications.map((a: { projectId: string }) => a.projectId)).toEqual([house.id]);
    expect(data).toMatchObject({ unionId: world.dhaka.union });
    for (const key of ['mobile', 'dawah', 'followUps', 'activities', 'nid', 'fatherOrHusbandName'])
      expect(data, key).not.toHaveProperty(key);
    const head = await as(world.users.head);
    expect((await profile(head, someone)).body.data.applications).toHaveLength(2);
  });

  it('keeps an older distribution when many other activities follow it', async () => {
    const someone = await person(world.dhaka);
    const application = await applyTo(house, world.dhaka, someone);
    const activity = (doneAt: string, type: string) =>
      h.db
        .query(
          `INSERT INTO activities (id, project_id, application_id, type, done_by, done_at)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [randomUUID(), house.id, application, type, world.users.head, doneAt],
        )
        .then((r) => r.rows[0].id as string);
    const distribution = await activity('2026-01-01T08:00:00Z', 'distribution');
    await h.db.query('INSERT INTO distributions (activity_id) VALUES ($1)', [distribution]);
    for (let i = 0; i < 25; i += 1)
      await activity(`2026-02-${String(i + 1).padStart(2, '0')}T08:00:00Z`, 'visit');
    const head = await as(world.users.head);
    const data = (await profile(head, someone)).body.data;
    expect(data.distributions.map((d: { id: string }) => d.id)).toEqual([distribution]);
    expect(data.activities).toHaveLength(20);
  });

  it('answers 404 for a profile merged into another one', async () => {
    const kept = await person(world.dhaka);
    const merged = await person(world.dhaka, { merged_into_id: kept });
    const head = await as(world.users.head);
    expect((await profile(head, merged)).status).toBe(404);
    expect((await profile(head, kept)).status).toBe(200);
  });

  it('answers 404 for an unknown id and 422 for a bad one', async () => {
    const head = await as(world.users.head);
    expect((await profile(head, randomUUID())).status).toBe(404);
    expect((await profile(head, 'lookup-or-not')).status).toBe(422);
  });
});
