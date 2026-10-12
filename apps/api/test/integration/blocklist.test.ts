import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RegistrationEvent } from '../../src/notifications/registration-events';
import { accessWorld } from './support/access-fixtures';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  PASSWORD,
  type Session,
} from './support/auth-app';
import * as f from './support/fixtures';

// The volunteer blocklist (BD-06, BR-047; DECISION_LOG D-088; plan
// docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md, unit U9).
const events: RegistrationEvent[] = [];
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);

beforeAll(async () => {
  h = await authHarness({
    overrides: { registrationEvents: { emit: (event) => void events.push(event) } },
  });
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
});
afterAll(async () => h.close());

async function activeVolunteer(tree = world.dhaka) {
  const a = await account(h.db, { kind: 'volunteer', role: 'volunteer_general' });
  const volunteerId = await f.volunteer(h.db, tree, a.id, { approved_at: new Date() });
  return { account: a, volunteerId };
}

const block = (s: Session, volunteerId: string, body: object) =>
  api().post(`/api/v1/volunteers/${volunteerId}/block`).set(bearer(s)).send(body);
const unblock = (s: Session, volunteerId: string, body: object) =>
  api().post(`/api/v1/volunteers/${volunteerId}/unblock`).set(bearer(s)).send(body);
const tryLogin = (loginId: string) =>
  api().post('/api/v1/auth/login').send({ loginId, password: PASSWORD });

describe('blocking a volunteer', () => {
  it('the Dhaka RPM blocks a Dhaka volunteer and lifts the block, each with a reason', async () => {
    const v = await activeVolunteer();
    const own = await login(h, v.account);
    const rpm = await as(world.users.rpmDhaka);
    expect((await block(rpm, v.volunteerId, {})).status).toBe(422);

    const res = await block(rpm, v.volunteerId, { reason: 'ভুয়া আবেদন জমা দিয়েছেন' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      subjectType: 'volunteer',
      subjectId: v.volunteerId,
      active: true,
    });
    expect(res.body.data).not.toHaveProperty('reason');
    const user = await h.db.query('SELECT state FROM users WHERE id = $1', [v.account.id]);
    expect(user.rows[0].state).toBe('blocked');
    expect((await api().get('/api/v1/volunteers/me').set(bearer(own))).status).toBe(401);
    const denied = await tryLogin(v.account.loginId);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('auth.account_blocked');
    expect(events).toContainEqual({ type: 'volunteer.blocked', userId: v.account.id });

    expect((await block(rpm, v.volunteerId, { reason: 'আবার' })).status).toBe(409);
    expect((await unblock(rpm, v.volunteerId, {})).status).toBe(422);
    const lifted = await unblock(rpm, v.volunteerId, { reason: 'তদন্তে নির্দোষ' });
    expect(lifted.status).toBe(200);
    expect(lifted.body.data).toMatchObject({ active: false, releasedAt: expect.any(String) });
    expect(lifted.body.data).not.toHaveProperty('reason');
    expect((await tryLogin(v.account.loginId)).status).toBe(200);
    expect((await unblock(rpm, v.volunteerId, { reason: 'আবার' })).status).toBe(404);

    const audit = await h.db.query(
      `SELECT action, reason FROM audit_log WHERE entity_id = $1 AND action LIKE 'blocklist.%' ORDER BY created_at`,
      [v.volunteerId],
    );
    expect(audit.rows).toEqual([
      { action: 'blocklist.set', reason: 'ভুয়া আবেদন জমা দিয়েছেন' },
      { action: 'blocklist.lift', reason: 'তদন্তে নির্দোষ' },
    ]);
  });

  it('an RPM gets 404 for a Rangpur volunteer; a Project Executive gets 403', async () => {
    const rangpur = await activeVolunteer(world.rangpur);
    expect(
      (await block(await as(world.users.rpmDhaka), rangpur.volunteerId, { reason: 'বাইরে' }))
        .status,
    ).toBe(404);
    const dhaka = await activeVolunteer();
    expect(
      (await block(await as(world.users.executive), dhaka.volunteerId, { reason: 'কারণ' })).status,
    ).toBe(403);
  });

  it('unblock is refused outside the region (404) and to a Project Executive (403); both need a login', async () => {
    const rangpur = await activeVolunteer(world.rangpur);
    expect(
      (
        await block(await as(world.users.rpmRangpur), rangpur.volunteerId, {
          reason: 'রংপুরে ব্লক',
        })
      ).status,
    ).toBe(201);
    const reason = { reason: 'তুলে দিন' };
    expect(
      (await unblock(await as(world.users.rpmDhaka), rangpur.volunteerId, reason)).status,
    ).toBe(404);
    expect(
      (await unblock(await as(world.users.executive), rangpur.volunteerId, reason)).status,
    ).toBe(403);
    for (const path of ['block', 'unblock'])
      expect(
        (await api().post(`/api/v1/volunteers/${rangpur.volunteerId}/${path}`).send(reason)).status,
      ).toBe(401);
  });

  it('an account the Department Head blocked is not put on the blocklist, so no lift can reactivate it', async () => {
    const v = await activeVolunteer();
    await h.db.query(`UPDATE users SET state = 'blocked' WHERE id = $1`, [v.account.id]);
    const rpm = await as(world.users.rpmDhaka);
    expect((await block(rpm, v.volunteerId, { reason: 'আবার ব্লক' })).status).toBe(409);
    expect((await unblock(rpm, v.volunteerId, { reason: 'তুলে দিন' })).status).toBe(404);
    const user = await h.db.query('SELECT state FROM users WHERE id = $1', [v.account.id]);
    expect(user.rows[0].state).toBe('blocked');
  });

  it('the PM blocks in the program; a blocklisted pending registration cannot be approved', async () => {
    const pending = await account(h.db, { kind: 'volunteer', state: 'pending' });
    const volunteerId = await f.volunteer(h.db, world.dhaka, pending.id);
    expect(
      (await block(await as(world.users.pm), volunteerId, { reason: 'সন্দেহজনক' })).status,
    ).toBe(201);
    const state = await h.db.query('SELECT state FROM users WHERE id = $1', [pending.id]);
    expect(state.rows[0].state).toBe('pending');
    const res = await api()
      .post(`/api/v1/registrations/${pending.id}/approve`)
      .set(bearer(await as(world.users.rpmDhaka)));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('registration.blocklisted');
  });
});
