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
  sessionFrom,
} from './support/auth-app';
import { notificationsOf } from './support/notifications';

// Login, lockout, account states, refresh and logout (AUTH.md 4 to 9; BR-023, BR-032, BR-033,
// BR-201, BR-203, BR-209; O-05, O-25, O-59, D-070).
let h: AuthHarness;

beforeAll(async () => {
  h = await authHarness();
});

afterAll(async () => {
  await h.close();
});

const post = (path: string) => request(h.server()).post(`/api/v1${path}`);
const get = (path: string) => request(h.server()).get(`/api/v1${path}`);

describe('POST /auth/login', () => {
  it('logs staff in by email or mobile and volunteers by mobile, with tokens and cookies', async () => {
    const staff = await account(h.db);
    const byEmail = await post('/auth/login')
      .send({ loginId: `  ${staff.email!.toUpperCase()} `, password: PASSWORD })
      .expect(200);
    expect(byEmail.body.data).toMatchObject({
      accessToken: expect.any(String),
      expiresAt: expect.any(String),
      me: { id: staff.id, kind: 'staff', state: 'active', roles: ['program_manager'] },
    });
    expect(byEmail.headers['cache-control']).toBe('no-store');
    const cookies = (byEmail.headers['set-cookie'] as unknown as string[]).join('\n');
    expect(cookies).toMatch(
      /css_refresh=[0-9a-f-]{36}\.[\w-]+; Path=\/api\/v1\/auth\/refresh; Expires=.+; HttpOnly; SameSite=Strict/,
    );
    expect(cookies).toMatch(/css_csrf=[\w-]+\.[\w-]+; Path=\/; Expires=.+; SameSite=Strict/);
    expect(cookies).not.toMatch(/css_csrf=[^\n]*HttpOnly/);

    await post('/auth/login')
      .send({ loginId: `+88${staff.mobile}`, password: PASSWORD })
      .expect(200);
    const volunteer = await account(h.db, { kind: 'volunteer' });
    await post('/auth/login').send({ loginId: volunteer.mobile, password: PASSWORD }).expect(200);
  });

  it('answers the same for an unknown id and a wrong password (no enumeration)', async () => {
    const staff = await account(h.db);
    const wrong = await post('/auth/login')
      .send({ loginId: staff.email, password: 'wrong password 1' })
      .expect(401);
    const unknown = await post('/auth/login')
      .send({ loginId: 'nobody@example.org', password: 'wrong password 1' })
      .expect(401);
    expect(wrong.body.error.code).toBe('auth.invalid_credentials');
    expect(unknown.body.error).toMatchObject({
      code: wrong.body.error.code,
      message: wrong.body.error.message,
    });
    const failures = await auditRows(h.db, 'auth.login_failed');
    expect(failures.some((r) => r.entity_id === staff.id)).toBe(true);
    expect(failures.some((r) => r.entity_id === null)).toBe(true);
    expect(JSON.stringify(failures)).not.toContain('wrong password');
    expect(JSON.stringify(failures)).not.toContain('nobody@example.org');
  });

  it('rejects unknown fields and a missing password with 422', async () => {
    const res = await post('/auth/login').send({ loginId: 'a@example.org' }).expect(422);
    expect(res.body.error.details).toEqual([
      expect.objectContaining({ path: 'password', code: 'validation.required' }),
    ]);
    await post('/auth/login').send({ loginId: 'a', password: 'b', role: 'x' }).expect(422);
  });

  it('locks after 5 failures for 15 minutes, also for unknown ids, and the lock passes (AUTH.md 6)', async () => {
    const staff = await account(h.db);
    for (let i = 1; i <= 4; i++)
      await post('/auth/login').send({ loginId: staff.email, password: 'bad pass 1' }).expect(401);
    const locked = await post('/auth/login')
      .send({ loginId: staff.email, password: 'bad pass 1' })
      .expect(423);
    expect(locked.body.error.code).toBe('auth.account_locked');
    expect(Number(locked.headers['retry-after'])).toBe(900);
    // the right password does not open a locked account
    await post('/auth/login').send({ loginId: staff.email, password: PASSWORD }).expect(423);
    expect(await auditRows(h.db, 'auth.locked')).toEqual(
      expect.arrayContaining([expect.objectContaining({ entity_id: staff.id })]),
    );

    for (let i = 1; i <= 4; i++)
      await post('/auth/login')
        .send({ loginId: 'ghost@example.org', password: 'x1x1x1x1' })
        .expect(401);
    await post('/auth/login')
      .send({ loginId: 'ghost@example.org', password: 'x1x1x1x1' })
      .expect(423);

    h.clock.advance(15 * 60_000 + 1000);
    await post('/auth/login').send({ loginId: staff.email, password: PASSWORD }).expect(200);
    const row = await h.db.query(
      'SELECT failed_login_count, locked_until FROM users WHERE id = $1',
      [staff.id],
    );
    expect(row.rows[0]).toEqual({ failed_login_count: 0, locked_until: null });
    // the person is told of the lock in the app
    expect(await notificationsOf(h.db, 'account_locked', staff.id)).toHaveLength(1);
  });

  it('emails the Monitoring Team at the tenth lockout of a day, once', async () => {
    const monitoring = await account(h.db, { role: 'monitoring_team' });
    const { rows } = await h.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit_log WHERE action = 'auth.locked'`,
    );
    // the lockouts of the day so far, up to nine
    for (let i = rows[0]!.n; i < 9; i++)
      await h.db.query(
        `INSERT INTO audit_log (id, action, entity_type, created_at) VALUES ($1, 'auth.locked', 'user', now())`,
        [randomUUID()],
      );
    const lockOut = async () => {
      const person = await account(h.db);
      for (let i = 1; i <= 5; i++)
        await post('/auth/login').send({ loginId: person.email, password: 'bad pass 1' });
    };
    await lockOut();
    await lockOut();
    const emails = await h.db.query(
      `SELECT params FROM outbound_messages WHERE template_key = 'security_lockout_alert' AND recipient_user_id = $1`,
      [monitoring.id],
    );
    expect(emails.rows).toHaveLength(1);
    expect(emails.rows[0].params).toMatchObject({ count: 10 });
    // email only: no in-app entry
    expect(await notificationsOf(h.db, 'security_lockout_alert')).toEqual([]);
  });

  it('a success resets the failure counter', async () => {
    const staff = await account(h.db);
    for (let i = 1; i <= 4; i++)
      await post('/auth/login').send({ loginId: staff.email, password: 'bad pass 1' }).expect(401);
    await login(h, staff);
    for (let i = 1; i <= 4; i++)
      await post('/auth/login').send({ loginId: staff.email, password: 'bad pass 1' }).expect(401);
  });

  it('gives a pending account tokens limited to its own profile and sessions (AUTH.md 7)', async () => {
    const pending = await account(h.db, { kind: 'volunteer', state: 'pending' });
    const s = await login(h, pending);
    expect(s.body.me).toMatchObject({ state: 'pending' });
    await get('/auth/me').set(bearer(s)).expect(200);
    await get('/sessions').set(bearer(s)).expect(200);
    const denied = await get('/users').set(bearer(s)).expect(403);
    expect(denied.body.error.code).toBe('auth.account_pending');
  });

  it('refuses blocked and deactivated accounts without a session (O-59 item 4)', async () => {
    const blocked = await account(h.db, { state: 'blocked' });
    const closed = await account(h.db, { state: 'deactivated' });
    const b = await post('/auth/login')
      .send({ loginId: blocked.email, password: PASSWORD })
      .expect(403);
    expect(b.body.error.code).toBe('auth.account_blocked');
    expect(b.headers['set-cookie']).toBeUndefined();
    const d = await post('/auth/login')
      .send({ loginId: closed.email, password: PASSWORD })
      .expect(403);
    expect(d.body.error.code).toBe('auth.account_deactivated');
    const sessions = await h.db.query(
      'SELECT count(*)::int AS n FROM device_sessions WHERE user_id = ANY($1)',
      [[blocked.id, closed.id]],
    );
    expect(sessions.rows[0].n).toBe(0);
    // a blocked account with a wrong password still gets the generic error
    await post('/auth/login').send({ loginId: blocked.email, password: 'bad pass 1' }).expect(401);
  });

  it('records the login with the device session and IP, never the password', async () => {
    const staff = await account(h.db);
    const s = await login(h, staff, { platform: 'desktop' });
    const rows = await auditRows(h.db, 'auth.login');
    const mine = rows.find((r) => r.actor_user_id === staff.id);
    expect(mine).toMatchObject({ entity_type: 'device_session', new: { platform: 'desktop' } });
    expect(mine!.device_session_id).toBe(mine!.entity_id);
    expect(mine!.ip).toBeTruthy();
    expect(JSON.stringify(rows)).not.toContain(PASSWORD);
    const session = await h.db.query(
      'SELECT idle_timeout, platform, device_name FROM device_sessions WHERE id = $1',
      [mine!.entity_id],
    );
    expect(session.rows[0]).toEqual({
      idle_timeout: true,
      platform: 'desktop',
      device_name: 'Test device',
    });
    expect(s.accessToken.split('.')).toHaveLength(3);
  });

  it('revokes the oldest session when a sixth device logs in (O-25)', async () => {
    const volunteer = await account(h.db, { kind: 'volunteer' });
    const sessions = [];
    for (let i = 0; i < 6; i++) {
      sessions.push(await login(h, volunteer));
      h.clock.advance(1000);
    }
    const res = await get('/auth/me').set(bearer(sessions[0]!)).expect(401);
    expect(res.body.error.code).toBe('auth.session_revoked');
    await get('/auth/me').set(bearer(sessions[5]!)).expect(200);
    const active = await h.db.query(
      'SELECT count(*)::int AS n FROM device_sessions WHERE user_id = $1 AND revoked_at IS NULL',
      [volunteer.id],
    );
    expect(active.rows[0].n).toBe(5);
  });

  it('keeps every device of the E2E run, whose specs share the demo accounts (D-102)', async () => {
    const relaxed = await authHarness({ relaxedDeviceLimit: true });
    try {
      const volunteer = await account(relaxed.db, { kind: 'volunteer' });
      const sessions = [];
      for (let i = 0; i < 7; i++) {
        sessions.push(await login(relaxed, volunteer));
        relaxed.clock.advance(1000);
      }
      await request(relaxed.server()).get('/api/v1/auth/me').set(bearer(sessions[0]!)).expect(200);
      const active = await relaxed.db.query(
        'SELECT count(*)::int AS n FROM device_sessions WHERE user_id = $1 AND revoked_at IS NULL',
        [volunteer.id],
      );
      expect(active.rows[0].n).toBe(7);
    } finally {
      await relaxed.close();
    }
  });
});

describe('access tokens on every request', () => {
  it('needs a bearer token and refuses a forged or expired one', async () => {
    expect((await get('/auth/me').expect(401)).body.error.code).toBe('auth.token_missing');
    const forged = await get('/auth/me').set('Authorization', 'Bearer abc.def.ghi').expect(401);
    expect(forged.body.error.code).toBe('auth.token_missing');
    const s = await login(h, await account(h.db));
    h.clock.advance(15 * 60_000 + 1000);
    expect((await get('/auth/me').set(bearer(s)).expect(401)).body.error.code).toBe(
      'auth.token_expired',
    );
  });

  it('answers token_stale after a permission-version bump (AUTH.md 9)', async () => {
    const staff = await account(h.db);
    const s = await login(h, staff);
    await h.db.query('UPDATE users SET permission_version = permission_version + 1 WHERE id = $1', [
      staff.id,
    ]);
    h.clock.advance(61_000); // past the one-minute session cache of another process
    expect((await get('/auth/me').set(bearer(s)).expect(401)).body.error.code).toBe(
      'auth.token_stale',
    );
    const refreshed = await post('/auth/refresh')
      .set('Cookie', s.cookieHeader)
      .set('X-CSRF-Token', s.csrf)
      .expect(200);
    const next = sessionFrom(refreshed);
    const me = await get('/auth/me').set(bearer(next)).expect(200);
    expect(me.body.data.permissionVersion).toBe(2);
  });

  it('returns the current user with roles and language', async () => {
    const staff = await account(h.db, { role: 'department_head' });
    const s = await login(h, staff);
    const res = await get('/auth/me').set(bearer(s)).expect(200);
    expect(res.body.data).toEqual({
      id: staff.id,
      displayName: expect.any(String),
      kind: 'staff',
      state: 'active',
      roles: ['department_head'],
      language: 'bn',
      permissionVersion: 1,
      passwordChangeRequired: false,
      blockMessage: null,
      volunteerId: null,
    });
  });
});

describe('POST /auth/refresh', () => {
  it('rotates the refresh token and its cookies', async () => {
    const s = await login(h, await account(h.db));
    const res = await post('/auth/refresh')
      .set('Cookie', s.cookieHeader)
      .set('X-CSRF-Token', s.csrf)
      .expect(200);
    const next = sessionFrom(res);
    expect(next.refreshCookie).not.toBe(s.refreshCookie);
    expect(next.refreshCookie.split('.')[0]).toBe(s.refreshCookie.split('.')[0]);
    await get('/auth/me').set(bearer(next)).expect(200);
  });

  it('needs the CSRF header equal to the cookie and signed for the session', async () => {
    const s = await login(h, await account(h.db));
    const other = await login(h, await account(h.db));
    const missing = await post('/auth/refresh').set('Cookie', s.cookieHeader).expect(403);
    expect(missing.body.error.code).toBe('auth.csrf_failed');
    // another session's valid token in both places is still refused
    await post('/auth/refresh')
      .set('Cookie', `css_refresh=${encodeURIComponent(s.refreshCookie)}; css_csrf=${other.csrf}`)
      .set('X-CSRF-Token', other.csrf)
      .expect(403);
    await post('/auth/refresh')
      .set('Cookie', s.cookieHeader)
      .set('X-CSRF-Token', `${s.csrf}x`)
      .expect(403);
  });

  it('revokes the session when an old refresh token is replayed (theft)', async () => {
    const owner = await account(h.db);
    const s = await login(h, owner);
    const first = sessionFrom(
      await post('/auth/refresh')
        .set('Cookie', s.cookieHeader)
        .set('X-CSRF-Token', s.csrf)
        .expect(200),
    );
    // within a few seconds a replay is a parallel tab: refused without revoking
    const parallel = await post('/auth/refresh')
      .set('Cookie', s.cookieHeader)
      .set('X-CSRF-Token', s.csrf)
      .expect(401);
    expect(parallel.body.error.code).toBe('auth.refresh_invalid');
    h.clock.advance(60_000);
    const reuse = await post('/auth/refresh')
      .set('Cookie', s.cookieHeader)
      .set('X-CSRF-Token', s.csrf)
      .expect(401);
    expect(reuse.body.error.code).toBe('auth.refresh_reused');
    const after = await post('/auth/refresh')
      .set('Cookie', first.cookieHeader)
      .set('X-CSRF-Token', first.csrf)
      .expect(401);
    expect(after.body.error.code).toBe('auth.session_revoked');
    expect((await auditRows(h.db, 'auth.refresh_reuse_detected')).length).toBeGreaterThan(0);
    // the person in the app, never by email with the Monitoring Team's text
    expect(await notificationsOf(h.db, 'security_refresh_reuse', owner.id)).toHaveLength(1);
    const own = await h.db.query(
      `SELECT 1 FROM outbound_messages WHERE template_key = 'security_refresh_reuse' AND recipient_user_id = $1`,
      [owner.id],
    );
    expect(own.rowCount).toBe(0);
  });

  it('refuses an unknown token, and sessions idle too long or past their limits', async () => {
    const none = await post('/auth/refresh')
      .set('Cookie', 'css_refresh=nope; css_csrf=x.y')
      .set('X-CSRF-Token', 'x.y')
      .expect(401);
    expect(none.body.error.code).toBe('auth.refresh_invalid');
    expect((none.headers['set-cookie'] as unknown as string[]).join(';')).toMatch(/css_refresh=;/);

    const staff = await account(h.db);
    const desk = await login(h, staff, { platform: 'desktop' });
    const phone = await login(h, await account(h.db, { kind: 'volunteer' }));
    h.clock.advance(12 * 3_600_000 + 60_000);
    const idle = await post('/auth/refresh')
      .set('Cookie', desk.cookieHeader)
      .set('X-CSRF-Token', desk.csrf)
      .expect(401);
    expect(idle.body.error.code).toBe('auth.refresh_invalid');
    // a volunteer phone has no idle timeout (O-25)
    const phoneNext = sessionFrom(
      await post('/auth/refresh')
        .set('Cookie', phone.cookieHeader)
        .set('X-CSRF-Token', phone.csrf)
        .expect(200),
    );
    h.clock.advance(31 * 24 * 3_600_000);
    await post('/auth/refresh')
      .set('Cookie', phoneNext.cookieHeader)
      .set('X-CSRF-Token', phoneNext.csrf)
      .expect(401);
  });

  it('ends at the 180-day hard limit even when refreshed within every 30 days', async () => {
    let s = await login(h, await account(h.db, { kind: 'volunteer' }));
    for (let round = 0; round < 6; round++) {
      h.clock.advance(29 * 24 * 3_600_000);
      s = sessionFrom(
        await post('/auth/refresh')
          .set('Cookie', s.cookieHeader)
          .set('X-CSRF-Token', s.csrf)
          .expect(200),
      );
    }
    // 6 x 29 = 174 days; one more week passes the 180-day limit
    h.clock.advance(7 * 24 * 3_600_000);
    await post('/auth/refresh')
      .set('Cookie', s.cookieHeader)
      .set('X-CSRF-Token', s.csrf)
      .expect(401);
  });
});

describe('POST /auth/logout', () => {
  it('revokes the current session, clears the cookies and audits', async () => {
    const staff = await account(h.db);
    const s = await login(h, staff);
    const res = await post('/auth/logout').set(bearer(s)).expect(204);
    expect((res.headers['set-cookie'] as unknown as string[]).join(';')).toMatch(/css_refresh=;/);
    expect((await get('/auth/me').set(bearer(s)).expect(401)).body.error.code).toBe(
      'auth.session_revoked',
    );
    await post('/auth/refresh')
      .set('Cookie', s.cookieHeader)
      .set('X-CSRF-Token', s.csrf)
      .expect(401);
    expect(await auditRows(h.db, 'auth.logout')).toEqual(
      expect.arrayContaining([expect.objectContaining({ actor_user_id: staff.id })]),
    );
  });
});

describe('PUT /me/language', () => {
  it('stores the language with an audit entry (O-56)', async () => {
    const staff = await account(h.db);
    const s = await login(h, staff);
    await request(h.server())
      .put('/api/v1/me/language')
      .set(bearer(s))
      .send({ language: 'en' })
      .expect(204);
    const row = await h.db.query('SELECT language FROM users WHERE id = $1', [staff.id]);
    expect(row.rows[0].language).toBe('en');
    expect(await auditRows(h.db, 'user.language_changed')).toEqual([
      expect.objectContaining({
        entity_id: staff.id,
        old: { language: 'bn' },
        new: { language: 'en' },
      }),
    ]);
    await request(h.server())
      .put('/api/v1/me/language')
      .set(bearer(s))
      .send({ language: 'fr' })
      .expect(422);
  });
});
