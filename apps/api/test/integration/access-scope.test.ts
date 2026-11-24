import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import { Router } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defineRoute, type RouteDeps } from '../../src/openapi/define-route.js';
import { accessWorld, seedAccessCatalogue } from './support/access-fixtures.js';
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

// Scope resolution and enforcement through the real endpoints (docs/security/RBAC.md, "Data scopes
// and their resolution" and "Server-side enforcement").
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const logLines: Record<string, unknown>[] = [];
const logStream = new Writable({
  write(chunk, _enc, done) {
    for (const line of String(chunk).split('\n'))
      if (line.trim()) logLines.push(JSON.parse(line) as Record<string, unknown>);
    done();
  },
});

// A route of entity `global` (filters no data): only a GLOBAL grant may pass
// (docs/security/RBAC.md, "Server-side enforcement").
function globalProbe(deps: RouteDeps): Router {
  const router = Router();
  defineRoute(router, deps, {
    method: 'get',
    path: '/scope-probe/global',
    operationId: 'probe.scopeGlobal',
    tag: 'probe',
    summary: 'global probe',
    permission: 'user.lock.clear',
    scope: 'global',
    audit: 'none',
    idempotency: 'none',
    rateLimit: 'default',
    responses: { 200: null },
    handler: () => ({ ok: true }),
  });
  return router;
}

const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
const deniedEvents = () => logLines.filter((l) => l.event === 'permission_denied');

