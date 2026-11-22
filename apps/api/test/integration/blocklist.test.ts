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
  PASSWORD,
  type Session,
} from './support/auth-app.js';
import { notificationsOf } from './support/notifications.js';
import * as f from './support/fixtures.js';
import type { Tx } from '../../src/core/prisma.service.js';

// The volunteer blocklist.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);

beforeAll(async () => {
  h = await authHarness();
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
    expect(await notificationsOf(h.db, 'account_blocked', v.account.id)).toHaveLength(1);

    expect((await block(rpm, v.volunteerId, { reason: 'আবার' })).status).toBe(409);
    expect((await unblock(rpm, v.volunteerId, {})).status).toBe(422);
    const lifted = await unblock(rpm, v.volunteerId, { reason: 'তদন্তে নির্দোষ' });
    expect(lifted.status).toBe(200);
    expect(lifted.body.data).toMatchObject({ active: false, releasedAt: expect.any(String) });
    expect(lifted.body.data).not.toHaveProperty('reason');
    expect(await notificationsOf(h.db, 'account_unblocked', v.account.id)).toHaveLength(1);
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

describe('blocking a beneficiary', () => {
  const blockB = (s: Session, id: string, body: object) =>
    api().post(`/api/v1/beneficiaries/${id}/block`).set(bearer(s)).send(body);
  const unblockB = (s: Session, id: string, body: object) =>
    api().post(`/api/v1/beneficiaries/${id}/unblock`).set(bearer(s)).send(body);
  const flag = async (id: string) =>
    (await h.db.query('SELECT is_blocked FROM beneficiaries WHERE id = $1', [id])).rows[0]
      .is_blocked as boolean;
  const mayApply = (id: string) =>
    h.container.prisma.$transaction((tx) => h.container.beneficiaryIdentity.assertMayApply(tx, id));

  it('the Dhaka RPM blocks a Dhaka beneficiary with a reason, and the lookup says blocked', async () => {
    const id = await f.applicant(h.db, { project: world.a1, loc: world.dhaka });
    const rpm = await as(world.users.rpmDhaka);
    expect((await blockB(rpm, id, {})).status).toBe(422);
    const res = await blockB(rpm, id, { reason: 'একই পরিবার থেকে বারবার আবেদন' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      subjectType: 'beneficiary',
      subjectId: id,
      active: true,
    });
    expect(JSON.stringify(res.body)).not.toContain('বারবার আবেদন');
    expect(await flag(id)).toBe(true);
    const audit = await h.db.query(
      `SELECT reason FROM audit_log WHERE action = 'blocklist.set' AND entity_type = 'beneficiary' AND entity_id = $1`,
      [id],
    );
    expect(audit.rows).toEqual([{ reason: 'একই পরিবার থেকে বারবার আবেদন' }]);
    const nid = (await h.db.query('SELECT nid FROM beneficiaries WHERE id = $1', [id])).rows[0].nid;
    const lookup = await api()
      .post('/api/v1/beneficiaries/lookup')
      .set(bearer(await as(world.users.general)))
      .send({ nid, projectId: world.a1.id });
    expect(lookup.body.data.blocked).toBe(true);
  });

  it('refuses a new application while blocked, keeps the ongoing ones, and allows again after the lift', async () => {
    const id = await f.beneficiary(h.db, world.dhaka);
    const ongoing = await f.application(
      h.db,
      { project: world.a1, loc: world.dhaka },
      { beneficiary_id: id, status: 'under_review' },
    );
    const rpm = await as(world.users.rpmDhaka);
    await blockB(rpm, id, { reason: 'যাচাই চলছে' }).expect(201);
    await expect(mayApply(id)).rejects.toMatchObject({ code: 'beneficiary.blocked', status: 409 });
    const status = (await h.db.query('SELECT status FROM applications WHERE id = $1', [ongoing]))
      .rows[0].status;
    expect(status).toBe('under_review');
    expect((await unblockB(rpm, id, {})).status).toBe(422);
    const lifted = await unblockB(rpm, id, { reason: 'যাচাই শেষ, সব ঠিক আছে' });
    expect(lifted.status).toBe(200);
    expect(lifted.body.data.active).toBe(false);
    expect(await flag(id)).toBe(false);
    await expect(mayApply(id)).resolves.toBeUndefined();
  });

  it("refuses a new application for a retired profile's id when the kept profile is blocked", async () => {
    const kept = await f.applicant(h.db, { project: world.a1, loc: world.dhaka });
    const retired = await f.applicant(h.db, { project: world.a1, loc: world.dhaka });
    await h.db.query('UPDATE beneficiaries SET merged_into_id = $2 WHERE id = $1', [retired, kept]);
    await blockB(await as(world.users.rpmDhaka), kept, { reason: 'যাচাই চলছে' }).expect(201);
    await expect(mayApply(retired)).rejects.toMatchObject({ code: 'beneficiary.blocked' });
  });

  /**
   * Holds a profile row in a transaction of its own until `release()`; `waiting()` resolves once
   * another session waits for that row's lock, so the order is proven without fixed sleeps.
   */
  function holdRow(id: string, thenWrite: (tx: Tx) => Promise<unknown>) {
    let release!: () => void;
    const released = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const lockTaken = new Promise<void>((r) => (locked = r));
    const done = h.container.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM beneficiaries WHERE id = ${id}::uuid FOR UPDATE`;
      locked();
      await released;
      await thenWrite(tx);
    });
    const waiting = async () => {
      for (let i = 0; i < 200; i++) {
        const { rows } = await h.db.query(
          `SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`,
        );
        if (rows[0].n > 0) return;
        await new Promise((r) => setImmediate(r));
      }
      throw new Error('no session ever waited for the row');
    };
    return { lockTaken, waiting, release, done };
  }

  it('waits for a block in progress before it lets an application through', async () => {
    const id = await f.applicant(h.db, { project: world.a1, loc: world.dhaka });
    const block = holdRow(id, (tx) =>
      tx.blocklist.create({
        data: {
          id: crypto.randomUUID(),
          subjectType: 'beneficiary',
          subjectId: id,
          reason: 'একসাথে চলা পরীক্ষা',
          blockedBy: world.users.rpmDhaka,
        },
      }),
    );
    await block.lockTaken;
    const gate = mayApply(id);
    await block.waiting();
    block.release();
    await block.done;
    await expect(gate).rejects.toMatchObject({ code: 'beneficiary.blocked' });
  });

  it('follows a merge that commits while the gate waits, to the blocked kept profile', async () => {
    const retiring = await f.applicant(h.db, { project: world.a1, loc: world.dhaka });
    const kept = await f.applicant(h.db, { project: world.a1, loc: world.dhaka });
    await blockB(await as(world.users.rpmDhaka), kept, { reason: 'যাচাই চলছে' }).expect(201);
    const merge = holdRow(
      retiring,
      (tx) =>
        tx.$executeRaw`UPDATE beneficiaries SET merged_into_id = ${kept}::uuid WHERE id = ${retiring}::uuid`,
    );
    await merge.lockTaken;
    const gate = mayApply(retiring);
    await merge.waiting();
    merge.release();
    await merge.done;
    await expect(gate).rejects.toMatchObject({ code: 'beneficiary.blocked' });
  });

  it("refuses a block on a retired profile's id: the block belongs on the kept profile", async () => {
    const kept = await f.applicant(h.db, { project: world.a1, loc: world.dhaka });
    const retired = await f.applicant(h.db, { project: world.a1, loc: world.dhaka });
    await h.db.query('UPDATE beneficiaries SET merged_into_id = $2 WHERE id = $1', [retired, kept]);
    const res = await blockB(await as(world.users.rpmDhaka), retired, { reason: 'ভুল প্রোফাইল' });
    expect(res.status).toBe(404);
    expect(await flag(kept)).toBe(false);
  });

  it('refuses the lift to an RPM of another region, an executive, a volunteer and no login', async () => {
    const id = await f.applicant(h.db, { project: world.a1, loc: world.dhaka });
    await blockB(await as(world.users.rpmDhaka), id, { reason: 'যাচাই চলছে' }).expect(201);
    const body = { reason: 'ব্লক তোলা হলো' };
    expect((await unblockB(await as(world.users.rpmRangpur), id, body)).status).toBe(404);
    expect((await unblockB(await as(world.users.executive), id, body)).status).toBe(403);
    expect((await unblockB(await as(world.users.general), id, body)).status).toBe(403);
    expect((await api().post(`/api/v1/beneficiaries/${id}/unblock`).send(body)).status).toBe(401);
    expect(await flag(id)).toBe(true);
  });

  it('refuses a second block and a lift without a block', async () => {
    const id = await f.applicant(h.db, { project: world.a1, loc: world.dhaka });
    const rpm = await as(world.users.rpmDhaka);
    expect((await unblockB(rpm, id, { reason: 'কোনো ব্লক নেই' })).status).toBe(409);
    await blockB(rpm, id, { reason: 'প্রথম ব্লক' }).expect(201);
    expect((await blockB(rpm, id, { reason: 'দ্বিতীয় ব্লক' })).status).toBe(409);
  });

  it('refuses an RPM of another region, an executive, a volunteer and no login', async () => {
    const id = await f.applicant(h.db, { project: world.a1, loc: world.dhaka });
    const body = { reason: 'কারণ লেখা হলো' };
    expect((await blockB(await as(world.users.rpmRangpur), id, body)).status).toBe(404);
    expect((await blockB(await as(world.users.executive), id, body)).status).toBe(403);
    expect((await blockB(await as(world.users.general), id, body)).status).toBe(403);
    expect((await api().post(`/api/v1/beneficiaries/${id}/block`).send(body)).status).toBe(401);
    expect(await flag(id)).toBe(false);
  });
});
