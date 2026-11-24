import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import * as f from './support/fixtures.js';

// The nationwide beneficiary tab and the 360° profile shell: filters, search, counts, the limited
// views of the Media and Procurement Teams and the NID per record.
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
  it('filters by the area cascade, type, gender, project, year and the blocked flag', async () => {
    const tree = await f.locationTree(h.db);
    const widow = await person(tree, { class_code: 'widow' });
    const blocked = await person(tree, { is_blocked: true });
    const applicant = await person(tree, { gender_code: 'male' });
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
    expect(ids(await list(head, { unionId: tree.union, gender: 'male' }))).toEqual([applicant]);
    expect(ids(await list(head, { unionId: tree.union, gender: 'female' })).sort()).toEqual(
      [widow, blocked].sort(),
    );
    expect(ids(await list(head, { projectId: project.id }))).toEqual([applicant]);
    expect(ids(await list(head, { unionId: tree.union, year: '2024' }))).toEqual([applicant]);
    expect(ids(await list(head, { unionId: tree.union, blocked: 'true' }))).toEqual([blocked]);
    expect((await list(head, { year: '1999' })).status).toBe(422);
    expect((await list(head, { type: 'Widow!' })).status).toBe(422);
    expect((await list(head, { gender: 'Male!' })).status).toBe(422);
    expect((await list(head, { gender: 'other' })).status).toBe(422);
  });

  it('searches by name, by mobile for those who see it, and by NID only inside the NID scope', async () => {
    const dhaka = await person(world.dhaka, { name: 'Sample Amena Begum', mobile: '01911000001' });
    const rangpur = await person(world.rangpur);
    // both applied to the RPMs' project where they live: the Dhaka RPM reaches the first alone
    await applyTo(world.a1, world.dhaka, dhaka);
    await applyTo(world.a1, world.rangpur, rangpur);
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
      'photoFileId',
    ])
      expect(row, key).not.toHaveProperty(key);
    for (const query of [
      { unionId: tree.union },
      { blocked: 'true' },
      { type: 'widow' },
      { gender: 'female' },
    ] as Record<string, string>[]) {
      const refused = await list(media, query);
      expect(refused.status).toBe(403);
      expect(refused.body.error.code).toBe('permission.denied');
      expect((await statistics(media, query)).status).toBe(403);
    }
  });

  it('carries the photo of a beneficiary in the row, and none for one without a photo', async () => {
    const tree = await f.locationTree(h.db);
    const photo = await f.insert(h.db, 'files', {
      id: randomUUID(),
      bucket: 'photos',
      object_key: `beneficiaries/${randomUUID()}.jpg`,
      kind: 'profile_photo',
      mime: 'image/jpeg',
      size_bytes: 10,
      sha256: randomUUID().replace(/-/g, '').padEnd(64, '0'),
      source: 'camera',
    });
    const pictured = await person(tree, { photo_file_id: photo });
    const plain = await person(tree);
    const head = await as(world.users.head);
    const rows = (await list(head, { unionId: tree.union })).body.data as {
      id: string;
      photoFileId: string | null;
    }[];
    expect(rows.find((r) => r.id === pictured)?.photoFileId).toBe(photo);
    expect(rows.find((r) => r.id === plain)?.photoFileId).toBeNull();
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

  it('shows the times helped, filters the people helped more than once in a year and orders by the count, inside the caller scope', async () => {
    const counted = async (tree: Tree, helps: number, inYear: number) => {
      const id = await person(tree);
      // the kept counters as the moves would leave them
      await h.db.query(
        'UPDATE beneficiaries SET help_count = $2, max_helps_in_year = $3 WHERE id = $1',
        [id, helps, inYear],
      );
      return id;
    };
    const tree = await f.locationTree(h.db);
    const twice = await counted(tree, 2, 2);
    const fiveOld = await counted(tree, 5, 3);
    const never = await counted(tree, 0, 0);
    const spread = await counted(tree, 5, 1);
    const head = await as(world.users.head);
    const rows = (await list(head, { unionId: tree.union })).body.data as {
      id: string;
      helpCount: number;
    }[];
    expect(Object.fromEntries(rows.map((r) => [r.id, r.helpCount]))).toEqual({
      [twice]: 2,
      [fiveOld]: 5,
      [never]: 0,
      [spread]: 5,
    });
    // more than once in one year: not the person helped five times over five years
    expect(
      ids(await list(head, { unionId: tree.union, helpedMoreThanOnceInYear: 'true' })).sort(),
    ).toEqual([twice, fiveOld].sort());
    expect(
      (await statistics(head, { unionId: tree.union, helpedMoreThanOnceInYear: 'true' })).body.data
        .total,
    ).toBe(2);
    // the most helped first, by id among equals (newest first for the ids the API makes), page
    // by page with a cursor
    const fives = [fiveOld, spread].sort();
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list(head, {
        unionId: tree.union,
        sort: '-helpCount',
        limit: '3',
        ...(cursor ? { cursor } : {}),
      });
      expect(page.status, JSON.stringify(page.body)).toBe(200);
      seen.push(...ids(page));
      cursor = page.body.meta.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toEqual([...[...fives].reverse(), twice, never]);
    expect(ids(await list(head, { unionId: tree.union, sort: 'helpCount' }))).toEqual([
      never,
      twice,
      ...fives,
    ]);
    // a cursor of one order is no cursor of another
    const first = await list(head, { unionId: tree.union, sort: '-helpCount', limit: '1' });
    expect(
      (await list(head, { unionId: tree.union, cursor: first.body.meta.nextCursor })).status,
    ).toBe(422);
    // a team that reaches a few projects filters and orders only their people
    const inHouse = await counted(tree, 3, 2);
    await applyTo(house, tree, inHouse);
    const elsewhere = await counted(tree, 4, 2);
    await applyTo(await f.project(h.db, { year: THIS_YEAR }), tree, elsewhere);
    expect(
      ids(await list(procurement, { upazilaId: tree.upazila, helpedMoreThanOnceInYear: 'true' })),
    ).toEqual([inHouse]);
    expect(ids(await list(procurement, { upazilaId: tree.upazila, sort: '-helpCount' }))).toEqual([
      inHouse,
    ]);
    expect(
      ids(await list(head, { upazilaId: tree.upazila, helpedMoreThanOnceInYear: 'true' })).sort(),
    ).toEqual([twice, fiveOld, inHouse, elsewhere].sort());
  });

  it('never tells the times helped to a role without the application history, and refuses its filter and order', async () => {
    const tree = await f.locationTree(h.db);
    const someone = await person(tree);
    await h.db.query(
      'UPDATE beneficiaries SET help_count = 2, max_helps_in_year = 2 WHERE id = $1',
      [someone],
    );
    const media = await staff('media_team');
    const row = (await list(media, { upazilaId: tree.upazila })).body.data[0];
    expect(row).toMatchObject({ id: someone });
    expect(row).not.toHaveProperty('helpCount');
    for (const query of [
      { helpedMoreThanOnceInYear: 'true' },
      { sort: '-helpCount' },
      { sort: 'helpCount' },
    ] as Record<string, string>[]) {
      const refused = await list(media, query);
      expect(refused.status, JSON.stringify(query)).toBe(403);
      expect(refused.body.error.code).toBe('permission.denied');
    }
    expect((await statistics(media, { helpedMoreThanOnceInYear: 'true' })).status).toBe(403);
    // the Procurement Team holds the class: it reads the count of its own people
    const inHouse = await person(tree);
    await applyTo(house, tree, inHouse);
    const own = (await list(procurement, { upazilaId: tree.upazila })).body.data[0];
    expect(own).toMatchObject({ id: inHouse, helpCount: 0 });
    // an order the list does not know is a bad request
    expect((await list(await as(world.users.head), { sort: 'name' })).status).toBe(422);
  });

  it('answers 401 without a sign-in and 403 to volunteers', async () => {
    expect((await api().get('/api/v1/beneficiaries')).status).toBe(401);
    const volunteer = await as(world.users.general);
    expect((await list(volunteer)).status).toBe(403);
    expect((await statistics(volunteer)).status).toBe(403);
    expect((await profile(volunteer, randomUUID())).status).toBe(403);
  });
});