beforeAll(async () => {
  h = await authHarness({ logStream, extraRouters: [globalProbe] });
  await seedAccessCatalogue(h.db);
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

afterAll(async () => {
  await h.close();
});

async function override(
  userId: string,
  permission: string,
  effect: string,
  scope = 'GLOBAL',
  ref: string | null = null,
) {
  await h.db.query(
    `INSERT INTO user_permissions (id, user_id, permission_name, effect, scope_type, scope_ref, reason, granted_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'Test override', $7)`,
    [randomUUID(), userId, permission, effect, scope, ref, world.users.head],
  );
  await h.db.query('UPDATE users SET permission_version = permission_version + 1 WHERE id = $1', [
    userId,
  ]);
  h.container.sessions.evictUser(userId);
}

async function refresh(s: Session): Promise<string> {
  const res = await api()
    .post('/api/v1/auth/refresh')
    .set('Cookie', s.cookieHeader)
    .set('X-CSRF-Token', s.csrf)
    .expect(200);
  return res.body.data.accessToken as string;
}

// The areas of a project show volunteers only while it is at work (docs/security/RBAC.md, "Data
// scopes and their resolution"); its applications stay with the people who work or worked on it.
describe('the areas of a project at work', () => {
  it('reach volunteers while the project is active or closing, and its applications in every state', async () => {
    const tree = await f.locationTree(h.db);
    const rpm = await account(h.db, { role: 'regional_program_manager' });
    const project = await f.project(h.db);
    await h.db.query(
      'INSERT INTO project_areas (id, project_id, location_id, rpm_user_id) VALUES ($1, $2, $3, $4)',
      [randomUUID(), project.id, tree.division, rpm.id],
    );
    // the PM of the project's program reaches volunteers through the same areas
    const pm = await account(h.db, { role: 'program_manager' });
    await h.db.query('UPDATE programs SET pm_user_id = $1 WHERE id = $2', [pm.id, project.program]);
    const areas = async (permission: string, entity: string, userId = rpm.id) =>
      (await h.container.access.scopeOfUser(userId, permission, entity)).instances.areas.map(
        (a) => a.locationId,
      );
    for (const [status, shown] of [
      ['draft', false],
      ['active', true],
      ['closing', true],
      ['closed', false],
      ['cancelled', false],
    ] as const) {
      await h.db.query(
        `UPDATE projects SET status = $1, cancelled_at = CASE WHEN $1 = 'cancelled' THEN now() END WHERE id = $2`,
        [status, project.id],
      );
      for (const permission of ['volunteer.view_all', 'registration.approve'])
        expect(await areas(permission, 'volunteer'), `${permission} ${status}`).toEqual(
          shown ? [tree.division] : [],
        );
      expect(await areas('volunteer.view_all', 'volunteer', pm.id), `PM ${status}`).toEqual(
        shown ? [tree.division] : [],
      );
      expect(await areas('application.view', 'application'), status).toEqual([tree.division]);
    }
  });
});

describe('scope on the user endpoints', () => {
  it('shows a PM the users of own program and nobody else', async () => {
    const pm = await as(world.users.pm);
    const ids = new Set<string>();
    let cursor: string | undefined;
    do {
      const res = await api()
        .get('/api/v1/users')
        .query({ limit: 100, ...(cursor ? { cursor } : {}) })
        .set(bearer(pm))
        .expect(200);
      for (const u of res.body.data as { id: string }[]) ids.add(u.id);
      cursor = res.body.meta.nextCursor ?? undefined;
    } while (cursor);
    for (const inside of [world.users.executive, world.users.rpmDhaka, world.users.general])
      expect(ids).toContain(inside);
    expect(ids).not.toContain(world.users.outsider);
    await api().get(`/api/v1/users/${world.users.executive}`).set(bearer(pm)).expect(200);
    const outside = await api()
      .get(`/api/v1/users/${world.users.outsider}`)
      .set(bearer(pm))
      .expect(404);
    expect(outside.body.error.code).toBe('permission.not_found');
  });

  it("lets the Dhaka RPM revoke a Dhaka volunteer's session but not a Rangpur volunteer's", async () => {
    const rpm = await as(world.users.rpmDhaka);
    await as(world.users.general);
    const list = await api()
      .get(`/api/v1/users/${world.users.general}/sessions`)
      .set(bearer(rpm))
      .expect(200);
    await api()
      .post(`/api/v1/users/${world.users.general}/sessions/${list.body.data[0].id}/revoke`)
      .set(bearer(rpm))
      .send({ reason: 'Phone lost in the field' })
      .expect(204);
    await api()
      .get(`/api/v1/users/${world.users.rangpurVolunteer}/sessions`)
      .set(bearer(rpm))
      .expect(404);
  });

  it("tells a person the network of their own devices, and an official never another person's", async () => {
    const volunteer = await as(world.users.general);
    const own = await api().get('/api/v1/sessions').set(bearer(volunteer)).expect(200);
    const hints = (own.body.data as { ipHint: string | null }[]).map((d) => d.ipHint);
    expect(hints).toContain('127.0.0.x');
    // never the whole address
    expect(JSON.stringify(own.body.data)).not.toMatch(/127\.0\.0\.1(?!\d)/);
    const rpm = await as(world.users.rpmDhaka);
    const theirs = await api()
      .get(`/api/v1/users/${world.users.general}/sessions`)
      .set(bearer(rpm))
      .expect(200);
    expect((theirs.body.data as { ipHint: string | null }[]).every((d) => d.ipHint === null)).toBe(
      true,
    );
  });

  it('refuses a role without the permission with 403 and logs the denial', async () => {
    const executive = await as(world.users.executive);
    const before = deniedEvents().length;
    const res = await api().get('/api/v1/users').set(bearer(executive)).expect(403);
    expect(res.body.error.code).toBe('permission.denied');
    expect(deniedEvents().slice(before)).toEqual([
      expect.objectContaining({ userId: world.users.executive, permission: 'permission.view' }),
    ]);
  });

  it('logs a scope 404 as a denial without the record', async () => {
    const pm = await as(world.users.pm);
    const before = deniedEvents().length;
    await api().get(`/api/v1/users/${world.users.outsider}`).set(bearer(pm)).expect(404);
    const events = deniedEvents().slice(before);
    expect(events).toEqual([
      expect.objectContaining({
        userId: world.users.pm,
        permission: 'permission.view',
        entity: 'user',
      }),
    ]);
    expect(JSON.stringify(events)).not.toContain(world.users.outsider);
  });

  it('answers 404 before any write when a state change targets a user outside the scope', async () => {
    const pmAccount = accounts.get(world.users.pm)!;
    // a PROGRAM-scoped grant of user.state.change for the PM's own program
    const { rows } = await h.db.query('SELECT id FROM programs WHERE pm_user_id = $1', [
      pmAccount.id,
    ]);
    await override(world.users.pm, 'user.state.change', 'grant', 'PROGRAM', rows[0].id as string);
    const pm = await as(world.users.pm);
    await api()
      .post(`/api/v1/users/${world.users.outsider}/state`)
      .set(bearer(pm))
      .set('If-Match', '"stale"')
      .send({ state: 'blocked', reason: 'Testing the scope' })
      .expect(404);
    const outsider = await h.db.query('SELECT state FROM users WHERE id = $1', [
      world.users.outsider,
    ]);
    expect(outsider.rows[0].state).toBe('active');
    // a PM may not block anybody, even inside the scope: only the Department Head blocks
    const etag = (await api().get(`/api/v1/users/${world.users.executive}`).set(bearer(pm))).headers
      .etag as string;
    const refused = await api()
      .post(`/api/v1/users/${world.users.executive}/state`)
      .set(bearer(pm))
      .set('If-Match', etag)
      .send({ state: 'blocked', reason: 'Testing the scope' })
      .expect(403);
    expect(refused.body.error.code).toBe('permission.denied');
    const executive = await h.db.query('SELECT state FROM users WHERE id = $1', [
      world.users.executive,
    ]);
    expect(executive.rows[0].state).toBe('active');
  });

  it('lets only the Department Head block, even when the Monitoring Team holds the panel grant', async () => {
    await override(world.users.monitoring, 'user.state.change', 'grant');
    const monitoring = await as(world.users.monitoring);
    const etag = (await api().get(`/api/v1/users/${world.users.outsider}`).set(bearer(monitoring)))
      .headers.etag as string;
    await api()
      .post(`/api/v1/users/${world.users.outsider}/state`)
      .set(bearer(monitoring))
      .set('If-Match', etag)
      .send({ state: 'blocked', reason: 'Monitoring may not block' })
      .expect(403);
    const outsider = await h.db.query('SELECT state FROM users WHERE id = $1', [
      world.users.outsider,
    ]);
    expect(outsider.rows[0].state).toBe('active');
    const head = await as(world.users.head);
    const headEtag = (await api().get(`/api/v1/users/${world.users.outsider}`).set(bearer(head)))
      .headers.etag as string;
    await api()
      .post(`/api/v1/users/${world.users.outsider}/state`)
      .set(bearer(head))
      .set('If-Match', headEtag)
      .send({ state: 'blocked', reason: 'Head blocks' })
      .expect(200);
    // lifting the block is the Department Head's too
    const blockedEtag = (await api().get(`/api/v1/users/${world.users.outsider}`).set(bearer(head)))
      .headers.etag as string;
    await api()
      .post(`/api/v1/users/${world.users.outsider}/state`)
      .set(bearer(monitoring))
      .set('If-Match', blockedEtag)
      .send({ state: 'active', reason: 'Monitoring may not unblock' })
      .expect(403);
    const stillBlocked = await h.db.query('SELECT state FROM users WHERE id = $1', [
      world.users.outsider,
    ]);
    expect(stillBlocked.rows[0].state).toBe('blocked');
    await api()
      .post(`/api/v1/users/${world.users.outsider}/state`)
      .set(bearer(head))
      .set('If-Match', blockedEtag)
      .send({ state: 'active', reason: 'Head lifts the block' })
      .expect(200);
  });

  it('applies a revoke override after the token refresh', async () => {
    const rpm = await as(world.users.rpmRangpur);
    await api().get('/api/v1/users').set(bearer(rpm)).expect(200);
    await override(world.users.rpmRangpur, 'permission.view', 'revoke');
    const stale = await api().get('/api/v1/users').set(bearer(rpm)).expect(401);
    expect(stale.body.error.code).toBe('auth.token_stale');
    const token = await refresh(rpm);
    await api().get('/api/v1/users').set('Authorization', `Bearer ${token}`).expect(403);
  });

  it("refuses an RPM the sessions of staff in the RPM's region (own_region: volunteers only)", async () => {
    const rpm = await as(world.users.rpmDhaka);
    await api().get(`/api/v1/users/${world.users.executive}/sessions`).set(bearer(rpm)).expect(404);
    // the same RPM still sees that staff member through permission.view (no condition)
    await api().get(`/api/v1/users/${world.users.executive}`).set(bearer(rpm)).expect(200);
  });

  it('answers 404 to an out-of-scope session revoke and leaves the session active', async () => {
    const rpm = await as(world.users.rpmDhaka);
    await as(world.users.rangpurVolunteer);
    const { rows } = await h.db.query(
      'SELECT id FROM device_sessions WHERE user_id = $1 AND revoked_at IS NULL LIMIT 1',
      [world.users.rangpurVolunteer],
    );
    const res = await api()
      .post(`/api/v1/users/${world.users.rangpurVolunteer}/sessions/${rows[0].id}/revoke`)
      .set(bearer(rpm))
      .send({ reason: 'Phone lost in the field' })
      .expect(404);
    expect(res.body.error.code).toBe('permission.not_found');
    const after = await h.db.query('SELECT revoked_at FROM device_sessions WHERE id = $1', [
      rows[0].id,
    ]);
    expect(after.rows[0].revoked_at).toBeNull();
  });

  it('answers 404 to an out-of-scope unlock and keeps the lock', async () => {
    const { rows } = await h.db.query('SELECT id FROM programs WHERE pm_user_id = $1', [
      world.users.pm,
    ]);
    await override(world.users.pm, 'user.lock.clear', 'grant', 'PROGRAM', rows[0].id as string);
    await h.db.query("UPDATE users SET locked_until = now() + interval '1 hour' WHERE id = $1", [
      world.users.outsider,
    ]);
    const pm = await as(world.users.pm);
    const res = await api()
      .post(`/api/v1/users/${world.users.outsider}/unlock`)
      .set(bearer(pm))
      .send({ reason: 'Testing the scope' })
      .expect(404);
    expect(res.body.error.code).toBe('permission.not_found');
    const after = await h.db.query('SELECT locked_until FROM users WHERE id = $1', [
      world.users.outsider,
    ]);
    expect(after.rows[0].locked_until).not.toBeNull();
    await h.db.query('UPDATE users SET locked_until = NULL WHERE id = $1', [world.users.outsider]);
  });

  it('refuses a below-GLOBAL grant on a route that filters no data', async () => {
    // the PM holds user.lock.clear for one program (previous test); the probe filters nothing
    const pm = await as(world.users.pm);
    const res = await api().get('/api/v1/scope-probe/global').set(bearer(pm)).expect(403);
    expect(res.body.error.code).toBe('permission.denied');
    const head = await as(world.users.head);
    await api().get('/api/v1/scope-probe/global').set(bearer(head)).expect(200);
  });
});
