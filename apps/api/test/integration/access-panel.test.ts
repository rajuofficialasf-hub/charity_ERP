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
import { notificationsOf } from './support/notifications.js';

// The permission panel API (docs/security/RBAC.md, "Permission panel").
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
const REASON = 'Panel change for the test';
const FUTURE = '2027-01-01T00:00:00Z';

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

type Row = { permission: string; scopeType: string; source: string; grantId?: string };
const effective = async (s: Session, userId: string, query: Record<string, string> = {}) =>
  (
    await api()
      .get(`/api/v1/users/${userId}/effective-permissions`)
      .query(query)
      .set(bearer(s))
      .expect(200)
  ).body.data as Row[];
const version = async (userId: string) =>
  (await h.db.query('SELECT permission_version FROM users WHERE id = $1', [userId])).rows[0]
    .permission_version as number;
const audits = async (userId: string, action: string, override?: string) =>
  (
    await h.db.query(
      `SELECT old, new, reason FROM audit_log
        WHERE entity_id = $1 AND action = $2
          AND ($3::text IS NULL OR old->>'override' = $3 OR new->>'override' = $3)
        ORDER BY created_at`,
      [userId, action, override ?? null],
    )
  ).rows as { old: unknown; new: unknown; reason: string }[];
const grant = (s: Session, body: Record<string, unknown>) =>
  api()
    .post('/api/v1/permission-grants')
    .set(bearer(s))
    .send({ effect: 'grant', scopeType: 'GLOBAL', reason: REASON, ...body });

