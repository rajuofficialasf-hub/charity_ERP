import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FrozenList } from '../../src/exports/rows';
import { ApiError } from '../../src/i18n/api-error';
import { accessWorld } from './support/access-fixtures';
import { principalOf } from './support/applications';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
} from './support/auth-app';
import * as f from './support/fixtures';

// The rows an export reads: exactly the rows the list shows for the same filters, inside the
// scope the person had when they asked, with the protected fields their export may carry.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
const rows = () => h.container.exportRows;

beforeAll(async () => {
  h = await authHarness();
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
  for (let i = 0; i < 3; i += 1) {
    const dhaka = await f.beneficiary(h.db, world.dhaka);
    await f.application(h.db, { project: world.a1, loc: world.dhaka }, { beneficiary_id: dhaka });
    await f.beneficiary(h.db, world.rangpur);
  }
});
afterAll(async () => h.close());

/** Every row of a frozen list, read in batches of the given size. */
async function readAll(frozen: FrozenList, size = 2) {
  const all: { id: string; cells: Record<string, unknown> }[] = [];
  let after = null;
  for (;;) {
    const page = await rows().batch(frozen, after, size);
    all.push(...page.rows);
    if (!page.next) return all;
    after = page.next;
  }
}

const freeze = async (userId: string, body: Parameters<ReturnType<typeof rows>['freeze']>[1]) =>
  rows().freeze(await principalOf(h.db, userId), body, 'bn');

describe('the rows of an export', () => {
  it('are the volunteer list’s rows, in its order', async () => {
    const s = await as(world.users.head);
    const listed = await api().get('/api/v1/volunteers?limit=100').set(bearer(s)).expect(200);
    const frozen = await freeze(world.users.head, { kind: 'volunteers', filters: {} });
    expect((await readAll(frozen)).map((r) => r.id)).toEqual(
      listed.body.data.map((r: { id: string }) => r.id),
    );
    expect(await rows().count(frozen)).toBe(listed.body.data.length);
  });

  it('are the beneficiary list’s rows, nationwide for an RPM as the list is', async () => {
    const s = await as(world.users.rpmDhaka);
    const listed = await api().get('/api/v1/beneficiaries?limit=100').set(bearer(s)).expect(200);
    const frozen = await freeze(world.users.rpmDhaka, { kind: 'beneficiaries', filters: {} });
    const exported = await readAll(frozen);
    expect(exported.map((r) => r.id)).toEqual(listed.body.data.map((r: { id: string }) => r.id));
    expect(exported.length).toBeGreaterThanOrEqual(6);
  });

  it('keep an RPM to the applications of their own region', async () => {
    const s = await as(world.users.rpmRangpur);
    const listed = await api()
      .get(`/api/v1/projects/${world.a1.id}/applications?limit=100`)
      .set(bearer(s))
      .expect(200);
    const exported = await readAll(
      await freeze(world.users.rpmRangpur, {
        kind: 'applications',
        filters: {},
        projectId: world.a1.id,
      }),
    );
    expect(exported.map((r) => r.id)).toEqual(listed.body.data.map((r: { id: string }) => r.id));
    const dhaka = await h.db.query<{ id: string }>(
      'SELECT id FROM applications WHERE project_id = $1 AND region_location_id = $2',
      [world.a1.id, world.dhaka.division],
    );
    expect(dhaka.rows.length).toBeGreaterThanOrEqual(3);
    for (const row of dhaka.rows) expect(exported.map((r) => r.id)).not.toContain(row.id);
  });

  it('are a project’s application list rows, with the list’s filters', async () => {
    const s = await as(world.users.rpmDhaka);
    const path = `/api/v1/projects/${world.a1.id}/applications?limit=100&status=submitted`;
    const listed = await api().get(path).set(bearer(s)).expect(200);
    const frozen = await freeze(world.users.rpmDhaka, {
      kind: 'applications',
      filters: { status: 'submitted' },
      projectId: world.a1.id,
    });
    expect((await readAll(frozen)).map((r) => r.id)).toEqual(
      listed.body.data.map((r: { id: string }) => r.id),
    );
  });

  it('carry the NID only for a holder of the beneficiary export permission', async () => {
    const rpm = await readAll(
      await freeze(world.users.rpmDhaka, { kind: 'beneficiaries', filters: {} }),
    );
    expect(rpm[0]!.cells).toHaveProperty('nid');
    // the Project Executive sees the NID on screen, but exports only through the list permission
    const executive = await readAll(
      await freeze(world.users.executive, { kind: 'beneficiaries', filters: {} }),
    );
    expect(executive.length).toBeGreaterThan(0);
    for (const row of executive) {
      expect(row.cells).not.toHaveProperty('nid');
      expect(row.cells).not.toHaveProperty('birth_reg');
      expect(row.cells).toHaveProperty('name');
    }
  });

  it('stay the frozen ones when the person’s access changes after the request', async () => {
    const frozen = await freeze(world.users.rpmRangpur, { kind: 'beneficiaries', filters: {} });
    const before = await readAll(frozen);
    await h.db.query(`UPDATE user_roles SET revoked_at = now() WHERE user_id = $1`, [
      world.users.rpmRangpur,
    ]);
    expect(await readAll(frozen)).toEqual(before);
    expect(before.length).toBeGreaterThan(0);
  });

  it('are refused to a volunteer, outside the project’s reach, and for a filter the list refuses', async () => {
    await expect(
      freeze(world.users.general, { kind: 'beneficiaries', filters: {} }),
    ).rejects.toMatchObject({ code: 'permission.denied', status: 403 });
    await expect(
      freeze(world.users.outsider, {
        kind: 'applications',
        filters: {},
        projectId: world.a1.id,
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      freeze(world.users.head, { kind: 'beneficiaries', filters: { nope: 1 } }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
