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
import { notificationsOf } from './support/notifications';
import * as f from './support/fixtures';

// Volunteers assigned to a project by the RPM of their area, with a permission set and a paid flag;
// an executive assigns only with the RPM's grant (plan
// docs/plans/2026-10-17-0905-feat-templates-consent-assignment-plan.md).
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
let otherDistrict: string;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
const at = (s: Session, method: 'get' | 'post' | 'patch', path: string) =>
  api()[method](`/api/v1${path}`).set(bearer(s));

beforeAll(async () => {
  h = await authHarness();
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
  // a second district of the Dhaka division, for the district filter
  otherDistrict = await f.insert(h.db, 'locations', {
    id: randomUUID(),
    parent_id: world.dhaka.division,
    level: 'district',
    kind: 'district',
    code: `T-d-${randomUUID().slice(0, 8)}`,
    name_bn: 'অন্য জেলা',
    name_en: 'Other district',
  });
});
afterAll(async () => h.close());

/** A volunteer with a login in an area; `state` is the account state. */
async function someone(
  tree: { division: string; district: string; upazila?: string; union?: string },
  over: { type?: string; state?: string; name?: string } = {},
) {
  const type = over.type ?? 'general';
  const a = await account(h.db, { kind: 'volunteer', role: `volunteer_${type}` });
  accounts.set(a.id, a);
  if (over.state) await h.db.query('UPDATE users SET state = $1 WHERE id = $2', [over.state, a.id]);
  if (over.name)
    await h.db.query('UPDATE users SET display_name = $1 WHERE id = $2', [over.name, a.id]);
  const volunteerId = await f.volunteer(h.db, world.dhaka, a.id, {
    type,
    division_id: tree.division,
    district_id: tree.district,
    // the address columns are required; the other district borrows the Dhaka upazila
    upazila_id: tree.upazila ?? world.dhaka.upazila,
    union_id: tree.union ?? world.dhaka.union,
  });
  return { userId: a.id, volunteerId };
}
const assign = (s: Session, projectId: string, volunteers: Record<string, unknown>[]) =>
  at(s, 'post', `/projects/${projectId}/volunteers`).send({ volunteers });
const candidates = async (s: Session, projectId: string, query: Record<string, string> = {}) => {
  const res = await at(s, 'get', `/projects/${projectId}/volunteer-candidates`).query({
    limit: 50,
    ...query,
  });
  expect(res.status).toBe(200);
  return (res.body.data as { volunteerId: string }[]).map((c) => c.volunteerId);
};
async function audit(entityId: string, action: string) {
  const { rows } = await h.db.query(
    'SELECT new FROM audit_log WHERE entity_id = $1 AND action = $2',
    [entityId, action],
  );
  return rows;
}

describe('the volunteers an RPM may assign', () => {
  it('are the approved, not blocked volunteers of the RPM areas, filtered and searched', async () => {
    const rpm = await as(world.users.rpmDhaka);
    const near = await someone(world.dhaka, { name: 'করিম উদ্দিন' });
    const elsewhere = await someone({ division: world.dhaka.division, district: otherDistrict });
    const far = await someone(world.rangpur);
    const pending = await someone(world.dhaka, { state: 'pending' });
    const blocked = await someone(world.dhaka);
    await h.db.query(
      `INSERT INTO blocklist (id, subject_type, subject_id, reason, blocked_by) VALUES ($1, 'volunteer', $2, 'Test block', $3)`,
      [randomUUID(), blocked.volunteerId, world.users.rpmDhaka],
    );
    const member = await someone(world.dhaka, { type: 'team_member' });

    const all = await candidates(rpm, world.a1.id);
    expect(all).toEqual(expect.arrayContaining([near.volunteerId, elsewhere.volunteerId]));
    for (const not of [far, pending, blocked, member]) expect(all).not.toContain(not.volunteerId);
    const district = await candidates(rpm, world.a1.id, { districtId: world.dhaka.district });
    expect(district).toContain(near.volunteerId);
    expect(district).not.toContain(elsewhere.volunteerId);
    expect(await candidates(rpm, world.a1.id, { q: 'করিম' })).toEqual([near.volunteerId]);
    // the Rangpur RPM sees the Rangpur volunteer and not the Dhaka one
    const rangpur = await candidates(await as(world.users.rpmRangpur), world.a1.id);
    expect(rangpur).toContain(far.volunteerId);
    expect(rangpur).not.toContain(near.volunteerId);
  });

  it('carry only the name, type and area', async () => {
    const rpm = await as(world.users.rpmDhaka);
    await someone(world.dhaka);
    const res = await at(rpm, 'get', `/projects/${world.a1.id}/volunteer-candidates`);
    const keys = Object.keys(res.body.data[0] as object).sort();
    expect(keys).toEqual(
      [
        'defaultPermissionSet',
        'displayName',
        'districtId',
        'divisionId',
        'type',
        'unionId',
        'upazilaId',
        'volunteerId',
      ].sort(),
    );
  });
});

