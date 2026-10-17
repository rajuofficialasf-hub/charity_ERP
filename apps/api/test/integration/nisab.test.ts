import { isoDateInDhaka } from '@css/shared/format';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accessWorld } from './support/access-fixtures';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  type Session,
} from './support/auth-app';

// The nisab: a PM or above adds versions that take effect today or later and after the latest;
// versions are never edited; one not yet in effect may be withdrawn with a reason (plan
// docs/plans/2026-10-17-1800-feat-admin-settings-core-plan.md).
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
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
});
afterAll(async () => h.close());

const DAY = 86_400_000;
const day = (offset: number) => isoDateInDhaka(new Date(h.clock.now().getTime() + offset * DAY));
const add = (s: Session, body: Record<string, unknown>) =>
  api().post('/api/v1/nisab-versions').set(bearer(s)).send(body);
const withdraw = (s: Session, id: string, reason = 'ভুল তারিখ') =>
  api().post(`/api/v1/nisab-versions/${id}/withdraw`).set(bearer(s)).send({ reason });

async function audits(entityId: string) {
  const { rows } = await h.db.query<{ new: Record<string, unknown>; reason: string | null }>(
    `SELECT new, reason FROM audit_log WHERE action = 'nisab.change' AND entity_id = $1 ORDER BY created_at`,
    [entityId],
  );
  return rows;
}

describe('the nisab versions', () => {
  it('answers 404 before the first version and lists nothing', async () => {
    const volunteer = await as(world.users.general);
    expect((await api().get('/api/v1/nisab-versions/in-force').set(bearer(volunteer))).status).toBe(
      404,
    );
    const list = await api().get('/api/v1/nisab-versions').set(bearer(volunteer));
    expect(list.status).toBe(200);
    expect(list.body.data).toEqual([]);
  });

  it('a PM adds a version for today, in force at once, audited', async () => {
    const pm = await as(world.users.pm);
    const res = await add(pm, { value: '98500.50', effectiveFrom: day(0), basisNote: 'রুপার দাম' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      value: '98500.50',
      effectiveFrom: day(0),
      basisNote: 'রুপার দাম',
      inForce: true,
      withdrawn: null,
    });
    const [entry] = await audits(res.body.data.id);
    expect(entry?.new).toMatchObject({ value: '98500.50', effectiveFrom: day(0) });
    const now = await api().get('/api/v1/nisab-versions/in-force').set(bearer(pm));
    expect(now.body.data.id).toBe(res.body.data.id);
  });

  it('refuses a date before today, more than a year ahead, or not after the latest', async () => {
    const head = await as(world.users.head);
    for (const effectiveFrom of [day(-1), day(0), day(400)]) {
      const res = await add(head, { value: '100000', effectiveFrom });
      expect(res.status, effectiveFrom).toBe(422);
      expect(res.body.error.details).toEqual([
        expect.objectContaining({ path: 'effectiveFrom', code: 'nisab.effective_date' }),
      ]);
    }
    const big = await add(head, { value: '10000000.01', effectiveFrom: day(30) });
    expect(big.status).toBe(422);
    expect(big.body.error.details[0]).toMatchObject({
      path: 'value',
      code: 'validation.out_of_range',
    });
  });

  it('lets one of two adds at the same moment through', async () => {
    const pm = await as(world.users.pm);
    const results = await Promise.all([
      add(pm, { value: '101000', effectiveFrom: day(20) }),
      add(pm, { value: '102000', effectiveFrom: day(20) }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 422]);
  });

  it('withdraws a future version with a reason, which frees its date', async () => {
    const pm = await as(world.users.pm);
    const future = await add(pm, { value: '105000', effectiveFrom: day(40) });
    expect(future.status).toBe(201);
    const res = await withdraw(pm, future.body.data.id);
    expect(res.status).toBe(200);
    expect(res.body.data.withdrawn).toMatchObject({ reason: 'ভুল তারিখ' });
    const entries = await audits(future.body.data.id);
    expect(entries[1]).toMatchObject({ reason: 'ভুল তারিখ', new: { withdrawn: true } });
    expect((await withdraw(pm, future.body.data.id)).status).toBe(409);
    // the date is free again, and the withdrawn version stays in the list, marked
    expect((await add(pm, { value: '104000', effectiveFrom: day(40) })).status).toBe(201);
    const list = await api().get('/api/v1/nisab-versions').set(bearer(pm));
    const versions = list.body.data as {
      effectiveFrom: string;
      withdrawn: unknown;
      inForce: boolean;
    }[];
    expect(versions.map((v) => v.effectiveFrom)).toEqual([day(40), day(40), day(20), day(0)]);
    expect(versions.filter((v) => v.withdrawn)).toHaveLength(1);
    expect(versions.filter((v) => v.inForce).map((v) => v.effectiveFrom)).toEqual([day(0)]);
  });

  it('never withdraws a version in effect', async () => {
    const pm = await as(world.users.pm);
    const list = await api().get('/api/v1/nisab-versions').set(bearer(pm));
    const current = (list.body.data as { id: string; inForce: boolean }[]).find((v) => v.inForce)!;
    const res = await withdraw(pm, current.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('nisab.in_effect');
  });

  it('answers the version in force on a date, skipping a withdrawn one', async () => {
    const volunteer = await as(world.users.general);
    const on = (date: string) =>
      api().get(`/api/v1/nisab-versions/in-force?date=${date}`).set(bearer(volunteer));
    expect((await on(day(-3))).status).toBe(404);
    expect((await on(day(10))).body.data.effectiveFrom).toBe(day(0));
    expect((await on(day(25))).body.data.effectiveFrom).toBe(day(20));
    const later = (await on(day(45))).body.data;
    expect(later).toMatchObject({ effectiveFrom: day(40), value: '104000.00', withdrawn: null });
  });

  it('answers 422 for a date that does not exist', async () => {
    const volunteer = await as(world.users.general);
    for (const date of ['2026-13-01', '2026-02-31']) {
      const res = await api()
        .get(`/api/v1/nisab-versions/in-force?date=${date}`)
        .set(bearer(volunteer));
      expect(res.status, date).toBe(422);
    }
  });

  it('answers 401 without a session', async () => {
    expect((await api().get('/api/v1/nisab-versions')).status).toBe(401);
    expect(
      (
        await api()
          .post('/api/v1/nisab-versions')
          .send({ value: '1', effectiveFrom: day(1) })
      ).status,
    ).toBe(401);
  });

  it('refuses an RPM and a volunteer adding or withdrawing', async () => {
    for (const userId of [world.users.rpmDhaka, world.users.general]) {
      const s = await as(userId);
      expect((await add(s, { value: '100000', effectiveFrom: day(60) })).status).toBe(403);
      const any = (await h.db.query('SELECT id FROM nisab_versions LIMIT 1')).rows[0].id as string;
      expect((await withdraw(s, any)).status).toBe(403);
    }
  });
});