// Whom the tab reaches (docs/BUSINESS_RULES.md, "An official sees a beneficiary and an
// application only through a project they work or worked on").
describe('whom the beneficiary tab reaches', () => {
  it('shows an Executive and an Official দায়ী with two districts the applicants placed there in the own project, also after its close, until the place ends', async () => {
    const first = await f.locationTree(h.db);
    /** Another district of the same division. */
    const sibling = async () => {
      const tree = await f.locationTree(h.db);
      await h.db.query('UPDATE locations SET parent_id = $1 WHERE id = $2', [
        first.division,
        tree.district,
      ]);
      return { ...tree, division: first.division };
    };
    const second = await sibling();
    const third = await sibling();
    const project = await f.project(h.db, { status: 'active' });
    const other = await f.project(h.db, { status: 'active' });
    const here = await f.applicant(h.db, { project, loc: first });
    // sent by whichever volunteer: the place of the application decides, not who brought it
    const there = await f.applicant(h.db, { project, loc: second });
    await f.applicant(h.db, { project, loc: third });
    // lives in the first district, and applied to a project the officials do not work on
    await f.applicant(h.db, { project: other, loc: first });
    await person(first);
    const places: string[] = [];
    const sessions: Session[] = [];
    for (const role of ['project_executive', 'official_daee']) {
      const official = await account(h.db, { role });
      const place = randomUUID();
      places.push(place);
      await h.db.query(
        `INSERT INTO project_staff (id, project_id, user_id, role_key, area_location_id, granted_by)
         VALUES ($1, $2, $3, $4, $5, $3)`,
        [place, project.id, official.id, role, first.division],
      );
      for (const district of [first.district, second.district])
        await h.db.query(
          'INSERT INTO project_staff_districts (id, project_staff_id, location_id) VALUES ($1, $2, $3)',
          [randomUUID(), place, district],
        );
      sessions.push(await login(h, official));
    }
    const seen = async (s: Session) =>
      ids(await list(s, { divisionId: first.division, limit: '100' })).sort();
    const expected = [here, there].sort();
    for (const s of sessions) {
      expect(await seen(s)).toEqual(expected);
      expect((await statistics(s)).body.data.total).toBe(2);
    }
    // closed: the people of the project stay with those who worked on it
    await h.db.query(`UPDATE projects SET status = 'closed' WHERE id = $1`, [project.id]);
    for (const s of sessions) expect(await seen(s)).toEqual(expected);
    // the place ended (a handover ends it the same way): nobody is left
    await h.db.query('UPDATE project_staff SET ended_at = now() WHERE id = ANY($1)', [places]);
    for (const s of sessions) expect(await seen(s)).toEqual([]);
  });

  it('shows an RPM the applicants placed in the own division of the project, and a PM those of every project of the program', async () => {
    // a name of their own, so the list by that name holds these three and nobody else
    const name = `নাগালের মানুষ ${randomUUID().slice(0, 8)}`;
    const dhaka = await person(world.dhaka, { name });
    const rangpur = await person(world.rangpur, { name });
    const second = await person(world.rangpur, { name });
    await applyTo(world.a1, world.dhaka, dhaka);
    await applyTo(world.a1, world.rangpur, rangpur);
    // the program's second project holds no area: its applicants are the PM's alone
    await applyTo(world.a2, world.rangpur, second);
    const people = [dhaka, rangpur, second];
    const listed = async (userId: string) => {
      const s = await as(userId);
      const inList = ids(await list(s, { q: name })).sort();
      // the profile opens for the same people the list shows
      for (const id of people)
        expect((await profile(s, id)).status, id).toBe(inList.includes(id) ? 200 : 404);
      return inList;
    };
    expect(await listed(world.users.rpmDhaka)).toEqual([dhaka]);
    expect(await listed(world.users.rpmRangpur)).toEqual([rangpur]);
    expect(await listed(world.users.pm)).toEqual([...people].sort());
    expect(await listed(world.users.head)).toEqual([...people].sort());
  });
});