describe('assigning', () => {
  it('assigns several at once with the default set of each type, or a chosen one', async () => {
    const rpm = await as(world.users.rpmDhaka);
    const general = await someone(world.dhaka);
    const daee = await someone(world.dhaka, { type: 'local_daee' });
    const both = await someone(world.dhaka, { type: 'both' });
    const res = await assign(rpm, world.a1.id, [
      { volunteerId: general.volunteerId },
      { volunteerId: daee.volunteerId },
      { volunteerId: both.volunteerId, permissionSet: 'application_distribution', isPaid: true },
    ]);
    expect(res.status).toBe(201);
    const byVolunteer = new Map(
      (res.body.data as { volunteerId: string }[]).map((r) => [r.volunteerId, r]),
    );
    expect(byVolunteer.get(general.volunteerId)).toMatchObject({
      permissionSet: 'application_distribution',
      isPaid: false,
      consentStatus: 'pending',
      regionLocationId: world.dhaka.division,
    });
    expect(byVolunteer.get(daee.volunteerId)).toMatchObject({
      permissionSet: 'application_distribution_dawah',
    });
    expect(byVolunteer.get(both.volunteerId)).toMatchObject({
      permissionSet: 'application_distribution',
      isPaid: true,
    });
    expect(await audit(world.a1.id, 'volunteer.assigned')).not.toHaveLength(0);
    // each volunteer is told in the app; volunteers never get an email
    const { rows: users } = await h.db.query<{ user_id: string }>(
      'SELECT user_id FROM volunteers WHERE id = $1',
      [general.volunteerId],
    );
    const told = await notificationsOf(h.db, 'project_assignment', users[0]!.user_id);
    expect(told.map((n) => n.params.projectId)).toContain(world.a1.id);
    const emails = await h.db.query(
      `SELECT 1 FROM outbound_messages WHERE recipient_user_id = $1`,
      [users[0]!.user_id],
    );
    expect(emails.rowCount).toBe(0);
    const list = await at(rpm, 'get', `/projects/${world.a1.id}/volunteers`).query({ limit: 100 });
    expect(list.status).toBe(200);
    expect((list.body.data as { volunteerId: string }[]).map((r) => r.volunteerId)).toEqual(
      expect.arrayContaining([general.volunteerId, daee.volunteerId, both.volunteerId]),
    );
  });

  it('refuses a second assignment, a set the type cannot hold and a volunteer outside the areas', async () => {
    const rpm = await as(world.users.rpmDhaka);
    const general = await someone(world.dhaka);
    expect((await assign(rpm, world.a1.id, [{ volunteerId: general.volunteerId }])).status).toBe(
      201,
    );
    const again = await assign(rpm, world.a1.id, [{ volunteerId: general.volunteerId }]);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('volunteer.already_assigned');
    const other = await someone(world.dhaka);
    const dawah = await assign(rpm, world.a1.id, [
      { volunteerId: other.volunteerId, permissionSet: 'application_distribution_dawah' },
    ]);
    expect(dawah.status).toBe(422);
    const far = await someone(world.rangpur);
    expect((await assign(rpm, world.a1.id, [{ volunteerId: far.volunteerId }])).status).toBe(404);
    // nothing of a refused request is kept
    const { rows } = await h.db.query(
      'SELECT count(*)::int AS n FROM project_volunteers WHERE volunteer_id = $1',
      [other.volunteerId],
    );
    expect(rows[0].n).toBe(0);
  });

  it('puts the same volunteer on two projects with different sets', async () => {
    const rpm = await as(world.users.rpmDhaka);
    await h.db.query(
      'INSERT INTO project_areas (id, project_id, location_id, rpm_user_id) VALUES ($1, $2, $3, $4)',
      [randomUUID(), world.a2.id, world.dhaka.division, world.users.rpmDhaka],
    );
    const both = await someone(world.dhaka, { type: 'both' });
    expect(
      (
        await assign(rpm, world.a1.id, [
          { volunteerId: both.volunteerId, permissionSet: 'application_distribution' },
        ])
      ).status,
    ).toBe(201);
    const second = await assign(rpm, world.a2.id, [{ volunteerId: both.volunteerId }]);
    expect(second.status).toBe(201);
    expect(second.body.data[0].permissionSet).toBe('application_distribution_dawah');
  });

  it('refuses a volunteer who is on a team of the project', async () => {
    const rpm = await as(world.users.rpmDhaka);
    const lead = await someone(world.dhaka);
    const member = await someone(world.dhaka);
    expect((await assign(rpm, world.a1.id, [{ volunteerId: lead.volunteerId }])).status).toBe(201);
    await h.db.query(
      'INSERT INTO volunteer_teams (id, project_id, lead_volunteer_id, member_volunteer_id) VALUES ($1, $2, $3, $4)',
      [randomUUID(), world.a1.id, lead.volunteerId, member.volunteerId],
    );
    const res = await assign(rpm, world.a1.id, [{ volunteerId: member.volunteerId }]);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('volunteer.on_team');
  });

  it('refuses a caller without the permission, and more than a hundred at once', async () => {
    const general = await someone(world.dhaka);
    const body = [{ volunteerId: general.volunteerId }];
    expect((await assign(await as(world.users.pm), world.a1.id, body)).status).toBe(403);
    expect((await assign(await as(world.users.general), world.a1.id, body)).status).toBe(403);
    const many = Array.from({ length: 101 }, () => ({ volunteerId: randomUUID() }));
    expect((await assign(await as(world.users.rpmDhaka), world.a1.id, many)).status).toBe(422);
  });
});

