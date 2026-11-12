import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FrozenList } from '../../src/exports/rows.js';
import { accessWorld } from './support/access-fixtures.js';
import { principalOf } from './support/applications.js';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
} from './support/auth-app.js';
import * as f from './support/fixtures.js';

// The rows an export reads: exactly the rows the list shows for the same filters, inside the
// scope the person had when they asked, with the protected fields their export may carry and only
// on the records the screens would show them on.
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
  // scored and unscored applications of the Dhaka region, and people of both regions
  for (const score of [40, null, 75, 40]) {
    const dhaka = await f.beneficiary(h.db, world.dhaka);
    await f.application(
      h.db,
      { project: world.a1, loc: world.dhaka },
      { beneficiary_id: dhaka, total_score: score },
    );
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

/** The division of each record of a table, by id. */
async function divisionsOf(table: 'beneficiaries' | 'volunteers', ids: string[]) {
  const res = await h.db.query<{ id: string; division_id: string }>(
    `SELECT id, division_id FROM ${table} WHERE id = ANY($1)`,
    [ids],
  );
  return new Map(res.rows.map((r) => [r.id, r.division_id]));
}

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
    expect(exported.length).toBeGreaterThanOrEqual(8);
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
    expect(dhaka.rows.length).toBeGreaterThanOrEqual(4);
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

  it('follow the office’s score order across batches, unscored last', async () => {
    const s = await as(world.users.rpmDhaka);
    const listed = await api()
      .get(`/api/v1/projects/${world.a1.id}/applications?limit=100&sort=-score`)
      .set(bearer(s))
      .expect(200);
    const exported = await readAll(
      await freeze(world.users.rpmDhaka, {
        kind: 'applications',
        filters: { sort: '-score' },
        projectId: world.a1.id,
      }),
      1,
    );
    expect(exported.map((r) => r.id)).toEqual(listed.body.data.map((r: { id: string }) => r.id));
    expect(exported.map((r) => r.cells.score)).toEqual([75, 40, 40, null]);
  });

  it('carry no NID for a person whose export permission does not cover it', async () => {
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

  it('print the words of a missing mobile and a missing document, never a number or an empty word, and only where the classes reach', async () => {
    const name = `পরিচয়পত্র ছাড়া ${randomUUID().slice(0, 8)}`;
    const inside = await f.beneficiary(h.db, world.dhaka, { name, nid: null, mobile: null });
    const outside = await f.beneficiary(h.db, world.rangpur, { name, nid: null, mobile: null });
    const birthOnly = await f.beneficiary(h.db, world.dhaka, {
      name,
      nid: null,
      birth_reg: '20261112000000017',
    });
    for (const [locale, noDocument, throughVolunteer] of [
      ['bn', 'পরিচয়পত্র নেই', 'স্বেচ্ছাসেবকের মাধ্যমে যোগাযোগ'],
      ['en', 'No identity document', 'Contact through the volunteer'],
    ] as const) {
      const frozen = await rows().freeze(
        await principalOf(h.db, world.users.rpmDhaka),
        { kind: 'beneficiaries', filters: { q: name } },
        locale,
      );
      const exported = new Map((await readAll(frozen)).map((r) => [r.id, r.cells]));
      expect(exported.get(inside)).toMatchObject({
        mobile: throughVolunteer,
        nid: noDocument,
        birth_reg: noDocument,
      });
      // outside the region the identity cells are gone, words and all; the contact stays
      expect(exported.get(outside)).toMatchObject({ mobile: throughVolunteer });
      expect(exported.get(outside)).not.toHaveProperty('nid');
      expect(exported.get(outside)).not.toHaveProperty('birth_reg');
      // a person with one of the two numbers leaves the other cell empty
      expect(exported.get(birthOnly)).toMatchObject({
        nid: null,
        birth_reg: '20261112000000017',
        mobile: expect.stringMatching(/^01\d{9}$/),
      });
      expect(JSON.stringify([...exported.values()])).not.toContain('"null"');
    }
    // a role whose export carries no identity class gets no word about the document either
    const executive = await readAll(
      await freeze(world.users.executive, { kind: 'beneficiaries', filters: { q: name } }),
    );
    expect(executive.length).toBeGreaterThanOrEqual(3);
    for (const row of executive) {
      expect(row.cells).not.toHaveProperty('nid');
      expect(JSON.stringify(row.cells)).not.toContain('পরিচয়পত্র নেই');
    }
  });

  it('carry an RPM’s NIDs only of the people their region reaches, on the nationwide list', async () => {
    const exported = await readAll(
      await freeze(world.users.rpmDhaka, { kind: 'beneficiaries', filters: {} }),
    );
    const divisions = await divisionsOf(
      'beneficiaries',
      exported.map((r) => r.id),
    );
    const inside = exported.filter((r) => divisions.get(r.id) === world.dhaka.division);
    const outside = exported.filter((r) => divisions.get(r.id) === world.rangpur.division);
    expect(inside.length).toBeGreaterThanOrEqual(4);
    expect(outside.length).toBeGreaterThanOrEqual(4);
    for (const row of inside) expect(row.cells).toHaveProperty('nid');
    for (const row of outside) {
      expect(row.cells).not.toHaveProperty('nid');
      expect(row.cells).not.toHaveProperty('birth_reg');
      expect(row.cells).toHaveProperty('name');
    }
  });

  it('carry a volunteer’s identity and bank details only inside the region, with the volunteer export permission', async () => {
    const byRpm = await readAll(
      await freeze(world.users.rpmDhaka, { kind: 'volunteers', filters: {} }),
    );
    const divisions = await divisionsOf(
      'volunteers',
      byRpm.map((r) => r.id),
    );
    const dhaka = byRpm.filter((r) => divisions.get(r.id) === world.dhaka.division);
    const rangpur = byRpm.filter((r) => divisions.get(r.id) === world.rangpur.division);
    expect(dhaka.length).toBeGreaterThanOrEqual(2);
    expect(rangpur.length).toBeGreaterThanOrEqual(1);
    for (const row of dhaka) {
      expect(row.cells).toHaveProperty('nid');
      expect(row.cells).toHaveProperty('bank_account_number');
    }
    for (const row of rangpur) {
      expect(row.cells).not.toHaveProperty('nid');
      expect(row.cells).not.toHaveProperty('bank_name');
      expect(row.cells).not.toHaveProperty('bank_account_number');
      expect(row.cells).toHaveProperty('name');
    }
    // the Project Executive holds no volunteer export permission: no row carries them
    const byExecutive = await readAll(
      await freeze(world.users.executive, { kind: 'volunteers', filters: {} }),
    );
    expect(byExecutive.length).toBeGreaterThan(0);
    for (const row of byExecutive) {
      expect(row.cells).not.toHaveProperty('nid');
      expect(row.cells).not.toHaveProperty('bank_account_number');
    }
  });

  it('carry the score only for a holder of the forms export permission', async () => {
    const query = { kind: 'applications' as const, filters: {}, projectId: world.a1.id };
    const byRpm = await readAll(await freeze(world.users.rpmDhaka, query));
    expect(byRpm.length).toBeGreaterThanOrEqual(4);
    for (const row of byRpm) expect(row.cells).toHaveProperty('score');
    const byExecutive = await readAll(await freeze(world.users.executive, query));
    expect(byExecutive.map((r) => r.id)).toEqual(byRpm.map((r) => r.id));
    for (const row of byExecutive) expect(row.cells).not.toHaveProperty('score');
  });

  it('need the export permission beside the list’s own', async () => {
    const official = await account(h.db, { role: 'project_executive' });
    await h.db.query(
      `INSERT INTO user_permissions (id, user_id, permission_name, effect, scope_type, reason, granted_by)
       VALUES ($1, $2, 'export.list', 'revoke', 'GLOBAL', 'Test override', $3)`,
      [randomUUID(), official.id, world.users.head],
    );
    // the list itself still opens for them
    await api()
      .get('/api/v1/beneficiaries?limit=1')
      .set(bearer(await login(h, official)))
      .expect(200);
    await expect(freeze(official.id, { kind: 'beneficiaries', filters: {} })).rejects.toMatchObject(
      { code: 'permission.denied', status: 403 },
    );
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
    ).rejects.toMatchObject({ code: 'validation.failed', status: 422 });
  });

  // last: it takes the Rangpur RPM's roles away
  it('stay the frozen ones when the person’s access changes after the request', async () => {
    const frozen = await freeze(world.users.rpmRangpur, { kind: 'beneficiaries', filters: {} });
    const before = await readAll(frozen);
    expect(before.length).toBeGreaterThan(0);
    await h.db.query(`UPDATE user_roles SET revoked_at = now() WHERE user_id = $1`, [
      world.users.rpmRangpur,
    ]);
    // a new request is refused now, while the frozen one still reads what it was given
    await expect(
      freeze(world.users.rpmRangpur, { kind: 'beneficiaries', filters: {} }),
    ).rejects.toMatchObject({ status: 403 });
    expect(await readAll(frozen)).toEqual(before);
  });
});
