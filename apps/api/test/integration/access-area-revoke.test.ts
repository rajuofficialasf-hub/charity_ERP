import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applicationWhere,
  beneficiaryScopeSql,
  beneficiaryWhere,
  userWhere,
  volunteerWhere,
} from '../../src/access/scope.js';
import { Prisma } from '../../src/generated/prisma/client.js';
import { accessWorld, grantRole } from './support/access-fixtures.js';
import { type AuthHarness, authHarness } from './support/auth-app.js';
import * as f from './support/fixtures.js';

// A panel revoke of an area beats every broader grant that reaches it: a region around a revoked
// district, a program, a project and GLOBAL (docs/security/RBAC.md, "Permission panel").
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
/** A second district of the Dhaka-like division, with its own upazila and union. */
let second: Awaited<ReturnType<typeof f.locationTree>>;

beforeAll(async () => {
  h = await authHarness();
  world = await accessWorld(h.db);
  const other = await f.locationTree(h.db);
  await h.db.query('UPDATE locations SET parent_id = $1 WHERE id = $2', [
    world.dhaka.division,
    other.district,
  ]);
  second = { ...other, division: world.dhaka.division };
});

afterAll(async () => {
  await h.close();
});

async function revoke(userId: string, permission: string, scope: string, ref: string) {
  await h.db.query(
    `INSERT INTO user_permissions (id, user_id, permission_name, effect, scope_type, scope_ref, reason, granted_by)
     VALUES ($1, $2, $3, 'revoke', $4, $5, 'Test override', $6)`,
    [randomUUID(), userId, permission, scope, ref, world.users.admin],
  );
}

const sorted = (rows: { id: string }[]) => rows.map((r) => r.id).sort();
/** A submitted application of a person who lives where it is placed. */
const applicationIn = async (
  project: (typeof world)['a1'],
  loc: Awaited<ReturnType<typeof f.locationTree>>,
) => f.application(h.db, { project, loc }, { beneficiary_id: await f.beneficiary(h.db, loc) });

