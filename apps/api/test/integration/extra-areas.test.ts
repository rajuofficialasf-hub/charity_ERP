import { randomUUID } from 'node:crypto';
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
  type Session,
} from './support/auth-app.js';
import * as f from './support/fixtures.js';
import { notificationsOf } from './support/notifications.js';

// The extra areas of an official (docs/BUSINESS_RULES.md, "An official may be given an extra
// area"): a division, a district or the whole country for volunteers alone, given and taken away
// by the person above inside that person's own reach.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
const at = (s: Session, method: 'get' | 'post', path: string) =>
  api()[method](`/api/v1${path}`).set(bearer(s));

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

type Tree = Awaited<ReturnType<typeof f.locationTree>>;
type Row = {
  id: string;
  wholeCountry: boolean;
  location: { id: string; level: string } | null;
  reason: string;
  grantedBy: { id: string };
  endedAt: string | null;
  endedBy: { id: string } | null;
  endReason: string | null;
};

const REASON = 'সাময়িক দায়িত্ব';
const give = (s: Session, userId: string, body: Record<string, unknown>) =>
  at(s, 'post', `/users/${userId}/extra-areas`).send({ reason: REASON, ...body });
const end = (s: Session, userId: string, areaId: string) =>
  at(s, 'post', `/users/${userId}/extra-areas/${areaId}/end`).send({ reason: 'আর দরকার নেই' });
const rows = (res: request.Response) => res.body.data as Row[];
const liveOf = (res: request.Response, locationId: string | null) =>
  rows(res).find((r) => r.endedAt === null && (r.location?.id ?? null) === locationId)!;

/** An official of a role, able to sign in. */
async function official(role: string) {
  const a = await account(h.db, { role });
  accounts.set(a.id, a);
  return a.id;
}
/** A volunteer living in a place; `state` is the account state. */
async function volunteerIn(tree: Tree, state = 'active') {
  const a = await account(h.db, { kind: 'volunteer', state });
  accounts.set(a.id, a);
  return { userId: a.id, volunteerId: await f.volunteer(h.db, tree, a.id) };
}
const listed = async (userId: string, tree: Tree) =>
  (
    (await at(await as(userId), 'get', '/volunteers').query({ unionId: tree.union })).body.data as {
      id: string;
    }[]
  ).map((r) => r.id);
const audit = async (entityId: string, action: string) =>
  (
    await h.db.query(
      'SELECT old, new, reason, actor_user_id FROM audit_log WHERE entity_id = $1 AND action = $2 ORDER BY created_at',
      [entityId, action],
    )
  ).rows as { old: unknown; new: unknown; reason: string | null; actor_user_id: string }[];
const refusal = (res: request.Response) => [res.status, res.body.error?.params?.rule];

