import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SeedContext } from '../../seed/context.js';
import { seedWorkflows } from '../../seed/sets/base/workflows.js';
import { ApiError } from '../../src/i18n/api-error.js';
import { assertWorkflowNamesKnown } from '../../src/workflow/registry.js';
import { mergedWorkflowDefinitions } from '../../src/workflow/templates.js';
import type { Principal } from '../../src/auth/principal.js';
import { accessWorld } from './support/access-fixtures.js';
import {
  applicationProject,
  applicationRow,
  IDENTITY_ANSWERS,
  principalOf,
  statusOf,
} from './support/applications.js';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
} from './support/auth-app.js';
import { beneficiary, fakeMobile, fakeNid } from './support/fixtures.js';

// The workflow engine on the common cycle: a move happens only through a transition of the
// project's snapshot, for a caller whose permission reaches the application, past every guard,
// with one audit entry per move.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);

let project: string;
let versionId: string;
let generalVolunteer: string;
let rangpurVolunteer: string;

beforeAll(async () => {
  h = await authHarness();
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
  await seedWorkflows(new SeedContext(h.container.prisma));
  // a project of this file's own, in the PM's program, with the form placed and the snapshot
  const made = await api()
    .post('/api/v1/projects')
    .set(bearer(await as(world.users.pm)))
    .send({
      programId: world.a1.program,
      code: 'WFE',
      year: 2026,
      name: { bn: 'ইঞ্জিন', en: 'Engine' },
      source: { kind: 'workflow', workflowKey: 'distribution' },
    });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  project = made.body.data.id as string;
  ({ versionId } = await applicationProject(h, await as(world.users.monitoring), project));
  const volunteers = await h.db.query<{ id: string; user_id: string }>(
    'SELECT id, user_id FROM volunteers WHERE user_id = ANY($1::uuid[])',
    [[world.users.general, world.users.rangpurVolunteer]],
  );
  generalVolunteer = volunteers.rows.find((v) => v.user_id === world.users.general)!.id;
  rangpurVolunteer = volunteers.rows.find((v) => v.user_id === world.users.rangpurVolunteer)!.id;
  await joinProject(project);
});

/** The Dhaka RPM and executive on the project's Dhaka area, and the general volunteer with consent. */
async function joinProject(projectId: string) {
  await h.db.query(
    `INSERT INTO project_areas (id, project_id, location_id, rpm_user_id) VALUES ($1, $2, $3, $4)`,
    [randomUUID(), projectId, world.dhaka.division, world.users.rpmDhaka],
  );
  await h.db.query(
    `INSERT INTO project_staff (id, project_id, user_id, role_key, area_location_id, extra_permissions, granted_by)
     VALUES ($1, $2, $3, 'project_executive', $4, '{}', $5)`,
    [randomUUID(), projectId, world.users.executive, world.dhaka.division, world.users.rpmDhaka],
  );
  await h.db.query(
    `INSERT INTO project_volunteers (id, project_id, volunteer_id, region_location_id, permission_set, extra_permissions, assigned_by, consent_status)
     VALUES ($1, $2, $3, $4, 'application_distribution', '{}', $5, 'accepted')`,
    [randomUUID(), projectId, generalVolunteer, world.dhaka.division, world.users.rpmDhaka],
  );
}

/** A project of the PM's program on the given workflow, with the form placed and the people on it. */
async function projectOn(workflowKey: string, code: string) {
  const made = await api()
    .post('/api/v1/projects')
    .set(bearer(await as(world.users.pm)))
    .send({
      programId: world.a1.program,
      code,
      year: 2026,
      name: { bn: 'ইঞ্জিন', en: 'Engine' },
      source: { kind: 'workflow', workflowKey },
    });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const id = made.body.data.id as string;
  const form = await applicationProject(h, await as(world.users.monitoring), id, {
    workflow: workflowKey,
  });
  await joinProject(id);
  return { id, versionId: form.versionId };
}
afterAll(async () => h.close());

