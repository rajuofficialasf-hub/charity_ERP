import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accessWorld } from './support/access-fixtures';
import {
  type Account,
  account,
  type AuthHarness,
  auditRows,
  authHarness,
  bearer,
  login,
  PASSWORD,
  type Session,
} from './support/auth-app';
import { DUMMY_CODE, pendingStaffRegistration } from './support/registration';

// A staff registration approved with a global role asks for a new password at the next sign-in
// (O-66; plan docs/plans/2026-10-14-1400-feat-volunteer-form-refine-plan.md, U6).
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const NEW_PASSWORD = 'Shapla phul 2026';

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

// officials no longer register themselves (D-097): a registration left pending from before
const registerStaff = () => pendingStaffRegistration(h);

const decide = async (userId: string, roleKey: string) => {
  const head = await login(h, accounts.get(world.users.head)!);
  return api()
    .post(`/api/v1/staff-registrations/${userId}/decision`)
    .set(bearer(head))
    .send({ decision: 'approve', roleKey });
};

const flagOf = async (userId: string) =>
  (await h.db.query('SELECT password_change_required AS p FROM users WHERE id = $1', [userId]))
    .rows[0].p as boolean;

/** An approved staff account with the Monitoring Team role, signed in: the flag is set. */
async function flaggedStaff() {
  const staff = await registerStaff();
  expect((await decide(staff.userId, 'monitoring_team')).status).toBe(200);
  const session = await login(h, staff.email);
  return { ...staff, session };
}

/** The operations a flagged account may call (O-66). */
const ALLOWED = [
  'auth.me.get',
  'auth.password.change',
  'auth.me.language.set',
  'auth.session.logout',
];

describe('the flag', () => {
  it('is set when a staff registration is approved with a global role, and only then', async () => {
    const global = await registerStaff();
    expect((await decide(global.userId, 'monitoring_team')).status).toBe(200);
    expect(await flagOf(global.userId)).toBe(true);
    const plain = await registerStaff();
    expect((await decide(plain.userId, 'project_executive')).status).toBe(200);
    expect(await flagOf(plain.userId)).toBe(false);
    // the approval's audit entry is the one it always was
    const rows = await auditRows(h.db, 'auth.approved');
    expect(rows.find((r) => r.entity_id === global.userId)).toMatchObject({
      new: { kind: 'staff', role: 'monitoring_team' },
    });
  });

  it('is false for every account that exists already, which signs in and works as before', async () => {
    const old = await account(h.db, { role: 'monitoring_team' });
    expect(await flagOf(old.id)).toBe(false);
    const s = await login(h, old);
    const me = await api().get('/api/v1/auth/me').set(bearer(s)).expect(200);
    expect(me.body.data.passwordChangeRequired).toBe(false);
    await api().get('/api/v1/registrations').set(bearer(s)).expect(200);
  });
});

describe('a flagged account', () => {
  it('sees the flag in its own profile and is refused every other operation', async () => {
    const { session } = await flaggedStaff();
    const me = await api().get('/api/v1/auth/me').set(bearer(session)).expect(200);
    expect(me.body.data.passwordChangeRequired).toBe(true);
    const refused = await api().get('/api/v1/registrations').set(bearer(session));
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('auth.password_change_required');
    await api()
      .put('/api/v1/me/language')
      .set(bearer(session))
      .send({ language: 'en' })
      .expect(204);
  });

  it('is refused by every registered operation but the four for the password change', async () => {
    const { session } = await flaggedStaff();
    const allowed = h.registry
      .list()
      .filter((o) => o.allowPasswordChange)
      .map((o) => o.operationId)
      .sort();
    expect(allowed).toEqual([...ALLOWED].sort());
    const port = (h.server().address() as { port: number }).port;
    let refusedCount = 0;
    for (const op of h.registry.list()) {
      if (op.permission === 'public' || ALLOWED.includes(op.operationId)) continue;
      const path = op.path.replace(/:[A-Za-z0-9_]+/g, () => randomUUID());
      const res = await fetch(`http://127.0.0.1:${port}/api/v1${path}`, {
        method: op.method.toUpperCase(),
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: ['get', 'delete'].includes(op.method) ? undefined : '{}',
      });
      const body = (await res.json()) as { error?: { code?: string } };
      expect(`${op.operationId} ${res.status} ${body.error?.code}`).toBe(
        `${op.operationId} 403 auth.password_change_required`,
      );
      refusedCount += 1;
    }
    expect(refusedCount).toBeGreaterThan(20);
  });

  it('can sign out', async () => {
    const { session } = await flaggedStaff();
    await api().post('/api/v1/auth/logout').set(bearer(session)).expect(204);
  });
});

describe('the password change', () => {
  it('refuses 11 characters and the same password, accepts 12, and the next request works at once', async () => {
    const { userId, session } = await flaggedStaff();
    // warm the cached facts of the session with the flag set
    await api().get('/api/v1/auth/me').set(bearer(session)).expect(200);
    const change = (newPassword: string) =>
      api()
        .post('/api/v1/auth/password/change')
        .set(bearer(session))
        .send({ currentPassword: PASSWORD, newPassword });
    const short = await change('Shapla 2026').expect(422);
    expect(short.body.error.details[0].code).toBe('validation.password_too_short');
    const same = await change(PASSWORD).expect(422);
    expect(same.body.error.details[0].code).toBe('auth.password_unchanged');
    expect(await flagOf(userId)).toBe(true);
    await change(NEW_PASSWORD).expect(204);
    expect(await flagOf(userId)).toBe(false);
    // the kept session was read before the change: the next request must not still see the flag
    await api().get('/api/v1/registrations').set(bearer(session)).expect(200);
    const me = await api().get('/api/v1/auth/me').set(bearer(session)).expect(200);
    expect(me.body.data.passwordChangeRequired).toBe(false);
  });
});

describe('the password reset', () => {
  const reset = (loginId: string, newPassword: string) =>
    api()
      .post('/api/v1/auth/password/reset/complete')
      .send({ loginId, code: DUMMY_CODE, newPassword });

  it('clears the flag with 12 characters and keeps it with fewer', async () => {
    const { userId, email } = await flaggedStaff();
    await api().post('/api/v1/auth/password/reset/start').send({ loginId: email }).expect(204);
    await reset(email, 'Shapla 2026').expect(422);
    expect(await flagOf(userId)).toBe(true);
    await api().post('/api/v1/auth/password/reset/start').send({ loginId: email }).expect(204);
    await reset(email, NEW_PASSWORD).expect(204);
    expect(await flagOf(userId)).toBe(false);
    const s: Session = await login(h, email, { password: NEW_PASSWORD });
    await api().get('/api/v1/registrations').set(bearer(s)).expect(200);
  });
});
