import { randomUUID } from 'node:crypto';
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
import * as f from './support/fixtures';

// Programs: the Department Head keeps them, officials read them in scope, nothing is deleted.
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

async function staff(role: string) {
  const a = await account(h.db, { role });
  accounts.set(a.id, a);
  return { id: a.id, session: await login(h, a) };
}

let n = 0;
/** A program code of capital letters that no other test uses. */
const code = () => {
  n += 1;
  return `PG${String.fromCharCode(65 + (n % 26))}${String.fromCharCode(65 + Math.floor(n / 26))}${randomUUID()
    .replace(/[^a-f]/g, '')
    .slice(0, 3)
    .toUpperCase()}`;
};
const name = { bn: 'নমুনা প্রোগ্রাম', en: 'Sample program' };

const create = (s: Session, body: Record<string, unknown>) =>
  api().post('/api/v1/programs').set(bearer(s)).send(body);
const patch = (s: Session, id: string, etag: string | undefined, body: Record<string, unknown>) =>
  api()
    .patch(`/api/v1/programs/${id}`)
    .set(bearer(s))
    .set('If-Match', etag ?? '')
    .send(body);

async function audit(entityId: string, action: string) {
  const { rows } = await h.db.query<{ old: unknown; new: unknown; reason: string | null }>(
    'SELECT old, new, reason FROM audit_log WHERE entity_id = $1 AND action = $2 ORDER BY created_at',
    [entityId, action],
  );
  return rows;
}