describe('an extra area given by the Department Head', () => {
  it('shows an RPM the volunteers of a division with no project, for the tab, a registration and the sessions, and nothing else there', async () => {
    const barishal = await f.locationTree(h.db);
    const active = await volunteerIn(barishal);
    const pending = await volunteerIn(barishal, 'pending');
    await f.beneficiary(h.db, barishal);
    const rpm = await official('regional_program_manager');
    const before = await as(rpm);
    expect(await listed(rpm, barishal)).toEqual([]);

    const head = await as(world.users.head);
    const given = await give(head, rpm, { locationId: barishal.division });
    expect(given.status).toBe(201);
    const row = liveOf(given, barishal.division);
    expect(row).toMatchObject({
      wholeCountry: false,
      location: { id: barishal.division, level: 'division' },
      reason: REASON,
      grantedBy: { id: world.users.head },
      endedBy: null,
      endReason: null,
    });
    // audited on the person, told to the person, and the earlier token no longer passes
    expect((await audit(rpm, 'user.extra_area_given')).at(-1)).toEqual({
      old: null,
      new: { id: row.id, locationId: barishal.division, wholeCountry: false },
      reason: REASON,
      actor_user_id: world.users.head,
    });
    expect(await notificationsOf(h.db, 'permission_changed', rpm)).not.toHaveLength(0);
    const stale = await api().get('/api/v1/auth/me').set(bearer(before));
    expect(stale.status).toBe(401);
    expect(stale.body.error.code).toBe('auth.token_stale');

    // the volunteer tab, a registration of the division and the volunteer's sessions
    expect((await listed(rpm, barishal)).sort()).toEqual(
      [active.volunteerId, pending.volunteerId].sort(),
    );
    const s = await as(rpm);
    expect((await at(s, 'get', `/volunteers/${active.volunteerId}`)).status).toBe(200);
    expect((await at(s, 'get', `/users/${active.userId}/sessions`)).status).toBe(200);
    expect((await at(s, 'post', `/registrations/${pending.userId}/approve`)).status).toBe(200);
    // no official through it: an Executive placed in the division on someone else's project
    const colleague = await official('project_executive');
    const project = await f.project(h.db, { status: 'active' });
    await h.db.query(
      `INSERT INTO project_staff (id, project_id, user_id, role_key, area_location_id, granted_by)
       VALUES ($1, $2, $3, 'project_executive', $4, $3)`,
      [randomUUID(), project.id, colleague, barishal.division],
    );
    expect((await at(s, 'get', `/users/${colleague}/sessions`)).status).toBe(404);
    // no beneficiary and no application: those follow the projects
    const people = await at(s, 'get', '/beneficiaries').query({ unionId: barishal.union });
    expect(people.status).toBe(200);
    expect(people.body.data).toEqual([]);
    for (const [permission, entity] of [
      ['beneficiary.view_all', 'beneficiary'],
      ['beneficiary.view_nid', 'beneficiary'],
      ['application.view', 'application'],
    ] as const) {
      const { instances } = await h.container.access.scopeOfUser(rpm, permission, entity);
      expect(instances.global, permission).toBe(false);
      expect(instances.areas, permission).toEqual([]);
    }

    // taken away: the tab is empty again, with who ended it and why
    const ended = await end(head, rpm, row.id);
    expect(ended.status).toBe(200);
    expect(rows(ended)[0]).toMatchObject({
      id: row.id,
      endedBy: { id: world.users.head },
      endReason: 'আর দরকার নেই',
    });
    expect(rows(ended)[0]!.endedAt).not.toBeNull();
    expect((await audit(rpm, 'user.extra_area_ended')).at(-1)).toMatchObject({
      old: { id: row.id, locationId: barishal.division, wholeCountry: false },
      actor_user_id: world.users.head,
    });
    expect(await listed(rpm, barishal)).toEqual([]);
    expect((await at(await as(rpm), 'get', `/users/${active.userId}/sessions`)).status).toBe(404);
    // ended once: a second end finds no live area
    expect((await end(head, rpm, row.id)).status).toBe(404);
  });

  it('gives the whole country only through an Admin or the Department Head', async () => {
    const anywhere = await f.locationTree(h.db);
    const person = await volunteerIn(anywhere);
    const executive = world.users.executive;
    for (const who of [world.users.pm, world.users.rpmDhaka]) {
      const res = await give(await as(who), executive, { wholeCountry: true });
      expect(refusal(res)).toEqual([403, 'whole_country_top_roles_only']);
    }
    expect((await audit(executive, 'permission_change_refused')).at(-1)).toMatchObject({
      new: { rule: 'whole_country_top_roles_only' },
    });
    const admin = await as(world.users.admin);
    const given = await give(admin, executive, { wholeCountry: true });
    expect(given.status).toBe(201);
    const row = liveOf(given, null);
    expect(row).toMatchObject({ wholeCountry: true, location: null });
    expect(await listed(executive, anywhere)).toEqual([person.volunteerId]);
    // the same live area twice
    const twice = await give(admin, executive, { wholeCountry: true });
    expect(twice.status).toBe(409);
    expect(twice.body.error.code).toBe('user.extra_area_exists');
    // an RPM does not take the whole country away either
    expect(refusal(await end(await as(world.users.rpmDhaka), executive, row.id))).toEqual([
      403,
      'whole_country_top_roles_only',
    ]);
    expect((await end(admin, executive, row.id)).status).toBe(200);
    expect(await listed(executive, anywhere)).toEqual([]);
  });
});

