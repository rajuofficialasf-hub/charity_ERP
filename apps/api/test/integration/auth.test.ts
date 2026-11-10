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
  type Session,
  sessionFrom,
} from './support/auth-app';
import { notificationsOf } from './support/notifications';

// Login, lockout, account states, refresh and logout (AUTH.md 4 to 9).
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

  it('counts wrong passwords sent in parallel one by one, so they still lock the account', async () => {
    const staff = await account(h.db);
    const tries = await Promise.all(
      Array.from({ length: 8 }, () =>
        post('/auth/login').send({ loginId: staff.email, password: 'bad pass 1' }),
      ),
    );
    expect(tries.every((r) => r.status === 401 || r.status === 423)).toBe(true);
    // the right password does not open the account the parallel guesses locked
    await post('/auth/login').send({ loginId: staff.email, password: PASSWORD }).expect(423);
    const locks = (await auditRows(h.db, 'auth.locked')).filter((r) => r.entity_id === staff.id);
    expect(locks).toHaveLength(1);
    h.clock.advance(15 * 60_000 + 1000);
    await post('/auth/login').send({ loginId: staff.email, password: PASSWORD }).expect(200);
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

  it('refuses blocked and deactivated accounts without a session', async () => {
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

  it('revokes the oldest session when a sixth device logs in', async () => {
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

  it('keeps every device of the E2E run, whose specs share the demo accounts', async () => {
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
      photoFileId: null,
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
    // a volunteer phone has no idle timeout
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

/** The `sid` claim of an access token: the device session the phone should remember. */
const sessionIdOf = (s: Session): string =>
  (JSON.parse(Buffer.from(s.accessToken.split('.')[1]!, 'base64url').toString()) as { sid: string })
    .sid;

describe('the device key of a session', () => {
  it('comes with the login and with every refresh, differs per device, and is never audited', async () => {
    const volunteer = await account(h.db, { kind: 'volunteer' });
    const phone = await login(h, volunteer);
    const deviceKey = phone.body.deviceKey as string;
    expect(deviceKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(phone.body.previousDeviceKey).toBeUndefined();
    const refreshed = await post('/auth/refresh')
      .set('Cookie', phone.cookieHeader)
      .set('X-CSRF-Token', phone.csrf)
      .expect(200);
    expect(refreshed.body.data.deviceKey).toBe(deviceKey);
    const tablet = await login(h, volunteer);
    expect(tablet.body.deviceKey).not.toBe(deviceKey);
    const audits = await auditRows(h.db, 'auth.login');
    expect(JSON.stringify(audits)).not.toContain(deviceKey);
    const row = await h.db.query('SELECT local_key FROM device_sessions WHERE id = $1', [
      sessionIdOf(phone),
    ]);
    // the row holds the sealed key, never the key the phone was told
    expect(Buffer.from(row.rows[0].local_key).toString('base64url')).not.toContain(deviceKey);
  });

  it('is handed back after the session expired, to the same user, and again for a short while', async () => {
    const volunteer = await account(h.db, { kind: 'volunteer' });
    // the oldest of five sessions: the sixth login would evict it, which must not cost the key
    const old = await login(h, volunteer);
    for (let i = 0; i < 4; i += 1) await login(h, volunteer);
    const oldKey = old.body.deviceKey as string;
    const oldSession = sessionIdOf(old);
    h.clock.advance(31 * 24 * 3_600_000);
    const again = await post('/auth/login')
      .send({ loginId: volunteer.mobile, password: PASSWORD, recoverSessionId: oldSession })
      .expect(200);
    expect(again.body.data.previousDeviceKey).toBe(oldKey);
    expect(again.body.data.deviceKey).not.toBe(oldKey);
    expect(await auditRows(h.db, 'auth.outbox_recovered')).toEqual(
      expect.arrayContaining([expect.objectContaining({ entity_id: oldSession })]),
    );
    // the answer was lost on the network: the same ask within the grace is answered again
    h.clock.advance(5 * 60_000);
    const lost = await post('/auth/login')
      .send({ loginId: volunteer.mobile, password: PASSWORD, recoverSessionId: oldSession })
      .expect(200);
    expect(lost.body.data.previousDeviceKey).toBe(oldKey);
    h.clock.advance(20 * 60_000);
    const late = await post('/auth/login')
      .send({
        loginId: volunteer.mobile,
        password: PASSWORD,
        recoverSessionId: oldSession,
        lostPending: { count: 3, reason: 'unrecoverable' },
      })
      .expect(200);
    expect(late.body.data.previousDeviceKey).toBeUndefined();
    expect(await auditRows(h.db, 'sync.outbox_unrecoverable')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity_id: oldSession,
          new: expect.objectContaining({ count: 3, reason: 'gone' }),
        }),
      ]),
    );
  });

  it('keeps the key of an ended session for thirty days, then the nightly cleanup drops it', async () => {
    const volunteer = await account(h.db, { kind: 'volunteer' });
    const kept = await login(h, volunteer);
    h.clock.advance(2 * 24 * 3_600_000);
    const dropped = await login(h, volunteer);
    // the first session ended 31 days after its last refresh, the second 29 days after
    h.clock.advance(59 * 24 * 3_600_000);
    await h.container.localKeyCleanup.run();
    const keyOf = async (s: Session) =>
      (await h.db.query('SELECT local_key FROM device_sessions WHERE id = $1', [sessionIdOf(s)]))
        .rows[0].local_key as Buffer | null;
    expect(await keyOf(kept)).toBeNull();
    expect(await keyOf(dropped)).not.toBeNull();
    const late = await post('/auth/login')
      .send({ loginId: volunteer.mobile, password: PASSWORD, recoverSessionId: sessionIdOf(kept) })
      .expect(200);
    expect(late.body.data.previousDeviceKey).toBeUndefined();
    const inTime = await post('/auth/login')
      .send({
        loginId: volunteer.mobile,
        password: PASSWORD,
        recoverSessionId: sessionIdOf(dropped),
      })
      .expect(200);
    expect(inTime.body.data.previousDeviceKey).toBe(dropped.body.deviceKey);
    // a key handed back is dropped a day later
    h.clock.advance(25 * 3_600_000);
    await h.container.localKeyCleanup.run();
    expect(await keyOf(dropped)).toBeNull();
  });

  it('replaces a sealed key no secret opens at the next refresh, and puts the loss on record', async () => {
    const volunteer = await account(h.db, { kind: 'volunteer' });
    const s = await login(h, volunteer);
    const sid = sessionIdOf(s);
    await h.db.query('UPDATE device_sessions SET local_key = $1 WHERE id = $2', [
      Buffer.alloc(60, 7),
      sid,
    ]);
    const refreshed = await post('/auth/refresh')
      .set('Cookie', s.cookieHeader)
      .set('X-CSRF-Token', s.csrf)
      .expect(200);
    expect(refreshed.body.data.deviceKey).not.toBe(s.body.deviceKey);
    expect(await auditRows(h.db, 'sync.outbox_unrecoverable')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity_id: sid,
          new: expect.objectContaining({ reason: 'seal_unopenable' }),
        }),
      ]),
    );
  });

  it('refuses malformed recovery and pending fields with 422', async () => {
    const volunteer = await account(h.db, { kind: 'volunteer' });
    for (const body of [
      { recoverSessionId: 'not-a-uuid' },
      { lostPending: { count: 100_001, reason: 'logout' } },
      { lostPending: { count: 1, reason: 'stolen' } },
    ])
      await post('/auth/login')
        .send({ loginId: volunteer.mobile, password: PASSWORD, ...body })
        .expect(422);
    const s = await login(h, volunteer);
    await post('/auth/logout').set(bearer(s)).send({ pendingCount: 100_001 }).expect(422);
    await post('/auth/logout').set(bearer(s)).send({ pendingCount: 'two' }).expect(422);
  });

  it('is never handed back for a live, a revoked, another user’s or a long-expired session', async () => {
    const volunteer = await account(h.db, { kind: 'volunteer' });
    const live = await login(h, volunteer);
    const recoverLive = await post('/auth/login')
      .send({ loginId: volunteer.mobile, password: PASSWORD, recoverSessionId: sessionIdOf(live) })
      .expect(200);
    expect(recoverLive.body.data.previousDeviceKey).toBeUndefined();

    const revoked = await login(h, volunteer);
    await post('/auth/logout').set(bearer(revoked)).expect(204);
    const keyRow = await h.db.query('SELECT local_key FROM device_sessions WHERE id = $1', [
      sessionIdOf(revoked),
    ]);
    expect(keyRow.rows[0].local_key).toBeNull();

    const stranger = await account(h.db, { kind: 'volunteer' });
    const strangers = await login(h, stranger);
    h.clock.advance(31 * 24 * 3_600_000);
    const theft = await post('/auth/login')
      .send({
        loginId: volunteer.mobile,
        password: PASSWORD,
        recoverSessionId: sessionIdOf(strangers),
        lostPending: { count: 9, reason: 'unrecoverable' },
      })
      .expect(200);
    expect(theft.body.data.previousDeviceKey).toBeUndefined();
    const unrecoverable = await auditRows(h.db, 'sync.outbox_unrecoverable');
    // a stranger's session id never becomes the entity of the caller's audit rows, and a live
    // session's key stays, so nothing is recorded as lost for it
    expect(unrecoverable.filter((r) => r.entity_id === sessionIdOf(strangers))).toEqual([]);
    expect(unrecoverable.filter((r) => r.entity_id === sessionIdOf(live))).toEqual([]);

    const forgotten = await login(h, volunteer);
    h.clock.advance(61 * 24 * 3_600_000);
    await h.container.localKeyCleanup.run();
    const late = await post('/auth/login')
      .send({
        loginId: volunteer.mobile,
        password: PASSWORD,
        recoverSessionId: sessionIdOf(forgotten),
      })
      .expect(200);
    expect(late.body.data.previousDeviceKey).toBeUndefined();
  });

  it('records a logout that left records on the phone, at once or at the next login', async () => {
    const volunteer = await account(h.db, { kind: 'volunteer' });
    const s = await login(h, volunteer);
    await post('/auth/logout').set(bearer(s)).send({ pendingCount: 2 }).expect(204);
    const row = await h.db.query<{ pending_count: number | null; revoked_at: Date | null }>(
      'SELECT pending_count, revoked_at FROM device_sessions WHERE user_id = $1',
      [volunteer.id],
    );
    expect(row.rows[0]).toMatchObject({ pending_count: 2 });
    expect(row.rows[0]!.revoked_at).not.toBeNull();
    await post('/auth/login')
      .send({
        loginId: volunteer.mobile,
        password: PASSWORD,
        lostPending: { count: 3, reason: 'logout' },
      })
      .expect(200);
    const rows = await auditRows(h.db, 'auth.logout_with_pending');
    expect(rows.map((r) => (r.new as { count: number }).count).sort()).toEqual([2, 3]);
    const quiet = await login(h, volunteer);
    await post('/auth/logout').set(bearer(quiet)).expect(204);
    expect(await auditRows(h.db, 'auth.logout_with_pending')).toHaveLength(2);
  });
});

describe('PUT /me/language', () => {
  it('stores the language with an audit entry', async () => {
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