describe('an executive with the RPM grant', () => {
  it('assigns in the area of their access, never marks paid, never outside it', async () => {
    const rpm = await as(world.users.rpmDhaka);
    // without the grant the executive is refused
    const first = await someone(world.dhaka);
    expect(
      (
        await assign(await as(world.users.executive), world.a1.id, [
          { volunteerId: first.volunteerId },
        ])
      ).status,
    ).toBe(403);
    const grant = await at(rpm, 'post', `/projects/${world.a1.id}/grants`).send({
      userId: world.users.executive,
      permissions: ['application.approve', 'volunteer.assign_project'],
      reason: 'সহায়তার জন্য',
    });
    expect(grant.status).toBe(200);
    const executive = await as(world.users.executive);
    const near = await someone(world.dhaka);
    expect((await assign(executive, world.a1.id, [{ volunteerId: near.volunteerId }])).status).toBe(
      201,
    );
    const paid = await someone(world.dhaka);
    expect(
      (await assign(executive, world.a1.id, [{ volunteerId: paid.volunteerId, isPaid: true }]))
        .status,
    ).toBe(403);
    const far = await someone(world.rangpur);
    expect((await assign(executive, world.a1.id, [{ volunteerId: far.volunteerId }])).status).toBe(
      404,
    );
  });
});

