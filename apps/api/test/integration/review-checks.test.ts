import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SeedContext } from '../../seed/context.js';
import { seedReferenceLists } from '../../seed/sets/base/reference-lists.js';
import { seedWorkflows } from '../../seed/sets/base/workflows.js';
import { accessWorld } from './support/access-fixtures.js';
import { applicationProject, applicationRow, IDENTITY_ANSWERS } from './support/applications.js';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  type Session,
} from './support/auth-app.js';
import { beneficiary, fakeMobile, fakeNid } from './support/fixtures.js';
import { draftProject } from './support/projects.js';

// The review checklist of an application: an official answers each item of the project's
// checklist "ok" or "problem" with a comment, the first answer starts the review, the answers are
// the office's alone, and a project that requires the checklist sends nothing for approval with
// an item unanswered, one by one or in bulk.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
const at = (s: Session, method: 'get' | 'post' | 'put', path: string) =>
  api()[method](`/api/v1${path}`).set(bearer(s));

let project: string;
let versionId: string;
let generalVolunteer: string;

/** A submitted application of the general volunteer for a new person, in Dhaka. */
const submitted = async () => {
  const person = await beneficiary(h.db, world.dhaka, {});
  return applicationRow(h.db, {
    projectId: project,
    versionId,
    loc: world.dhaka,
    status: 'submitted',
    beneficiaryId: person,
    ownerVolunteerId: generalVolunteer,
    createdByUserId: world.users.general,
    submittedBy: world.users.general,
    answers: IDENTITY_ANSWERS(fakeNid(), fakeMobile(), world.dhaka),
    over: { submitted_at: new Date() },
  });
};
const etagOf = async (s: Session, id: string) =>
  (await at(s, 'get', `/applications/${id}`)).headers.etag as string;
/** One answer with the version the caller last read, as the screen sends it. */
const check = async (s: Session, id: string, item: string, body: Record<string, unknown>) =>
  at(s, 'put', `/applications/${id}/review-checks/${item}`)
    .set('If-Match', (await etagOf(s, id)) ?? '"none"')
    .send(body);
const send = async (s: Session, id: string) =>
  at(s, 'post', `/applications/${id}/actions/send_for_approval`)
    .set('If-Match', (await etagOf(s, id)) ?? '"none"')
    .send({});
const setChecklist = (checklist: unknown) =>
  h.db.query(
    `UPDATE project_components SET settings = settings || jsonb_build_object('review_checklist', $2::jsonb)
      WHERE project_id = $1 AND component_key = 'application_form'`,
    [project, JSON.stringify(checklist)],
  );
const auditActions = async (id: string) =>
  (
    await h.db.query<{ action: string }>(
      `SELECT action FROM audit_log WHERE entity_type = 'application' AND entity_id = $1 ORDER BY created_at, id`,
      [id],
    )
  ).rows.map((r) => r.action);

