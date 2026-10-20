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

// The official view of one volunteer: protected parts per record and per class, the team and the
// action flags (DECISION_LOG O-67, D-094; plan
// docs/plans/2026-10-15-1030-feat-volunteer-beneficiary-tabs-plan.md).
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

type Tree = Awaited<ReturnType<typeof f.locationTree>>;
const BANK = { bank_name: 'Sample Bank', bank_account_number: '0001112223' };

async function someone(tree: Tree, state = 'active', volunteer: Record<string, unknown> = {}) {
  const a = await account(h.db, { kind: 'volunteer', state });
  const volunteerId = await f.volunteer(h.db, tree, a.id, {
    blood_group: 'O+',
    date_of_birth: '1990-05-17',
    ...BANK,
    ...volunteer,
  });
  return { account: a, volunteerId };
}

async function staff(role: string) {
  return login(h, await account(h.db, { role }));
}

const profile = (s: Session | null, volunteerId: string) => {
  const req = api().get(`/api/v1/volunteers/${volunteerId}`);
  return s ? req.set(bearer(s)) : req;
};
const volunteerIdOf = async (userId: string) =>
  (await h.db.query('SELECT id FROM volunteers WHERE user_id = $1', [userId])).rows[0].id as string;

const IDENTITY = [
  'nid',
  'nidPhotoFileId',
  'nidPhotoBackFileId',
  'bloodGroup',
  'dateOfBirth',
  'bank',
];

describe('the protected parts of a volunteer profile', () => {
  it('reach the RPM inside the region and not in another one', async () => {
    const dhaka = await someone(world.dhaka);
    const rangpur = await someone(world.rangpur);
    const rpm = await as(world.users.rpmDhaka);
    const here = (await profile(rpm, dhaka.volunteerId)).body.data;
    expect(here).toMatchObject({
      id: dhaka.volunteerId,
      nid: expect.any(String),
      bloodGroup: 'O+',
      dateOfBirth: '1990-05-17',
      bank: { bankName: 'Sample Bank', accountNumber: '0001112223' },
    });
    const there = await profile(rpm, rangpur.volunteerId);
    expect(there.status).toBe(200);
    for (const key of IDENTITY) expect(there.body.data, key).not.toHaveProperty(key);
    // the rest of the profile is there
    expect(there.body.data).toMatchObject({
      id: rangpur.volunteerId,
      fatherName: expect.any(String),
    });
  });

  it('reach the Monitoring Team everywhere and never an Official দায়ী', async () => {
    const rangpur = await someone(world.rangpur);
    const monitoring = await as(world.users.monitoring);
    expect((await profile(monitoring, rangpur.volunteerId)).body.data).toMatchObject({
      nid: expect.any(String),
      bank: { bankName: 'Sample Bank' },
    });
    const daee = await staff('official_daee');
    const seen = (await profile(daee, rangpur.volunteerId)).body.data;
    for (const key of IDENTITY) expect(seen, key).not.toHaveProperty(key);
  });

  it('send the category, the ratings and the blocklist reason only with their classes', async () => {
    const rated = await someone(world.dhaka, 'active', { category: 'B' });
    await h.db.query(
      `INSERT INTO volunteer_ratings (id, project_id, volunteer_id, work_kind, final_scores, finalized_by, finalized_at)
       VALUES ($1, $2, $3, 'application_distribution', '{"timeliness": 4}', $4, now())`,
      [randomUUID(), world.a1.id, rated.volunteerId, world.users.rpmDhaka],
    );
    await h.db.query(
      `INSERT INTO blocklist (id, subject_type, subject_id, reason, blocked_by) VALUES ($1, 'volunteer', $2, 'Sample reason', $3)`,
      [randomUUID(), rated.volunteerId, world.users.rpmDhaka],
    );
    const rpm = await as(world.users.rpmDhaka);
    expect((await profile(rpm, rated.volunteerId)).body.data).toMatchObject({
      category: 'B',
      inactiveFlag: false,
      ratings: [
        {
          projectId: world.a1.id,
          workKind: 'application_distribution',
          finalScores: { timeliness: 4 },
          finalizedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        },
      ],
      blocklist: { blocked: true, reason: 'Sample reason', blockedAt: expect.any(String) },
    });
    const implementer = await staff('implementer');
    const masked = (await profile(implementer, rated.volunteerId)).body.data;
    for (const key of ['category', 'inactiveFlag', 'ratings'])
      expect(masked, key).not.toHaveProperty(key);
    expect(masked.blocklist).toEqual({ blocked: true, blockedAt: expect.any(String) });
  });
});