const engine = () => h.container.workflow;
const principal = (userId: string) => principalOf(h.db, userId);
const draft = (over: Parameters<typeof applicationRow>[1]['over'] = {}, more = {}) =>
  applicationRow(h.db, {
    projectId: project,
    versionId,
    loc: world.dhaka,
    ownerVolunteerId: generalVolunteer,
    createdByUserId: world.users.general,
    answers: IDENTITY_ANSWERS(fakeNid(), fakeMobile(), world.dhaka),
    over,
    ...more,
  });

async function run(
  userId: string,
  id: string,
  action:
    | 'submit'
    | 'review'
    | 'send_for_approval'
    | 'approve'
    | 'reject'
    | 'delete'
    | 'return_to_review'
    | 'reject_unverified'
    | 'waitlist',
  input: { reason?: string; message?: string; comment?: string } = {},
) {
  const p: Principal = await principal(userId);
  return h.container.prisma.$transaction((tx) => engine().transition(tx, p, id, action, input));
}
async function refused(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    const e = error as ApiError;
    return { code: e.code, status: e.status };
  }
  throw new Error('expected a refusal');
}
async function auditOf(id: string) {
  const { rows } = await h.db.query<{
    action: string;
    old: unknown;
    new: unknown;
    reason: string | null;
    actor_user_id: string | null;
  }>(
    'SELECT action, old, new, reason, actor_user_id FROM audit_log WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at, id',
    ['application', id],
  );
  return rows;
}

describe('a move through the cycle', () => {
  it('submits a draft, records the actor and the states, and refuses the same move twice', async () => {
    const id = await draft();
    const result = await run(world.users.general, id, 'submit');
    expect(result).toMatchObject({ from: 'draft', to: 'submitted' });
    expect(await statusOf(h.db, id)).toBe('submitted');
    const row = await h.db.query(
      'SELECT submitted_by, submitted_at FROM applications WHERE id = $1',
      [id],
    );
    expect(row.rows[0].submitted_by).toBe(world.users.general);
    expect(row.rows[0].submitted_at).not.toBeNull();
    const audit = await auditOf(id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: 'application.submit',
      old: { status: 'draft' },
      new: expect.objectContaining({ status: 'submitted', action: 'submit' }),
      actor_user_id: world.users.general,
    });
    expect(await refused(run(world.users.general, id, 'submit'))).toEqual({
      code: 'workflow.transition_not_allowed',
      status: 409,
    });
  });

  it('runs review, approval and the automatic move into implementation, each audited', async () => {
    const id = await draft();
    await run(world.users.general, id, 'submit');
    await run(world.users.executive, id, 'review');
    expect(await statusOf(h.db, id)).toBe('under_review');
    await run(world.users.executive, id, 'send_for_approval');
    expect(await statusOf(h.db, id)).toBe('reviewed');
    const approved = await run(world.users.rpmDhaka, id, 'approve');
    expect(approved).toMatchObject({ from: 'reviewed', to: 'approved' });
    expect(await statusOf(h.db, id)).toBe('implementation');
    const actions = (await auditOf(id)).map((a) => a.action);
    expect(actions).toEqual([
      'application.submit',
      'application.review_started',
      'application.reviewed',
      'application.approve',
      'application.implementation_started',
    ]);
    const approval = (await auditOf(id))[3]!.new as { locked?: boolean; effectsPending?: string[] };
    // the approved answers are locked; the score freezes with the move, the quota and ledger
    // modules are not built yet
    expect(approval.locked).toBe(true);
    expect(approval.effectsPending).toEqual(
      expect.arrayContaining(['quota.increment', 'ledger.post:approved']),
    );
    expect(approval.effectsPending).not.toContain('score.snapshot');
  });

  it('rejects with the office reason and the volunteer message, and returns the rejection with a reason', async () => {
    const id = await draft();
    await run(world.users.general, id, 'submit');
    await run(world.users.executive, id, 'review');
    await run(world.users.executive, id, 'send_for_approval');
    expect(await refused(run(world.users.rpmDhaka, id, 'reject', { message: 'x' }))).toEqual({
      code: 'workflow.reason_required',
      status: 422,
    });
    expect(await refused(run(world.users.rpmDhaka, id, 'reject', { reason: 'x' }))).toEqual({
      code: 'workflow.message_required',
      status: 422,
    });
    await run(world.users.rpmDhaka, id, 'reject', {
      reason: 'আয় সীমার উপরে',
      message: 'এবার সম্ভব হলো না',
    });
    const row = await h.db.query(
      'SELECT status, decision_comment, rejection_message FROM applications WHERE id = $1',
      [id],
    );
    expect(row.rows[0]).toEqual({
      status: 'rejected',
      decision_comment: 'আয় সীমার উপরে',
      rejection_message: 'এবার সম্ভব হলো না',
    });
    const audit = await auditOf(id);
    expect(audit.at(-1)).toMatchObject({
      action: 'application.reject',
      reason: 'আয় সীমার উপরে',
      new: expect.objectContaining({ message: 'এবার সম্ভব হলো না' }),
    });
    expect(await refused(run(world.users.rpmDhaka, id, 'return_to_review'))).toEqual({
      code: 'workflow.reason_required',
      status: 422,
    });
    await run(world.users.rpmDhaka, id, 'return_to_review', { reason: 'ভুল করে বাতিল' });
    const back = await h.db.query(
      'SELECT status, decision_comment, rejection_message FROM applications WHERE id = $1',
      [id],
    );
    expect(back.rows[0]).toEqual({
      status: 'reviewed',
      decision_comment: 'ভুল করে বাতিল',
      rejection_message: null,
    });
    expect((await auditOf(id)).at(-1)).toMatchObject({ action: 'application.reopened' });
  });

  it('waitlists a reviewed application only with a reason, and stamps when it began to wait', async () => {
    const id = await draft();
    await run(world.users.general, id, 'submit');
    await run(world.users.executive, id, 'review');
    await run(world.users.executive, id, 'send_for_approval');
    expect(await refused(run(world.users.rpmDhaka, id, 'waitlist'))).toEqual({
      code: 'workflow.reason_required',
      status: 422,
    });
    await run(world.users.rpmDhaka, id, 'waitlist', { reason: 'কোটা পূর্ণ' });
    const row = await h.db.query<{ status: string; waited: boolean }>(
      'SELECT status, waitlisted_at IS NOT NULL AS waited FROM applications WHERE id = $1',
      [id],
    );
    expect(row.rows[0]).toEqual({ status: 'waitlisted', waited: true });
  });
});