beforeAll(async () => {
  h = await authHarness();
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
  const ctx = new SeedContext(h.container.prisma);
  await seedWorkflows(ctx);
  await seedReferenceLists(ctx);
  const made = await draftProject(h, await as(world.users.pm), {
    programId: world.a1.program,
    code: 'CHK',
    year: 2026,
    name: { bn: 'চেকলিস্ট', en: 'Checklist' },
    source: { kind: 'workflow', workflowKey: 'distribution' },
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  project = made.body.data.id as string;
  ({ versionId } = await applicationProject(h, await as(world.users.monitoring), project));
  const volunteers = await h.db.query<{ id: string }>(
    'SELECT id FROM volunteers WHERE user_id = $1',
    [world.users.general],
  );
  generalVolunteer = volunteers.rows[0]!.id;
  await h.db.query(
    `INSERT INTO project_areas (id, project_id, location_id, rpm_user_id) VALUES ($1, $2, $3, $4)`,
    [randomUUID(), project, world.dhaka.division, world.users.rpmDhaka],
  );
  await h.db.query(
    `INSERT INTO project_staff (id, project_id, user_id, role_key, area_location_id, extra_permissions, granted_by)
     VALUES ($1, $2, $3, 'project_executive', $4, '{}', $5)`,
    [randomUUID(), project, world.users.executive, world.dhaka.division, world.users.rpmDhaka],
  );
  await h.db.query(
    `INSERT INTO project_volunteers (id, project_id, volunteer_id, region_location_id, permission_set, extra_permissions, assigned_by, consent_status)
     VALUES ($1, $2, $3, $4, 'application_distribution', '{}', $5, 'accepted')`,
    [randomUUID(), project, generalVolunteer, world.dhaka.division, world.users.rpmDhaka],
  );
});
afterAll(async () => h.close());

describe('the review checklist of an application', () => {
  it('takes an official’s answers, starting the review with the first, and shows them to the office only', async () => {
    const executive = await as(world.users.executive);
    const id = await submitted();
    // a project that never chose a checklist has the three starting items, none answered
    const before = await at(executive, 'get', `/applications/${id}`);
    expect(before.body.data.reviewChecklist).toEqual({
      required: false,
      items: [
        expect.objectContaining({ code: 'identity', result: null }),
        expect.objectContaining({ code: 'address', result: null }),
        expect.objectContaining({ code: 'eligibility', result: null }),
      ],
    });
    const ok = await check(executive, id, 'identity', { result: 'ok' });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.data.status).toBe('under_review');
    const problem = await check(executive, id, 'address', {
      result: 'problem',
      comment: 'গ্রামের নাম মেলেনি',
    });
    expect(problem.status, JSON.stringify(problem.body)).toBe(200);
    const items = problem.body.data.reviewChecklist.items;
    expect(items[0]).toMatchObject({
      code: 'identity',
      result: 'ok',
      comment: null,
      checkedBy: { id: world.users.executive },
    });
    expect(typeof items[0].checkedAt).toBe('string');
    expect(items[1]).toMatchObject({ result: 'problem', comment: 'গ্রামের নাম মেলেনি' });
    // a later answer replaces the earlier one
    const again = await check(executive, id, 'address', { result: 'ok' });
    expect(again.body.data.reviewChecklist.items[1]).toMatchObject({
      result: 'ok',
      comment: null,
    });
    expect(await auditActions(id)).toEqual([
      'application.review_started',
      'application.review_check',
      'application.review_check',
      'application.review_check',
    ]);
    // the volunteer reads the application without the office's checklist
    const volunteer = await as(world.users.general);
    const mine = await at(volunteer, 'get', `/applications/${id}`);
    expect(mine.status).toBe(200);
    expect(mine.body.data.reviewChecklist ?? null).toBeNull();
    expect(JSON.stringify(mine.body)).not.toContain('গ্রামের নাম মেলেনি');
  });

  it('refuses a problem without a comment, an item the project does not list, a stale version and the wrong hands', async () => {
    const executive = await as(world.users.executive);
    const id = await submitted();
    const noComment = await check(executive, id, 'address', { result: 'problem' });
    expect(noComment.status).toBe(422);
    const unknown = await check(executive, id, 'land_papers', { result: 'ok' });
    expect(unknown.status).toBe(422);
    const stale = await at(executive, 'put', `/applications/${id}/review-checks/identity`)
      .set('If-Match', '"stale"')
      .send({ result: 'ok' });
    expect(stale.status).toBe(412);
    // a volunteer holds no review permission; another region's RPM does not reach it
    expect(
      (await check(await as(world.users.general), id, 'identity', { result: 'ok' })).status,
    ).toBe(403);
    expect(
      (await check(await as(world.users.rpmRangpur), id, 'identity', { result: 'ok' })).status,
    ).toBe(404);
    // none of the refusals started the review
    expect((await at(executive, 'get', `/applications/${id}`)).body.data.status).toBe('submitted');
  });

  it('takes no answer once the application is sent for approval or decided', async () => {
    const executive = await as(world.users.executive);
    for (const status of ['reviewed', 'approved']) {
      const id = await submitted();
      await h.db.query(`UPDATE applications SET status = $2 WHERE id = $1`, [id, status]);
      const late = await check(executive, id, 'identity', { result: 'ok' });
      expect(late.status, status).toBe(409);
      expect(late.body.error.code).toBe('application.not_editable');
    }
  });

  it('sends nothing for approval with an item unanswered where the project requires the checklist', async () => {
    const executive = await as(world.users.executive);
    await setChecklist({
      required: true,
      items: [
        { code: 'identity', label: { bn: 'পরিচয় যাচাই', en: 'Identity checked' } },
        { code: 'land_papers', label: { bn: 'জমির কাগজ দেখা', en: 'Land papers seen' } },
      ],
    });
    try {
      const id = await submitted();
      expect((await check(executive, id, 'identity', { result: 'ok' })).status).toBe(200);
      const early = await send(executive, id);
      expect(early.status).toBe(409);
      expect(early.body.error.code).toBe('workflow.guard.review_checklist_complete');
      // a problem with its comment is an answer too
      expect(
        (
          await check(executive, id, 'land_papers', {
            result: 'problem',
            comment: 'দলিল পরে দেখাবেন',
          })
        ).status,
      ).toBe(200);
      const sent = await send(executive, id);
      expect(sent.status, JSON.stringify(sent.body)).toBe(200);
      expect(sent.body.data.status).toBe('reviewed');

      // in bulk, the row with an unanswered item fails on its own
      const done = await submitted();
      for (const item of ['identity', 'land_papers'])
        await check(executive, done, item, { result: 'ok' });
      const open = await submitted();
      const rows = await Promise.all(
        [done, open].map(async (applicationId) => ({
          clientUuid: randomUUID(),
          applicationId,
          ifMatch: await etagOf(executive, applicationId),
        })),
      );
      const bulk = await at(executive, 'post', `/projects/${project}/bulk/review`)
        .set('Idempotency-Key', randomUUID())
        .send({ action: 'send_for_approval', rows });
      expect(bulk.status, JSON.stringify(bulk.body)).toBe(200);
      expect(
        (bulk.body.data.results as { result: string; code: string | null }[]).map((r) => [
          r.result,
          r.code,
        ]),
      ).toEqual([
        ['done', null],
        ['failed', 'workflow.guard.review_checklist_complete'],
      ]);
      // the refused row kept its state: the lead-in rolled back with it
      expect((await at(executive, 'get', `/applications/${open}`)).body.data.status).toBe(
        'submitted',
      );
    } finally {
      await setChecklist({ required: false, items: [] });
    }
  });

  it('asks only the items the project lists now, and nothing of a required checklist without items', async () => {
    const executive = await as(world.users.executive);
    await setChecklist({
      required: false,
      items: [
        { code: 'identity', label: { bn: 'পরিচয় যাচাই', en: 'Identity checked' } },
        { code: 'address', label: { bn: 'ঠিকানা যাচাই', en: 'Address checked' } },
      ],
    });
    const id = await submitted();
    expect((await check(executive, id, 'address', { result: 'ok' })).status).toBe(200);
    // the PM takes the answered item out and requires the rest
    await setChecklist({
      required: true,
      items: [{ code: 'identity', label: { bn: 'পরিচয় যাচাই', en: 'Identity checked' } }],
    });
    try {
      const read = await at(executive, 'get', `/applications/${id}`);
      expect(read.body.data.reviewChecklist.items.map((i: { code: string }) => i.code)).toEqual([
        'identity',
      ]);
      // the answer of the item taken out does not count for the one still listed
      expect((await send(executive, id)).body.error?.code).toBe(
        'workflow.guard.review_checklist_complete',
      );
      // a required checklist with no items asks nothing
      await setChecklist({ required: true, items: [] });
      const sent = await send(executive, id);
      expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    } finally {
      await setChecklist({ required: false, items: [] });
    }
  });

  it('sends for approval with nothing answered where the checklist is not required', async () => {
    const executive = await as(world.users.executive);
    await setChecklist({
      required: false,
      items: [{ code: 'identity', label: { bn: 'পরিচয় যাচাই', en: 'Identity checked' } }],
    });
    const id = await submitted();
    const sent = await send(executive, id);
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    expect(sent.body.data.status).toBe('reviewed');
  });
});
