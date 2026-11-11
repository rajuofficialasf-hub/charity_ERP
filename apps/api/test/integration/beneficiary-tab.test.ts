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

  it('answers 401 without a sign-in and 403 to volunteers', async () => {
    expect((await api().get('/api/v1/beneficiaries')).status).toBe(401);
    const volunteer = await as(world.users.general);
    expect((await list(volunteer)).status).toBe(403);
    expect((await statistics(volunteer)).status).toBe(403);
    expect((await profile(volunteer, randomUUID())).status).toBe(403);
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