describe('who may move', () => {
  it('refuses a caller without the permission (403) and one whose scope misses the application (404)', async () => {
    const id = await draft();
    // a volunteer holds no review permission; a team member holds no submit permission
    await run(world.users.general, id, 'submit');
    expect(await refused(run(world.users.general, id, 'review'))).toEqual({
      code: 'permission.denied',
      status: 403,
    });
    expect(await refused(run(world.users.team, id, 'delete'))).toEqual({
      code: 'permission.denied',
      status: 403,
    });
    // the Rangpur RPM holds the review permission in another region
    expect(await refused(run(world.users.rpmRangpur, id, 'review'))).toEqual({
      code: 'permission.not_found',
      status: 404,
    });
    // the Dhaka RPM holds Dhaka on this project and on a1, not on b1: an application of b1 placed
    // in Dhaka stays hidden, whatever its state, and so does a move that state allows
    const elsewhere = await applicationRow(h.db, {
      projectId: world.b1.id,
      versionId,
      loc: world.dhaka,
      status: 'submitted',
      ownerVolunteerId: rangpurVolunteer,
    });
    expect(await refused(run(world.users.rpmDhaka, elsewhere, 'review'))).toEqual({
      code: 'permission.not_found',
      status: 404,
    });
    expect(await refused(run(world.users.rpmDhaka, elsewhere, 'approve'))).toEqual({
      code: 'permission.not_found',
      status: 404,
    });
    // another volunteer may submit, but not this one's draft
    const other = await draft(
      {},
      { ownerVolunteerId: rangpurVolunteer, createdByUserId: world.users.rangpurVolunteer },
    );
    expect(await refused(run(world.users.general, other, 'submit'))).toEqual({
      code: 'permission.not_found',
      status: 404,
    });
    // the global roles reach everything
    await run(world.users.monitoring, id, 'review');
    expect(await statusOf(h.db, id)).toBe('under_review');
  });

  it('refuses the decision of the official who brought the application, and lets them review it', async () => {
    const id = await applicationRow(h.db, {
      projectId: project,
      versionId,
      loc: world.dhaka,
      createdByUserId: world.users.rpmDhaka,
      answers: IDENTITY_ANSWERS(fakeNid(), fakeMobile(), world.dhaka),
    });
    await run(world.users.rpmDhaka, id, 'submit');
    await run(world.users.rpmDhaka, id, 'review');
    await run(world.users.rpmDhaka, id, 'send_for_approval');
    expect(await refused(run(world.users.rpmDhaka, id, 'approve'))).toEqual({
      code: 'workflow.guard.actor_not_creator',
      status: 409,
    });
    // the Department Head who submits one cannot approve it either; another approver can
    await run(world.users.monitoring, id, 'approve');
    expect(await statusOf(h.db, id)).toBe('implementation');
  });

  it('gives the final approval of house construction to the PM, and to no RPM', async () => {
    const construction = await projectOn('construction', 'WFC');
    const id = await applicationRow(h.db, {
      projectId: construction.id,
      versionId: construction.versionId,
      loc: world.dhaka,
      ownerVolunteerId: generalVolunteer,
      createdByUserId: world.users.general,
      answers: IDENTITY_ANSWERS(fakeNid(), fakeMobile(), world.dhaka),
    });
    await run(world.users.general, id, 'submit');
    await run(world.users.rpmDhaka, id, 'review');
    await run(world.users.rpmDhaka, id, 'send_for_approval');
    expect(await refused(run(world.users.rpmDhaka, id, 'approve'))).toEqual({
      code: 'workflow.guard.approver_has_permission',
      status: 409,
    });
    await run(world.users.pm, id, 'approve');
    expect(await statusOf(h.db, id)).toBe('implementation');
    // the PM's approval reaches construction projects only: a distribution application is hidden
    const distribution = await draft();
    await run(world.users.general, distribution, 'submit');
    await run(world.users.executive, distribution, 'review');
    await run(world.users.executive, distribution, 'send_for_approval');
    expect(await refused(run(world.users.pm, distribution, 'approve'))).toEqual({
      code: 'permission.not_found',
      status: 404,
    });
    await h.db.query(
      `UPDATE applications SET status = 'deleted', deleted_at = now() WHERE id = $1`,
      [distribution],
    );
  });
});