describe('the sections of a volunteer profile', () => {
  it('lists the active projects and the team with name, type and state only', async () => {
    const lead = await someone(world.dhaka);
    const member = await someone(world.dhaka, 'pending', {
      type: 'team_member',
      reference_volunteer_id: lead.volunteerId,
    });
    const head = await as(world.users.head);
    const data = (await profile(head, lead.volunteerId)).body.data;
    expect(data.team).toEqual([
      {
        id: member.volunteerId,
        displayName: expect.any(String),
        type: 'team_member',
        state: 'pending',
      },
    ]);
    const general = await volunteerIdOf(world.users.general);
    const projects = (await profile(head, general)).body.data.projects;
    expect(projects.map((p: { id: string }) => p.id).sort()).toEqual(
      [world.a1.id, world.a2.id].sort(),
    );
    expect(projects[0]).toMatchObject({ permissionSet: expect.any(String), isPaid: false });
  });
});

describe('the action flags of a volunteer profile', () => {
  it('allow approve and correction on a pending volunteer in scope only', async () => {
    const pending = await someone(world.dhaka, 'pending');
    const elsewhere = await someone(world.rangpur, 'pending');
    const rpm = await as(world.users.rpmDhaka);
    expect((await profile(rpm, pending.volunteerId)).body.data.actions).toMatchObject({
      approve: true,
      requestCorrection: true,
      unblock: false,
    });
    expect((await profile(rpm, elsewhere.volunteerId)).body.data.actions).toMatchObject({
      approve: false,
      requestCorrection: false,
      block: false,
    });
    const active = await someone(world.dhaka);
    expect((await profile(rpm, active.volunteerId)).body.data.actions).toMatchObject({
      approve: false,
      block: true,
    });
  });

  it('allow unblock only on a blocked volunteer, and sessions where the session permission reaches', async () => {
    const blocked = await someone(world.dhaka);
    await h.db.query(
      `INSERT INTO blocklist (id, subject_type, subject_id, reason, blocked_by) VALUES ($1, 'volunteer', $2, 'Reason', $3)`,
      [randomUUID(), blocked.volunteerId, world.users.rpmDhaka],
    );
    const rpm = await as(world.users.rpmDhaka);
    expect((await profile(rpm, blocked.volunteerId)).body.data.actions).toMatchObject({
      block: false,
      unblock: true,
    });
    // the RPM's session permission reaches the volunteers on its projects in its region
    const general = await volunteerIdOf(world.users.general);
    const flags = (await profile(rpm, general)).body.data.actions;
    expect(flags).toMatchObject({ viewSessions: true, revokeSessions: true });
    expect(
      (await api().get(`/api/v1/users/${world.users.general}/sessions`).set(bearer(rpm))).status,
    ).toBe(200);
    const rangpur = await volunteerIdOf(world.users.rangpurVolunteer);
    expect((await profile(rpm, rangpur)).body.data.actions.viewSessions).toBe(false);
    expect(
      (await api().get(`/api/v1/users/${world.users.rangpurVolunteer}/sessions`).set(bearer(rpm)))
        .status,
    ).toBe(404);
  });

  it('do not offer approval of a blocklisted registration or one with a correction pending', async () => {
    const rpm = await as(world.users.rpmDhaka);
    const blocked = await someone(world.dhaka, 'pending');
    await h.db.query(
      `INSERT INTO blocklist (id, subject_type, subject_id, reason, blocked_by) VALUES ($1, 'volunteer', $2, 'Reason', $3)`,
      [randomUUID(), blocked.volunteerId, world.users.rpmDhaka],
    );
    expect((await profile(rpm, blocked.volunteerId)).body.data.actions).toMatchObject({
      approve: false,
      requestCorrection: true,
    });
    const correcting = await someone(world.dhaka, 'pending');
    await h.db.query(
      `INSERT INTO volunteer_change_requests (id, volunteer_id, kind, field, status, requested_by)
       VALUES ($1, $2, 'registration_correction', 'name', 'open', $3)`,
      [randomUUID(), correcting.volunteerId, world.users.rpmDhaka],
    );
    expect((await profile(rpm, correcting.volunteerId)).body.data.actions).toMatchObject({
      // still the RPM's to decide: the review stays open with approval held back
      review: true,
      approve: false,
      requestCorrection: false,
    });
  });

  it('are all false for an Official দায়ী', async () => {
    const pending = await someone(world.dhaka, 'pending');
    const daee = await staff('official_daee');
    expect((await profile(daee, pending.volunteerId)).body.data.actions).toEqual({
      review: false,
      approve: false,
      requestCorrection: false,
      block: false,
      unblock: false,
      viewSessions: false,
      revokeSessions: false,
    });
  });
});

describe('access to a volunteer profile', () => {
  it('answers 404 for an unknown id, 422 for a bad one, 403 to a volunteer and 401 without a sign-in', async () => {
    const head = await as(world.users.head);
    const unknown = await profile(head, randomUUID());
    expect(unknown.status).toBe(404);
    expect(unknown.headers['cache-control']).toBe('no-store');
    expect((await profile(head, 'me-or-not')).status).toBe(422);
    const target = await someone(world.dhaka);
    const volunteer = await as(world.users.general);
    expect((await profile(volunteer, target.volunteerId)).status).toBe(403);
    expect((await profile(null, target.volunteerId)).status).toBe(401);
  });
});
