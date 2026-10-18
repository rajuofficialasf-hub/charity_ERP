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
} from './support/auth-app';
import * as f from './support/fixtures';

// "Needs your attention" of the My Work home: counted items for the caller's own work and for
// the records their roles reach, each counted as the list it opens counts it.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());

type Item = { kind: string; count: number; href: string };
const attention = async (userId: string) => {
  const res = await api()
    .get('/api/v1/me/attention')
    .set(bearer(await login(h, accounts.get(userId)!)));
  expect(res.status).toBe(200);
  return res.body.data as Item[];
};
const countOf = (items: Item[], kind: string) => items.find((i) => i.kind === kind)?.count ?? 0;

/** A volunteer who registered and waits for a decision, living in a region. */
async function pendingVolunteer(tree: Awaited<ReturnType<typeof f.locationTree>>) {
  const a = await account(h.db, { kind: 'volunteer', role: 'volunteer_general', state: 'pending' });
  accounts.set(a.id, a);
  const volunteerId = await f.volunteer(h.db, tree, a.id);
  return { userId: a.id, volunteerId };
}

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

describe('GET /me/attention', () => {
  it('gives a volunteer their own consent, corrections and unread notifications, never another volunteer’s', async () => {
    const a = await account(h.db, { kind: 'volunteer', role: 'volunteer_general' });
    const b = await account(h.db, { kind: 'volunteer', role: 'volunteer_general' });
    accounts.set(a.id, a);
    accounts.set(b.id, b);
    const va = await f.volunteer(h.db, world.dhaka, a.id, { approved_at: new Date() });
    const vb = await f.volunteer(h.db, world.dhaka, b.id, { approved_at: new Date() });
    for (const v of [va, vb])
      await h.db.query(
        `INSERT INTO project_volunteers (id, project_id, volunteer_id, region_location_id, permission_set, assigned_by, consent_status)
         VALUES ($1, $2, $3, $4, 'application_distribution', $5, $6)`,
        [
          randomUUID(),
          world.a1.id,
          v,
          world.dhaka.division,
          world.users.rpmDhaka,
          v === va ? 'pending' : 'accepted',
        ],
      );
    await h.db.query(`UPDATE projects SET status = 'active' WHERE id = $1`, [world.a1.id]);
    await h.db.query(
      `INSERT INTO volunteer_change_requests (id, volunteer_id, kind, field, note, requested_by, status)
       VALUES ($1, $2, 'registration_correction', 'education', 'আরও লিখুন', $3, 'open')`,
      [randomUUID(), va, world.users.rpmDhaka],
    );
    await h.db.query(
      `INSERT INTO notifications (id, user_id, template_key, template_version, params) VALUES ($1, $2, 'registration_approved', 1, '{}')`,
      [randomUUID(), a.id],
    );

    const mine = await attention(a.id);
    expect(mine).toEqual(
      expect.arrayContaining([
        { kind: 'consent_pending', count: 1, href: '/my-projects' },
        { kind: 'corrections', count: 1, href: '/account/profile' },
        { kind: 'unread_notifications', count: 1, href: '/notifications' },
      ]),
    );
    // another volunteer sees none of it, and no volunteer gets counts of officials' work
    const theirs = await attention(b.id);
    expect(theirs.map((i) => i.kind)).toEqual([]);
  });

  it('counts the registrations waiting in the caller’s region only', async () => {
    await pendingVolunteer(world.dhaka);
    await pendingVolunteer(world.dhaka);
    await pendingVolunteer(world.rangpur);
    expect(countOf(await attention(world.users.rpmDhaka), 'registrations_pending')).toBe(2);
    expect(countOf(await attention(world.users.rpmRangpur), 'registrations_pending')).toBe(1);
    expect(
      countOf(await attention(world.users.head), 'registrations_pending'),
    ).toBeGreaterThanOrEqual(3);
    // a volunteer holds no registration permission
    expect(countOf(await attention(world.users.general), 'registrations_pending')).toBe(0);
  });

  it('gives a PM the drafts of their program and the windows ending within a week, none of another program', async () => {
    const soon = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    await h.db.query(`UPDATE projects SET status = 'draft' WHERE id = $1`, [world.a2.id]);
    await h.db.query(`UPDATE projects SET status = 'active', apply_to = $2 WHERE id = $1`, [
      world.a1.id,
      soon,
    ]);
    await h.db.query(`UPDATE projects SET status = 'draft' WHERE id = $1`, [world.b1.id]);
    const items = await attention(world.users.pm);
    expect(items).toEqual(
      expect.arrayContaining([
        { kind: 'projects_draft', count: 1, href: '/admin/projects?status=draft' },
        { kind: 'deadlines_soon', count: 1, href: '/admin/projects?status=active' },
      ]),
    );
    expect(countOf(await attention(world.users.rpmDhaka), 'projects_draft')).toBe(0);
  });

  it('gives the global roles the handovers that are started and not completed', async () => {
    await h.db.query(
      `INSERT INTO handovers (id, from_user_id, to_user_id, scope, approved_by) VALUES ($1, $2, $3, '{"items":[]}', $4)`,
      [randomUUID(), world.users.outsider, world.users.executive, world.users.head],
    );
    expect(await attention(world.users.head)).toEqual(
      expect.arrayContaining([{ kind: 'handovers_open', count: 1, href: '/admin/handover' }]),
    );
    expect(countOf(await attention(world.users.pm), 'handovers_open')).toBe(0);
  });

  it('answers 401 without a session', async () => {
    await api().get('/api/v1/me/attention').expect(401);
  });
});