describe('the guards', () => {
  const refusal = async (id: string, userId: string, action: 'submit' | 'approve', guard: string) =>
    expect(await refused(run(userId, id, action))).toEqual({
      code: `workflow.guard.${guard}`,
      status: 409,
    });

  it('refuse a submission on a project that is not active, outside the window, over the limit', async () => {
    const id = await draft();
    await h.db.query(`UPDATE projects SET status = 'draft' WHERE id = $1`, [project]);
    try {
      await refusal(id, world.users.general, 'submit', 'project_active');
    } finally {
      await h.db.query(`UPDATE projects SET status = 'active' WHERE id = $1`, [project]);
    }
    await h.db.query(`UPDATE projects SET apply_to = '2026-01-02' WHERE id = $1`, [project]);
    try {
      await refusal(id, world.users.general, 'submit', 'deadline_open');
    } finally {
      await h.db.query(`UPDATE projects SET apply_to = '2099-12-31' WHERE id = $1`, [project]);
    }
    // a limit just below the owner's live applications refuses; a rejected one does not count
    const live = await h.db.query<{ n: string }>(
      `SELECT count(*) AS n FROM applications WHERE project_id = $1 AND owner_volunteer_id = $2
         AND id <> $3 AND status NOT IN ('rejected', 'deleted')`,
      [project, generalVolunteer, id],
    );
    const others = Number(live.rows[0]!.n);
    const a = await draft();
    await h.db.query(`UPDATE projects SET per_volunteer_limit = $2 WHERE id = $1`, [
      project,
      others + 1,
    ]);
    try {
      await refusal(id, world.users.general, 'submit', 'limit_not_exceeded');
      await h.db.query(`UPDATE applications SET status = 'rejected' WHERE id = $1`, [a]);
      await run(world.users.general, id, 'submit');
    } finally {
      await h.db.query(`UPDATE projects SET per_volunteer_limit = 50 WHERE id = $1`, [project]);
    }
    await h.db.query(
      `UPDATE applications SET status = 'deleted', deleted_at = now() WHERE id = ANY($1::uuid[])`,
      [[a, id]],
    );
  });

  it('refuse a submission without the identity number, with a required answer missing, for a blocked person or volunteer, or without consent', async () => {
    const noId = await draft(
      {},
      {
        answers: {
          ...IDENTITY_ANSWERS(fakeNid(), fakeMobile(), world.dhaka),
          q_id: { t: 'short_text', v: '12' },
        },
      },
    );
    await refusal(noId, world.users.general, 'submit', 'identity_present');
    const answers = IDENTITY_ANSWERS(fakeNid(), fakeMobile(), world.dhaka) as Record<
      string,
      unknown
    >;
    delete answers.q_village;
    const missing = await draft({}, { answers });
    await refusal(missing, world.users.general, 'submit', 'mandatory_fields_present');
    await h.db.query(
      `UPDATE applications SET status = 'deleted', deleted_at = now() WHERE id = ANY($1::uuid[])`,
      [[noId, missing]],
    );

    const blockedPerson = await beneficiary(h.db, world.dhaka, { is_blocked: true });
    const forBlocked = await draft({}, { beneficiaryId: blockedPerson });
    await refusal(forBlocked, world.users.general, 'submit', 'beneficiary_not_blocked');
    await h.db.query(
      `UPDATE applications SET status = 'deleted', deleted_at = now() WHERE id = $1`,
      [forBlocked],
    );

    const id = await draft();
    await h.db.query(
      `INSERT INTO blocklist (id, subject_type, subject_id, reason, blocked_by) VALUES ($1, 'volunteer', $2, 'test', $3)`,
      [randomUUID(), generalVolunteer, world.users.rpmDhaka],
    );
    try {
      await refusal(id, world.users.general, 'submit', 'volunteer_not_blocked');
    } finally {
      await h.db.query(`DELETE FROM blocklist WHERE subject_id = $1`, [generalVolunteer]);
    }
    await h.db.query(
      `UPDATE project_volunteers SET consent_status = 'pending' WHERE project_id = $1 AND volunteer_id = $2`,
      [project, generalVolunteer],
    );
    try {
      await refusal(id, world.users.general, 'submit', 'consent_accepted');
    } finally {
      await h.db.query(
        `UPDATE project_volunteers SET consent_status = 'accepted' WHERE project_id = $1 AND volunteer_id = $2`,
        [project, generalVolunteer],
      );
    }
    await h.db.query(
      `UPDATE applications SET status = 'deleted', deleted_at = now() WHERE id = $1`,
      [id],
    );
  });

  it('require the zakat decision only when the project is funded by zakat', async () => {
    const id = await draft();
    await run(world.users.general, id, 'submit');
    await run(world.users.executive, id, 'review');
    await run(world.users.executive, id, 'send_for_approval');
    await h.db.query(
      `INSERT INTO fund_sources (id, project_id, source, amount) VALUES ($1, $2, 'zakat', 1000)`,
      [randomUUID(), project],
    );
    try {
      await refusal(id, world.users.rpmDhaka, 'approve', 'zakat_eligible_if_zakat_fund');
      await h.db.query(`UPDATE applications SET zakat_decision = 'eligible' WHERE id = $1`, [id]);
      await run(world.users.rpmDhaka, id, 'approve');
    } finally {
      await h.db.query(`DELETE FROM fund_sources WHERE project_id = $1 AND source = 'zakat'`, [
        project,
      ]);
    }
    expect(await statusOf(h.db, id)).toBe('implementation');
  });
});

describe('the seed', () => {
  it('refuses a template naming a guard nobody built', async () => {
    const [def] = mergedWorkflowDefinitions();
    const broken = structuredClone(def!);
    broken.transitions = [
      { from: 'draft', to: 'submitted', permission: 'application.submit', guards: ['moon.full'] },
    ];
    expect(() => assertWorkflowNamesKnown([broken], () => true)).toThrow(
      /unknown guard moon\.full/,
    );
  });
});
