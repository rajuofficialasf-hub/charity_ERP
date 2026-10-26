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

// Profile merges: an RPM proposes, a PM or a global role merges (from a proposal or directly) with
// the profile to keep and a reason; everything that points to the retired profile moves to the kept
// one, except an application past pending in a project both share; a block never lifts; the
// Monitoring Team or the Department Head reverts exactly what moved.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
type Tree = Awaited<ReturnType<typeof f.locationTree>>;
type Project = Awaited<ReturnType<typeof f.project>>;

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

const REASON = 'একই মানুষ, দুইবার নিবন্ধন হয়েছিল';
const person = (tree: Tree = world.dhaka, over: Record<string, unknown> = {}) =>
  f.beneficiary(h.db, tree, over);
const applyTo = (
  project: Project,
  beneficiaryId: string,
  status = 'approved',
  tree = world.dhaka,
) =>
  f.application(
    h.db,
    { project, loc: tree },
    {
      beneficiary_id: beneficiaryId,
      status,
      ...(status === 'deleted' ? { deleted_at: new Date() } : {}),
    },
  );
/** Two profiles of one person, both applicants of program P (so its PM reaches them). */
async function duplicate() {
  const kept = await person();
  const retired = await person();
  await applyTo(world.a1, kept);
  await applyTo(world.a2, retired);
  return { kept, retired };
}
const propose = (s: Session, body: Record<string, unknown>) =>
  api().post('/api/v1/beneficiary-merges').set(bearer(s)).send(body);
const execute = (s: Session, id: string, body: Record<string, unknown> = {}) =>
  api().post(`/api/v1/beneficiary-merges/${id}/execute`).set(bearer(s)).send(body);
const direct = (s: Session, body: Record<string, unknown>) =>
  api().post('/api/v1/beneficiary-merges/direct').set(bearer(s)).send(body);
const revert = (s: Session, id: string, reason = 'ভুল করে মার্জ হয়েছিল') =>
  api().post(`/api/v1/beneficiary-merges/${id}/revert`).set(bearer(s)).send({ reason });
const ownerOf = async (table: string, id: string) =>
  (await h.db.query(`SELECT beneficiary_id FROM ${table} WHERE id = $1`, [id])).rows[0]
    .beneficiary_id as string;
const pointer = async (id: string) =>
  (await h.db.query('SELECT merged_into_id, is_blocked FROM beneficiaries WHERE id = $1', [id]))
    .rows[0] as { merged_into_id: string | null; is_blocked: boolean };
const block = (id: string, reason = 'যাচাই চলছে') =>
  h.db.query(
    `INSERT INTO blocklist (id, subject_type, subject_id, reason, blocked_by) VALUES ($1, 'beneficiary', $2, $3, $4)`,
    [randomUUID(), id, reason, world.users.rpmDhaka],
  );
const activeBlockReason = async (id: string) =>
  (
    await h.db.query(
      `SELECT reason FROM blocklist WHERE subject_type = 'beneficiary' AND subject_id = $1 AND active`,
      [id],
    )
  ).rows.map((r) => r.reason as string);