describe('keeping programs', () => {
  it('the Department Head creates, renames and gives a PM, each change audited', async () => {
    const head = await as(world.users.head);
    const pm = await staff('program_manager');
    const created = await create(head, { code: code(), name });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    expect(created.body.data).toMatchObject({ name, active: true, pmUserId: null });
    expect(await audit(id, 'program.create')).toHaveLength(1);

    const renamed = await patch(head, id, created.headers.etag, {
      name: { bn: 'নতুন নাম', en: 'New name' },
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.name.en).toBe('New name');
    const [entry] = await audit(id, 'program.update');
    expect(entry?.old).toMatchObject({ name });
    expect(entry?.new).toMatchObject({ name: { en: 'New name' } });

    const assigned = await api()
      .post(`/api/v1/programs/${id}/pm`)
      .set(bearer(head))
      .send({ pmUserId: pm.id });
    expect(assigned.status).toBe(200);
    expect(assigned.body.data.pmUserId).toBe(pm.id);
    expect(await audit(id, 'program.assign_pm')).toHaveLength(1);
  });

  it('refuses a duplicate code, a bad code and an unknown key', async () => {
    const head = await as(world.users.head);
    const taken = code();
    expect((await create(head, { code: taken, name })).status).toBe(201);
    const again = await create(head, { code: taken, name });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('program.code_taken');
    expect((await create(head, { code: 'ab', name })).status).toBe(422);
    expect((await create(head, { code: code(), name, extra: 1 })).status).toBe(422);
  });

  it('gives the program only to someone who holds the PM role', async () => {
    const head = await as(world.users.head);
    const created = await create(head, { code: code(), name });
    const rpm = await staff('regional_program_manager');
    const res = await api()
      .post(`/api/v1/programs/${created.body.data.id}/pm`)
      .set(bearer(head))
      .send({ pmUserId: rpm.id });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('program.pm_role_required');
  });

  it('deactivates a program only without open projects, and activates it again', async () => {
    const head = await as(world.users.head);
    const created = await create(head, { code: code(), name });
    const id = created.body.data.id as string;
    // a draft project keeps the program open
    const project = await f.project(h.db, { program_id: id });
    const refused = await patch(head, id, created.headers.etag, { active: false });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('program.has_open_projects');

    await h.db.query(`UPDATE projects SET status = 'closed' WHERE id = $1`, [project.id]);
    const current = await api().get(`/api/v1/programs/${id}`).set(bearer(head));
    const off = await patch(head, id, current.headers.etag, { active: false });
    expect(off.status).toBe(200);
    expect(off.body.data.active).toBe(false);
    const on = await patch(head, id, off.headers.etag, { active: true });
    expect(on.body.data.active).toBe(true);
    const changes = await audit(id, 'program.update');
    expect(
      changes.map((e) => [
        (e.old as { active: boolean }).active,
        (e.new as { active: boolean }).active,
      ]),
    ).toEqual([
      [true, false],
      [false, true],
    ]);
    // a deactivated program takes no PM
    await patch(head, id, on.headers.etag, { active: false });
    const pm = await staff('program_manager');
    const noPm = await api()
      .post(`/api/v1/programs/${id}/pm`)
      .set(bearer(head))
      .send({ pmUserId: pm.id });
    expect(noPm.status).toBe(409);
    expect(noPm.body.error.code).toBe('program.inactive');
  });

  it('creates a program with its PM, and refuses one without the role and leaves no row', async () => {
    const head = await as(world.users.head);
    const pm = await staff('program_manager');
    const withPm = await create(head, { code: code(), name, pmUserId: pm.id });
    expect(withPm.status).toBe(201);
    expect(withPm.body.data.pmUserId).toBe(pm.id);
    expect(withPm.body.data.pmName).toEqual(expect.any(String));
    const notPm = await staff('finance_team');
    const taken = code();
    const refused = await create(head, { code: taken, name, pmUserId: notPm.id });
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('program.pm_role_required');
    const { rowCount } = await h.db.query('SELECT 1 FROM programs WHERE code = $1', [taken]);
    expect(rowCount).toBe(0);
  });

  it('answers 412 to a stale If-Match', async () => {
    const head = await as(world.users.head);
    const created = await create(head, { code: code(), name });
    const res = await patch(head, created.body.data.id, '"stale"', { name });
    expect(res.status).toBe(412);
    // a change that changes nothing is refused
    expect((await patch(head, created.body.data.id, created.headers.etag, {})).status).toBe(422);
  });
});

describe('who reads and who changes programs', () => {
  it('lets officials read programs in their scope', async () => {
    const pm = await as(world.users.pm);
    const own = await api().get('/api/v1/programs').set(bearer(pm));
    expect(own.status).toBe(200);
    expect(own.body.data.map((p: { id: string }) => p.id)).toEqual([world.a1.program]);
    // the whole list in one page, in the list envelope
    expect(own.body.meta).toMatchObject({ limit: 1, nextCursor: null, prevCursor: null });
    const finance = (await staff('finance_team')).session;
    const all = await api().get('/api/v1/programs').set(bearer(finance));
    expect(all.status).toBe(200);
    expect(all.body.data.map((p: { id: string }) => p.id)).toEqual(
      expect.arrayContaining([world.a1.program, world.b1.program]),
    );
    // an RPM's program grant names no program of its own, so it reads none
    const rpm = await as(world.users.rpmDhaka);
    const none = await api().get('/api/v1/programs').set(bearer(rpm));
    expect(none.status).toBe(200);
    expect(none.body.data).toEqual([]);
    // another program is not found for the PM
    expect((await api().get(`/api/v1/programs/${world.b1.program}`).set(bearer(pm))).status).toBe(
      404,
    );
  });

  it('refuses changes to a PM, reading to a volunteer, and everything without a sign-in', async () => {
    const pm = await as(world.users.pm);
    expect((await create(pm, { code: code(), name })).status).toBe(403);
    const program = await api().get(`/api/v1/programs/${world.a1.program}`).set(bearer(pm));
    expect((await patch(pm, world.a1.program, program.headers.etag, { name })).status).toBe(403);
    const other = await staff('program_manager');
    const toPm = await api()
      .post(`/api/v1/programs/${world.a1.program}/pm`)
      .set(bearer(pm))
      .send({ pmUserId: other.id });
    expect(toPm.status).toBe(403);
    const volunteer = await as(world.users.general);
    expect((await api().get('/api/v1/programs').set(bearer(volunteer))).status).toBe(403);
    expect(
      (
        await api()
          .post(`/api/v1/programs/${world.a1.program}/pm`)
          .set(bearer(volunteer))
          .send({ pmUserId: other.id })
      ).status,
    ).toBe(403);
    expect((await api().get('/api/v1/programs')).status).toBe(401);
    expect((await api().patch(`/api/v1/programs/${world.a1.program}`).send({ name })).status).toBe(
      401,
    );
    expect(
      (await api().post(`/api/v1/programs/${world.a1.program}/pm`).send({ pmUserId: other.id }))
        .status,
    ).toBe(401);
  });
});
