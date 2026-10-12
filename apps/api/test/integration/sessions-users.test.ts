import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  account,
  type AuthHarness,
  auditRows,
  authHarness,
  bearer,
  login,
  PASSWORD,
  systemOwner,
} from './support/auth-app';

// Device lists and revocation, user administration, Main Admin protection and the
// permission-version bump (AUTH.md 6 to 11; BR-034, BR-035, BR-201; O-59).
let h: AuthHarness;

beforeAll(async () => {
  h = await authHarness();
});

afterAll(async () => {
  await h.close();
});

const api = () => request(h.server());

describe('own device sessions', () => {
  it('lists active sessions with the current one marked', async () => {
    const volunteer = await account(h.db, { kind: 'volunteer' });
    const a = await login(h, volunteer);
    await login(h, volunteer, { platform: 'ios' });
    const res = await api().get('/api/v1/sessions').set(bearer(a)).expect(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    expect(res.body.data[0]).toEqual({
      id: expect.any(String),
      deviceName: 'Test device',
      platform: expect.any(String),
      appVersion: '1.0.0',
      createdAt: expect.any(String),
      lastSeenAt: expect.any(String),
      current: expect.any(Boolean),
      revokedAt: null,
    });
    expect(res.body.meta).toMatchObject({ limit: 2, nextCursor: null });
  });

  it('revokes another own session, but not the current one or someone else’s', async () => {
    const volunteer = await account(h.db, { kind: 'volunteer' });
    const a = await login(h, volunteer);
    const b = await login(h, volunteer);
    const list = await api().get('/api/v1/sessions').set(bearer(a)).expect(200);
    const current = list.body.data.find((s: { current: boolean }) => s.current).id;
    const other = list.body.data.find((s: { current: boolean }) => !s.current).id;
    const self = await api().post(`/api/v1/sessions/${current}/revoke`).set(bearer(a)).expect(409);
    expect(self.body.error.code).toBe('session.use_logout');
    const stranger = await login(h, await account(h.db, { kind: 'volunteer' }));
    await api().post(`/api/v1/sessions/${other}/revoke`).set(bearer(stranger)).expect(404);
    await api().post(`/api/v1/sessions/${other}/revoke`).set(bearer(a)).expect(204);
    const revoked = await api().get('/api/v1/auth/me').set(bearer(b)).expect(401);
    expect(revoked.body.error.code).toBe('auth.session_revoked');
    await api().post(`/api/v1/sessions/${randomUUID()}/revoke`).set(bearer(a)).expect(404);
    expect(await auditRows(h.db, 'auth.session_revoked')).toEqual(
      expect.arrayContaining([expect.objectContaining({ entity_id: other })]),
    );
  });
});

describe("an official revokes another user's device", () => {
  it('lets the Monitoring Team list and revoke with a reason (lost phone)', async () => {
    const monitor = await login(h, await account(h.db, { role: 'monitoring_team' }));
    const volunteer = await account(h.db, { kind: 'volunteer' });
    const phone = await login(h, volunteer);
    const list = await api()
      .get(`/api/v1/users/${volunteer.id}/sessions`)
      .set(bearer(monitor))
      .expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].current).toBe(false);
    await api()
      .post(`/api/v1/users/${volunteer.id}/sessions/${list.body.data[0].id}/revoke`)
      .set(bearer(monitor))
      .send({ reason: 'x' })
      .expect(422);
    await api()
      .post(`/api/v1/users/${volunteer.id}/sessions/${list.body.data[0].id}/revoke`)
      .set(bearer(monitor))
      .send({ reason: 'Phone lost in the field' })
      .expect(204);
    expect(
      (await api().get('/api/v1/auth/me').set(bearer(phone)).expect(401)).body.error.code,
    ).toBe('auth.session_revoked');
    expect(await auditRows(h.db, 'auth.session_revoked_by_official')).toEqual([
      expect.objectContaining({ reason: 'Phone lost in the field', new: { userId: volunteer.id } }),
    ]);
  });

  it("answers 404 to an RPM for a volunteer outside the RPM's region (RBAC.md 8.4)", async () => {
    const rpm = await login(h, await account(h.db, { role: 'regional_program_manager' }));
    const volunteer = await account(h.db, { kind: 'volunteer' });
    const res = await api()
      .get(`/api/v1/users/${volunteer.id}/sessions`)
      .set(bearer(rpm))
      .expect(404);
    expect(res.body.error.code).toBe('permission.not_found');
  });

  it("protects the Main Admin's sessions from everyone else (BR-035)", async () => {
    const owner = await systemOwner(h.db);
    const ownerSession = await login(h, owner);
    const monitor = await login(h, await account(h.db, { role: 'monitoring_team' }));
    const list = await api()
      .get(`/api/v1/users/${owner.id}/sessions`)
      .set(bearer(monitor))
      .expect(200);
    const res = await api()
      .post(`/api/v1/users/${owner.id}/sessions/${list.body.data[0].id}/revoke`)
      .set(bearer(monitor))
      .send({ reason: 'testing protection' })
      .expect(409);
    expect(res.body.error.code).toBe('user.system_owner_protected');
    await api().get('/api/v1/auth/me').set(bearer(ownerSession)).expect(200);
  });
});