/** One row of every kind a merge moves, all on the given profile. */
async function belongings(beneficiaryId: string) {
  const family = await f.insert(h.db, 'beneficiary_family_members', {
    id: randomUUID(),
    beneficiary_id: beneficiaryId,
    name: 'পরিবারের সদস্য',
  });
  const call = await f.insert(h.db, 'call_logs', {
    id: randomUUID(),
    beneficiary_id: beneficiaryId,
    called_by: world.users.rpmDhaka,
    called_at: new Date(),
  });
  const followup = await f.insert(h.db, 'followup_evaluations', {
    id: randomUUID(),
    beneficiary_id: beneficiaryId,
    evaluated_by: world.users.rpmDhaka,
    evaluated_at: new Date(),
    method: 'phone',
  });
  const file = await f.insert(h.db, 'files', {
    id: randomUUID(),
    bucket: 'photos',
    object_key: `merge/${randomUUID()}.jpg`,
    kind: 'profile_photo',
    mime: 'image/jpeg',
    size_bytes: 10,
    sha256: randomUUID().replace(/-/g, '').padEnd(64, '0'),
    source: 'camera',
  });
  const link = await f.insert(h.db, 'file_links', {
    id: randomUUID(),
    file_id: file,
    entity_type: 'beneficiary',
    entity_id: beneficiaryId,
    slot: 'photo',
  });
  // a media referral of the profile's application follows the profile
  const app = (
    await h.db.query('SELECT id, project_id FROM applications WHERE beneficiary_id = $1', [
      beneficiaryId,
    ])
  ).rows[0] as { id: string; project_id: string };
  const referral = await f.insert(h.db, 'media_referrals', {
    id: randomUUID(),
    application_id: app.id,
    beneficiary_id: beneficiaryId,
    project_id: app.project_id,
    referred_by: world.users.rpmDhaka,
    priority: 'normal',
    note: 'নোট',
  });
  return { family, call, followup, link, referral };
}
const linkOwner = async (id: string) =>
  (await h.db.query('SELECT entity_id FROM file_links WHERE id = $1', [id])).rows[0]
    .entity_id as string;

describe('a merge proposed by an RPM and carried out by the PM', () => {
  it('moves everything of the retired profile to the kept one, and its numbers lead there', async () => {
    const { kept, retired } = await duplicate();
    const things = await belongings(retired);
    const app = (
      await h.db.query('SELECT id FROM applications WHERE beneficiary_id = $1', [retired])
    ).rows[0].id as string;
    const proposed = await propose(await as(world.users.rpmDhaka), {
      keptId: kept,
      mergedId: retired,
      reason: REASON,
    });
    expect(proposed.status).toBe(201);
    expect(proposed.body.data).toMatchObject({
      status: 'proposed',
      keptId: kept,
      mergedId: retired,
    });
    const done = await execute(await as(world.users.pm), proposed.body.data.id);
    expect(done.status).toBe(200);
    expect(done.body.data.status).toBe('merged');
    expect(await ownerOf('applications', app)).toBe(kept);
    expect(await ownerOf('beneficiary_family_members', things.family)).toBe(kept);
    expect(await ownerOf('call_logs', things.call)).toBe(kept);
    expect(await ownerOf('followup_evaluations', things.followup)).toBe(kept);
    expect(await linkOwner(things.link)).toBe(kept);
    expect(await ownerOf('media_referrals', things.referral)).toBe(kept);
    expect((await pointer(retired)).merged_into_id).toBe(kept);
    const live = await h.container.prisma.$transaction((tx) =>
      h.container.beneficiaryIdentity.liveOf(tx, retired),
    );
    expect(live).toBe(kept);
    const audits = await h.db.query(
      `SELECT action FROM audit_log WHERE entity_type = 'beneficiary' AND entity_id = $1 AND action LIKE 'beneficiary.merge%' ORDER BY created_at`,
      [kept],
    );
    expect(audits.rows.map((r) => r.action)).toEqual([
      'beneficiary.merge_proposed',
      'beneficiary.merge',
    ]);
  });

  it('lets the merging official keep the other profile of the proposal', async () => {
    const { kept, retired } = await duplicate();
    const proposed = await propose(await as(world.users.rpmDhaka), {
      keptId: kept,
      mergedId: retired,
      reason: REASON,
    });
    const done = await execute(await as(world.users.pm), proposed.body.data.id, {
      keptId: retired,
    });
    expect(done.body.data).toMatchObject({ keptId: retired, mergedId: kept });
    expect((await pointer(kept)).merged_into_id).toBe(retired);
  });

  it('lets the Department Head merge without a proposal, with the ids in any case', async () => {
    const { kept, retired } = await duplicate();
    const done = await direct(await as(world.users.head), {
      keptId: kept.toUpperCase(),
      mergedId: retired.toUpperCase(),
      reason: REASON,
    });
    expect(done.status).toBe(201);
    expect(done.body.data).toMatchObject({ status: 'merged', proposedBy: world.users.head });
  });

  it('shows the PM the proposals of the program', async () => {
    const { kept, retired } = await duplicate();
    const proposed = await propose(await as(world.users.rpmDhaka), {
      keptId: kept,
      mergedId: retired,
      reason: REASON,
    });
    const listed = await api()
      .get('/api/v1/beneficiary-merges')
      .query({ status: 'proposed' })
      .set(bearer(await as(world.users.pm)));
    expect(listed.status).toBe(200);
    expect((listed.body.data as { id: string }[]).map((m) => m.id)).toContain(
      proposed.body.data.id,
    );
  });
});

