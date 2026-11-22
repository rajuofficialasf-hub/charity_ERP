import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { beneficiaryWhere } from '../../src/access/scope.js';
import type { RecordEntity } from '../../src/access/service.js';
import type { Principal } from '../../src/auth/principal.js';
import { boundedRead } from '../../src/core/bounded-read.js';
import { accessWorld } from './support/access-fixtures.js';
import { account, type AuthHarness, authHarness } from './support/auth-app.js';
import * as f from './support/fixtures.js';

// Per-record access for the nationwide lists: the sensitive scope, the action flags, the
// beneficiary scope with the Procurement Team's house-construction projects, and the time limit of
// a list read.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
let dhakaVolunteer: string;
let rangpurVolunteer: string;

const principal = (userId: string) => ({ userId }) as Principal;

beforeAll(async () => {
  h = await authHarness();
  world = await accessWorld(
    h.db,
    {
      staff: async (role) => (await account(h.db, { kind: 'staff', role })).id,
      volunteerUser: async (role) => (await account(h.db, { kind: 'volunteer', role })).id,
    },
    { atWork: true },
  );
  const ids = async (userId: string) =>
    (await h.db.query('SELECT id FROM volunteers WHERE user_id = $1', [userId])).rows[0]
      .id as string;
  dhakaVolunteer = await ids(world.users.general);
  rangpurVolunteer = await ids(world.users.rangpurVolunteer);
});
afterAll(async () => h.close());

async function scopeOf(userId: string, permission: string, entity: RecordEntity) {
  const access = await h.container.access.load(userId);
  return h.container.access.sensitiveScope(principal(userId), access, permission, entity);
}

describe('the sensitive scope of a nationwide list', () => {
  it("reaches the RPM's own region and not another one", async () => {
    const scope = await scopeOf(world.users.rpmDhaka, 'volunteer.view_sensitive', 'volunteer');
    expect(scope).not.toBeNull();
    expect(await h.container.access.reaches(scope!, { volunteerId: dhakaVolunteer })).toBe(true);
    expect(await h.container.access.reaches(scope!, { volunteerId: rangpurVolunteer })).toBe(false);
  });

  it('reaches every volunteer for the Monitoring Team', async () => {
    const scope = await scopeOf(world.users.monitoring, 'volunteer.view_sensitive', 'volunteer');
    expect(await h.container.access.reaches(scope!, { volunteerId: rangpurVolunteer })).toBe(true);
  });

  it('is null for a role without the permission and for a volunteer', async () => {
    const daee = (await account(h.db, { role: 'official_daee' })).id;
    expect(await scopeOf(daee, 'volunteer.view_sensitive', 'volunteer')).toBeNull();
    expect(await scopeOf(world.users.general, 'volunteer.view_sensitive', 'volunteer')).toBeNull();
    expect(await scopeOf(world.users.general, 'volunteer.view_all', 'volunteer')).toBeNull();
  });
});

describe('the action flags of one record', () => {
  const actions = {
    block: { permission: 'volunteer.block', entity: 'volunteer' },
    revokeSessions: { permission: 'session.revoke_user', entity: 'user' },
  } as const;

  it('are true for the RPM on a volunteer of the region and false on another region', async () => {
    const access = await h.container.access.load(world.users.rpmDhaka);
    const here = await h.container.access.allowedOn(
      principal(world.users.rpmDhaka),
      access,
      actions,
      {
        volunteerId: dhakaVolunteer,
        userId: world.users.general,
      },
    );
    expect(here).toEqual({ block: true, revokeSessions: true });
    const there = await h.container.access.allowedOn(
      principal(world.users.rpmDhaka),
      access,
      actions,
      { volunteerId: rangpurVolunteer, userId: world.users.rangpurVolunteer },
    );
    expect(there).toEqual({ block: false, revokeSessions: false });
  });

  it('are false for a role that holds neither permission', async () => {
    const daee = (await account(h.db, { role: 'official_daee' })).id;
    const access = await h.container.access.load(daee);
    expect(
      await h.container.access.allowedOn(principal(daee), access, actions, {
        volunteerId: dhakaVolunteer,
        userId: world.users.general,
      }),
    ).toEqual({ block: false, revokeSessions: false });
  });
});

describe('the beneficiary scope', () => {
  it('reaches the beneficiaries of attached house-construction projects only', async () => {
    const procurement = (await account(h.db, { role: 'procurement_team' })).id;
    const house = await f.project(h.db);
    await h.db.query(`UPDATE workflow_definitions SET key = 'construction' WHERE id = $1`, [
      house.workflow,
    ]);
    const other = await f.project(h.db);
    for (const p of [house, other])
      await h.db.query(
        `INSERT INTO project_staff (id, project_id, user_id, role_key, granted_by)
         VALUES ($1, $2, $3, 'procurement_team', $3)`,
        [randomUUID(), p.id, procurement],
      );
    const inHouse = await f.beneficiary(h.db, world.dhaka);
    const inOther = await f.beneficiary(h.db, world.dhaka);
    const nowhere = await f.beneficiary(h.db, world.rangpur);
    await f.application(h.db, { project: house, loc: world.dhaka }, { beneficiary_id: inHouse });
    await f.application(h.db, { project: other, loc: world.dhaka }, { beneficiary_id: inOther });

    const scope = await scopeOf(procurement, 'beneficiary.view_all', 'beneficiary');
    expect(scope!.instances.projectIds).toEqual([house.id]);
    const ids = (
      await h.container.prisma.beneficiary.findMany({
        where: { AND: [{ id: { in: [inHouse, inOther, nowhere] } }, beneficiaryWhere(scope!)] },
        select: { id: true },
      })
    ).map((b) => b.id);
    expect(ids).toEqual([inHouse]);
  });

  it('reaches every beneficiary for a GLOBAL holder, the applicants of the own program for a PM, and none for a volunteer', async () => {
    const someone = await f.beneficiary(h.db, world.rangpur);
    const global = await scopeOf(world.users.head, 'beneficiary.view_all', 'beneficiary');
    expect(await h.container.access.reaches(global!, { beneficiaryId: someone })).toBe(true);
    const ofProgram = () => scopeOf(world.users.pm, 'beneficiary.view_all', 'beneficiary');
    expect(await h.container.access.reaches((await ofProgram())!, { beneficiaryId: someone })).toBe(
      false,
    );
    await f.application(
      h.db,
      { project: world.a1, loc: world.rangpur },
      { beneficiary_id: someone },
    );
    expect(await h.container.access.reaches((await ofProgram())!, { beneficiaryId: someone })).toBe(
      true,
    );
    expect(await scopeOf(world.users.general, 'beneficiary.view_all', 'beneficiary')).toBeNull();
  });
});

describe('the time limit of a list read', () => {
  it('answers server.busy when a read runs over its limit', async () => {
    await expect(
      boundedRead(h.container.prisma, (tx) => tx.$queryRaw`SELECT pg_sleep(1)`, 100),
    ).rejects.toMatchObject({ code: 'server.busy', status: 503 });
  });

  it('passes any other failure through unchanged', async () => {
    const failure = new Error('the read itself failed');
    await expect(boundedRead(h.container.prisma, () => Promise.reject(failure))).rejects.toBe(
      failure,
    );
  });

  it('returns the result of a read within its limit', async () => {
    await expect(
      boundedRead(h.container.prisma, (tx) => tx.$queryRaw`SELECT 1 AS one`),
    ).resolves.toEqual([{ one: 1 }]);
  });
});