describe('user administration', () => {
  it('lists and shows users for global roles only, with an ETag', async () => {
    const head = await login(h, await account(h.db, { role: 'department_head' }));
    const target = await account(h.db);
    const list = await api()
      .get('/api/v1/users')
      .query({ limit: 2, include: 'total', state: 'active' })
      .set(bearer(head))
      .expect(200);
    expect(list.body.data).toHaveLength(2);
    expect(list.body.meta.total).toBeGreaterThan(2);
    expect(list.body.meta.nextCursor).toEqual(expect.any(String));
    const next = await api()
      .get('/api/v1/users')
      .query({ limit: 2, state: 'active', cursor: list.body.meta.nextCursor })
      .set(bearer(head))
      .expect(200);
    expect(next.body.data[0].id).not.toBe(list.body.data[0].id);
    await api().get('/api/v1/users').query({ sort: 'x' }).set(bearer(head)).expect(400);
    const one = await api().get(`/api/v1/users/${target.id}`).set(bearer(head)).expect(200);
    expect(one.headers.etag).toMatch(/^".+"$/);
    expect(one.body.data).toMatchObject({
      id: target.id,
      email: target.email,
      isSystemOwner: false,
    });
    expect(one.body.data).not.toHaveProperty('passwordHash');
    await api().get(`/api/v1/users/${randomUUID()}`).set(bearer(head)).expect(404);
    // a PM without a program sees nobody (PROGRAM scope, RBAC.md 4)
    const pm = await login(h, await account(h.db));
    const none = await api().get('/api/v1/users').set(bearer(pm)).expect(200);
    expect(none.body.data).toEqual([]);
  });

  it('blocks a staff account with If-Match, bumps the version and revokes its sessions', async () => {
    const head = await login(h, await account(h.db, { role: 'department_head' }));
    const target = await account(h.db);
    const targetSession = await login(h, target);
    const etag = (await api().get(`/api/v1/users/${target.id}`).set(bearer(head))).headers
      .etag as string;
    await api()
      .post(`/api/v1/users/${target.id}/state`)
      .set(bearer(head))
      .send({ state: 'blocked', reason: 'Suspended pending review' })
      .expect(412);
    const res = await api()
      .post(`/api/v1/users/${target.id}/state`)
      .set(bearer(head))
      .set('If-Match', etag)
      .send({ state: 'blocked', reason: 'Suspended pending review' })
      .expect(200);
    expect(res.body.data.state).toBe('blocked');
    expect(res.headers.etag).not.toBe(etag);
    expect(
      (await api().get('/api/v1/auth/me').set(bearer(targetSession)).expect(401)).body.error.code,
    ).toBe('auth.session_revoked');
    const blocked = await api()
      .post('/api/v1/auth/login')
      .send({ loginId: target.email, password: PASSWORD })
      .expect(403);
    expect(blocked.body.error.code).toBe('auth.account_blocked');
    const row = await h.db.query('SELECT permission_version FROM users WHERE id = $1', [target.id]);
    expect(row.rows[0].permission_version).toBe(2);
    expect(await auditRows(h.db, 'auth.state_changed')).toEqual([
      expect.objectContaining({
        entity_id: target.id,
        old: { state: 'active' },
        new: { state: 'blocked' },
        reason: 'Suspended pending review',
      }),
    ]);
    // lifting the block lets the user log in again; old sessions stay revoked
    await api()
      .post(`/api/v1/users/${target.id}/state`)
      .set(bearer(head))
      .set('If-Match', res.headers.etag as string)
      .send({ state: 'active', reason: 'Review finished' })
      .expect(200);
    await login(h, target);
  });

  it('refuses the Main Admin, own account, volunteer blocks, pending accounts and same-state changes', async () => {
    const headAccount = await account(h.db, { role: 'department_head' });
    const head = await login(h, headAccount);
    const change = async (id: string, state: string) => {
      const etag = (await api().get(`/api/v1/users/${id}`).set(bearer(head))).headers
        .etag as string;
      return api()
        .post(`/api/v1/users/${id}/state`)
        .set(bearer(head))
        .set('If-Match', etag)
        .send({ state, reason: 'testing rules' });
    };
    const owner = await systemOwner(h.db);
    expect((await change(owner.id, 'blocked')).body.error.code).toBe('user.system_owner_protected');
    expect((await change(headAccount.id, 'blocked')).body.error.code).toBe(
      'user.transition_not_allowed',
    );
    const volunteer = await account(h.db, { kind: 'volunteer' });
    expect((await change(volunteer.id, 'blocked')).body.error.code).toBe(
      'user.transition_not_allowed',
    );
    const pending = await account(h.db, { state: 'pending' });
    expect((await change(pending.id, 'active')).body.error.code).toBe(
      'user.transition_not_allowed',
    );
    const staff = await account(h.db);
    expect((await change(staff.id, 'active')).status).toBe(409);
  });

  it('deactivates only after a completed handover and allows reactivation (BR-034)', async () => {
    const headAccount = await account(h.db, { role: 'monitoring_team' });
    const head = await login(h, headAccount);
    const staff = await account(h.db);
    const etag = async () =>
      (await api().get(`/api/v1/users/${staff.id}`).set(bearer(head))).headers.etag as string;
    // supertest listens per request: read the ETag before building the next request
    let tag = await etag();
    const refused = await api()
      .post(`/api/v1/users/${staff.id}/state`)
      .set(bearer(head))
      .set('If-Match', tag)
      .send({ state: 'deactivated', reason: 'Left the department' })
      .expect(409);
    expect(refused.body.error.code).toBe('user.handover_required');
    await h.db.query(
      `INSERT INTO handovers (id, from_user_id, to_user_id, scope, approved_by, completed_at)
       VALUES ($1, $2, $3, '{}', $3, now())`,
      [randomUUID(), staff.id, headAccount.id],
    );
    tag = await etag();
    await api()
      .post(`/api/v1/users/${staff.id}/state`)
      .set(bearer(head))
      .set('If-Match', tag)
      .send({ state: 'deactivated', reason: 'Left the department' })
      .expect(200);
    const closed = await api()
      .post('/api/v1/auth/login')
      .send({ loginId: staff.email, password: PASSWORD })
      .expect(403);
    expect(closed.body.error.code).toBe('auth.account_deactivated');
    tag = await etag();
    await api()
      .post(`/api/v1/users/${staff.id}/state`)
      .set(bearer(head))
      .set('If-Match', tag)
      .send({ state: 'active', reason: 'Rejoined' })
      .expect(200);
    await login(h, staff);
  });

  it('clears a login lock with a reason (O-59 item 2)', async () => {
    const monitor = await login(h, await account(h.db, { role: 'monitoring_team' }));
    const staff = await account(h.db);
    const notLocked = await api()
      .post(`/api/v1/users/${staff.id}/unlock`)
      .set(bearer(monitor))
      .send({ reason: 'Called the helpdesk' })
      .expect(409);
    expect(notLocked.body.error.code).toBe('user.not_locked');
    for (let i = 0; i < 5; i++)
      await api().post('/api/v1/auth/login').send({ loginId: staff.email, password: 'bad pass 1' });
    await api()
      .post('/api/v1/auth/login')
      .send({ loginId: staff.email, password: PASSWORD })
      .expect(423);
    const pm = await login(h, await account(h.db));
    await api()
      .post(`/api/v1/users/${staff.id}/unlock`)
      .set(bearer(pm))
      .send({ reason: 'Called the helpdesk' })
      .expect(403);
    await api()
      .post(`/api/v1/users/${staff.id}/unlock`)
      .set(bearer(monitor))
      .send({ reason: 'Called the helpdesk' })
      .expect(204);
    await login(h, staff);
    expect(await auditRows(h.db, 'auth.lock_cleared')).toEqual([
      expect.objectContaining({ entity_id: staff.id, reason: 'Called the helpdesk' }),
    ]);
  });
});

describe('permission version (AUTH.md 9)', () => {
  it('a role change bumps the version, is audited and forces a silent refresh', async () => {
    const staff = await account(h.db);
    const s = await login(h, staff);
    const { prisma, permissionVersions: versions } = h.container;
    const version = await prisma.$transaction((tx) =>
      versions.bump(tx, staff.id, {
        action: 'auth.role_changed',
        old: { roles: ['program_manager'] },
        new: { roles: ['program_manager', 'regional_program_manager'] },
        reason: 'Assigned to Rangpur',
        actorUserId: staff.id,
      }),
    );
    expect(version).toBe(2);
    const stale = await api().get('/api/v1/auth/me').set(bearer(s)).expect(401);
    expect(stale.body.error.code).toBe('auth.token_stale');
    expect(await auditRows(h.db, 'auth.role_changed')).toEqual([
      expect.objectContaining({ entity_id: staff.id, reason: 'Assigned to Rangpur' }),
    ]);
  });
});