describe('what stops a merge', () => {
  it("stops at the retired profile's pending application in a project both applied to", async () => {
    const { kept, retired } = await duplicate();
    await applyTo(world.a1, retired, 'submitted');
    const res = await direct(await as(world.users.head), {
      keptId: kept,
      mergedId: retired,
      reason: REASON,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('beneficiary.merge_conflict');
    expect(res.body.error.details[0].params).toMatchObject({ projectId: world.a1.id });
    expect((await pointer(retired)).merged_into_id).toBeNull();
  });

  it('leaves an application past pending on the retired profile, and the revert keeps it there', async () => {
    const { kept, retired } = await duplicate();
    const rejected = await applyTo(world.a1, retired, 'rejected');
    const res = await direct(await as(world.users.head), {
      keptId: kept,
      mergedId: retired,
      reason: REASON,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.leftBehind).toBe(1);
    expect(await ownerOf('applications', rejected)).toBe(retired);
    await revert(await as(world.users.monitoring), res.body.data.id).expect(200);
    expect(await ownerOf('applications', rejected)).toBe(retired);
  });

  it('refuses a second carrying out, and a proposal whose profile was merged meanwhile', async () => {
    const { kept, retired } = await duplicate();
    const third = await person();
    const rpm = await as(world.users.rpmDhaka);
    const first = await propose(rpm, { keptId: kept, mergedId: retired, reason: REASON });
    const other = await propose(rpm, { keptId: third, mergedId: retired, reason: REASON });
    const pm = await as(world.users.pm);
    await execute(pm, first.body.data.id).expect(200);
    // the retired profile's applications moved, so it left the PM's program: a global role asks again
    const again = await execute(await as(world.users.head), first.body.data.id);
    expect(again.status).toBe(409);
    const stale = await execute(await as(world.users.head), other.body.data.id);
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('beneficiary.merge_stale');
  });

  it('refuses a pair with a profile outside the scope, without naming it', async () => {
    const dhaka = await person();
    const rangpur = await person(world.rangpur);
    const res = await propose(await as(world.users.rpmDhaka), {
      keptId: dhaka,
      mergedId: rangpur,
      reason: REASON,
    });
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain(rangpur);
  });

  it("leaves a merge that moves another program's application to the global roles", async () => {
    const { kept, retired } = await duplicate();
    await applyTo(world.b1, retired);
    const body = { keptId: kept, mergedId: retired, reason: REASON };
    const pm = await direct(await as(world.users.pm), body);
    expect(pm.status).toBe(403);
    expect(pm.body.error.code).toBe('beneficiary.merge_needs_global');
    expect((await pointer(retired)).merged_into_id).toBeNull();
    expect((await direct(await as(world.users.monitoring), body)).status).toBe(201);
  });

  it('refuses the PM of another program, an RPM carrying out, and a PM reverting', async () => {
    const { kept, retired } = await duplicate();
    const proposed = await propose(await as(world.users.rpmDhaka), {
      keptId: kept,
      mergedId: retired,
      reason: REASON,
    });
    const otherPm = await account(h.db, { role: 'program_manager' });
    await h.db.query(
      'UPDATE programs SET pm_user_id = $1 WHERE id = (SELECT program_id FROM projects WHERE id = $2)',
      [otherPm.id, world.b1.id],
    );
    expect((await execute(await login(h, otherPm), proposed.body.data.id)).status).toBe(404);
    expect((await execute(await as(world.users.rpmDhaka), proposed.body.data.id)).status).toBe(403);
    const done = await execute(await as(world.users.pm), proposed.body.data.id);
    expect((await revert(await as(world.users.pm), done.body.data.id)).status).toBe(403);
    expect(
      (
        await direct(await as(world.users.rpmDhaka), {
          keptId: kept,
          mergedId: retired,
          reason: REASON,
        })
      ).status,
    ).toBe(403);
  });

  it('stops at a file linked to both profiles in the same slot', async () => {
    const { kept, retired } = await duplicate();
    const things = await belongings(retired);
    const file = (await h.db.query('SELECT file_id FROM file_links WHERE id = $1', [things.link]))
      .rows[0].file_id as string;
    await f.insert(h.db, 'file_links', {
      id: randomUUID(),
      file_id: file,
      entity_type: 'beneficiary',
      entity_id: kept,
      slot: 'photo',
    });
    const res = await direct(await as(world.users.head), {
      keptId: kept,
      mergedId: retired,
      reason: REASON,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('beneficiary.merge_conflict');
    expect(res.body.error.details[0].path).toMatch(/^file_links\./);
    expect(await linkOwner(things.link)).toBe(retired);
  });

  it("refuses to bring a volunteer's application onto a profile with that volunteer's mobile", async () => {
    const own = accounts.get(world.users.general)!.mobile;
    const kept = await person(world.dhaka, { mobile: own });
    await applyTo(world.a1, kept);
    const retired = await person();
    const volunteer = (
      await h.db.query('SELECT id FROM volunteers WHERE user_id = $1', [world.users.general])
    ).rows[0].id as string;
    await f.application(
      h.db,
      { project: world.a2, loc: world.dhaka },
      { beneficiary_id: retired, owner_volunteer_id: volunteer },
    );
    const res = await direct(await as(world.users.head), {
      keptId: kept,
      mergedId: retired,
      reason: REASON,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('beneficiary.mobile_is_volunteer_mobile');
    expect((await pointer(retired)).merged_into_id).toBeNull();
  });

  it('refuses a second open proposal of the same pair, a kept profile outside the pair, and no login', async () => {
    const { kept, retired } = await duplicate();
    const rpm = await as(world.users.rpmDhaka);
    const first = await propose(rpm, { keptId: kept, mergedId: retired, reason: REASON });
    expect((await propose(rpm, { keptId: retired, mergedId: kept, reason: REASON })).status).toBe(
      409,
    );
    const outsider = await person();
    const wrong = await execute(await as(world.users.head), first.body.data.id, {
      keptId: outsider,
    });
    expect(wrong.status).toBe(422);
    expect(
      (
        await api()
          .post('/api/v1/beneficiary-merges')
          .send({ keptId: kept, mergedId: retired, reason: REASON })
      ).status,
    ).toBe(401);
    const upper = await execute(await as(world.users.head), first.body.data.id, {
      keptId: retired.toUpperCase(),
    });
    expect(upper.status).toBe(200);
    expect(upper.body.data.keptId).toBe(retired);
  });

  it('keeps showing the PM a merge after the retired profile left the program', async () => {
    const { kept, retired } = await duplicate();
    const done = await direct(await as(world.users.head), {
      keptId: kept,
      mergedId: retired,
      reason: REASON,
    });
    const listed = await api()
      .get('/api/v1/beneficiary-merges')
      .query({ status: 'merged' })
      .set(bearer(await as(world.users.pm)));
    expect((listed.body.data as { id: string }[]).map((m) => m.id)).toContain(done.body.data.id);
  });

  it('rejects a waiting correction of the retired profile', async () => {
    const { kept, retired } = await duplicate();
    const asked = await api()
      .post(`/api/v1/beneficiaries/${retired}/correction-requests`)
      .set(bearer(await as(world.users.rpmDhaka)))
      .send({ field: 'name', newValue: 'অন্য বানানের নাম', reason: 'বানান ঠিক করা দরকার' })
      .expect(201);
    await direct(await as(world.users.head), {
      keptId: kept,
      mergedId: retired,
      reason: REASON,
    }).expect(201);
    const row = await h.db.query('SELECT status FROM profile_correction_requests WHERE id = $1', [
      asked.body.data.id,
    ]);
    expect(row.rows[0].status).toBe('rejected');
  });
});

describe('a merge never lifts a block', () => {
  it('moves the block of the retired profile to the kept one, and back on a revert', async () => {
    const { kept, retired } = await duplicate();
    await block(retired, 'বারবার আবেদন');
    const done = await direct(await as(world.users.head), {
      keptId: kept,
      mergedId: retired,
      reason: REASON,
    });
    expect((await pointer(kept)).is_blocked).toBe(true);
    expect(await activeBlockReason(kept)).toEqual(['বারবার আবেদন']);
    await revert(await as(world.users.head), done.body.data.id).expect(200);
    expect((await pointer(kept)).is_blocked).toBe(false);
    expect((await pointer(retired)).is_blocked).toBe(true);
    expect(await activeBlockReason(retired)).toEqual(['বারবার আবেদন']);
  });

  it('keeps the kept profile its own block when both are blocked, and restores both on a revert', async () => {
    const { kept, retired } = await duplicate();
    await block(kept, 'প্রথম কারণ');
    await block(retired, 'দ্বিতীয় কারণ');
    const done = await direct(await as(world.users.head), {
      keptId: kept,
      mergedId: retired,
      reason: REASON,
    });
    expect(await activeBlockReason(kept)).toEqual(['প্রথম কারণ']);
    expect(await activeBlockReason(retired)).toEqual([]);
    await revert(await as(world.users.monitoring), done.body.data.id).expect(200);
    expect(await activeBlockReason(kept)).toEqual(['প্রথম কারণ']);
    expect(await activeBlockReason(retired)).toEqual(['দ্বিতীয় কারণ']);
  });
});

describe('the revert', () => {
  it('moves back exactly what moved, and keeps what was added to the kept profile after', async () => {
    const { kept, retired } = await duplicate();
    const things = await belongings(retired);
    const done = await direct(await as(world.users.head), {
      keptId: kept,
      mergedId: retired,
      reason: REASON,
    });
    const later = await f.insert(h.db, 'call_logs', {
      id: randomUUID(),
      beneficiary_id: kept,
      called_by: world.users.rpmDhaka,
      called_at: new Date(),
    });
    const res = await revert(await as(world.users.monitoring), done.body.data.id);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('reverted');
    expect(await ownerOf('call_logs', things.call)).toBe(retired);
    expect(await ownerOf('beneficiary_family_members', things.family)).toBe(retired);
    expect(await linkOwner(things.link)).toBe(retired);
    expect(await ownerOf('media_referrals', things.referral)).toBe(retired);
    expect(await ownerOf('call_logs', later)).toBe(kept);
    expect((await pointer(retired)).merged_into_id).toBeNull();
    const audit = await h.db.query(
      `SELECT reason FROM audit_log WHERE action = 'beneficiary.merge_reverted' AND entity_id = $1`,
      [kept],
    );
    expect(audit.rows).toEqual([{ reason: 'ভুল করে মার্জ হয়েছিল' }]);
  });

  it('waits for a later merge of the kept profile to be reverted first', async () => {
    const { kept, retired } = await duplicate();
    const further = await person();
    await applyTo(world.a2, further);
    const head = await as(world.users.head);
    const first = await direct(head, { keptId: kept, mergedId: retired, reason: REASON });
    const second = await direct(head, { keptId: further, mergedId: kept, reason: REASON });
    const blocked = await revert(head, first.body.data.id);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('beneficiary.merge_revert_order');
    await revert(head, second.body.data.id).expect(200);
    await revert(head, first.body.data.id).expect(200);
  });

  it('refuses a second revert', async () => {
    const { kept, retired } = await duplicate();
    const head = await as(world.users.head);
    const done = await direct(head, { keptId: kept, mergedId: retired, reason: REASON });
    await revert(head, done.body.data.id).expect(200);
    expect((await revert(head, done.body.data.id)).status).toBe(409);
  });
});
