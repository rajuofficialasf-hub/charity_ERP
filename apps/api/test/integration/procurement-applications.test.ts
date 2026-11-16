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

// The Procurement Team on the applications of a house-construction project it is attached to
// (docs/security/permissions.yaml, `application.view` and `project.view`): it lists and reads
// them with the protected fields masked, and reaches no other project's applications.

let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
let procurement: Account;
let house: Awaited<ReturnType<typeof f.project>>;
let distribution: Awaited<ReturnType<typeof f.project>>;
let unattached: Awaited<ReturnType<typeof f.project>>;
const accounts = new Map<string, Account>();
const nids = new Map<string, string>();
const applications = new Map<string, string>();

const api = () => request(h.server());
const get = (s: Session, path: string) => api().get(`/api/v1${path}`).set(bearer(s));

beforeAll(async () => {
  h = await authHarness();
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
  procurement = await account(h.db, { kind: 'staff', role: 'procurement_team' });
  house = await f.project(h.db);
  unattached = await f.project(h.db);
  // the two construction projects run versions of the one house-construction workflow
  for (const [version, p] of [house, unattached].entries())
    await h.db.query(
      `UPDATE workflow_definitions SET key = 'construction', version = $2 WHERE id = $1`,
      [p.workflow, version + 1],
    );
  distribution = await f.project(h.db);
  for (const p of [house, distribution])
    await h.db.query(
      `INSERT INTO project_staff (id, project_id, user_id, role_key, granted_by)
       VALUES ($1, $2, $3, 'procurement_team', $3)`,
      [randomUUID(), p.id, procurement.id],
    );
  for (const [key, p] of [
    ['house', house],
    ['distribution', distribution],
    ['unattached', unattached],
  ] as const) {
    const nid = f.fakeNid();
    nids.set(key, nid);
    const person = await f.beneficiary(h.db, world.dhaka, { nid });
    applications.set(
      key,
      await f.application(h.db, { project: p, loc: world.dhaka }, { beneficiary_id: person }),
    );
  }
});
afterAll(async () => h.close());

describe('the Procurement Team on a house-construction project', () => {
  it('lists and reads its applications, with the identity number masked', async () => {
    const s = await login(h, procurement);
    const list = await get(s, `/projects/${house.id}/applications`);
    expect(list.status, JSON.stringify(list.body)).toBe(200);
    expect(list.body.data.map((a: { id: string }) => a.id)).toEqual([applications.get('house')]);
    expect(JSON.stringify(list.body)).not.toContain(nids.get('house'));

    const one = await get(s, `/applications/${applications.get('house')}`);
    expect(one.status, JSON.stringify(one.body)).toBe(200);
    expect(JSON.stringify(one.body)).not.toContain(nids.get('house'));
    expect(one.body.data.availableActions ?? []).toEqual([]);
  });

  it('reaches no application of another project, attached or not', async () => {
    const s = await login(h, procurement);
    for (const key of ['distribution', 'unattached'] as const) {
      const project = key === 'distribution' ? distribution : unattached;
      const list = await get(s, `/projects/${project.id}/applications`);
      expect(list.status, key).toBe(404);
      const one = await get(s, `/applications/${applications.get(key)}`);
      expect(one.status, key).toBe(404);
    }
  });

  it('keeps a volunteer of the region away from the house-construction applications', async () => {
    const s = await login(h, accounts.get(world.users.general)!);
    expect((await get(s, `/applications/${applications.get('house')}`)).status).toBe(404);
  });
});
