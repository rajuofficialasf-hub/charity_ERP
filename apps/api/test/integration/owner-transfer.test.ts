import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedAccessCatalogue } from './support/access-fixtures.js';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  PASSWORD,
  type Session,
  systemOwner,
} from './support/auth-app.js';
import { notificationsOf } from './support/notifications.js';

// The hand-over of the Main Admin flag (docs/architecture/AUTH.md, "Main Admin protection").
// A test-only wrong password for the confirmation.
const WRONG = `${PASSWORD}x`;
let h: AuthHarness;
let owner: Account;
let admin: Account;
let head: Account;
const api = () => request(h.server());

beforeAll(async () => {
  h = await authHarness();
  await seedAccessCatalogue(h.db);
  owner = await systemOwner(h.db);
  admin = await account(h.db, { role: 'admin' });
  head = await account(h.db, { role: 'department_head' });
});

afterAll(async () => {
  await h.close();
});

// Every case starts from the same state: the flag on the first Main Admin, and no wrong password
// counted on either Admin. The flag moves inside one transaction, as the database asks.
beforeEach(async () => {
  await h.db.query('BEGIN');
  await h.db.query('UPDATE users SET is_system_owner = false WHERE is_system_owner AND id <> $1', [
    owner.id,
  ]);
  await h.db.query('UPDATE users SET is_system_owner = true WHERE id = $1', [owner.id]);
  await h.db.query('COMMIT');
  await h.db.query(
    'UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = ANY($1::uuid[])',
    [[owner.id, admin.id]],
  );
  for (const id of [owner.id, admin.id]) h.container.sessions.evictUser(id);
});

const transfer = (s: Session, toUserId: string, password: string = PASSWORD) =>
  api().post('/api/v1/system-owner/transfer').set(bearer(s)).send({ toUserId, password });
const owners = async () =>
  (await h.db.query('SELECT id FROM users WHERE is_system_owner')).rows.map((r) => r.id as string);
const row = async (userId: string) =>
  (
    await h.db.query(
      'SELECT permission_version, failed_login_count, locked_until FROM users WHERE id = $1',
      [userId],
    )
  ).rows[0] as {
    permission_version: number;
    failed_login_count: number;
    locked_until: Date | null;
  };
const audits = async (userId: string, action: string) =>
  (
    await h.db.query(
      'SELECT new FROM audit_log WHERE entity_id = $1 AND action = $2 ORDER BY created_at',
      [userId, action],
    )
  ).rows.map((r) => r.new as Record<string, unknown>);

describe('the hand-over of the Main Admin flag', () => {
  it('is the Main Admin’s own act: another Admin and the Department Head are refused', async () => {
    const other = await transfer(await login(h, admin), admin.id);
    expect(other.status).toBe(403);
    expect(other.body.error.code).toBe('permission.denied');
    expect(await audits(admin.id, 'permission_change_refused')).toEqual([
      { rule: 'system_owner_only', toUserId: admin.id },
    ]);
    // the Head does not hold the permission at all
    const byHead = await transfer(await login(h, head), admin.id);
    expect(byHead.status).toBe(403);
    expect(byHead.body.error.code).toBe('permission.denied');
    expect(await owners()).toEqual([owner.id]);
    // another Admin is refused before the password is looked at: nothing is counted
    expect((await row(admin.id)).failed_login_count).toBe(0);
  });

  it('goes to another active Admin only', async () => {
    const session = await login(h, owner);
    const closed = await account(h.db, { role: 'admin', state: 'deactivated' });
    for (const toUserId of [head.id, owner.id, closed.id, '00000000-0000-7000-8000-000000000000']) {
      const res = await transfer(session, toUserId);
      expect(res.status, toUserId).toBe(422);
      expect(res.body.error.details).toContainEqual(
        expect.objectContaining({ path: 'toUserId', code: 'validation.option_unknown' }),
      );
    }
    expect(await owners()).toEqual([owner.id]);
  });

  it('asks for the own password, and counts a wrong one as a wrong login', async () => {
    const session = await login(h, owner);
    const res = await transfer(session, admin.id, WRONG);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('auth.password_confirmation_failed');
    expect((await row(owner.id)).failed_login_count).toBe(1);
    expect(await audits(owner.id, 'auth.login_failed')).toContainEqual({
      confirmation: 'system_owner_transfer',
    });
    expect(await owners()).toEqual([owner.id]);
    // the right password clears the count, as a sign-in does, and the flag moves
    await transfer(session, admin.id).expect(204);
    expect((await row(owner.id)).failed_login_count).toBe(0);
    expect(await owners()).toEqual([admin.id]);
  });

  it('moves the flag: both sessions refresh, both accounts are audited and told', async () => {
    const session = await login(h, owner);
    const adminSession = await login(h, admin);
    const before = { owner: await row(owner.id), admin: await row(admin.id) };
    await transfer(session, admin.id).expect(204);
    expect(await owners()).toEqual([admin.id]);
    expect((await row(owner.id)).permission_version).toBe(before.owner.permission_version + 1);
    expect((await row(admin.id)).permission_version).toBe(before.admin.permission_version + 1);
    expect(await audits(owner.id, 'auth.system_owner_transferred')).toContainEqual({
      toUserId: admin.id,
    });
    expect(await audits(admin.id, 'auth.system_owner_received')).toContainEqual({
      fromUserId: owner.id,
    });
    // both holders are told, and so is everyone who watches over the system
    for (const userId of [owner.id, admin.id, head.id])
      expect(
        (await notificationsOf(h.db, 'system_owner_transferred', userId)).length,
        userId,
      ).toBeGreaterThan(0);
    // both tokens carry the old version
    for (const s of [session, adminSession]) {
      const stale = await api().get('/api/v1/auth/me').set(bearer(s)).expect(401);
      expect(stale.body.error.code).toBe('auth.token_stale');
    }
    // the earlier holder is an ordinary Admin now, and the new one may hand the flag on
    const earlier = await transfer(await login(h, owner), admin.id);
    expect(earlier.status).toBe(403);
    await transfer(await login(h, admin), owner.id).expect(204);
    expect(await owners()).toEqual([owner.id]);
  });

  it('locks the account at the limit of wrong passwords, and refuses a locked one the right password', async () => {
    const session = await login(h, owner);
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1)
      statuses.push((await transfer(session, admin.id, WRONG)).status);
    expect(statuses).toEqual([403, 403, 403, 403, 423]);
    expect((await row(owner.id)).locked_until).not.toBeNull();
    const locked = await transfer(session, admin.id);
    expect(locked.status).toBe(423);
    expect(locked.body.error.code).toBe('auth.account_locked');
    expect(await owners()).toEqual([owner.id]);
  });
});
