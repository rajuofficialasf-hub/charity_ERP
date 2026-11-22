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

// The nationwide volunteer tab: filters, search, counts and the protected parts.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);

beforeAll(async () => {
  h = await authHarness();
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  world = await accessWorld(
    h.db,
    { staff: make('staff'), volunteerUser: make('volunteer') },
    { atWork: true },
  );
});
afterAll(async () => h.close());

type Tree = Awaited<ReturnType<typeof f.locationTree>>;

/** A volunteer at an address, with the account state and the volunteer columns given. */
async function someone(
  tree: Tree,
  over: { state?: string; name?: string; volunteer?: Record<string, unknown> } = {},
) {
  const a = await account(h.db, { kind: 'volunteer', state: over.state ?? 'active' });
  accounts.set(a.id, a);
  if (over.name)
    await h.db.query('UPDATE users SET display_name = $1 WHERE id = $2', [over.name, a.id]);
  const volunteerId = await f.volunteer(h.db, tree, a.id, over.volunteer ?? {});
  return { account: a, volunteerId };
}

/** An official with a place in a division on a project at work, so the volunteers there are theirs to see. */
async function placed(role: string, tree: Tree) {
  const a = await account(h.db, { role });
  const project = await f.project(h.db, { status: 'active' });
  await h.db.query(
    `INSERT INTO project_staff (id, project_id, user_id, role_key, area_location_id, granted_by)
     VALUES ($1, $2, $3, $4, $5, $3)`,
    [randomUUID(), project.id, a.id, role, tree.division],
  );
  return login(h, a);
}

const list = (s: Session, query: Record<string, string> = {}) =>
  api().get('/api/v1/volunteers').query(query).set(bearer(s));
const statistics = (s: Session, query: Record<string, string> = {}) =>
  api().get('/api/v1/volunteers/statistics').query(query).set(bearer(s));
const ids = (res: request.Response) => (res.body.data as { id: string }[]).map((r) => r.id);