describe('catalogue and effective permissions', () => {
  it('lists roles and permissions for the Department Head and the Monitoring Team', async () => {
    for (const userId of [world.users.head, world.users.monitoring]) {
      const s = await as(userId);
      const roles = await api().get('/api/v1/roles').set(bearer(s)).expect(200);
      expect(roles.body.data).toContainEqual({
        key: 'regional_program_manager',
        name: { bn: 'রিজিওনাল প্রোগ্রাম ম্যানেজার', en: 'Regional Program Manager' },
        kind: 'official',
        globalScope: false,
      });
      const permissions = await api().get('/api/v1/permissions').set(bearer(s)).expect(200);
      expect(permissions.body.data).toContainEqual(
        expect.objectContaining({ name: 'permission.panel.manage', module: 'M02' }),
      );
    }
  });

  it('shows effective permissions with their source and filters by project', async () => {
    const head = await as(world.users.head);
    const rows = await effective(head, world.users.executive);
    expect(rows).toContainEqual(
      expect.objectContaining({ permission: 'application.approve', source: 'project_grant' }),
    );
    expect(rows).toContainEqual(
      expect.objectContaining({ permission: 'application.review', source: 'role_default' }),
    );
    const onB1 = await effective(head, world.users.executive, { projectId: world.b1.id });
    expect(onB1.some((r) => r.source === 'project_grant')).toBe(false);
  });

  it('lets a PM view effective permissions inside the own program only, never change them', async () => {
    const pm = await as(world.users.pm);
    await effective(pm, world.users.executive);
    const outside = await api()
      .get(`/api/v1/users/${world.users.outsider}/effective-permissions`)
      .set(bearer(pm))
      .expect(404);
    expect(outside.body.error.code).toBe('permission.not_found');
    const res = await grant(pm, { userId: world.users.executive, permission: 'permission.view' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('permission.denied');
  });
});

describe('grant and revoke', () => {
  it('grants with a reason and expiry, audits old and new grants and stales the old token', async () => {
    const head = await as(world.users.head);
    const target = await as(world.users.executive);
    await api().get('/api/v1/users').set(bearer(target)).expect(403);
    const before = await version(world.users.executive);
    const res = await grant(head, {
      userId: world.users.executive,
      permission: 'permission.view',
      expiresAt: FUTURE,
    }).expect(201);
    expect(res.body.data).toMatchObject({
      userId: world.users.executive,
      permission: 'permission.view',
      effect: 'grant',
      scopeType: 'GLOBAL',
      grantedBy: world.users.head,
      reason: REASON,
    });
    expect(await version(world.users.executive)).toBe(before + 1);
    const stale = await api().get('/api/v1/users').set(bearer(target)).expect(401);
    expect(stale.body.error.code).toBe('auth.token_stale');
    const fresh = await as(world.users.executive);
    await api().get('/api/v1/users').set(bearer(fresh)).expect(200);
    const rows = await effective(head, world.users.executive);
    expect(rows).toContainEqual(
      expect.objectContaining({
        permission: 'permission.view',
        source: 'panel_grant',
        grantId: res.body.data.id,
      }),
    );
    const entries = await audits(world.users.executive, 'permission_change', res.body.data.id);
    expect(entries).toHaveLength(1);
    const entry = entries[0]!;
    expect(entry.reason).toBe(REASON);
    expect(JSON.stringify(entry.old)).not.toContain('panel_grant');
    expect(JSON.stringify(entry.new)).toContain('panel_grant');
    // the person is told, in both languages, what changed
    const told = await notificationsOf(h.db, 'permission_changed', world.users.executive);
    expect(told).toHaveLength(1);
    expect(told[0]!.params.summary).toMatchObject({
      en: expect.stringContaining('permission.view'),
    });
  });

  it('hides a role default with a revoke override and restores it when the override ends', async () => {
    const head = await as(world.users.head);
    const has = async () =>
      (await effective(head, world.users.rpmRangpur)).some(
        (r) => r.permission === 'permission.view',
      );
    expect(await has()).toBe(true);
    const created = await api()
      .post('/api/v1/permission-grants')
      .set(bearer(head))
      .send({
        userId: world.users.rpmRangpur,
        permission: 'permission.view',
        effect: 'revoke',
        scopeType: 'GLOBAL',
        reason: REASON,
      })
      .expect(201);
    expect(await has()).toBe(false);
    const before = await version(world.users.rpmRangpur);
    await api()
      .post(`/api/v1/permission-grants/${created.body.data.id}/revoke`)
      .set(bearer(head))
      .send({ reason: 'The override is no longer needed' })
      .expect(204);
    expect(await has()).toBe(true);
    expect(await version(world.users.rpmRangpur)).toBe(before + 1);
    expect(
      await audits(world.users.rpmRangpur, 'permission_change', created.body.data.id),
    ).toHaveLength(2);
    // an ended override cannot be ended again
    await api()
      .post(`/api/v1/permission-grants/${created.body.data.id}/revoke`)
      .set(bearer(head))
      .send({ reason: 'The override is no longer needed' })
      .expect(404);
  });
});

describe('refusals', () => {
  const refused = async (body: Record<string, unknown>, rule: string, target: string) => {
    const head = await as(world.users.head);
    const before = (await audits(target, 'permission_change_refused')).length;
    const res = await api()
      .post('/api/v1/permission-grants')
      .set(bearer(head))
      .send({ effect: 'grant', scopeType: 'GLOBAL', reason: REASON, userId: target, ...body })
      .expect(403);
    expect(res.body.error).toMatchObject({ code: 'permission.grant_refused', params: { rule } });
    expect(await audits(target, 'permission_change_refused')).toHaveLength(before + 1);
  };

  it('refuses the owner transfer to anyone but an Admin', async () => {
    for (const target of [world.users.monitoring, world.users.pm])
      await refused({ permission: 'system.owner.transfer' }, 'owner_transfer_only_admin', target);
  });

  it('refuses the Monitoring Team the panel itself', async () => {
    const monitoring = await as(world.users.monitoring);
    const res = await grant(monitoring, {
      userId: world.users.pm,
      permission: 'permission.view',
    }).expect(403);
    expect(res.body.error.code).toBe('permission.denied');
  });

  it('refuses to remove the GLOBAL scope of the Monitoring Team', async () => {
    await refused(
      { permission: 'permission.view', effect: 'revoke' },
      'global_scope_protected',
      world.users.monitoring,
    );
  });

  it('refuses a sensitive permission to a volunteer', async () => {
    await refused(
      { permission: 'volunteer.view_sensitive', scopeType: 'PROJECT', scopeRef: world.a1.id },
      'sensitive_to_volunteer',
      world.users.general,
    );
  });

  it('answers 409 for any change that targets the Main Admin, before every other rule', async () => {
    // a Main Admin of its own, so no other test depends on the flag (it cannot be unset)
    const owner = await account(h.db, { role: 'department_head' });
    const head = await as(world.users.head);
    const live = await grant(head, {
      userId: owner.id,
      permission: 'form.library.manage',
    }).expect(201);
    await h.db.query('UPDATE users SET is_system_owner = true WHERE id = $1', [owner.id]);
    for (const body of [
      { permission: 'permission.view' },
      { permission: 'permission.view', effect: 'revoke' },
      { permission: 'volunteer.view_sensitive', scopeType: 'PROJECT' },
    ]) {
      const res = await api()
        .post('/api/v1/permission-grants')
        .set(bearer(head))
        .send({
          effect: 'grant',
          scopeType: 'GLOBAL',
          reason: REASON,
          userId: owner.id,
          ...body,
        })
        .expect(409);
      expect(res.body.error.code).toBe('user.system_owner_protected');
    }
    // ending a grant of the Main Admin is refused too, and the grant stays live
    const end = await api()
      .post(`/api/v1/permission-grants/${live.body.data.id}/revoke`)
      .set(bearer(head))
      .send({ reason: 'Trying to strip the owner' })
      .expect(409);
    expect(end.body.error.code).toBe('user.system_owner_protected');
    const row = await h.db.query('SELECT revoked_at FROM user_permissions WHERE id = $1', [
      live.body.data.id,
    ]);
    expect(row.rows[0].revoked_at).toBeNull();
    // every attempt is audited (three grants and one end)
    expect(await audits(owner.id, 'permission_change_refused')).toHaveLength(4);
  });

  it('refuses a caller without the panel permission to end a grant', async () => {
    const head = await as(world.users.head);
    const live = await grant(head, {
      userId: world.users.outsider,
      permission: 'form.library.manage',
    }).expect(201);
    const pm = await as(world.users.pm);
    const res = await api()
      .post(`/api/v1/permission-grants/${live.body.data.id}/revoke`)
      .set(bearer(pm))
      .send({ reason: 'Not my permission to end' })
      .expect(403);
    expect(res.body.error.code).toBe('permission.denied');
    const row = await h.db.query('SELECT revoked_at FROM user_permissions WHERE id = $1', [
      live.body.data.id,
    ]);
    expect(row.rows[0].revoked_at).toBeNull();
    expect(await audits(world.users.outsider, 'permission_change', live.body.data.id)).toHaveLength(
      1,
    );
  });

  it('validates the permission, the scope reference and the expiry', async () => {
    const head = await as(world.users.head);
    const bad = async (body: Record<string, unknown>, path: string) => {
      const res = await grant(head, {
        userId: world.users.executive,
        permission: 'permission.view',
        ...body,
      }).expect(422);
      expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain(path);
    };
    await bad({ permission: 'no.such_permission' }, 'permission');
    await bad({ scopeType: 'PROGRAM' }, 'scopeRef');
    await bad({ scopeRef: world.a1.program }, 'scopeRef');
    await bad({ scopeType: 'PROGRAM', scopeRef: world.a1.id }, 'scopeRef');
    await bad({ scopeType: 'REGION', scopeRef: world.a1.program }, 'scopeRef');
    await bad({ condition: 'no_such_condition' }, 'condition');
    await bad({ expiresAt: '2020-01-01T00:00:00Z' }, 'expiresAt');
    await grant(head, {
      userId: world.users.executive,
      permission: 'permission.view',
      scopeType: 'REGION',
      scopeRef: world.dhaka.division,
    }).expect(201);
    const unknownUser = await grant(head, {
      userId: '00000000-0000-7000-8000-000000000000',
      permission: 'permission.view',
    }).expect(404);
    expect(unknownUser.body.error.code).toBe('permission.not_found');
  });
});
