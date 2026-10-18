import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parsePermissionsFile, readPermissionsFile } from '../../src/access/registry';
import { accessWorld } from './support/access-fixtures';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
} from './support/auth-app';
import { notificationsOf } from './support/notifications';

// Project grants of "if RPM grants" extras (docs/security/RBAC.md 3 and 7; plan
// docs/plans/2026-10-12-1100-feat-rbac-permission-panel-plan.md, U5).
// The fixture catalogue marks a sensitive permission as "if RPM grants" for volunteers, so the
// refusal shared with the panel is reachable here too; the real permissions.yaml has no such case.
function fixtureRegistry() {
  const file = readPermissionsFile();
  const sensitive = file.permissions.find((p) => p.name === 'volunteer.view_sensitive')!;
  sensitive.default.push({
    role: 'volunteer_general',
    scope: 'PROJECT',
    condition: 'if_rpm_grants',
  });
  return parsePermissionsFile(file);
}

let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
const REASON = 'Approval help for this project';

beforeAll(async () => {
  h = await authHarness({ accessRegistry: fixtureRegistry() });
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
});

afterAll(async () => {
  await h.close();
});

const setGrants = async (projectId: string, userId: string, permissions: string[]) =>
  api()
    .post(`/api/v1/projects/${projectId}/grants`)
    .set(bearer(await as(world.users.rpmDhaka)))
    .send({ userId, permissions, reason: REASON });

describe('project grants', () => {
  it('lets the RPM grant an "if RPM grants" extra to an Executive on the own project', async () => {
    const before = await h.db.query('SELECT permission_version FROM users WHERE id = $1', [
      world.users.executive,
    ]);
    const res = await setGrants(world.a1.id, world.users.executive, [
      'application.approve',
      'application.reject',
    ]);
    expect(res.status).toBe(200);
    expect(res.body.data).toContainEqual(
      expect.objectContaining({ permission: 'application.reject', source: 'project_grant' }),
    );
    const row = await h.db.query(
      'SELECT extra_permissions FROM project_staff WHERE project_id = $1 AND user_id = $2',
      [world.a1.id, world.users.executive],
    );
    expect(row.rows[0].extra_permissions).toEqual(['application.approve', 'application.reject']);
    const after = await h.db.query('SELECT permission_version FROM users WHERE id = $1', [
      world.users.executive,
    ]);
    expect(after.rows[0].permission_version).toBe(before.rows[0].permission_version + 1);
    const audit = await h.db.query(
      "SELECT reason FROM audit_log WHERE entity_id = $1 AND action = 'permission_change'",
      [world.users.executive],
    );
    expect(audit.rows).toEqual([{ reason: REASON }]);
    const told = await notificationsOf(h.db, 'project_grant_changed', world.users.executive);
    expect(told).toHaveLength(1);
    expect(told[0]!.params).toMatchObject({
      projectId: world.a1.id,
      summary: { en: expect.any(String) },
    });
  });

  it("answers 404 on another RPM's project and for a user who is not on the project", async () => {
    const other = await setGrants(world.b1.id, world.users.outsider, ['application.approve']);
    expect(other.status).toBe(404);
    expect(other.body.error.code).toBe('permission.not_found');
    const notOnProject = await setGrants(world.a1.id, world.users.outsider, [
      'application.approve',
    ]);
    expect(notOnProject.status).toBe(404);
  });

  it('answers 404 for a user of another region on a project shared by both regions', async () => {
    // A1 has areas in Dhaka and Rangpur; the Rangpur volunteer works in the Rangpur area
    const res = await setGrants(world.a1.id, world.users.rangpurVolunteer, ['exam.record']);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('permission.not_found');
    const row = await h.db.query(
      `SELECT pv.extra_permissions FROM project_volunteers pv JOIN volunteers v ON v.id = pv.volunteer_id
        WHERE pv.project_id = $1 AND v.user_id = $2`,
      [world.a1.id, world.users.rangpurVolunteer],
    );
    expect(row.rows[0].extra_permissions).toEqual([]);
  });

  it('refuses a permission without "if RPM grants" and one the RPM does not hold there', async () => {
    const plain = await setGrants(world.a1.id, world.users.executive, ['permission.view']);
    expect(plain.status).toBe(403);
    expect(plain.body.error).toMatchObject({
      code: 'permission.grant_refused',
      params: { rule: 'not_rpm_grantable' },
    });
    // a panel revoke takes application.waitlist from the RPM on this project
    await h.db.query(
      `INSERT INTO user_permissions (id, user_id, permission_name, effect, scope_type, scope_ref, reason, granted_by)
       VALUES ($1, $2, 'application.waitlist', 'revoke', 'PROJECT', $3, 'Test override', $4)`,
      [randomUUID(), world.users.rpmDhaka, world.a1.id, world.users.head],
    );
    const notHeld = await setGrants(world.a1.id, world.users.executive, ['application.waitlist']);
    expect(notHeld.status).toBe(403);
    expect(notHeld.body.error.params).toEqual({ rule: 'not_held_by_granter' });
  });

  it('checks only newly added extras: kept ones need no granter check, removals are free', async () => {
    // the RPM lost application.waitlist on A1 in the previous test; the Executive keeps it
    await h.db.query(
      `UPDATE project_staff SET extra_permissions = ARRAY['application.waitlist']
        WHERE project_id = $1 AND user_id = $2`,
      [world.a1.id, world.users.executive],
    );
    const keep = await setGrants(world.a1.id, world.users.executive, [
      'application.waitlist',
      'application.transfer',
    ]);
    expect(keep.status).toBe(200);
    const drop = await setGrants(world.a1.id, world.users.executive, ['application.transfer']);
    expect(drop.status).toBe(200);
    const row = await h.db.query(
      'SELECT extra_permissions FROM project_staff WHERE project_id = $1 AND user_id = $2',
      [world.a1.id, world.users.executive],
    );
    expect(row.rows[0].extra_permissions).toEqual(['application.transfer']);
  });

  it('answers 422 for an unknown permission and changes nothing', async () => {
    const res = await setGrants(world.a1.id, world.users.executive, ['no.such_permission']);
    expect(res.status).toBe(422);
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toEqual(['permissions']);
    const row = await h.db.query(
      'SELECT extra_permissions FROM project_staff WHERE project_id = $1 AND user_id = $2',
      [world.a1.id, world.users.executive],
    );
    expect(row.rows[0].extra_permissions).toEqual(['application.transfer']);
  });

  it('never gives a sensitive permission to a volunteer, even when the catalogue allows it', async () => {
    const res = await setGrants(world.a1.id, world.users.general, ['volunteer.view_sensitive']);
    expect(res.status).toBe(403);
    expect(res.body.error.params).toEqual({ rule: 'sensitive_to_volunteer' });
    const audit = await h.db.query(
      "SELECT 1 FROM audit_log WHERE entity_id = $1 AND action = 'permission_change_refused'",
      [world.users.general],
    );
    expect(audit.rowCount).toBe(1);
  });

  it('answers 409 when the target is the Main Admin, even one who is not on the project', async () => {
    const owner = await account(h.db, { role: 'project_executive', systemOwner: true });
    const res = await setGrants(world.a1.id, owner.id, ['application.approve']);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('user.system_owner_protected');
  });
});
