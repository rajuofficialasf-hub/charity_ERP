import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { projectWhere } from '../../src/access/scope';
import type { Principal } from '../../src/auth/principal';
import { accessWorld } from './support/access-fixtures';
import { project, volunteer } from './support/fixtures';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  type Session,
} from './support/auth-app';

// Cross-region and cross-project access (docs/plans/2026-10-12-1100-feat-rbac-permission-panel-plan.md;
// RBAC.md 8.4: 404, never 403,
// for a record outside the caller's scope). Entities whose endpoints come in later tasks
// (applications, beneficiaries, volunteers) get their scope filters and IDOR tests with them.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
let c1: string; // a project with an area only in the other division (Rangpur)
const accounts = new Map<string, Account>();
const field: Record<string, string> = {};
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
  c1 = (await project(h.db)).id;
  await h.db.query(
    'INSERT INTO project_areas (id, project_id, location_id, rpm_user_id) VALUES ($1, $2, $3, $4)',
    [randomUUID(), c1, world.rangpur.division, world.users.rpmRangpur],
  );
  // field roles of A1 in Dhaka that the shared world does not assign
  const assign = (volunteerId: string, set: string) =>
    h.db.query(
      `INSERT INTO project_volunteers (id, project_id, volunteer_id, region_location_id, permission_set, assigned_by, consent_status)
       VALUES ($1, $2, $3, $4, $5, $6, 'accepted')`,
      [randomUUID(), world.a1.id, volunteerId, world.dhaka.division, set, world.users.rpmDhaka],
    );
  const paidUser = await make('volunteer')('volunteer_paid');
  await assign(await volunteer(h.db, world.dhaka, paidUser, { type: 'paid' }), 'work_progress');
  const teamVolunteer = await volunteer(h.db, world.dhaka, world.users.team, {
    type: 'team_member',
  });
  await assign(teamVolunteer, 'application_distribution');
  const procurement = await make('staff')('procurement_team');
  await h.db.query(
    `INSERT INTO project_staff (id, project_id, user_id, role_key, area_location_id, granted_by)
     VALUES ($1, $2, $3, 'procurement_team', $4, $5)`,
    [randomUUID(), world.a1.id, procurement, world.dhaka.division, world.users.rpmDhaka],
  );
  Object.assign(field, {
    rpm: world.users.rpmDhaka,
    executive: world.users.executive,
    volunteer: world.users.general,
    teamMember: world.users.team,
    localDaee: world.users.daee,
    paidVolunteer: paidUser,
    procurement,
  });
});

afterAll(async () => {
  await h.close();
});

const PROTECTED_KEYS = [
  'nid',
  'nidPhotoFileId',
  'nidPhotoBackFileId',
  'bankName',
  'bankAccountName',
  'bankAccountNumber',
  'bankRoutingNumber',
  'bloodGroup',
  'dateOfBirth',
  'category',
  'ratings',
];
const keysOf = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.flatMap(keysOf)
    : value && typeof value === 'object'
      ? Object.entries(value).flatMap(([k, v]) => [k, ...keysOf(v)])
      : [];

describe('endpoints answer 404 outside the region and the project', () => {
  it("refuses the Dhaka RPM a Rangpur volunteer's profile, sessions and permissions", async () => {
    const rpm = await as(world.users.rpmDhaka);
    for (const path of [
      `/api/v1/users/${world.users.rangpurVolunteer}`,
      `/api/v1/users/${world.users.rangpurVolunteer}/sessions`,
      `/api/v1/users/${world.users.rangpurVolunteer}/effective-permissions`,
      `/api/v1/users/${world.users.outsider}`,
    ]) {
      const res = await api().get(path).set(bearer(rpm)).expect(404);
      expect(res.body.error.code, path).toBe('permission.not_found');
    }
    // the same RPM reaches the own region's volunteer
    await api().get(`/api/v1/users/${world.users.general}`).set(bearer(rpm)).expect(200);
  });

  it("refuses the Dhaka RPM project grants on a project of another region's RPM", async () => {
    const rpm = await as(world.users.rpmDhaka);
    const res = await api()
      .post(`/api/v1/projects/${c1}/grants`)
      .set(bearer(rpm))
      .send({ userId: world.users.rpmRangpur, permissions: [], reason: 'Cross-region attempt' })
      .expect(404);
    expect(res.body.error.code).toBe('permission.not_found');
  });

  it("never lets a field role revoke another user's session (own sessions only)", async () => {
    const victim = await as(world.users.rangpurVolunteer);
    const { rows } = await h.db.query(
      'SELECT id FROM device_sessions WHERE user_id = $1 AND revoked_at IS NULL',
      [world.users.rangpurVolunteer],
    );
    for (const [name, userId] of Object.entries(field)) {
      const s: Session = await as(userId);
      const own = await api().get('/api/v1/sessions').set(bearer(s)).expect(200);
      expect(
        (own.body.data as { id: string }[]).some((r) => r.id === rows[0].id),
        name,
      ).toBe(false);
      const res = await api()
        .post(`/api/v1/sessions/${rows[0].id}/revoke`)
        .set(bearer(s))
        .send({})
        .expect(404);
      expect(res.body.error.code, name).toBe('permission.not_found');
    }
    const after = await h.db.query('SELECT revoked_at FROM device_sessions WHERE id = $1', [
      rows[0].id,
    ]);
    expect(after.rows[0].revoked_at).toBeNull();
    await api().get('/api/v1/auth/me').set(bearer(victim)).expect(200);
  });
});

describe('the project filter of every field role', () => {
  const reached = async (userId: string) => {
    const access = await h.container.access.load(userId);
    const principal = { userId } as Principal;
    const scope = await h.container.access.scopeFor(principal, access, 'project.view', 'project');
    const projects = await h.container.prisma.project.findMany({
      where: projectWhere(scope),
      select: { id: true },
    });
    return projects.map((p) => p.id);
  };

  it('reaches only the own project in the own region', async () => {
    for (const [name, userId] of Object.entries(field)) {
      const ids = await reached(userId);
      expect(ids, name).not.toContain(world.b1.id);
      expect(ids, name).not.toContain(c1);
      // the Procurement Team sees house-construction projects only; A1 is not one
      if (name === 'procurement') expect(ids, name).toEqual([]);
      else expect(ids, name).toContain(world.a1.id);
    }
  });
});

describe('field protection on the responses served today', () => {
  it('sends no protected key to a volunteer or to an RPM listing users', async () => {
    const volunteerSession = await as(world.users.general);
    const me = await api().get('/api/v1/auth/me').set(bearer(volunteerSession)).expect(200);
    const rpm = await as(world.users.rpmDhaka);
    const list = await api().get('/api/v1/users').set(bearer(rpm)).expect(200);
    for (const body of [me.body, list.body])
      expect(keysOf(body).filter((k) => PROTECTED_KEYS.includes(k))).toEqual([]);
  });
});