describe('an extra area given on', () => {
  it("lets an RPM give an own Executive the district the Head gave the RPM, and ends it with the RPM's", async () => {
    const barishal = await f.locationTree(h.db);
    const person = await volunteerIn(barishal);
    const head = await as(world.users.head);
    const rpm = world.users.rpmDhaka;
    const executive = world.users.executive;
    // not yet the RPM's to give
    expect(
      refusal(await give(await as(rpm), executive, { locationId: barishal.district })),
    ).toEqual([403, 'outside_own_reach']);
    const toRpm = await give(head, rpm, { locationId: barishal.district });
    expect(toRpm.status).toBe(201);
    const toExecutive = await give(await as(rpm), executive, { locationId: barishal.district });
    expect(toExecutive.status).toBe(201);
    const given = liveOf(toExecutive, barishal.district);
    expect(given.grantedBy.id).toBe(rpm);
    expect(await listed(executive, barishal)).toEqual([person.volunteerId]);

    expect((await end(head, rpm, liveOf(toRpm, barishal.district).id)).status).toBe(200);
    expect(await listed(rpm, barishal)).toEqual([]);
    // the Executive's area came from the RPM's, so it ends with it, by the same hand and audited
    expect(await listed(executive, barishal)).toEqual([]);
    const after = rows(await at(head, 'get', `/users/${executive}/extra-areas`)).find(
      (r) => r.id === given.id,
    )!;
    expect(after).toMatchObject({ endReason: 'উৎস শেষ', endedBy: { id: world.users.head } });
    expect((await audit(executive, 'user.extra_area_ended')).at(-1)).toMatchObject({
      old: { id: given.id, locationId: barishal.district, wholeCountry: false },
      reason: 'উৎস শেষ',
      actor_user_id: world.users.head,
    });
    // the RPM no longer reaches the district: another person's area there is not theirs to end
    const other = await official('project_executive');
    await h.db.query(
      `INSERT INTO project_staff (id, project_id, user_id, role_key, area_location_id, granted_by)
       VALUES ($1, $2, $3, 'project_executive', $4, $5)`,
      [randomUUID(), world.a1.id, other, world.dhaka.division, rpm],
    );
    const toOther = await give(head, other, { locationId: barishal.district });
    expect(toOther.status).toBe(201);
    expect(refusal(await end(await as(rpm), other, liveOf(toOther, barishal.district).id))).toEqual(
      [403, 'outside_own_reach'],
    );
  });

  it('ends a whole chain of areas passed on when its first one ends', async () => {
    const khulna = await f.locationTree(h.db);
    const person = await volunteerIn(khulna);
    const head = await as(world.users.head);
    const pm = world.users.pm;
    const rpm = world.users.rpmDhaka;
    const executive = world.users.executive;
    const toPm = await give(head, pm, { locationId: khulna.division });
    expect(toPm.status, JSON.stringify(toPm.body)).toBe(201);
    expect((await give(await as(pm), rpm, { locationId: khulna.district })).status).toBe(201);
    expect((await give(await as(rpm), executive, { locationId: khulna.district })).status).toBe(
      201,
    );
    expect(await listed(executive, khulna)).toEqual([person.volunteerId]);
    expect((await end(head, pm, liveOf(toPm, khulna.division).id)).status).toBe(200);
    for (const userId of [pm, rpm, executive]) expect(await listed(userId, khulna)).toEqual([]);
  });

  it("keeps an area given from the giver's own project area when an unrelated extra area of the giver ends", async () => {
    const sylhet = await f.locationTree(h.db);
    const head = await as(world.users.head);
    const rpm = world.users.rpmDhaka;
    const executive = world.users.executive;
    const ownArea = await give(await as(rpm), executive, { locationId: world.dhaka.district });
    expect(ownArea.status, JSON.stringify(ownArea.body)).toBe(201);
    const toRpm = await give(head, rpm, { locationId: sylhet.district });
    expect(toRpm.status).toBe(201);
    expect((await end(head, rpm, liveOf(toRpm, sylhet.district).id)).status).toBe(200);
    const still = rows(await at(head, 'get', `/users/${executive}/extra-areas`)).find(
      (r) => r.location?.id === world.dhaka.district && r.endedAt === null,
    );
    expect(still).toBeDefined();
    expect((await end(await as(rpm), executive, still!.id)).status).toBe(200);
  });

  it('keeps an RPM and a PM inside what they reach and whom they reach', async () => {
    const rpm = await as(world.users.rpmDhaka);
    const executive = world.users.executive;
    // a district of the own division, and the own division itself
    const own = await give(rpm, executive, { locationId: world.dhaka.district });
    expect(own.status).toBe(201);
    expect(refusal(await give(rpm, executive, { locationId: world.rangpur.district }))).toEqual([
      403,
      'outside_own_reach',
    ]);
    // an Executive of another program is nobody to this RPM
    expect(
      (await give(rpm, world.users.outsider, { locationId: world.dhaka.district })).status,
    ).toBe(404);
    const pm = await as(world.users.pm);
    const toRpm = await give(pm, world.users.rpmRangpur, { locationId: world.dhaka.division });
    expect(toRpm.status).toBe(201);
    expect(
      (await give(pm, world.users.outsider, { locationId: world.dhaka.division })).status,
    ).toBe(404);
    const elsewhere = await f.locationTree(h.db);
    expect(
      refusal(await give(pm, world.users.rpmRangpur, { locationId: elsewhere.division })),
    ).toEqual([403, 'outside_own_reach']);
    // tidy: the two areas given here are taken away by their givers
    expect((await end(rpm, executive, liveOf(own, world.dhaka.district).id)).status).toBe(200);
    expect(
      (await end(pm, world.users.rpmRangpur, liveOf(toRpm, world.dhaka.division).id)).status,
    ).toBe(200);
  });
});

