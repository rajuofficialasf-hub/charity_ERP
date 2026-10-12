import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accessWorld, grantRole } from './support/access-fixtures';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  PASSWORD,
  type Session,
} from './support/auth-app';
import * as f from './support/fixtures';

// Staff handover before deactivation (BD-08, BR-034; plan
// docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md, unit U10).
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

async function official(role: string) {
  const a = await account(h.db, { role });
  accounts.set(a.id, a);
  return a;
}

/** An RPM leaving with two project areas, and the RPM who takes over. */
async function leavingRpm() {
  const leaving = await official('regional_program_manager');
  const project = await f.project(h.db);
  const areas: string[] = [];
  for (const tree of [await f.locationTree(h.db), await f.locationTree(h.db)]) {
    const id = randomUUID();
    await h.db.query(
      'INSERT INTO project_areas (id, project_id, location_id, rpm_user_id) VALUES ($1, $2, $3, $4)',
      [id, project.id, tree.division, leaving.id],
    );
    areas.push(id);
  }
  return { leaving, areas, target: await official('regional_program_manager') };
}

const handover = (s: Session, userId: string) =>
  api().get(`/api/v1/users/${userId}/handover`).set(bearer(s));
const assign = (s: Session, userId: string, body: object) =>
  api().post(`/api/v1/users/${userId}/handover`).set(bearer(s)).send(body);
const complete = (s: Session, userId: string) =>
  api().post(`/api/v1/users/${userId}/handover/complete`).set(bearer(s));
const rpmOf = async (areaId: string) =>
  (await h.db.query('SELECT rpm_user_id FROM project_areas WHERE id = $1', [areaId])).rows[0]
    .rpm_user_id as string;
const versionOf = async (userId: string) =>
  (await h.db.query('SELECT permission_version FROM users WHERE id = $1', [userId])).rows[0]
    .permission_version as number;