describe('the volunteer list', () => {
  it('filters by the area cascade, type, state, project and the blocklist', async () => {
    const tree = await f.locationTree(h.db);
    const plain = await someone(tree);
    const pending = await someone(tree, { state: 'pending' });
    const daee = await someone(tree, { volunteer: { type: 'local_daee' } });
    const project = await f.project(h.db);
    await h.db.query(
      `INSERT INTO project_volunteers (id, project_id, volunteer_id, region_location_id, permission_set, assigned_by)
       VALUES ($1, $2, $3, $4, 'application_distribution', $5)`,
      [randomUUID(), project.id, plain.volunteerId, tree.division, world.users.rpmDhaka],
    );
    await h.db.query(
      `INSERT INTO blocklist (id, subject_type, subject_id, reason, blocked_by) VALUES ($1, 'volunteer', $2, 'Test block', $3)`,
      [randomUUID(), daee.volunteerId, world.users.rpmDhaka],
    );
    const head = await as(world.users.head);
    const inTree = await list(head, { districtId: tree.district });
    expect(inTree.status).toBe(200);
    expect(ids(inTree).sort()).toEqual(
      [plain.volunteerId, pending.volunteerId, daee.volunteerId].sort(),
    );
    for (const [column, value] of [
      ['divisionId', tree.division],
      ['upazilaId', tree.upazila],
      ['unionId', tree.union],
    ] as [string, string][])
      expect(ids(await list(head, { [column]: value })).length, column).toBe(3);
    expect(ids(await list(head, { unionId: tree.union, type: 'local_daee' }))).toEqual([
      daee.volunteerId,
    ]);
    expect(ids(await list(head, { unionId: tree.union, state: 'pending' }))).toEqual([
      pending.volunteerId,
    ]);
    expect(ids(await list(head, { projectId: project.id }))).toEqual([plain.volunteerId]);
    expect(ids(await list(head, { unionId: tree.union, blocked: 'true' }))).toEqual([
      daee.volunteerId,
    ]);
    expect(ids(await list(head, { unionId: tree.union, blocked: 'false' })).length).toBe(2);
    const row = (await list(head, { projectId: project.id })).body.data[0];
    expect(row).toMatchObject({
      id: plain.volunteerId,
      state: 'active',
      blocked: false,
      projects: [{ id: project.id, code: expect.any(String) }],
    });
  });

  it('pages with a cursor and refuses a limit over 100', async () => {
    const tree = await f.locationTree(h.db);
    for (let i = 0; i < 3; i += 1) await someone(tree);
    const head = await as(world.users.head);
    const first = await list(head, { unionId: tree.union, limit: '2', include: 'total' });
    expect(first.body.data).toHaveLength(2);
    expect(first.body.meta.total).toBe(3);
    const second = await list(head, {
      unionId: tree.union,
      limit: '2',
      cursor: first.body.meta.nextCursor,
    });
    expect(second.body.data).toHaveLength(1);
    expect(new Set([...ids(first), ...ids(second)]).size).toBe(3);
    expect((await list(head, { limit: '101' })).status).toBe(422);
    expect((await list(head, { state: 'sleeping' })).status).toBe(422);
    expect((await list(head, { divisionId: 'dhaka' })).status).toBe(422);
  });

  it('jumps to a page number inside the counted range, and goes on with its cursors', async () => {
    const tree = await f.locationTree(h.db);
    for (let i = 0; i < 5; i += 1) await someone(tree);
    const head = await as(world.users.head);
    const all = ids(await list(head, { unionId: tree.union, limit: '5' }));
    const third = await list(head, { unionId: tree.union, limit: '2', page: '3' });
    expect(third.status).toBe(200);
    expect(ids(third)).toEqual(all.slice(4));
    // the page before the third one, through its cursor
    const back = await list(head, {
      unionId: tree.union,
      limit: '2',
      cursor: third.body.meta.prevCursor,
    });
    expect(ids(back)).toEqual(all.slice(2, 4));
    const second = await list(head, { unionId: tree.union, limit: '2', page: '2' });
    expect(ids(second)).toEqual(all.slice(2, 4));
    expect(second.body.meta.nextCursor).not.toBeNull();
    // a page and a cursor together, a page past the counted range and page 0 are refused
    expect((await list(head, { page: '2', cursor: second.body.meta.nextCursor })).status).toBe(422);
    expect((await list(head, { limit: '100', page: '101' })).status).toBe(422);
    expect((await list(head, { page: '0' })).status).toBe(422);
  });

  it('searches by name and by the exact mobile number', async () => {
    const tree = await f.locationTree(h.db);
    const named = await someone(tree, { name: 'Sample Rahima Khatun' });
    const head = await as(world.users.head);
    expect(ids(await list(head, { q: 'rahima' }))).toContain(named.volunteerId);
    expect(ids(await list(head, { q: named.account.mobile }))).toEqual([named.volunteerId]);
    expect(ids(await list(head, { q: `+88${named.account.mobile}` }))).toEqual([named.volunteerId]);
  });

  it('finds an NID only inside the sensitive scope of the caller', async () => {
    const nidOf = async (volunteerId: string) =>
      (await h.db.query('SELECT nid FROM volunteers WHERE id = $1', [volunteerId])).rows[0]
        .nid as string;
    const dhaka = await someone(world.dhaka);
    const nid = await nidOf(dhaka.volunteerId);
    const rangpur = await someone(world.rangpur);
    const otherNid = await nidOf(rangpur.volunteerId);
    const rpm = await as(world.users.rpmDhaka);
    expect(ids(await list(rpm, { q: nid }))).toEqual([dhaka.volunteerId]);
    expect(ids(await list(rpm, { q: otherNid }))).toEqual([]);
    // the Official দায়ী of the area lists the volunteer and still finds no NID
    const daee = await placed('official_daee', world.dhaka);
    expect(ids(await list(daee, { unionId: world.dhaka.union }))).toContain(dhaka.volunteerId);
    expect(ids(await list(daee, { q: nid }))).toEqual([]);
    const head = await as(world.users.head);
    expect(ids(await list(head, { q: otherNid }))).toEqual([rangpur.volunteerId]);
  });

  it('sends the category only to callers who see it and refuses its filter to the others', async () => {
    const tree = await f.locationTree(h.db);
    const rated = await someone(tree, { volunteer: { category: 'A', inactive_flag: true } });
    const monitoring = await as(world.users.monitoring);
    const shown = (await list(monitoring, { unionId: tree.union })).body.data[0];
    expect(shown).toMatchObject({ id: rated.volunteerId, category: 'A', inactiveFlag: true });
    expect(ids(await list(monitoring, { unionId: tree.union, category: 'A' }))).toEqual([
      rated.volunteerId,
    ]);
    expect(ids(await list(monitoring, { unionId: tree.union, category: 'inactive' }))).toEqual([
      rated.volunteerId,
    ]);
    const daee = await placed('official_daee', tree);
    const hidden = (await list(daee, { unionId: tree.union })).body.data[0];
    expect(hidden.id).toBe(rated.volunteerId);
    expect(hidden).not.toHaveProperty('category');
    expect(hidden).not.toHaveProperty('inactiveFlag');
    const refused = await list(daee, { unionId: tree.union, category: 'A' });
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('permission.denied');
    expect((await statistics(daee, { category: 'A' })).status).toBe(403);
  });

  it('answers 401 without a sign-in', async () => {
    expect((await api().get('/api/v1/volunteers')).status).toBe(401);
    expect((await api().get('/api/v1/volunteers/statistics')).status).toBe(401);
  });

  it('treats the LIKE wildcards of a name search as letters', async () => {
    const tree = await f.locationTree(h.db);
    await someone(tree, { name: 'Sample Karim' });
    const head = await as(world.users.head);
    expect(ids(await list(head, { unionId: tree.union, q: '%%' }))).toEqual([]);
    expect(ids(await list(head, { unionId: tree.union, q: '__' }))).toEqual([]);
  });

  it('answers 403 to volunteers, team members and paid volunteers, and no-store to officials', async () => {
    for (const role of ['volunteer_general', 'volunteer_team_member', 'volunteer_paid']) {
      const a = await account(h.db, { kind: 'volunteer', role });
      await f.volunteer(h.db, world.dhaka, a.id);
      const s = await login(h, a);
      expect((await list(s)).status, role).toBe(403);
      expect((await statistics(s)).status, role).toBe(403);
    }
    const head = await as(world.users.head);
    for (const res of [await list(head), await statistics(head)])
      expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('the statistics of the volunteer tab', () => {
  it('count the volunteers by state and their applications, for the filters in use', async () => {
    const tree = await f.locationTree(h.db);
    const active = await someone(tree, { volunteer: { inactive_flag: true } });
    await someone(tree, { state: 'pending' });
    await someone(tree, { state: 'blocked' });
    await someone(tree, { state: 'deactivated' });
    const project = await f.project(h.db);
    for (const status of ['draft', 'submitted', 'under_review', 'approved', 'completed'])
      await f.application(
        h.db,
        { project, loc: tree },
        {
          status,
          owner_volunteer_id: active.volunteerId,
          beneficiary_id: await f.beneficiary(h.db, tree),
        },
      );
    const monitoring = await as(world.users.monitoring);
    const res = await statistics(monitoring, { districtId: tree.district });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      volunteers: { total: 4, active: 1, pending: 1, blocked: 1, deactivated: 1, inactive: 1 },
      applications: { total: 4, approved: 2, underReview: 2 },
    });
    const narrower = await statistics(monitoring, { districtId: tree.district, state: 'pending' });
    expect(narrower.body.data.volunteers).toMatchObject({ total: 1, pending: 1, active: 0 });
    expect(narrower.body.data.applications.total).toBe(0);
    // without the rating class there is no inactive count
    const daee = await placed('official_daee', tree);
    const masked = await statistics(daee, { districtId: tree.district });
    expect(masked.body.data.volunteers).not.toHaveProperty('inactive');
    expect(masked.body.data.volunteers.total).toBe(4);
  });

  it('count everyone without a filter, the applications by their owner alone', async () => {
    const tree = await f.locationTree(h.db);
    const owner = await someone(tree);
    const project = await f.project(h.db);
    for (const status of ['draft', 'approved', 'submitted'])
      await f.application(
        h.db,
        { project, loc: tree },
        {
          status,
          owner_volunteer_id: owner.volunteerId,
          beneficiary_id: await f.beneficiary(h.db, tree),
        },
      );
    // an application without an owner volunteer (an official's) is not a volunteer's work
    await f.application(
      h.db,
      { project, loc: tree },
      { status: 'approved', beneficiary_id: await f.beneficiary(h.db, tree) },
    );
    const { rows } = await h.db.query<{ people: string; active: string; work: string }>(
      `SELECT (SELECT count(*) FROM volunteers) AS people,
              (SELECT count(*) FROM volunteers v JOIN users u ON u.id = v.user_id
                WHERE u.state = 'active') AS active,
              (SELECT count(*) FROM applications WHERE owner_volunteer_id IS NOT NULL
                AND status NOT IN ('draft', 'deleted')) AS work`,
    );
    const res = await statistics(await as(world.users.monitoring));
    expect(res.status).toBe(200);
    expect(res.body.data.volunteers.total).toBe(Number(rows[0]!.people));
    expect(res.body.data.volunteers.active).toBe(Number(rows[0]!.active));
    expect(res.body.data.applications.total).toBe(Number(rows[0]!.work));
  });
});

// Whom the tab reaches (docs/BUSINESS_RULES.md, "An official sees the volunteers whose address
// lies in the areas they hold on projects at work").
describe('whom the volunteer tab reaches', () => {
  const total = async (s: Session, query: Record<string, string> = {}) =>
    (await statistics(s, query)).body.data.volunteers.total as number;
  const areaOf = (projectId: string, locationId: string, rpmUserId: string) =>
    h.db.query(
      'INSERT INTO project_areas (id, project_id, location_id, rpm_user_id) VALUES ($1, $2, $3, $4)',
      [randomUUID(), projectId, locationId, rpmUserId],
    );

  it('shows an RPM the volunteers of the own division and nobody of another, in the list and its counts', async () => {
    const near = await someone(world.dhaka);
    const waiting = await someone(world.dhaka, { state: 'pending' });
    const far = await someone(world.rangpur);
    const rpm = await as(world.users.rpmDhaka);
    expect(ids(await list(rpm, { unionId: world.dhaka.union, limit: '100' }))).toEqual(
      expect.arrayContaining([near.volunteerId, waiting.volunteerId]),
    );
    expect(ids(await list(rpm, { unionId: world.rangpur.union }))).toEqual([]);
    expect(await total(rpm, { divisionId: world.rangpur.division })).toBe(0);
    // without a filter the RPM counts the division, as the Department Head counts it there
    const head = await as(world.users.head);
    expect(await total(rpm)).toBe(await total(head, { divisionId: world.dhaka.division }));
    const rangpur = await as(world.users.rpmRangpur);
    expect(ids(await list(rangpur, { unionId: world.rangpur.union, limit: '100' }))).toContain(
      far.volunteerId,
    );
    expect(ids(await list(rangpur, { unionId: world.dhaka.union }))).toEqual([]);
  });

  it('names every project of a volunteer in reach and counts all their applications, also on a project the reader cannot open', async () => {
    const name = `দুই প্রকল্পের স্বেচ্ছাসেবক ${randomUUID().slice(0, 8)}`;
    const near = await someone(world.dhaka, { name });
    // a project of another program, worked in Rangpur: the Dhaka RPM holds nothing on it
    const elsewhere = await f.project(h.db, { status: 'active' });
    await h.db.query(
      `INSERT INTO project_volunteers (id, project_id, volunteer_id, region_location_id, permission_set, extra_permissions, assigned_by, consent_status)
       VALUES ($1, $2, $3, $4, 'application_distribution', '{}', $5, 'accepted')`,
      [
        randomUUID(),
        elsewhere.id,
        near.volunteerId,
        world.rangpur.division,
        world.users.rpmRangpur,
      ],
    );
    await f.application(
      h.db,
      { project: elsewhere, loc: world.rangpur },
      {
        status: 'submitted',
        owner_volunteer_id: near.volunteerId,
        beneficiary_id: await f.beneficiary(h.db, world.rangpur),
      },
    );
    const rpm = await as(world.users.rpmDhaka);
    expect((await api().get(`/api/v1/projects/${elsewhere.id}`).set(bearer(rpm))).status).toBe(404);
    // how busy the volunteer is shows whole: the project by its code and name, and its application
    const rows = (await list(rpm, { q: name })).body.data as {
      id: string;
      projects: { id: string }[];
    }[];
    expect(rows.map((r) => r.id)).toEqual([near.volunteerId]);
    expect(rows[0]!.projects.map((p) => p.id)).toContain(elsewhere.id);
    const counts = (await statistics(rpm, { q: name })).body.data;
    expect(counts.volunteers.total).toBe(1);
    expect(counts.applications.total).toBe(1);
  });

  it('shows an Executive and an Official দায়ী with two districts the volunteers of those districts alone', async () => {
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
    const inFirst = await someone(first);
    const inSecond = await someone(second);
    await someone(third);
    const project = await f.project(h.db, { status: 'active' });
    for (const role of ['project_executive', 'official_daee']) {
      const official = await account(h.db, { role });
      const place = randomUUID();
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
      const s = await login(h, official);
      expect(ids(await list(s, { divisionId: first.division })).sort(), role).toEqual(
        [inFirst.volunteerId, inSecond.volunteerId].sort(),
      );
      expect(await total(s), role).toBe(2);
    }
  });

  it('shows a PM every area of the own program projects at work, and nothing where the program has no area', async () => {
    const near = await someone(world.dhaka);
    const far = await someone(world.rangpur);
    const nowhere = await f.locationTree(h.db);
    await someone(nowhere);
    const pm = await as(world.users.pm);
    expect(ids(await list(pm, { unionId: world.dhaka.union, limit: '100' }))).toContain(
      near.volunteerId,
    );
    expect(ids(await list(pm, { unionId: world.rangpur.union, limit: '100' }))).toContain(
      far.volunteerId,
    );
    expect(ids(await list(pm, { unionId: nowhere.union }))).toEqual([]);
    // the PM of the other program, whose project holds no area
    const other = await account(h.db, { role: 'program_manager' });
    await h.db.query('UPDATE programs SET pm_user_id = $1 WHERE id = $2', [
      other.id,
      world.b1.program,
    ]);
    const s = await login(h, other);
    expect(ids(await list(s))).toEqual([]);
    expect(await total(s)).toBe(0);
  });

  it('is empty while the project is a draft and after its close, and back after the reopen; a draft still offers its area to choose from', async () => {
    const tree = await f.locationTree(h.db);
    const person = await someone(tree);
    const official = await account(h.db, { role: 'regional_program_manager' });
    const project = await f.project(h.db);
    await areaOf(project.id, tree.division, official.id);
    const rpm = await login(h, official);
    const seen = async () => ids(await list(rpm, { unionId: tree.union }));
    const become = (status: string) =>
      h.db.query('UPDATE projects SET status = $1 WHERE id = $2', [status, project.id]);

    expect(await seen()).toEqual([]);
    expect(await total(rpm)).toBe(0);
    // the project's own candidate list reads its areas whatever its state
    const candidates = await api()
      .get(`/api/v1/projects/${project.id}/volunteer-candidates`)
      .set(bearer(rpm));
    expect(candidates.status).toBe(200);
    expect((candidates.body.data as { volunteerId: string }[]).map((c) => c.volunteerId)).toEqual([
      person.volunteerId,
    ]);

    // active, closing, closed, and reopened
    for (const [status, shown] of [
      ['active', true],
      ['closing', true],
      ['closed', false],
      ['active', true],
    ] as const) {
      await become(status);
      expect(await seen(), status).toEqual(shown ? [person.volunteerId] : []);
      expect(await total(rpm), status).toBe(shown ? 1 : 0);
    }
  });

  it('shows an Admin, the Department Head and the Monitoring Team everyone', async () => {
    const near = await someone(world.dhaka);
    const nowhere = await f.locationTree(h.db);
    const far = await someone(nowhere);
    for (const who of [world.users.admin, world.users.head, world.users.monitoring]) {
      const s = await as(who);
      expect(ids(await list(s, { unionId: world.dhaka.union, limit: '100' }))).toContain(
        near.volunteerId,
      );
      expect(ids(await list(s, { unionId: nowhere.union }))).toEqual([far.volunteerId]);
    }
  });
});

describe('the request budget of the list routes', () => {
  let limited: AuthHarness;
  beforeAll(async () => {
    limited = await authHarness({ realRateLimits: true });
    await accessWorld(limited.db);
  });
  afterAll(async () => limited.close());

  it('shares 60 calls a minute per user across the list and its statistics', async () => {
    const head = await account(limited.db, { role: 'admin' });
    const s = await login(limited, head);
    const call = (path: string) =>
      request(limited.server()).get(`/api/v1/volunteers${path}`).set(bearer(s));
    for (let i = 0; i < 30; i += 1) expect((await call('')).status).toBe(200);
    for (let i = 0; i < 30; i += 1) expect((await call('/statistics')).status).toBe(200);
    const refused = await call('');
    expect(refused.status).toBe(429);
    expect(refused.headers['retry-after']).toBeTruthy();
    expect((await call('/statistics')).status).toBe(429);
  }, 60_000);
});