describe('what an extra area refuses', () => {
  it('refuses the own account, a volunteer, an account that is not active, and a caller without the permission', async () => {
    const head = await as(world.users.head);
    const place = { locationId: world.dhaka.division };
    expect(refusal(await give(head, world.users.head, place))).toEqual([403, 'self_change']);
    expect((await give(head, world.users.general, place)).status).toBe(404);
    const closed = await official('project_executive');
    await h.db.query(`UPDATE users SET state = 'deactivated' WHERE id = $1`, [closed]);
    const inactive = await give(head, closed, place);
    expect(inactive.status).toBe(409);
    expect(inactive.body.error.code).toBe('user.extra_area_inactive');
    for (const who of [world.users.monitoring, world.users.executive, world.users.general]) {
      const s = await as(who);
      expect((await give(s, world.users.rpmRangpur, place)).status, who).toBe(403);
      expect((await at(s, 'get', `/users/${world.users.rpmRangpur}/extra-areas`)).status).toBe(403);
    }
    expect((await api().get(`/api/v1/users/${world.users.rpmRangpur}/extra-areas`)).status).toBe(
      401,
    );
    const none = await h.db.query('SELECT 1 FROM user_extra_areas WHERE user_id = ANY($1)', [
      [world.users.head, world.users.general, closed],
    ]);
    expect(none.rowCount).toBe(0);
  });

  it('refuses a body with both or neither place, a place that is no division or district, and an unknown one', async () => {
    const head = await as(world.users.head);
    const target = world.users.rpmRangpur;
    for (const body of [
      {},
      { locationId: world.dhaka.division, wholeCountry: true },
      { locationId: world.dhaka.upazila },
      { locationId: world.dhaka.union },
      { locationId: randomUUID() },
    ]) {
      const res = await give(head, target, body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(res.body.error.details).toContainEqual(
        expect.objectContaining({ path: 'locationId' }),
      );
    }
    // a reason too short to say why
    const short = await give(head, target, { locationId: world.dhaka.division, reason: 'x' });
    expect(short.status).toBe(422);
    expect(short.body.error.details).toContainEqual(expect.objectContaining({ path: 'reason' }));
  });

  it("answers 404 for another person's area under this person's address, and leaves it live", async () => {
    const head = await as(world.users.head);
    const holder = await official('regional_program_manager');
    const other = await official('regional_program_manager');
    const given = await give(head, holder, { locationId: world.dhaka.division });
    expect(given.status).toBe(201);
    const row = liveOf(given, world.dhaka.division);
    expect((await end(head, other, row.id)).status).toBe(404);
    const kept = await h.db.query('SELECT ended_at FROM user_extra_areas WHERE id = $1', [row.id]);
    expect(kept.rows).toEqual([{ ended_at: null }]);
  });

  it('lists the live areas first, then the ended ones, each with who gave it and why', async () => {
    const head = await as(world.users.head);
    const target = await official('regional_program_manager');
    const first = await give(head, target, { locationId: world.dhaka.division });
    const second = await give(head, target, { locationId: world.rangpur.district });
    expect([first.status, second.status]).toEqual([201, 201]);
    await end(head, target, liveOf(first, world.dhaka.division).id);
    const list = await at(head, 'get', `/users/${target}/extra-areas`);
    expect(list.status).toBe(200);
    expect(rows(list).map((r) => [r.location?.id, r.endedAt === null])).toEqual([
      [world.rangpur.district, true],
      [world.dhaka.division, false],
    ]);
    // the same place may be given again once the earlier one is ended
    expect((await give(head, target, { locationId: world.dhaka.division })).status).toBe(201);
    const twice = await give(head, target, { locationId: world.dhaka.division });
    expect(twice.status).toBe(409);
    expect(twice.body.error.code).toBe('user.extra_area_exists');
  });
});