describe('the handover of an official', () => {
  it("lists an RPM's areas and a PM's program by category", async () => {
    const { leaving, areas } = await leavingRpm();
    const head = await as(world.users.head);
    const res = await handover(head, leaving.id);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: null, fromUserId: leaving.id, outstandingCount: 2 });
    expect(res.body.data.pending.map((i: { itemId: string }) => i.itemId).sort()).toEqual(
      areas.sort(),
    );
    expect(
      res.body.data.pending.every(
        (i: { category: string; itemType: string }) =>
          i.category === 'projects' && i.itemType === 'project_area',
      ),
    ).toBe(true);

    const pm = await official('program_manager');
    const program = (await f.project(h.db)).program;
    await h.db.query('UPDATE programs SET pm_user_id = $1 WHERE id = $2', [pm.id, program]);
    const pmItems = (await handover(head, pm.id)).body.data.pending;
    expect(pmItems).toEqual([
      expect.objectContaining({ category: 'projects', itemType: 'program', itemId: program }),
    ]);
  });

  it('reassigns one item, then all; starts once, bumps both versions and audits', async () => {
    const { leaving, areas, target } = await leavingRpm();
    const head = await as(world.users.head);
    const before = [await versionOf(leaving.id), await versionOf(target.id)];
    const one = await assign(head, leaving.id, {
      toUserId: target.id,
      items: [{ itemType: 'project_area', itemId: areas[0] }],
    });
    expect(one.status).toBe(200);
    expect(one.body.data.outstandingCount).toBe(1);
    expect(one.body.data.id).toEqual(expect.any(String));
    expect(await rpmOf(areas[0]!)).toBe(target.id);
    expect(await rpmOf(areas[1]!)).toBe(leaving.id);
    expect(await versionOf(leaving.id)).toBeGreaterThan(before[0]!);
    expect(await versionOf(target.id)).toBeGreaterThan(before[1]!);

    const all = await assign(head, leaving.id, { toUserId: target.id });
    expect(all.status).toBe(200);
    expect(all.body.data).toMatchObject({ id: one.body.data.id, outstandingCount: 0, pending: [] });
    expect(await rpmOf(areas[1]!)).toBe(target.id);
    expect(all.body.data.scope.items).toHaveLength(2);

    const actions = (
      await h.db.query(
        `SELECT action FROM audit_log WHERE entity_id = $1 AND action LIKE 'auth.handover%' ORDER BY created_at`,
        [leaving.id],
      )
    ).rows.map((r) => r.action as string);
    expect(actions.filter((a) => a === 'auth.handover_started')).toHaveLength(1);
    expect(actions).toContain('auth.handover_assigned');
  });

  it('refuses a volunteer, a closed official, an unfitting role and the person as target', async () => {
    const { leaving, target } = await leavingRpm();
    const head = await as(world.users.head);
    const closed = await official('regional_program_manager');
    await h.db.query(`UPDATE users SET state = 'deactivated' WHERE id = $1`, [closed.id]);
    const unfitting = await official('program_manager');
    for (const toUserId of [world.users.general, closed.id, unfitting.id, leaving.id]) {
      const res = await assign(head, leaving.id, { toUserId });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('handover.target_invalid');
    }
    expect((await assign(head, leaving.id, { toUserId: target.id, items: [] })).status).toBe(200);
  });

  it('refuses an item of another user and an item already handed over', async () => {
    const a = await leavingRpm();
    const b = await leavingRpm();
    const head = await as(world.users.head);
    const foreign = await assign(head, a.leaving.id, {
      toUserId: a.target.id,
      items: [{ itemType: 'project_area', itemId: b.areas[0] }],
    });
    expect(foreign.status).toBe(422);
    const first = {
      toUserId: a.target.id,
      items: [{ itemType: 'project_area', itemId: a.areas[0] }],
    };
    expect((await assign(head, a.leaving.id, first)).status).toBe(200);
    expect((await assign(head, a.leaving.id, first)).status).toBe(422);
    expect(await rpmOf(b.areas[0]!)).toBe(b.leaving.id);
  });

  it('completes only without outstanding items; then the state change deactivates', async () => {
    const { leaving, target } = await leavingRpm();
    const monitoring = await as(world.users.monitoring);
    const early = await complete(monitoring, leaving.id);
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('handover.items_outstanding');
    const deactivate = async () => {
      const etag = (await api().get(`/api/v1/users/${leaving.id}`).set(bearer(monitoring))).headers
        .etag as string;
      return api()
        .post(`/api/v1/users/${leaving.id}/state`)
        .set(bearer(monitoring))
        .set('If-Match', etag)
        .send({ state: 'deactivated', reason: 'চাকরি ছেড়েছেন' });
    };
    const refused = await deactivate();
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('user.handover_required');

    expect((await assign(monitoring, leaving.id, { toUserId: target.id })).status).toBe(200);
    const done = await complete(monitoring, leaving.id);
    expect(done.status).toBe(200);
    expect(done.body.data.completedAt).toEqual(expect.any(String));
    const still = await h.db.query('SELECT state FROM users WHERE id = $1', [leaving.id]);
    expect(still.rows[0].state).toBe('active');

    expect((await deactivate()).status).toBe(200);
    const loginRes = await api()
      .post('/api/v1/auth/login')
      .send({ loginId: leaving.loginId, password: PASSWORD });
    expect(loginRes.status).toBe(403);
    expect(loginRes.body.error.code).toBe('auth.account_deactivated');
    const kept = await h.db.query('SELECT completed_at FROM handovers WHERE from_user_id = $1', [
      leaving.id,
    ]);
    expect(kept.rows).toHaveLength(1);
    const actions = (
      await h.db.query(`SELECT action FROM audit_log WHERE entity_id = $1`, [leaving.id])
    ).rows.map((r) => r.action as string);
    expect(actions).toContain('auth.handover_completed');
  });

  it('a project staff row moves to an official holding the same role', async () => {
    const leaving = await official('project_executive');
    const project = await f.project(h.db);
    const staffRow = randomUUID();
    await h.db.query(
      `INSERT INTO project_staff (id, project_id, user_id, role_key, granted_by) VALUES ($1, $2, $3, 'project_executive', $3)`,
      [staffRow, project.id, leaving.id],
    );
    const target = await official('regional_program_manager');
    await grantRole(h.db, target.id, 'project_executive');
    const head = await as(world.users.head);
    const res = await assign(head, leaving.id, { toUserId: target.id });
    expect(res.status).toBe(200);
    const rows = await h.db.query(
      'SELECT user_id, ended_at FROM project_staff WHERE project_id = $1 ORDER BY created_at',
      [project.id],
    );
    expect(rows.rows.map((r) => [r.user_id, r.ended_at === null])).toEqual([
      [leaving.id, false],
      [target.id, true],
    ]);
  });

  it('a PM gets 403 on the handover', async () => {
    const { leaving } = await leavingRpm();
    expect((await handover(await as(world.users.pm), leaving.id)).status).toBe(403);
  });
});
