import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { isoDateInDhaka } from '@css/shared/format';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accessWorld } from './support/access-fixtures.js';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
} from './support/auth-app.js';
import * as f from './support/fixtures.js';

// "Needs your attention" of the My Work home: counted items for the caller's own work and for
// the records their roles reach, each linked to the list that holds them.
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
      `INSERT INTO volunteer_change_requests (id, user_id, volunteer_id, kind, field, note, requested_by, status)
       VALUES ($1, (SELECT user_id FROM volunteers WHERE id = $2), $2, 'registration_correction', 'education', 'আরও লিখুন', $3, 'open')`,
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

  it('counts the registrations waiting in the caller’s region only, volunteers and officials apart', async () => {
    const before = countOf(await attention(world.users.head), 'registrations_pending');
    await pendingVolunteer(world.dhaka);
    await pendingVolunteer(world.dhaka);
    await pendingVolunteer(world.rangpur);
    const staff = await account(h.db, { kind: 'staff', state: 'pending' });
    expect(countOf(await attention(world.users.rpmDhaka), 'registrations_pending')).toBe(2);
    expect(countOf(await attention(world.users.rpmRangpur), 'registrations_pending')).toBe(1);
    const head = await attention(world.users.head);
    expect(countOf(head, 'registrations_pending')).toBe(before + 3);
    expect(head).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'registrations_pending',
          href: '/admin/volunteers?state=pending',
        }),
        expect.objectContaining({
          kind: 'staff_registrations_pending',
          href: '/admin/registrations',
        }),
      ]),
    );
    // an official's registration is decided by the global roles only
    expect(countOf(await attention(world.users.rpmDhaka), 'staff_registrations_pending')).toBe(0);
    // a volunteer holds no registration permission
    expect(countOf(await attention(world.users.general), 'registrations_pending')).toBe(0);
    await h.db.query(`UPDATE users SET state = 'deactivated' WHERE id = $1`, [staff.id]);
  });

  it('lets a pending registrant read their own corrections', async () => {
    const { userId, volunteerId } = await pendingVolunteer(world.dhaka);
    await h.db.query(
      `INSERT INTO volunteer_change_requests (id, user_id, volunteer_id, kind, field, note, requested_by, status)
       VALUES ($1, (SELECT user_id FROM volunteers WHERE id = $2), $2, 'registration_correction', 'education', 'আরও লিখুন', $3, 'open')`,
      [randomUUID(), volunteerId, world.users.rpmDhaka],
    );
    // an unread notification is not offered: the inbox opens after the approval
    await h.db.query(
      `INSERT INTO notifications (id, user_id, template_key, template_version, params) VALUES ($1, $2, 'registration_approved', 1, '{}')`,
      [randomUUID(), userId],
    );
    expect(await attention(userId)).toEqual([
      { kind: 'corrections', count: 1, href: '/account/profile' },
    ]);
  });

  it('counts the edit requests waiting in the approver’s region, and tells the volunteer of a recent answer', async () => {
    const a = await account(h.db, { kind: 'volunteer', role: 'volunteer_general' });
    accounts.set(a.id, a);
    const volunteerId = await f.volunteer(h.db, world.dhaka, a.id, { approved_at: new Date() });
    const request = (status: string, decidedAt: Date | null) =>
      h.db.query(
        `INSERT INTO volunteer_change_requests (id, user_id, volunteer_id, kind, field, new_value, requested_by, status, decided_at)
         VALUES ($1, (SELECT user_id FROM volunteers WHERE id = $2), $2, 'profile_edit', 'education', 'স্নাতক', $3, $4, $5)`,
        [randomUUID(), volunteerId, a.id, status, decidedAt],
      );
    const rangpurBefore = countOf(await attention(world.users.rpmRangpur), 'edit_requests_pending');
    await request('submitted', null);
    const now = h.clock.now().getTime();
    await request('approved', new Date(now - 86_400_000));
    // answered too long ago to be news
    await request('rejected', new Date(now - 30 * 86_400_000));
    expect(await attention(world.users.rpmDhaka)).toEqual(
      expect.arrayContaining([
        { kind: 'edit_requests_pending', count: 1, href: '/admin/registrations?tab=edits' },
      ]),
    );
    expect(countOf(await attention(world.users.rpmRangpur), 'edit_requests_pending')).toBe(
      rangpurBefore,
    );
    expect(await attention(a.id)).toEqual(
      expect.arrayContaining([{ kind: 'edit_answered', count: 1, href: '/account/profile' }]),
    );
  });

  it('gives a PM the drafts of their program and the windows ending within a week, none of another program', async () => {
    const day = 86_400_000;
    const now = h.clock.now().getTime();
    const soon = isoDateInDhaka(new Date(now + 3 * day));
    const later = isoDateInDhaka(new Date(now + 30 * day));
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
        {
          kind: 'deadlines_soon',
          count: 1,
          href: '/admin/projects?status=active&endingSoon=true',
        },
      ]),
    );
    expect(countOf(await attention(world.users.rpmDhaka), 'projects_draft')).toBe(0);
    // the list the item opens shows the same projects
    const list = await api()
      .get('/api/v1/projects?status=active&endingSoon=true')
      .set(bearer(await login(h, accounts.get(world.users.pm)!)));
    expect(list.status).toBe(200);
    expect(list.body.data.map((p: { id: string }) => p.id)).toEqual([world.a1.id]);
    // a window ending later is not near
    await h.db.query(`UPDATE projects SET apply_to = $2 WHERE id = $1`, [world.a1.id, later]);
    expect(countOf(await attention(world.users.pm), 'deadlines_soon')).toBe(0);
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

  it('counts the applications waiting for the review or the approval an official may give, inside their reach, opening the oldest', async () => {
    await h.db.query(`UPDATE projects SET status = 'active' WHERE id = $1`, [world.a1.id]);
    const officials = [
      world.users.rpmDhaka,
      world.users.rpmRangpur,
      world.users.executive,
      world.users.outsider,
    ];
    const before = new Map<string, number>();
    for (const id of officials)
      before.set(id, countOf(await attention(id), 'applications_waiting'));
    const ctx = { project: world.a1, loc: world.dhaka };
    const person = async (loc: typeof world.dhaka) => ({
      beneficiary_id: await f.beneficiary(h.db, loc),
    });
    const old = new Date(Date.now() - 30 * 24 * 60 * 60_000);
    const oldest = await f.application(h.db, ctx, {
      status: 'submitted',
      updated_at: old,
      ...(await person(world.dhaka)),
    });
    await f.application(h.db, ctx, { status: 'reviewed', ...(await person(world.dhaka)) });
    // neither a draft nor an approved one waits for the office
    await f.application(h.db, ctx, { status: 'draft' });
    await f.application(h.db, ctx, { status: 'approved', ...(await person(world.dhaka)) });
    await f.application(
      h.db,
      { project: world.a1, loc: world.rangpur },
      { status: 'under_review', ...(await person(world.rangpur)) },
    );
    // a project that is not running does not count
    await f.application(
      h.db,
      { project: world.a2, loc: world.dhaka },
      { status: 'submitted', ...(await person(world.dhaka)) },
    );
    const delta = async (id: string) =>
      countOf(await attention(id), 'applications_waiting') - before.get(id)!;
    expect(await delta(world.users.rpmDhaka)).toBe(2);
    expect(await delta(world.users.executive)).toBe(2);
    expect(await delta(world.users.rpmRangpur)).toBe(1);
    // an official on another program's project sees none of them
    expect(await delta(world.users.outsider)).toBe(0);
    const item = (await attention(world.users.rpmDhaka)).find(
      (i) => i.kind === 'applications_waiting',
    );
    expect(item?.href).toBe(`/admin/applications/${oldest}`);
  });

  it('answers 401 without a session', async () => {
    await api().get('/api/v1/me/attention').expect(401);
  });
});
