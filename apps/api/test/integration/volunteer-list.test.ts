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

// The nationwide volunteer tab: filters, search, counts and the protected parts (DECISION_LOG
// O-67, D-094; plan docs/plans/2026-10-15-1030-feat-volunteer-beneficiary-tabs-plan.md).
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
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
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

async function staff(role: string) {
  const a = await account(h.db, { role });
  accounts.set(a.id, a);
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
    const daee = await staff('official_daee');
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
    const daee = await staff('official_daee');
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
    const daee = await staff('official_daee');
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

describe('the request budget of the list routes', () => {
  let limited: AuthHarness;
  beforeAll(async () => {
    limited = await authHarness({ realRateLimits: true });
    await accessWorld(limited.db);
  });
  afterAll(async () => limited.close());

  it('shares 60 calls a minute per user across the list and its statistics', async () => {
    const head = await account(limited.db, { role: 'department_head' });
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
