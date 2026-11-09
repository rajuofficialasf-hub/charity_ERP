import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { beneficiaryScopeSql, beneficiaryWhere, projectWhere } from '../../src/access/scope';
import { Prisma } from '../../src/generated/prisma/client';
import { accessWorld, seedAccessCatalogue } from './support/access-fixtures';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
} from './support/auth-app';
import * as f from './support/fixtures';

// A panel revoke of one project beats every grant that reaches it: the PM's program, an area
// without a project and GLOBAL (RBAC.md 7).
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);

beforeAll(async () => {
  h = await authHarness();
  await seedAccessCatalogue(h.db);
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
});

afterAll(async () => {
  await h.close();
});

async function override(
  userId: string,
  permission: string,
  effect: 'grant' | 'revoke',
  scope: string,
  ref: string,
) {
  await h.db.query(
    `INSERT INTO user_permissions (id, user_id, permission_name, effect, scope_type, scope_ref, reason, granted_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'Test override', $7)`,
    [randomUUID(), userId, permission, effect, scope, ref, world.users.head],
  );
  await h.db.query('UPDATE users SET permission_version = permission_version + 1 WHERE id = $1', [
    userId,
  ]);
  h.container.sessions.evictUser(userId);
}

const holds = (userId: string, permission: string, projectId: string) =>
  h.container.access.holdsOnProject(userId, permission, projectId);

describe('a project revoke against a broader grant', () => {
  it("takes one project out of the PM's program grant and leaves the program's other project", async () => {
    const permission = 'application.view_official_section';
    const { pm } = world.users;
    expect(await holds(pm, permission, world.a1.id)).toBe(true);
    expect(await holds(pm, permission, world.a2.id)).toBe(true);
    await override(pm, permission, 'revoke', 'PROJECT', world.a1.id);
    expect(await holds(pm, permission, world.a1.id)).toBe(false);
    expect(await holds(pm, permission, world.a2.id)).toBe(true);
    const scope = await h.container.access.scopeOfUser(pm, permission, 'project');
    const reached = await h.container.prisma.project.findMany({
      where: { AND: [{ programId: world.a1.program }, projectWhere(scope)] },
      select: { id: true },
    });
    expect(reached.map((p) => p.id)).toEqual([world.a2.id]);
  });

  it('answers 404 to the PM on the revoked project through the real endpoint', async () => {
    const { pm } = world.users;
    const before = await as(pm);
    await api().get(`/api/v1/projects/${world.a2.id}`).set(bearer(before)).expect(200);
    await api().get(`/api/v1/projects/${world.a1.id}`).set(bearer(before)).expect(200);
    await override(pm, 'project.view', 'revoke', 'PROJECT', world.a2.id);
    const after = await as(pm);
    await api().get(`/api/v1/projects/${world.a2.id}`).set(bearer(after)).expect(404);
    await api().get(`/api/v1/projects/${world.a1.id}`).set(bearer(after)).expect(200);
  });

  it('beats a GLOBAL grant of the Monitoring Team', async () => {
    const permission = 'application.view_official_section';
    const { monitoring } = world.users;
    expect(await holds(monitoring, permission, world.b1.id)).toBe(true);
    await override(monitoring, permission, 'revoke', 'PROJECT', world.b1.id);
    expect(await holds(monitoring, permission, world.b1.id)).toBe(false);
    expect(await holds(monitoring, permission, world.a1.id)).toBe(true);
  });

  it('beats a panel grant of an area without a project', async () => {
    const permission = 'beneficiary.merge.dismiss';
    const { outsider } = world.users;
    // a REGION grant names no project: it reaches every project with an area in the division
    await override(outsider, permission, 'grant', 'REGION', world.dhaka.division);
    expect(await holds(outsider, permission, world.a1.id)).toBe(true);
    await override(outsider, permission, 'revoke', 'PROJECT', world.a1.id);
    expect(await holds(outsider, permission, world.a1.id)).toBe(false);
  });

  it('keeps a beneficiary reached through another project, in the Prisma filter and the raw SQL alike', async () => {
    const permission = 'beneficiary.merge.dismiss';
    const { pm } = world.users;
    const onlyA1 = await f.beneficiary(h.db, world.rangpur);
    const both = await f.beneficiary(h.db, world.rangpur);
    await f.application(
      h.db,
      { project: world.a1, loc: world.rangpur },
      { beneficiary_id: onlyA1 },
    );
    await f.application(h.db, { project: world.a1, loc: world.rangpur }, { beneficiary_id: both });
    await f.application(h.db, { project: world.a2, loc: world.rangpur }, { beneficiary_id: both });
    const ids = [onlyA1, both] as string[];
    const reach = async () => {
      const scope = await h.container.access.scopeOfUser(pm, permission, 'beneficiary');
      const viaPrisma = (
        await h.container.prisma.beneficiary.findMany({
          where: { AND: [{ id: { in: ids } }, beneficiaryWhere(scope)] },
          select: { id: true },
        })
      )
        .map((r) => r.id)
        .sort();
      const viaSql = (
        await h.container.prisma.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT b.id FROM beneficiaries b WHERE b.id = ANY(ARRAY[${Prisma.join(ids)}]::uuid[]) AND ${beneficiaryScopeSql(scope, 'b')}`,
        )
      )
        .map((r) => r.id)
        .sort();
      expect(viaSql).toEqual(viaPrisma);
      return viaPrisma;
    };
    expect(await reach()).toEqual([...ids].sort());
    await override(pm, permission, 'revoke', 'PROJECT', world.a1.id);
    expect(await reach()).toEqual([both]);
  });
});