describe('an area revoke against a broader grant', () => {
  it("takes one district out of the RPM's region and leaves the region's other district", async () => {
    const { rpmDhaka } = world.users;
    const first = await applicationIn(world.a1, world.dhaka);
    const inSecond = await applicationIn(world.a1, second);
    const ids = [first, inSecond] as string[];
    const reach = async () => {
      const scope = await h.container.access.scopeOfUser(
        rpmDhaka,
        'application.view',
        'application',
      );
      return sorted(
        await h.container.prisma.application.findMany({
          where: { AND: [{ id: { in: ids } }, applicationWhere(scope)] },
          select: { id: true },
        }),
      );
    };
    expect(await reach()).toEqual([...ids].sort());
    await revoke(rpmDhaka, 'application.view', 'DISTRICT', second.district);
    expect(await reach()).toEqual([first]);
    // a union names its own applications alone
    await revoke(rpmDhaka, 'application.view', 'UNION', world.dhaka.union);
    expect(await reach()).toEqual([]);
  });

  it("takes an upazila out of the PM's program", async () => {
    const { pm } = world.users;
    const kept = await applicationIn(world.a2, world.rangpur);
    const gone = await applicationIn(world.a2, second);
    await revoke(pm, 'application.view', 'UPAZILA', second.upazila);
    const scope = await h.container.access.scopeOfUser(pm, 'application.view', 'application');
    expect(
      sorted(
        await h.container.prisma.application.findMany({
          where: { AND: [{ id: { in: [kept, gone] as string[] } }, applicationWhere(scope)] },
          select: { id: true },
        }),
      ),
    ).toEqual([kept]);
  });

  it('takes a region out of the GLOBAL reach of the Monitoring Team, in the Prisma filter and the raw SQL alike', async () => {
    const { monitoring } = world.users;
    const inDhaka = await f.beneficiary(h.db, world.dhaka);
    const inSecond = await f.beneficiary(h.db, second);
    const inRangpur = await f.beneficiary(h.db, world.rangpur);
    const ids = [inDhaka, inSecond, inRangpur] as string[];
    const reach = async () => {
      const scope = await h.container.access.scopeOfUser(
        monitoring,
        'beneficiary.view_all',
        'beneficiary',
      );
      const viaPrisma = sorted(
        await h.container.prisma.beneficiary.findMany({
          where: { AND: [{ id: { in: ids } }, beneficiaryWhere(scope)] },
          select: { id: true },
        }),
      );
      const viaSql = sorted(
        await h.container.prisma.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT b.id FROM beneficiaries b WHERE b.id = ANY(ARRAY[${Prisma.join(ids)}]::uuid[]) AND ${beneficiaryScopeSql(scope, 'b')}`,
        ),
      );
      expect(viaSql).toEqual(viaPrisma);
      return viaPrisma;
    };
    expect(await reach()).toEqual([...ids].sort());
    await revoke(monitoring, 'beneficiary.view_all', 'DISTRICT', second.district);
    expect(await reach()).toEqual([inDhaka, inRangpur].sort());
    await revoke(monitoring, 'beneficiary.view_all', 'REGION', world.dhaka.division);
    expect(await reach()).toEqual([inRangpur]);
  });

  it('leaves out the volunteers whose address is there', async () => {
    const { monitoring } = world.users;
    const here = await f.volunteer(h.db, second, await f.volunteerUser(h.db));
    const elsewhere = await f.volunteer(h.db, world.rangpur, await f.volunteerUser(h.db));
    await revoke(monitoring, 'volunteer.view_all', 'DISTRICT', second.district);
    const scope = await h.container.access.scopeOfUser(
      monitoring,
      'volunteer.view_all',
      'volunteer',
    );
    expect(
      sorted(
        await h.container.prisma.volunteer.findMany({
          where: { AND: [{ id: { in: [here, elsewhere] as string[] } }, volunteerWhere(scope)] },
          select: { id: true },
        }),
      ),
    ).toEqual([elsewhere]);
  });

  it('leaves out the people whose own place is there, and keeps an official without a home division', async () => {
    const { monitoring } = world.users;
    const official = async (homeDivision: string | null) => {
      const id = await f.user(h.db);
      await grantRole(h.db, id, 'project_executive');
      await h.db.query('UPDATE users SET home_division_id = $1 WHERE id = $2', [homeDivision, id]);
      return id;
    };
    const ofDhaka = await official(world.dhaka.division);
    const ofRangpur = await official(world.rangpur.division);
    const ofNowhere = await official(null);
    const volunteerOfDhaka = await f.volunteerUser(h.db);
    await f.volunteer(h.db, world.dhaka, volunteerOfDhaka);
    const volunteerOfRangpur = await f.volunteerUser(h.db);
    await f.volunteer(h.db, world.rangpur, volunteerOfRangpur);
    const ids = [ofDhaka, ofRangpur, ofNowhere, volunteerOfDhaka, volunteerOfRangpur];
    await revoke(monitoring, 'permission.view', 'REGION', world.dhaka.division);
    const scope = await h.container.access.scopeOfUser(monitoring, 'permission.view', 'user');
    expect(
      sorted(
        await h.container.prisma.user.findMany({
          where: { AND: [{ id: { in: ids } }, userWhere(scope)] },
          select: { id: true },
        }),
      ),
    ).toEqual([ofRangpur, ofNowhere, volunteerOfRangpur].sort());
  });

  it('takes nothing from an Admin or the Department Head, whatever row exists', async () => {
    for (const userId of [world.users.admin, world.users.head]) {
      await revoke(userId, 'application.view', 'REGION', world.dhaka.division);
      const scope = await h.container.access.scopeOfUser(userId, 'application.view', 'application');
      expect(scope.instances.revokedLocationIds).toEqual([]);
      expect(applicationWhere(scope)).toEqual({});
    }
  });
});
