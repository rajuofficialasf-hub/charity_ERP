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

// The quotas of a project: the PM of its program sets district or union targets in the setup,
// also while the project runs, each change audited; the office reads each area's target, the
// applications received and the ones approved, counted live. A quota only informs the decision.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
const at = (s: Session, method: 'get' | 'patch', path: string) =>
  api()[method](`/api/v1${path}`).set(bearer(s));

const put = async (s: Session, projectId: string, quotas: unknown[]) =>
  at(s, 'patch', `/projects/${projectId}/quotas`).send({ quotas });

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

describe('the quotas of a project', () => {
  it('are set by the PM of the program with each change audited, and read by the office', async () => {
    const pm = await as(world.users.pm);
    const set = await put(pm, world.a1.id, [
      { level: 'district', locationId: world.dhaka.district, target: 50 },
      { level: 'union', locationId: world.dhaka.union, target: 20 },
    ]);
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    const read = await at(await as(world.users.rpmDhaka), 'get', `/projects/${world.a1.id}/quotas`);
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    expect(read.body.data).toEqual([
      expect.objectContaining({
        level: 'district',
        locationId: world.dhaka.district,
        target: 50,
        received: 0,
        approved: 0,
      }),
      expect.objectContaining({
        level: 'union',
        locationId: world.dhaka.union,
        target: 20,
        received: 0,
        approved: 0,
      }),
    ]);
    // a second save replaces the list
    expect(
      (await put(pm, world.a1.id, [{ level: 'union', locationId: world.dhaka.union, target: 1 }]))
        .status,
    ).toBe(200);
    const audit = await h.db.query<{ old: { quotas: unknown[] }; new: { quotas: unknown[] } }>(
      `SELECT old, new FROM audit_log WHERE entity_id = $1 AND action = 'project.quota_change' ORDER BY created_at, id`,
      [world.a1.id],
    );
    expect(audit.rows).toHaveLength(2);
    expect(audit.rows[1]!.old.quotas).toHaveLength(2);
    expect(audit.rows[1]!.new.quotas).toEqual([
      { level: 'union', locationId: world.dhaka.union, target: 1 },
    ]);
  });

  it('counts the applications received and approved in each area, live', async () => {
    const pm = await as(world.users.pm);
    await put(pm, world.a1.id, [
      { level: 'district', locationId: world.dhaka.district, target: 3 },
      { level: 'union', locationId: world.dhaka.union, target: 1 },
    ]);
    for (const [status, approved] of [
      ['submitted', false],
      ['approved', true],
      ['implementation', true],
      ['draft', false],
      ['needs_verification', false],
    ] as const)
      await f.application(
        h.db,
        { project: world.a1, loc: world.dhaka },
        {
          status,
          ...(approved ? { approved_at: new Date() } : {}),
          ...(status === 'draft' || status === 'needs_verification'
            ? {}
            : { beneficiary_id: await f.beneficiary(h.db, world.dhaka) }),
        },
      );
    const read = await at(await as(world.users.pm), 'get', `/projects/${world.a1.id}/quotas`);
    const byLevel = Object.fromEntries(read.body.data.map((q: { level: string }) => [q.level, q]));
    expect(byLevel.district).toMatchObject({ target: 3, received: 3, approved: 2, full: false });
    expect(byLevel.union).toMatchObject({ target: 1, received: 3, approved: 2, full: true });
  });

  it('refuses a target below zero, an area outside the project, and a level that is not the place', async () => {
    const pm = await as(world.users.pm);
    const elsewhere = await f.locationTree(h.db);
    for (const quotas of [
      [{ level: 'union', locationId: world.dhaka.union, target: -1 }],
      [{ level: 'union', locationId: world.dhaka.union, target: 0 }],
      [{ level: 'district', locationId: elsewhere.district, target: 5 }],
      [{ level: 'union', locationId: world.dhaka.district, target: 5 }],
      [{ level: 'upazila', locationId: world.dhaka.upazila, target: 5 }],
      [
        { level: 'union', locationId: world.dhaka.union, target: 5 },
        { level: 'union', locationId: world.dhaka.union, target: 6 },
      ],
    ]) {
      const res = await put(pm, world.a1.id, quotas);
      expect(res.status, JSON.stringify(quotas)).toBe(422);
    }
  });

  it('is refused to an RPM, a PM of another program and a volunteer, and on a closed project', async () => {
    const quotas = [{ level: 'union', locationId: world.dhaka.union, target: 5 }];
    expect((await put(await as(world.users.rpmDhaka), world.a1.id, quotas)).status).toBe(403);
    const otherPm = await account(h.db, { kind: 'staff', role: 'program_manager' });
    accounts.set(otherPm.id, otherPm);
    await h.db.query('UPDATE programs SET pm_user_id = $1 WHERE id = $2', [
      otherPm.id,
      world.b1.program,
    ]);
    // the project is outside the other PM's reach, so it is not found for them
    const foreign = await put(await as(otherPm.id), world.a1.id, quotas);
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe('permission.not_found');
    const volunteer = await as(world.users.general);
    expect((await at(volunteer, 'get', `/projects/${world.a1.id}/quotas`)).status).toBe(403);
    const closed = await f.project(h.db, { program_id: world.a1.program, status: 'closed' });
    await h.db.query(
      `INSERT INTO project_areas (id, project_id, location_id, rpm_user_id) VALUES ($1, $2, $3, $4)`,
      [randomUUID(), closed.id, world.dhaka.division, world.users.rpmDhaka],
    );
    expect((await put(await as(world.users.pm), closed.id, quotas)).status).toBe(409);
  });

  it('asks for a session, and does not know a project that does not exist', async () => {
    for (const method of ['get', 'patch'] as const)
      expect((await api()[method](`/api/v1/projects/${world.a1.id}/quotas`).send({})).status).toBe(
        401,
      );
    const pm = await as(world.users.pm);
    const missing = randomUUID();
    expect((await at(pm, 'get', `/projects/${missing}/quotas`)).status).toBe(404);
    expect((await put(pm, missing, [])).status).toBe(404);
  });
});