describe('changing and ending an assignment', () => {
  async function assigned() {
    const rpm = await as(world.users.rpmDhaka);
    const v = await someone(world.dhaka, { type: 'both' });
    const res = await assign(rpm, world.a1.id, [{ volunteerId: v.volunteerId }]);
    expect(res.status).toBe(201);
    return { ...v, assignmentId: res.body.data[0].id as string, rpm };
  }

  it('changes the set and the paid flag inside the caller areas', async () => {
    const a = await assigned();
    const changed = await at(a.rpm, 'patch', `/project-volunteers/${a.assignmentId}`).send({
      permissionSet: 'application_distribution',
      isPaid: true,
    });
    expect(changed.status).toBe(200);
    expect(changed.body.data).toMatchObject({
      permissionSet: 'application_distribution',
      isPaid: true,
    });
    expect(
      (
        await at(a.rpm, 'patch', `/project-volunteers/${a.assignmentId}`).send({
          permissionSet: 'work_progress',
        })
      ).status,
    ).toBe(422);
    const rangpur = await as(world.users.rpmRangpur);
    expect(
      (await at(rangpur, 'patch', `/project-volunteers/${a.assignmentId}`).send({ isPaid: false }))
        .status,
    ).toBe(404);
    expect(await audit(world.a1.id, 'volunteer.assignment_changed')).not.toHaveLength(0);
  });

  it('ends with a reason: the volunteer and their team lose the project, the record stays', async () => {
    const a = await assigned();
    const member = await someone(world.dhaka);
    const team = randomUUID();
    await h.db.query(
      `INSERT INTO volunteer_teams (id, project_id, lead_volunteer_id, member_volunteer_id, consent_status) VALUES ($1, $2, $3, $4, 'accepted')`,
      [team, world.a1.id, a.volunteerId, member.volunteerId],
    );
    await h.db.query(`UPDATE project_volunteers SET consent_status = 'accepted' WHERE id = $1`, [
      a.assignmentId,
    ]);
    // a volunteer sees a running project only
    await h.db.query(`UPDATE projects SET status = 'active' WHERE id = $1`, [world.a1.id]);
    const volunteer = await as(a.userId);
    expect((await at(volunteer, 'get', `/projects/${world.a1.id}`)).status).toBe(200);

    const rangpur = await as(world.users.rpmRangpur);
    expect(
      (
        await at(rangpur, 'post', `/project-volunteers/${a.assignmentId}/end`).send({
          reason: 'অন্য এলাকা',
        })
      ).status,
    ).toBe(404);
    expect(
      (await at(a.rpm, 'post', `/project-volunteers/${a.assignmentId}/end`).send({})).status,
    ).toBe(422);
    const ended = await at(a.rpm, 'post', `/project-volunteers/${a.assignmentId}/end`).send({
      reason: 'কাজ শেষ',
    });
    expect(ended.status).toBe(204);
    // with no other project the volunteer holds no project permission at all
    expect((await at(volunteer, 'get', `/projects/${world.a1.id}`)).status).toBe(403);
    const { rows } = await h.db.query(
      `SELECT pv.ended_at IS NOT NULL AS ended, vt.removed_at IS NOT NULL AS removed
       FROM project_volunteers pv, volunteer_teams vt WHERE pv.id = $1 AND vt.id = $2`,
      [a.assignmentId, team],
    );
    expect(rows[0]).toEqual({ ended: true, removed: true });
    const ends = await h.db.query<{ new: { assignmentId: string }; reason: string }>(
      `SELECT new, reason FROM audit_log WHERE entity_id = $1 AND action = 'volunteer.assignment_ended'`,
      [world.a1.id],
    );
    expect(ends.rows.find((r) => r.new.assignmentId === a.assignmentId)?.reason).toBe('কাজ শেষ');
    // ended once
    expect(
      (
        await at(a.rpm, 'post', `/project-volunteers/${a.assignmentId}/end`).send({
          reason: 'আবার',
        })
      ).status,
    ).toBe(404);
  });
});

