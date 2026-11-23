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
  systemOwner,
} from './support/auth-app.js';
import { notificationsOf } from './support/notifications.js';

// The change of an official's role (docs/security/RBAC.md, "Roles"; docs/architecture/AUTH.md,
// "Main Admin protection").
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
const REASON = 'Moved to another post';

beforeAll(async () => {
  h = await authHarness();
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

/** An official of a role with no work of their own, who can sign in. */
async function official(role: string): Promise<Account> {
  const a = await account(h.db, { role });
  accounts.set(a.id, a);
  return a;
}
/** The user's ETag, read by an Admin (not every actor of the tests may read a user). */
const etagOf = async (userId: string) =>
  (
    await api()
      .get(`/api/v1/users/${userId}`)
      .set(bearer(await as(world.users.admin)))
      .expect(200)
  ).headers.etag as string;
const change = async (s: Session, userId: string, roleKey: string, etag?: string) =>
  api()
    .post(`/api/v1/users/${userId}/role`)
    .set(bearer(s))
    .set('If-Match', etag ?? (await etagOf(userId)))
    .send({ roleKey, reason: REASON });
const liveRoles = async (userId: string) =>
  (
    await h.db.query(
      'SELECT role_key FROM user_roles WHERE user_id = $1 AND revoked_at IS NULL ORDER BY role_key',
      [userId],
    )
  ).rows.map((r) => r.role_key as string);
const userRow = async (userId: string) =>
  (
    await h.db.query(
      'SELECT permission_version, password_change_required FROM users WHERE id = $1',
      [userId],
    )
  ).rows[0] as { permission_version: number; password_change_required: boolean };
const audits = async (userId: string, action: string) =>
  (
    await h.db.query(
      'SELECT old, new, reason FROM audit_log WHERE entity_id = $1 AND action = $2 ORDER BY created_at',
      [userId, action],
    )
  ).rows as { old: unknown; new: Record<string, unknown>; reason: string | null }[];
const refusedWith = (res: request.Response, rule: string) => {
  expect(res.status).toBe(403);
  expect(res.body.error).toMatchObject({ code: 'permission.grant_refused', params: { rule } });
};

describe('a role change', () => {
  it('ends the old role and starts the new one, audited, told to the person, and the old token is stale', async () => {
    const target = await official('project_executive');
    const session = await login(h, target);
    const admin = await as(world.users.admin);
    const before = await userRow(target.id);
    const etag = await etagOf(target.id);
    const res = await change(admin, target.id, 'regional_program_manager', etag);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: target.id, roles: ['regional_program_manager'] });
    // the answer carries the new version of the user, for the next change
    expect(res.headers.etag).toMatch(/^"[^"]+"$/);
    expect(res.headers.etag).not.toBe(etag);
    expect(res.body.meta.etag).toBe(res.headers.etag);
    expect(await liveRoles(target.id)).toEqual(['regional_program_manager']);
    const ended = await h.db.query(
      'SELECT revoked_by FROM user_roles WHERE user_id = $1 AND revoked_at IS NOT NULL',
      [target.id],
    );
    expect(ended.rows).toEqual([{ revoked_by: world.users.admin }]);
    expect((await userRow(target.id)).permission_version).toBe(before.permission_version + 1);
    expect(await audits(target.id, 'user.role_changed')).toEqual([
      {
        old: { roles: ['project_executive'] },
        new: { role: 'regional_program_manager', endedOverrides: [], endedExtras: 0 },
        reason: REASON,
      },
    ]);
    const told = await notificationsOf(h.db, 'permission_changed', target.id);
    expect(told).toHaveLength(1);
    expect(told[0]!.params).toMatchObject({
      summary: {
        en: 'your role is now Regional Program Manager',
        bn: 'আপনার রোল এখন রিজিওনাল প্রোগ্রাম ম্যানেজার',
      },
    });
    // the next request with the token of the old role is refused, and a refresh would follow
    const stale = await api().get('/api/v1/auth/me').set(bearer(session)).expect(401);
    expect(stale.body.error.code).toBe('auth.token_stale');
    // the new role works at once for a new session
    const now = await login(h, target);
    const me = await api().get('/api/v1/auth/me').set(bearer(now)).expect(200);
    expect(me.body.data.roles).toEqual(['regional_program_manager']);
  });

  it('shows the history of a person: the newest role first, with who gave and who ended each', async () => {
    const target = await official('project_executive');
    const admin = await as(world.users.admin);
    expect((await change(admin, target.id, 'official_daee')).status).toBe(200);
    const res = await api().get(`/api/v1/users/${target.id}/roles`).set(bearer(admin)).expect(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toMatchObject({
      roleKey: 'official_daee',
      revokedAt: null,
      revokedBy: null,
      grantedBy: { id: world.users.admin },
    });
    expect(res.body.data[1]).toMatchObject({
      roleKey: 'project_executive',
      revokedBy: { id: world.users.admin },
    });
    expect(res.body.data[1].revokedAt).toEqual(expect.any(String));
    // a role the seed gave has no person as its giver: the system's name never reaches the screen
    const system = randomUUID();
    await h.db.query(
      `INSERT INTO users (id, kind, display_name, state) VALUES ($1, 'system', 'System', 'active')`,
      [system],
    );
    await h.db.query(
      `UPDATE user_roles SET granted_by = $1 WHERE user_id = $2 AND role_key = 'project_executive'`,
      [system, target.id],
    );
    const seeded = await api()
      .get(`/api/v1/users/${target.id}/roles`)
      .set(bearer(admin))
      .expect(200);
    expect(seeded.body.data[1]).toMatchObject({ roleKey: 'project_executive', grantedBy: null });
    // outside the reader's scope the person is not found
    await api()
      .get(`/api/v1/users/${target.id}/roles`)
      .set(bearer(await as(world.users.pm)))
      .expect(404);
  });

  it('asks for the version of the user, and refuses an unknown role, a volunteer role and a volunteer', async () => {
    const target = await official('project_executive');
    const admin = await as(world.users.admin);
    expect((await change(admin, target.id, 'official_daee', '"stale"')).status).toBe(412);
    await api()
      .post(`/api/v1/users/${target.id}/role`)
      .set(bearer(admin))
      .send({ roleKey: 'official_daee', reason: REASON })
      .expect(412);
    for (const roleKey of ['no_such_role', 'volunteer_general'])
      expect((await change(admin, target.id, roleKey)).status).toBe(422);
    expect((await change(admin, world.users.general, 'project_executive', '"x"')).status).toBe(404);
    const same = await change(admin, target.id, 'project_executive');
    expect(same.status).toBe(409);
    expect(same.body.error.code).toBe('user.role_unchanged');
    expect(await liveRoles(target.id)).toEqual(['project_executive']);
    expect(await audits(target.id, 'user.role_changed')).toEqual([]);
  });

  it('changes the role of an active account only', async () => {
    const admin = await as(world.users.admin);
    for (const state of ['pending', 'blocked', 'deactivated']) {
      const target = await account(h.db, { role: 'project_executive', state });
      const res = await change(admin, target.id, 'official_daee');
      expect(res.status, state).toBe(409);
      expect(res.body.error.code).toBe('user.role_change_inactive');
      expect(await liveRoles(target.id)).toEqual(['project_executive']);
    }
  });

  it('waits for the handover of the work only the old role may hold', async () => {
    const admin = await as(world.users.admin);
    // the Executive holds a staff place on a project, the PM a program
    for (const [userId, roleKey] of [
      [world.users.executive, 'regional_program_manager'],
      [world.users.pm, 'regional_program_manager'],
      [world.users.rpmDhaka, 'program_manager'],
    ] as const) {
      const held = await liveRoles(userId);
      const res = await change(admin, userId, roleKey);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('handover.items_outstanding');
      expect(await liveRoles(userId)).toEqual(held);
    }
  });

  it('keeps a place of the new role, with the extras that role may hold', async () => {
    const target = await official('regional_program_manager');
    const place = randomUUID();
    await h.db.query(
      `INSERT INTO project_staff (id, project_id, user_id, role_key, extra_permissions, granted_by)
       VALUES ($1, $2, $3, 'project_executive', $4, $3)`,
      // an RPM may give an Executive the approval; the exam record is a stray row of another role
      [place, world.b1.id, target.id, ['application.approve', 'exam.record']],
    );
    const res = await change(await as(world.users.admin), target.id, 'project_executive');
    expect(res.status).toBe(200);
    const row = await h.db.query('SELECT extra_permissions FROM project_staff WHERE id = $1', [
      place,
    ]);
    expect(row.rows[0].extra_permissions).toEqual(['application.approve']);
    expect((await audits(target.id, 'user.role_changed'))[0]!.new).toMatchObject({
      endedExtras: 1,
    });
  });
});

describe('who may change which role', () => {
  it('refuses a change of the own role', async () => {
    for (const actor of [world.users.admin, world.users.head]) {
      const before = (await audits(actor, 'permission_change_refused')).length;
      refusedWith(await change(await as(actor), actor, 'program_manager'), 'self_change');
      expect(await audits(actor, 'permission_change_refused')).toHaveLength(before + 1);
    }
    expect(await liveRoles(world.users.head)).toEqual(['department_head']);
  });

  it('leaves an Admin and the Department Head to an Admin: the Head gives neither and takes neither away', async () => {
    const head = await as(world.users.head);
    const target = await official('project_executive');
    for (const roleKey of ['admin', 'department_head'])
      refusedWith(await change(head, target.id, roleKey), 'role_admin_only');
    const otherAdmin = await official('admin');
    refusedWith(await change(head, otherAdmin.id, 'program_manager'), 'role_admin_only');
    expect(await liveRoles(otherAdmin.id)).toEqual(['admin']);
    expect(await liveRoles(target.id)).toEqual(['project_executive']);
    expect(await audits(target.id, 'permission_change_refused')).toHaveLength(2);
    // an Admin makes another Admin, and takes the role away again
    const admin = await as(world.users.admin);
    expect((await change(admin, target.id, 'admin')).status).toBe(200);
    expect((await change(admin, target.id, 'project_executive')).status).toBe(200);
  });

  it('lets the Head give and take away the Monitoring Team, and asks the new member for the longer password', async () => {
    const head = await as(world.users.head);
    const target = await official('project_executive');
    expect((await userRow(target.id)).password_change_required).toBe(false);
    const res = await change(head, target.id, 'monitoring_team');
    expect(res.status).toBe(200);
    expect(await liveRoles(target.id)).toEqual(['monitoring_team']);
    expect((await userRow(target.id)).password_change_required).toBe(true);
    expect((await change(head, target.id, 'official_daee')).status).toBe(200);
  });

  it('holds a person whom an Admin gave the role change to the ordinary roles', async () => {
    const holder = await official('program_manager');
    await h.db.query(
      `INSERT INTO user_permissions (id, user_id, permission_name, effect, scope_type, reason, granted_by)
       VALUES ($1, $2, 'user.role.change', 'grant', 'GLOBAL', 'Test grant', $3)`,
      [randomUUID(), holder.id, world.users.admin],
    );
    const session = await login(h, holder);
    const target = await official('project_executive');
    for (const roleKey of ['monitoring_team', 'admin', 'department_head'])
      refusedWith(await change(session, target.id, roleKey), 'role_admin_only');
    // nor off a role with the whole reach
    refusedWith(await change(session, world.users.monitoring, 'official_daee'), 'role_admin_only');
    expect((await change(session, target.id, 'official_daee')).status).toBe(200);
  });

  it('refuses the Monitoring Team and an RPM the change at all', async () => {
    const target = await official('project_executive');
    for (const actor of [world.users.monitoring, world.users.rpmRangpur]) {
      const res = await change(await as(actor), target.id, 'official_daee');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('permission.denied');
    }
    expect(await liveRoles(target.id)).toEqual(['project_executive']);
  });

  it('never changes the role of the Main Admin', async () => {
    const owner = await systemOwner(h.db);
    const res = await change(await as(world.users.admin), owner.id, 'program_manager');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('user.system_owner_protected');
    expect(await liveRoles(owner.id)).toEqual(['admin']);
  });
});

describe('what the new role may not hold', () => {
  const override = async (userId: string, effect: string, scope: string, ref: string | null) => {
    const id = randomUUID();
    await h.db.query(
      `INSERT INTO user_permissions (id, user_id, permission_name, effect, scope_type, scope_ref, reason, granted_by)
       VALUES ($1, $2, 'application.view', $3, $4, $5, 'Test override', $6)`,
      [id, userId, effect, scope, ref, world.users.admin],
    );
    return id;
  };
  const live = async (ids: string[]) =>
    (
      await h.db.query(
        'SELECT id FROM user_permissions WHERE id = ANY($1::uuid[]) AND revoked_at IS NULL',
        [ids],
      )
    ).rows.map((r) => r.id as string);

  it('ends every revoke of a person who becomes an Admin, and keeps the grants', async () => {
    const target = await official('project_executive');
    const narrow = await override(target.id, 'revoke', 'PROJECT', world.a1.id);
    const wide = await override(target.id, 'revoke', 'GLOBAL', null);
    const given = await override(target.id, 'grant', 'PROJECT', world.b1.id);
    const res = await change(await as(world.users.admin), target.id, 'admin');
    expect(res.status).toBe(200);
    expect(await live([narrow, wide, given])).toEqual([given]);
    const entry = (await audits(target.id, 'user.role_changed'))[0]!.new;
    expect([...(entry.endedOverrides as string[])].sort()).toEqual([narrow, wide].sort());
  });

  it('ends a GLOBAL revoke of a new member of the Monitoring Team, and keeps a narrower one', async () => {
    const target = await official('project_executive');
    const narrow = await override(target.id, 'revoke', 'PROJECT', world.a1.id);
    const wide = await override(target.id, 'revoke', 'GLOBAL', null);
    const res = await change(await as(world.users.head), target.id, 'monitoring_team');
    expect(res.status).toBe(200);
    expect(await live([narrow, wide])).toEqual([narrow]);
  });
});

// Last: these cases move the one Department Head of the file.
describe('one Department Head at a time', () => {
  it('refuses a second Head while one is in office', async () => {
    const candidate = await official('program_manager');
    const res = await change(await as(world.users.admin), candidate.id, 'department_head');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('user.department_head_exists');
    expect(await liveRoles(candidate.id)).toEqual(['program_manager']);
  });

  it('appoints a new Head after the old one changed role, and of two appointments at once lets one through', async () => {
    const admin = await as(world.users.admin);
    expect((await change(admin, world.users.head, 'program_manager')).status).toBe(200);
    const first = await official('program_manager');
    const second = await official('program_manager');
    const [etagA, etagB] = [await etagOf(first.id), await etagOf(second.id)];
    const results = await Promise.all([
      change(admin, first.id, 'department_head', etagA),
      change(admin, second.id, 'department_head', etagB),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const refused = results.find((r) => r.status === 409)!;
    expect(refused.body.error.code).toBe('user.department_head_exists');
    const heads = await h.db.query(
      `SELECT user_id FROM user_roles WHERE role_key = 'department_head' AND revoked_at IS NULL`,
    );
    expect(heads.rows).toHaveLength(1);
    expect([first.id, second.id]).toContain(heads.rows[0].user_id);
  });
});