describe('the statistics of the beneficiary tab', () => {
  it('count everyone, those assisted this year, the blocked, the men and the women, inside the caller scope', async () => {
    const tree = await f.locationTree(h.db);
    const assisted = await person(tree);
    await person(tree, { is_blocked: true });
    await person(tree, { gender_code: 'male' });
    await applyTo(house, tree, assisted);
    const head = await as(world.users.head);
    const res = await statistics(head, { districtId: tree.district });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.data).toEqual({
      total: 3,
      assistedThisYear: 1,
      blocked: 1,
      male: 1,
      female: 2,
    });
    // the counts follow the filters in use, the gender among them
    expect(
      (await statistics(head, { districtId: tree.district, gender: 'male' })).body.data,
    ).toEqual({ total: 1, assistedThisYear: 0, blocked: 0, male: 1, female: 0 });
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
      mergedInto: null,
      contactLog: [],
      corrections: [],
      blocks: [],
      merges: [],
      files: [],
    });
    const ben = (await h.db.query('SELECT ben_no FROM beneficiaries WHERE id = $1', [someone]))
      .rows[0].ben_no as number;
    expect(res.body.data.benNo).toBe(ben);
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
    await applyTo(world.a1, world.dhaka, dhaka);
    // the Dhaka RPM, given the tab of the Rangpur division too in the panel: the identity still
    // follows the applications of the own project
    await h.db.query(
      `INSERT INTO user_permissions (id, user_id, permission_name, effect, scope_type, scope_ref, reason, granted_by)
       VALUES ($1, $2, 'beneficiary.view_all', 'grant', 'REGION', $3, 'Test grant', $4)`,
      [randomUUID(), world.users.rpmDhaka, world.rangpur.division, world.users.head],
    );
    const rpm = await as(world.users.rpmDhaka);
    expect((await profile(rpm, dhaka)).body.data).toHaveProperty('nid');
    const there = (await profile(rpm, rangpur)).body.data;
    expect(there.id).toBe(rangpur);
    expect(there).not.toHaveProperty('nid');
    expect(there).not.toHaveProperty('birthReg');
    await h.db.query(
      `UPDATE user_permissions SET revoked_at = now(), revoked_by = $2
        WHERE user_id = $1 AND permission_name = 'beneficiary.view_all'`,
      [world.users.rpmDhaka, world.users.head],
    );
  });

  it('answers 404 for a person who never applied to a project of the caller, wherever they live', async () => {
    const neighbour = await person(world.dhaka);
    const applicantHere = await person(world.dhaka);
    await applyTo(world.a1, world.dhaka, applicantHere);
    const elsewhere = await person(world.dhaka);
    await applyTo(world.b1, world.dhaka, elsewhere);
    for (const who of [world.users.rpmDhaka, world.users.executive, world.users.pm]) {
      const s = await as(who);
      expect((await profile(s, applicantHere)).status, who).toBe(200);
      expect((await profile(s, neighbour)).status, who).toBe(404);
      expect((await profile(s, elsewhere)).status, who).toBe(404);
      expect(ids(await list(s, { unionId: world.dhaka.union, limit: '100' }))).not.toContain(
        neighbour,
      );
    }
    // a deleted application reaches nobody; a draft stands, and the office works on its person
    const drafted = await person(world.dhaka);
    await applyTo(world.a1, world.dhaka, drafted, 'draft');
    const removed = await person(world.dhaka);
    await h.db.query(
      `UPDATE applications SET status = 'deleted', deleted_at = now() WHERE id = $1`,
      [await applyTo(world.a1, world.dhaka, removed)],
    );
    for (const who of [world.users.rpmDhaka, world.users.pm]) {
      const s = await as(who);
      expect((await profile(s, removed)).status, who).toBe(404);
      expect((await profile(s, drafted)).status, who).toBe(200);
    }
    // an application placed in another region of the same project is not the Dhaka RPM's
    const far = await person(world.dhaka);
    await applyTo(world.a1, world.rangpur, far);
    expect((await profile(await as(world.users.rpmDhaka), far)).status).toBe(404);
    expect((await profile(await as(world.users.rpmRangpur), far)).status).toBe(200);
    expect((await profile(await as(world.users.pm), far)).status).toBe(200);
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
      'help',
      'trail',
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
    for (const key of [
      'mobile',
      'dawah',
      'followUps',
      'activities',
      'trail',
      'nid',
      'fatherOrHusbandName',
    ])
      expect(data, key).not.toHaveProperty(key);
    const head = await as(world.users.head);
    expect((await profile(head, someone)).body.data.applications).toHaveLength(2);
  });

  it('names who did each step: the audited trail of the person and of the applications the caller sees, the contact changes and the blocks', async () => {
    const someone = await person(world.dhaka);
    const here = await applyTo(world.a1, world.dhaka, someone);
    const elsewhere = await applyTo(world.b1, world.dhaka, someone);
    const audit = (actor: string | null, action: string, type: string, id: string) =>
      h.db.query(
        `INSERT INTO audit_log (id, actor_user_id, action, entity_type, entity_id, reason)
         VALUES ($1, $2, $3, $4, $5, 'a reason the trail never shows')`,
        [randomUUID(), actor, action, type, id],
      );
    await audit(world.users.rpmDhaka, 'application.approve', 'application', here);
    await audit(world.users.pm, 'application.approve', 'application', elsewhere);
    await audit(world.users.executive, 'beneficiary.contact_updated', 'beneficiary', someone);
    await audit(world.users.rpmDhaka, 'beneficiary.looked_up', 'beneficiary', someone);
    await audit(null, 'beneficiary.create', 'beneficiary', someone);
    await h.db.query(
      `INSERT INTO field_changes (id, entity_type, entity_id, field, old_value, new_value, kind, created_by)
       VALUES ($1, 'beneficiary', $2, 'village', '"পুরনো গ্রাম"', '"নতুন গ্রাম"', 'contact_update', $3)`,
      [randomUUID(), someone, world.users.executive],
    );
    await h.db.query(
      `INSERT INTO blocklist (id, subject_type, subject_id, reason, blocked_by, active,
                              released_by, released_at, release_reason)
       VALUES ($1, 'beneficiary', $2, 'নমুনা কারণ', $3, false, $4, now(), 'ভুল করে')`,
      [randomUUID(), someone, world.users.head, world.users.rpmDhaka],
    );
    const nameOf = async (id: string) =>
      (await h.db.query('SELECT display_name FROM users WHERE id = $1', [id])).rows[0]
        .display_name as string;
    const data = (await profile(await as(world.users.rpmDhaka), someone)).body.data;
    const appNo = (await h.db.query('SELECT app_no FROM applications WHERE id = $1', [here]))
      .rows[0].app_no as string | null;
    // the steps of the applications the RPM sees and of the person, never a lookup, and no
    // value or reason of the entry
    expect(data.trail).toEqual([
      expect.objectContaining({ action: 'beneficiary.create', byName: null }),
      expect.objectContaining({
        action: 'beneficiary.contact_updated',
        byName: await nameOf(world.users.executive),
        applicationId: null,
      }),
      expect.objectContaining({
        action: 'application.approve',
        byName: await nameOf(world.users.rpmDhaka),
        applicationId: here,
        appNo,
      }),
    ]);
    expect(JSON.stringify(data.trail)).not.toContain('a reason the trail never shows');
    expect(data.contactLog[0]).toMatchObject({
      field: 'village',
      byName: await nameOf(world.users.executive),
    });
    expect(data.blocks[0]).toMatchObject({
      blockedByName: await nameOf(world.users.head),
      releasedByName: await nameOf(world.users.rpmDhaka),
    });
    // the head sees both projects, so both approvals
    const all = (await profile(await as(world.users.head), someone)).body.data.trail;
    expect(all.map((t: { applicationId: string | null }) => t.applicationId)).toEqual(
      expect.arrayContaining([here, elsewhere]),
    );
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

  it('answers a profile merged into another one with the kept profile it leads to', async () => {
    const kept = await person(world.dhaka);
    const merged = await person(world.dhaka, { merged_into_id: kept });
    const head = await as(world.users.head);
    const res = await profile(head, merged);
    expect(res.status).toBe(200);
    const keptBen = (await h.db.query('SELECT ben_no FROM beneficiaries WHERE id = $1', [kept]))
      .rows[0].ben_no as number;
    expect(res.body.data.mergedInto).toEqual({ id: kept, benNo: keptBen });
  });

  it('shows the contact changes, the corrections and the merges of the person', async () => {
    const someone = await person(world.dhaka, { mobile: '01822000001' });
    await applyTo(world.a1, world.dhaka, someone);
    const twin = await person(world.dhaka);
    const head = await as(world.users.head);
    const tag = (await profile(head, someone)).headers.etag as string;
    await api()
      .patch(`/api/v1/beneficiaries/${someone}/contact`)
      .set(bearer(head))
      .set('If-Match', tag)
      .send({ mobile: '01822000002' })
      .expect(200);
    await api()
      .post(`/api/v1/beneficiaries/${someone}/correction-requests`)
      .set(bearer(await as(world.users.rpmDhaka)))
      .send({ field: 'name', newValue: 'সংশোধিত নাম', reason: 'বানানের ভুল' })
      .expect(201);
    await api()
      .post('/api/v1/beneficiary-merges/direct')
      .set(bearer(head))
      .send({ keptId: someone, mergedId: twin, reason: 'একই মানুষ' })
      .expect(201);
    const data = (await profile(head, someone)).body.data;
    expect(data.contactLog).toEqual([
      expect.objectContaining({
        field: 'mobile',
        oldValue: '01822000001',
        newValue: '01822000002',
      }),
    ]);
    expect(data.corrections).toEqual([
      expect.objectContaining({ field: 'name', newValue: 'সংশোধিত নাম', status: 'submitted' }),
    ]);
    expect(data.merges).toEqual([
      expect.objectContaining({ role: 'kept', otherId: twin, status: 'merged' }),
    ]);
  });

  it('shows the block history to a PM, never to the Media Team or the Procurement Team', async () => {
    const someone = await person(world.dhaka);
    await applyTo(house, world.dhaka, someone);
    await applyTo(world.a1, world.dhaka, someone);
    await api()
      .post(`/api/v1/beneficiaries/${someone}/block`)
      .set(bearer(await as(world.users.rpmDhaka)))
      .send({ reason: 'গোপন ব্লকের কারণ' })
      .expect(201);
    const pm = (await profile(await as(world.users.pm), someone)).body.data;
    expect(pm.blocks).toEqual([
      expect.objectContaining({ reason: 'গোপন ব্লকের কারণ', active: true }),
    ]);
    for (const s of [await staff('media_team'), procurement]) {
      const res = await profile(s, someone);
      expect(res.body.data).not.toHaveProperty('blocks');
      expect(JSON.stringify(res.body)).not.toContain('গোপন ব্লকের কারণ');
    }
  });

  it('says which actions the caller may take on the person, by permission and by state', async () => {
    const someone = await person(world.dhaka);
    const twin = await person(world.dhaka);
    await applyTo(world.a1, world.dhaka, someone);
    const actions = async (s: Session, id = someone) => (await profile(s, id)).body.data.actions;
    const rpm = await as(world.users.rpmDhaka);
    expect(await actions(rpm)).toMatchObject({
      block: true,
      unblock: false,
      editContact: true,
      requestCorrection: true,
      proposeMerge: true,
      merge: false,
      revertMerge: false,
    });
    await api()
      .post(`/api/v1/beneficiaries/${someone}/correction-requests`)
      .set(bearer(rpm))
      .send({ field: 'name', newValue: 'নতুন বানান', reason: 'বানান ঠিক করা' })
      .expect(201);
    await api()
      .post(`/api/v1/beneficiaries/${someone}/block`)
      .set(bearer(rpm))
      .send({ reason: 'যাচাই চলছে' })
      .expect(201);
    expect(await actions(rpm)).toMatchObject({ block: false, unblock: true });
    expect(await actions(await as(world.users.pm))).toMatchObject({
      merge: true,
      decideCorrection: true,
      revertMerge: false,
    });
    const monitoring = await as(world.users.monitoring);
    expect(await actions(monitoring)).toMatchObject({ revertMerge: false });
    await api()
      .post('/api/v1/beneficiary-merges/direct')
      .set(bearer(monitoring))
      .send({ keptId: someone, mergedId: twin, reason: 'একই মানুষ' })
      .expect(201);
    expect(await actions(monitoring)).toMatchObject({ revertMerge: true });
    // a retired profile takes no edits, only the revert of its merge
    expect(await actions(monitoring, twin)).toMatchObject({
      block: false,
      editContact: false,
      merge: false,
      revertMerge: true,
    });
    const media = await actions(await staff('media_team'));
    expect(Object.values(media).every((v) => v === false)).toBe(true);
  });

  it('shows on the kept profile an application left on the retired one, marked so', async () => {
    const kept = await person(world.dhaka);
    const retired = await person(world.dhaka);
    await applyTo(world.a1, world.dhaka, kept);
    const left = await applyTo(world.a1, world.dhaka, retired, 'rejected');
    const head = await as(world.users.head);
    await api()
      .post('/api/v1/beneficiary-merges/direct')
      .set(bearer(head))
      .send({ keptId: kept, mergedId: retired, reason: 'একই মানুষ' })
      .expect(201);
    const data = (await profile(head, kept)).body.data;
    expect(data.merges[0].leftBehind).toBe(1);
    expect(data.applications).toContainEqual(
      expect.objectContaining({ id: left, throughMerge: true }),
    );
  });

  it('keeps identity values of a correction and an NID photo from a caller without the NID class', async () => {
    const someone = await person(world.dhaka);
    await applyTo(world.a1, world.dhaka, someone);
    const rpm = await as(world.users.rpmDhaka);
    await api()
      .post(`/api/v1/beneficiaries/${someone}/correction-requests`)
      .set(bearer(rpm))
      .send({ field: 'nid', newValue: f.fakeNid(), reason: 'কার্ডে নম্বর ভিন্ন' })
      .expect(201);
    const file = await f.insert(h.db, 'files', {
      id: randomUUID(),
      bucket: 'photos',
      object_key: `nid/${randomUUID()}.jpg`,
      kind: 'nid_photo',
      mime: 'image/jpeg',
      size_bytes: 10,
      sha256: randomUUID().replace(/-/g, '').padEnd(64, '0'),
      source: 'camera',
    });
    await f.insert(h.db, 'file_links', {
      id: randomUUID(),
      file_id: file,
      entity_type: 'beneficiary',
      entity_id: someone,
      slot: 'nid_photo',
    });
    const full = (await profile(rpm, someone)).body.data;
    expect(full.corrections[0].newValue).toEqual(expect.any(String));
    expect(full.files).toEqual([expect.objectContaining({ fileId: file, kind: 'nid_photo' })]);
    // the same official without the NID class, as a role without it would read the profile
    const principal = { userId: world.users.rpmDhaka } as never;
    const access = await h.container.access.load(world.users.rpmDhaka);
    const scope = await h.container.access.scopeFor(
      principal,
      access,
      'beneficiary.view_all',
      'beneficiary',
    );
    const classes = new Set([...access.fieldClasses].filter((c) => c !== 'beneficiary.nid'));
    const masked = await h.container.beneficiaries.profile(
      { principal, scope, fieldClasses: classes },
      someone,
    );
    expect(masked.corrections[0]).toMatchObject({ oldValue: null, newValue: null });
    expect(masked.files).toEqual([]);
  });

  it('answers 404 for a retired profile outside the caller scope', async () => {
    const kept = await person(world.dhaka);
    const retired = await person(world.dhaka, { merged_into_id: kept });
    expect((await profile(procurement, retired)).status).toBe(404);
    expect((await profile(procurement, kept)).status).toBe(404);
  });

  it('answers 404 for an unknown id and 422 for a bad one', async () => {
    const head = await as(world.users.head);
    expect((await profile(head, randomUUID())).status).toBe(404);
    expect((await profile(head, 'lookup-or-not')).status).toBe(422);
  });
});
