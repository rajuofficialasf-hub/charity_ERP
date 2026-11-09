import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  systemOwner,
} from './support/auth-app';

// Every active device session for the global roles; ending one keeps the Main Admin's sessions for
// the Main Admin.
let h: AuthHarness;
const api = () => request(h.server());

beforeAll(async () => {
  h = await authHarness();
});

/** The newest device session of a user: the one a login just opened. */
async function newestSession(userId: string): Promise<string> {
  const { rows } = await h.db.query(
    'SELECT id FROM device_sessions WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1',
    [userId],
  );
  return rows[0].id as string;
}
afterAll(async () => h.close());

describe('the active sessions', () => {
  it('lists active sessions only, with the person and the device, never a token or address', async () => {
    const head = await login(h, await account(h.db, { role: 'department_head' }));
    const volunteer = await account(h.db, { kind: 'volunteer', role: 'volunteer_general' });
    await login(h, volunteer);
    const kept = await newestSession(volunteer.id);
    await login(h, volunteer);
    const ended = await newestSession(volunteer.id);
    await h.db.query(`UPDATE device_sessions SET revoked_at = now() WHERE id = $1`, [ended]);
    // a session past its expiry, written as an old row would be
    const expired = (
      await h.db.query(
        `INSERT INTO device_sessions (id, user_id, refresh_token_hash, expires_at, created_at, last_seen_at)
         VALUES (gen_random_uuid(), $1, md5(random()::text), now() - interval '1 minute', now() - interval '100 days', now() - interval '20 days')
         RETURNING id`,
        [volunteer.id],
      )
    ).rows[0].id as string;
    const res = await api()
      .get('/api/v1/sessions/active')
      .query({ kind: 'volunteer' })
      .set(bearer(head));
    expect(res.status).toBe(200);
    const ids = (res.body.data as { id: string }[]).map((s) => s.id);
    expect(ids).toContain(kept);
    expect(ids).not.toContain(ended);
    expect(ids).not.toContain(expired);
    // newest started first
    expect(ids).toEqual([...ids].sort().reverse());
    const row = (res.body.data as { id: string }[]).find((s) => s.id === kept);
    expect(row).toMatchObject({
      person: { id: volunteer.id, kind: 'volunteer', systemOwner: false },
    });
    expect(Object.keys(row!).sort()).toEqual([
      'appVersion',
      'createdAt',
      'deviceName',
      'id',
      'lastSeenAt',
      'person',
      'platform',
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/refresh|Hash|lastIp/);
  });

  it('searches by person name', async () => {
    const monitor = await login(h, await account(h.db, { role: 'monitoring_team' }));
    const target = await account(h.db, { role: 'program_manager' });
    await h.db.query(`UPDATE users SET display_name = 'অনন্য খোঁজ' WHERE id = $1`, [target.id]);
    await login(h, target);
    const res = await api()
      .get('/api/v1/sessions/active')
      .query({ q: 'অনন্য' })
      .set(bearer(monitor));
    expect(res.status).toBe(200);
    expect((res.body.data as { person: { id: string } }[]).map((s) => s.person.id)).toEqual([
      target.id,
    ]);
  });

  it('a global role ends an official session with a reason; the Main Admin stays protected', async () => {
    const monitor = await login(h, await account(h.db, { role: 'monitoring_team' }));
    const official = await account(h.db, { role: 'program_manager' });
    await login(h, official);
    const officialSession = await newestSession(official.id);
    const ended = await api()
      .post(`/api/v1/users/${official.id}/sessions/${officialSession}/revoke`)
      .set(bearer(monitor))
      .send({ reason: 'lost phone' });
    expect(ended.status).toBe(204);
    const { rows } = await h.db.query(
      `SELECT reason FROM audit_log WHERE action = 'auth.session_revoked_by_official' AND entity_id = $1`,
      [officialSession],
    );
    expect(rows).toEqual([{ reason: 'lost phone' }]);
    const owner = await systemOwner(h.db);
    await login(h, owner);
    const ownerSession = await newestSession(owner.id);
    const listed = await api().get('/api/v1/sessions/active').set(bearer(monitor));
    expect(
      (listed.body.data as { id: string; person: { systemOwner: boolean } }[]).find(
        (s) => s.id === ownerSession,
      )?.person.systemOwner,
    ).toBe(true);
    const refused = await api()
      .post(`/api/v1/users/${owner.id}/sessions/${ownerSession}/revoke`)
      .set(bearer(monitor))
      .send({ reason: 'testing protection' });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('user.system_owner_protected');
  });

  it('refuses an RPM, a PM and a volunteer, and answers 401 without a session', async () => {
    for (const role of ['regional_program_manager', 'program_manager']) {
      const s = await login(h, await account(h.db, { role }));
      expect((await api().get('/api/v1/sessions/active').set(bearer(s))).status).toBe(403);
    }
    const v = await login(h, await account(h.db, { kind: 'volunteer', role: 'volunteer_general' }));
    expect((await api().get('/api/v1/sessions/active').set(bearer(v))).status).toBe(403);
    expect((await api().get('/api/v1/sessions/active')).status).toBe(401);
  });
});