describe('more of the rules', () => {
  it('lists the assignments of the caller areas only, and never for a volunteer', async () => {
    const rpm = await as(world.users.rpmDhaka);
    const v = await someone(world.dhaka);
    expect((await assign(rpm, world.a1.id, [{ volunteerId: v.volunteerId }])).status).toBe(201);
    const ids = async (s: Session) =>
      (
        (await at(s, 'get', `/projects/${world.a1.id}/volunteers`).query({ limit: 100 })).body
          .data as { volunteerId: string }[]
      ).map((r) => r.volunteerId);
    expect(await ids(rpm)).toContain(v.volunteerId);
    expect(await ids(await as(world.users.rpmRangpur))).not.toContain(v.volunteerId);
    expect(
      (await at(await as(v.userId), 'get', `/projects/${world.a1.id}/volunteers`)).status,
    ).toBe(403);
  });

  it('keeps an assignment with the area it was made in when the volunteer moves', async () => {
    const rpm = await as(world.users.rpmDhaka);
    const v = await someone(world.dhaka);
    const res = await assign(rpm, world.a1.id, [{ volunteerId: v.volunteerId }]);
    const id = res.body.data[0].id as string;
    await h.db.query(
      'UPDATE volunteers SET division_id = $1, district_id = $2, upazila_id = $3, union_id = $4 WHERE id = $5',
      [
        world.rangpur.division,
        world.rangpur.district,
        world.rangpur.upazila,
        world.rangpur.union,
        v.volunteerId,
      ],
    );
    const rangpur = await as(world.users.rpmRangpur);
    expect(
      (await at(rangpur, 'patch', `/project-volunteers/${id}`).send({ isPaid: true })).status,
    ).toBe(404);
    expect(
      (await at(rpm, 'patch', `/project-volunteers/${id}`).send({ isPaid: true })).status,
    ).toBe(200);
  });

  it('refuses a paid flag by a caller without the paid permission, also on a change', async () => {
    const rpm = await as(world.users.rpmDhaka);
    // the executive holds the assignment grant from the test above, never the paid permission
    await at(rpm, 'post', `/projects/${world.a1.id}/grants`).send({
      userId: world.users.executive,
      permissions: ['volunteer.assign_project'],
      reason: 'সহায়তার জন্য',
    });
    const executive = await as(world.users.executive);
    const v = await someone(world.dhaka);
    const res = await assign(executive, world.a1.id, [{ volunteerId: v.volunteerId }]);
    expect(res.status).toBe(201);
    const id = res.body.data[0].id as string;
    expect(
      (await at(executive, 'patch', `/project-volunteers/${id}`).send({ isPaid: true })).status,
    ).toBe(403);
    // the same value again is no change of the flag
    expect(
      (await at(executive, 'patch', `/project-volunteers/${id}`).send({ isPaid: false })).status,
    ).toBe(200);
  });

  it('searches by the exact mobile number', async () => {
    const rpm = await as(world.users.rpmDhaka);
    const v = await someone(world.dhaka);
    const { rows } = await h.db.query<{ mobile: string }>(
      'SELECT mobile FROM users WHERE id = $1',
      [v.userId],
    );
    expect(await candidates(rpm, world.a1.id, { q: rows[0]!.mobile })).toEqual([v.volunteerId]);
    expect(await candidates(rpm, world.a1.id, { q: '0123' })).toEqual([]);
  });

  it('assigns and changes nothing on a closing or closed project', async () => {
    const rpm = await as(world.users.rpmDhaka);
    const v = await someone(world.dhaka);
    const res = await assign(rpm, world.a2.id, [{ volunteerId: v.volunteerId }]);
    expect(res.status).toBe(201);
    await h.db.query(`UPDATE projects SET status = 'closed' WHERE id = $1`, [world.a2.id]);
    const other = await someone(world.dhaka);
    const refused = await assign(rpm, world.a2.id, [{ volunteerId: other.volunteerId }]);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('project.read_only');
    expect(
      (
        await at(rpm, 'patch', `/project-volunteers/${res.body.data[0].id as string}`).send({
          isPaid: true,
        })
      ).status,
    ).toBe(409);
  });
});
