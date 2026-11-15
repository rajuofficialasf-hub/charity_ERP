import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SeedContext } from '../../seed/context.js';
import { seedReferenceLists } from '../../seed/sets/base/reference-lists.js';
import { seedWorkflows } from '../../seed/sets/base/workflows.js';
import { accessWorld } from './support/access-fixtures.js';
import { applicationProject, IDENTITY_ANSWERS, setIdentityRules } from './support/applications.js';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  type Session,
} from './support/auth-app.js';
import { fakeMobile, fakeNid, insert } from './support/fixtures.js';
import { notificationsOf } from './support/notifications.js';
import { option, question } from './support/forms.js';

// The decisions of the review against the score and the quotas: an approval while a
// higher-scored application of the same quota area still waits, a waitlisting or a rejection
// while a lower-scored one of the area is approved, an approval in a full quota area, and a pull
// from the waitlist that is not the next in order each ask for a comment; the next one is pulled
// in one click, never the same person twice. The score only asks; it never decides. An approval of
// a person who appears again in the project, probably as the same person under another profile or
// as someone of the same family, asks for a comment too where the project holds that repeat, asks
// nothing where it only tells, and is never refused.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
const at = (s: Session, method: 'get' | 'post' | 'patch', path: string) =>
  api()[method](`/api/v1${path}`).set(bearer(s));

let project: string;
let versionId: string;
let generalVolunteer: string;
/** A second union of the Dhaka upazila, whose applications are another quota area. */
let otherUnion: string;

const SCORED = {
  fields: [
    question('q_kind', 'radio', {
      options: [option('widow'), option('elderly'), option('other')],
      settings: { score: { options: { widow: 30, elderly: 20, other: 5 } } },
    }),
  ],
};

const toAnswers = (record: Record<string, unknown>) =>
  Object.entries(record).map(([fieldKey, value]) => ({ fieldKey, value }));
const read = (s: Session, id: string) => at(s, 'get', `/applications/${id}`);
const act = async (s: Session, id: string, action: string, body: Record<string, unknown> = {}) => {
  const before = await read(s, id);
  return at(s, 'post', `/applications/${id}/actions/${action}`)
    .set('If-Match', before.headers.etag as string)
    .send(body);
};
const moved = async (s: Session, id: string, action: string, body?: Record<string, unknown>) => {
  const res = await act(s, id, action, body);
  expect(res.status, `${action}: ${JSON.stringify(res.body)}`).toBe(200);
  return res;
};
/** A volunteer's application, sent and reviewed up to waiting for the approver; answers its id. */
async function reviewed(
  kind: string,
  union = world.dhaka.union,
  mobile = fakeMobile(),
  extra: Record<string, unknown> = {},
): Promise<string> {
  const s = await as(world.users.general);
  const loc = { ...world.dhaka, union };
  const made = await at(s, 'post', `/projects/${project}/applications`).send({
    clientUuid: randomUUID(),
    projectId: project,
    formVersionId: versionId,
    answers: toAnswers({
      ...IDENTITY_ANSWERS(fakeNid(), mobile, loc),
      q_kind: { t: 'radio', v: kind },
      ...extra,
    }),
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const id = made.body.data.id as string;
  await moved(s, id, 'submit');
  const rpm = await as(world.users.rpmDhaka);
  await moved(rpm, id, 'review');
  await moved(rpm, id, 'send_for_approval');
  return id;
}
const setQuotas = async (quotas: unknown[]) => {
  const res = await at(await as(world.users.pm), 'patch', `/projects/${project}/quotas`).send({
    quotas,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
};
const pullNext = (s: Session, body: Record<string, unknown>, key = randomUUID()) =>
  at(s, 'post', `/projects/${project}/waitlist/pull-next`).set('Idempotency-Key', key).send(body);
/** Leaves no waiting application behind, so each test starts with an empty queue. */
async function clearQueue() {
  await h.db.query(
    `UPDATE applications SET status = 'deleted', deleted_at = now() WHERE project_id = $1 AND status IN ('reviewed', 'waitlisted')`,
    [project],
  );
  await h.db.query(
    `UPDATE applications SET approved_at = NULL, status = 'deleted', deleted_at = now() WHERE project_id = $1 AND approved_at IS NOT NULL`,
    [project],
  );
}

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
  const made = await at(await as(world.users.pm), 'post', '/projects').send({
    programId: world.a1.program,
    code: 'DEC',
    year: 2026,
    name: { bn: 'সিদ্ধান্ত', en: 'Decisions' },
    source: { kind: 'workflow', workflowKey: 'distribution' },
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  project = made.body.data.id as string;
  ({ versionId } = await applicationProject(h, await as(world.users.monitoring), project, {
    form: SCORED,
  }));
  generalVolunteer = (
    await h.db.query<{ id: string }>('SELECT id FROM volunteers WHERE user_id = $1', [
      world.users.general,
    ])
  ).rows[0]!.id;
  await h.db.query(
    `INSERT INTO project_areas (id, project_id, location_id, rpm_user_id) VALUES ($1, $2, $3, $4)`,
    [randomUUID(), project, world.dhaka.division, world.users.rpmDhaka],
  );
  await h.db.query(
    `INSERT INTO project_volunteers (id, project_id, volunteer_id, region_location_id, permission_set, extra_permissions, assigned_by, consent_status)
     VALUES ($1, $2, $3, $4, 'application_distribution', '{}', $5, 'accepted')`,
    [randomUUID(), project, generalVolunteer, world.dhaka.division, world.users.rpmDhaka],
  );
  otherUnion = await insert(h.db, 'locations', {
    id: randomUUID(),
    parent_id: world.dhaka.upazila,
    level: 'union',
    kind: 'union',
    code: `T-u-${randomUUID().slice(0, 8)}`,
    name_bn: 'অন্য ইউনিয়ন',
    name_en: 'Other union',
  });
});
afterAll(async () => h.close());

describe('a decision against the score', () => {
  it('asks a comment to approve while a higher-scored application of the union waits, and takes one', async () => {
    await clearQueue();
    await setQuotas([
      { level: 'union', locationId: world.dhaka.union, target: 50 },
      { level: 'union', locationId: otherUnion, target: 50 },
    ]);
    const high = await reviewed('widow');
    const low = await reviewed('other');
    const elsewhere = await reviewed('widow', otherUnion);
    const rpm = await as(world.users.rpmDhaka);
    const hints = await read(rpm, low);
    expect(hints.body.data.decisionHints).toMatchObject({ approve: ['against_score'] });
    const refused = await act(rpm, low, 'approve');
    expect(refused.status, JSON.stringify(refused.body)).toBe(422);
    expect(refused.body.error.code).toBe('workflow.comment_required');
    expect(refused.body.error.details).toEqual([
      expect.objectContaining({ path: 'against_score' }),
    ]);
    await moved(rpm, low, 'approve', { comment: 'বেশি স্কোরের জনকে আগেই সহায়তা দেওয়া হয়েছে' });
    const steps = await at(rpm, 'get', `/applications/${low}/timeline`);
    expect(JSON.stringify(steps.body.data)).toContain(
      'বেশি স্কোরের জনকে আগেই সহায়তা দেওয়া হয়েছে',
    );
    // the higher one and the one in another union need none
    await moved(rpm, high, 'approve');
    await moved(rpm, elsewhere, 'approve');
  });

  it('asks a comment to waitlist or reject while a lower-scored one of the union is approved, and a reason to waitlist', async () => {
    await clearQueue();
    await setQuotas([{ level: 'union', locationId: world.dhaka.union, target: 50 }]);
    const low = await reviewed('other');
    const high = await reviewed('widow');
    const second = await reviewed('elderly');
    const rpm = await as(world.users.rpmDhaka);
    await moved(rpm, low, 'approve', { comment: 'প্রথম ধাপে' });
    expect((await act(rpm, high, 'waitlist', { reason: 'মালামাল কম' })).status).toBe(422);
    expect((await act(rpm, high, 'waitlist')).body.error.code).toBe('workflow.reason_required');
    await moved(rpm, high, 'waitlist', { reason: 'মালামাল কম', comment: 'পরের চালানে' });
    // the waitlist reason stays on the record; the comment is kept in the audit entry
    const kept = await h.db.query<{ decision_comment: string }>(
      'SELECT decision_comment FROM applications WHERE id = $1',
      [high],
    );
    expect(kept.rows[0]!.decision_comment).toBe('মালামাল কম');
    const entry = await h.db.query<{ new: { comment?: string } }>(
      `SELECT "new" FROM audit_log WHERE entity_id = $1 AND action = 'application.waitlisted'`,
      [high],
    );
    expect(entry.rows[0]!.new.comment).toBe('পরের চালানে');
    expect(
      (
        await act(rpm, second, 'reject', {
          reason: 'কাগজ অসম্পূর্ণ',
          message: 'এবার সম্ভব হলো না',
        })
      ).body.error.code,
    ).toBe('workflow.comment_required');
    // a waitlisted application can be rejected with its two texts, and the comment
    await moved(rpm, high, 'reject', {
      reason: 'স্থান ত্যাগ করেছেন',
      message: 'এবার সম্ভব হলো না',
      comment: 'ঠিকানায় পাওয়া যায়নি',
    });
  });
});

describe('a full quota', () => {
  it('asks a comment for an approval in the full area, and never refuses it', async () => {
    await clearQueue();
    await setQuotas([{ level: 'union', locationId: world.dhaka.union, target: 1 }]);
    const first = await reviewed('widow');
    const second = await reviewed('widow');
    const rpm = await as(world.users.rpmDhaka);
    await moved(rpm, first, 'approve');
    expect((await read(rpm, second)).body.data.decisionHints.approve).toEqual(['quota_full']);
    const refused = await act(rpm, second, 'approve');
    expect(refused.status).toBe(422);
    expect(refused.body.error.details).toEqual([expect.objectContaining({ path: 'quota_full' })]);
    await moved(rpm, second, 'approve', { comment: 'অতিরিক্ত মালামাল এসেছে' });
  });
});

describe('a family match', () => {
  it('asks a comment to approve a person who shares a mobile with another applicant, and never refuses', async () => {
    await clearQueue();
    await setIdentityRules(h.db, project, { repeatFamily: 'hold' });
    await setQuotas([{ level: 'union', locationId: world.dhaka.union, target: 50 }]);
    const mobile = fakeMobile();
    const first = await reviewed('widow', world.dhaka.union, mobile);
    const second = await reviewed('widow', world.dhaka.union, mobile);
    const apart = await reviewed('widow');
    const rpm = await as(world.users.rpmDhaka);
    const record = (await read(rpm, second)).body.data;
    expect(record.familyDuplicateWarnings).toHaveLength(1);
    expect(record.decisionHints.approve).toEqual(['family_match']);
    const refused = await act(rpm, second, 'approve');
    expect(refused.status, JSON.stringify(refused.body)).toBe(422);
    expect(refused.body.error.code).toBe('workflow.comment_required');
    expect(refused.body.error.details).toEqual([expect.objectContaining({ path: 'family_match' })]);
    await moved(rpm, second, 'approve', { comment: 'আলাদা পরিবার, একই ফোন ব্যবহার করেন' });
    const entry = await h.db.query<{ new: { comment?: string } }>(
      `SELECT "new" FROM audit_log WHERE entity_id = $1 AND action = 'application.approve'`,
      [second],
    );
    expect(entry.rows[0]!.new.comment).toBe('আলাদা পরিবার, একই ফোন ব্যবহার করেন');
    // the other one of the pair asks the same; a person without a match asks nothing
    expect((await read(rpm, first)).body.data.decisionHints.approve).toEqual(['family_match']);
    expect((await read(rpm, apart)).body.data.decisionHints.approve ?? []).toEqual([]);
    await moved(rpm, apart, 'approve');
  });
});

/** The person of an application, as the office reads it. */
const personOf = async (id: string) =>
  (await read(await as(world.users.rpmDhaka), id)).body.data.beneficiaryId as string;
/** The answers of one person under a fixed father's name, so two profiles of them make a pair. */
const samePerson = (father: string) => ({ q_father: { t: 'short_text', v: father } });
/** Takes the project's rules on repeats away, so it reads as a project that never chose. */
const forgetRepeatRules = () =>
  h.db.query(
    `UPDATE project_components SET settings = settings - 'repeat_person' - 'repeat_family'
      WHERE project_id = $1 AND component_key = 'application_form'`,
    [project],
  );

describe('a repeat the project holds or only tells', () => {
  it('asks a reason to approve the same person under another profile where the project holds it', async () => {
    await clearQueue();
    await setQuotas([{ level: 'union', locationId: world.dhaka.union, target: 50 }]);
    await setIdentityRules(h.db, project, { repeatPerson: 'hold', repeatFamily: 'tell' });
    const father = `একই পিতা ${randomUUID().slice(0, 8)}`;
    const first = await reviewed('widow', world.dhaka.union, fakeMobile(), samePerson(father));
    const second = await reviewed('widow', world.dhaka.union, fakeMobile(), samePerson(father));
    const rpm = await as(world.users.rpmDhaka);
    const record = (await read(rpm, second)).body.data;
    expect(record.samePersonSignals).toEqual([
      expect.objectContaining({ level: 'probable', matchedOn: ['name_father_village'] }),
    ]);
    expect(record.decisionHints.approve).toEqual(['same_person']);
    const refused = await act(rpm, second, 'approve');
    expect(refused.status, JSON.stringify(refused.body)).toBe(422);
    expect(refused.body.error.code).toBe('workflow.comment_required');
    expect(refused.body.error.details).toEqual([expect.objectContaining({ path: 'same_person' })]);
    // the bulk approval passes through the same move: the row fails as the single one does
    const bulk = await at(rpm, 'post', `/projects/${project}/bulk/review`)
      .set('Idempotency-Key', randomUUID())
      .send({
        action: 'approve',
        rows: [
          {
            clientUuid: randomUUID(),
            applicationId: second,
            ifMatch: (await read(rpm, second)).headers.etag as string,
          },
        ],
      });
    expect(bulk.status, JSON.stringify(bulk.body)).toBe(200);
    expect(bulk.body.data.results).toEqual([
      expect.objectContaining({ result: 'failed', code: 'workflow.comment_required' }),
    ]);
    await moved(rpm, second, 'approve', { comment: 'যাচাই করেছি, পরে প্রোফাইল একত্র হবে' });
    const entry = await h.db.query<{ new: { comment?: string } }>(
      `SELECT "new" FROM audit_log WHERE entity_id = $1 AND action = 'application.approve'`,
      [second],
    );
    expect(entry.rows[0]!.new.comment).toBe('যাচাই করেছি, পরে প্রোফাইল একত্র হবে');
    // the other profile of the pair asks the same, until the project only tells
    expect((await read(rpm, first)).body.data.decisionHints.approve).toEqual(['same_person']);
    await setIdentityRules(h.db, project, { repeatPerson: 'tell' });
    expect((await read(rpm, first)).body.data.decisionHints.approve ?? []).toEqual([]);
    await moved(rpm, first, 'approve');
  });

  it('asks nothing for a pair an official marked as two people', async () => {
    await clearQueue();
    await setQuotas([{ level: 'union', locationId: world.dhaka.union, target: 50 }]);
    // one father, union and village are a family match too, which this project only tells
    await setIdentityRules(h.db, project, { repeatPerson: 'hold', repeatFamily: 'tell' });
    const father = `একই পিতা ${randomUUID().slice(0, 8)}`;
    const first = await reviewed('widow', world.dhaka.union, fakeMobile(), samePerson(father));
    const second = await reviewed('widow', world.dhaka.union, fakeMobile(), samePerson(father));
    const [a, b] = [await personOf(first), await personOf(second)];
    const rpm = await as(world.users.rpmDhaka);
    expect((await read(rpm, second)).body.data.decisionHints.approve).toEqual(['same_person']);
    const [low, high] = [a, b].map((id) => id.toLowerCase()).sort();
    await h.db.query(
      `INSERT INTO beneficiary_merge_dismissals (id, low_id, high_id, reason, dismissed_by)
       VALUES ($1, $2, $3, 'আলাদা মানুষ, একই নাম', $4)`,
      [randomUUID(), low, high, world.users.rpmDhaka],
    );
    expect((await read(rpm, second)).body.data.decisionHints.approve ?? []).toEqual([]);
    await moved(rpm, second, 'approve');
  });

  it('holds the same person where the project never chose, and asks again once a mark of two people is lifted', async () => {
    await clearQueue();
    await setQuotas([{ level: 'union', locationId: world.dhaka.union, target: 50 }]);
    await forgetRepeatRules();
    const father = `একই পিতা ${randomUUID().slice(0, 8)}`;
    const first = await reviewed('widow', world.dhaka.union, fakeMobile(), samePerson(father));
    const second = await reviewed('widow', world.dhaka.union, fakeMobile(), samePerson(father));
    const rpm = await as(world.users.rpmDhaka);
    // the pair is a family match too, which the project also holds now
    expect((await read(rpm, second)).body.data.decisionHints.approve).toContain('same_person');
    const refused = await act(rpm, second, 'approve');
    expect(refused.status, JSON.stringify(refused.body)).toBe(422);
    expect(refused.body.error.code).toBe('workflow.comment_required');
    expect(refused.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'same_person' })]),
    );
    // a mark of two people that was lifted again counts for nothing
    const [low, high] = [await personOf(first), await personOf(second)]
      .map((id) => id.toLowerCase())
      .sort();
    await h.db.query(
      `INSERT INTO beneficiary_merge_dismissals (id, low_id, high_id, reason, dismissed_by, lifted_at, lifted_by, lift_reason)
       VALUES ($1, $2, $3, 'আলাদা মানুষ, একই নাম', $4, now(), $4, 'আবার দেখা দরকার')`,
      [randomUUID(), low, high, world.users.rpmDhaka],
    );
    expect((await read(rpm, second)).body.data.decisionHints.approve).toContain('same_person');
    const again = await act(rpm, second, 'approve');
    expect(again.status, JSON.stringify(again.body)).toBe(422);
    expect(again.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'same_person' })]),
    );
    await moved(rpm, second, 'approve', { comment: 'যাচাই করেছি, একই মানুষ নন' });
  });

  it('follows the project for a family match, in the hints and the move alike, and holds where it never chose', async () => {
    await clearQueue();
    await setQuotas([{ level: 'union', locationId: world.dhaka.union, target: 50 }]);
    await setIdentityRules(h.db, project, { repeatPerson: 'hold', repeatFamily: 'tell' });
    const mobile = fakeMobile();
    const first = await reviewed('widow', world.dhaka.union, mobile);
    const second = await reviewed('widow', world.dhaka.union, mobile);
    const rpm = await as(world.users.rpmDhaka);
    const told = (await read(rpm, second)).body.data;
    expect(told.familyDuplicateWarnings).toHaveLength(1);
    expect(told.decisionHints.approve ?? []).toEqual([]);
    await moved(rpm, second, 'approve');
    // a project that never chose holds, as before the projects chose
    await forgetRepeatRules();
    expect((await read(rpm, first)).body.data.decisionHints.approve).toEqual(['family_match']);
    const refused = await act(rpm, first, 'approve');
    expect(refused.status, JSON.stringify(refused.body)).toBe(422);
    expect(refused.body.error.details).toEqual([expect.objectContaining({ path: 'family_match' })]);
    await moved(rpm, first, 'approve', { comment: 'একই ফোন, আলাদা পরিবার' });
  });

  it('asks a reason for a person listed in the family of another applicant of the project', async () => {
    await clearQueue();
    await setQuotas([{ level: 'union', locationId: world.dhaka.union, target: 50 }]);
    await setIdentityRules(h.db, project, { repeatPerson: 'tell', repeatFamily: 'hold' });
    const head = await reviewed('widow');
    const member = await reviewed('widow', world.dhaka.union, fakeMobile(), {
      q_name: { t: 'short_text', v: `নমুনা সন্তান ${randomUUID().slice(0, 8)}` },
      q_father: { t: 'short_text', v: 'নমুনা আবেদনকারী' },
    });
    const rpm = await as(world.users.rpmDhaka);
    expect((await read(rpm, member)).body.data.decisionHints.approve ?? []).toEqual([]);
    // the head's family list holds the member under the member's own name key
    const [headId, memberId] = [await personOf(head), await personOf(member)];
    const memberRow = await h.db.query<{ name: string; name_key: string }>(
      'SELECT name, name_key FROM beneficiaries WHERE id = $1',
      [memberId],
    );
    await h.db.query(
      `INSERT INTO beneficiary_family_members (id, beneficiary_id, name, name_key)
       VALUES ($1, $2, $3, $4)`,
      [randomUUID(), headId, memberRow.rows[0]!.name, memberRow.rows[0]!.name_key],
    );
    expect((await read(rpm, member)).body.data.decisionHints.approve).toEqual(['family_match']);
    expect((await act(rpm, member, 'approve')).status).toBe(422);
    await moved(rpm, member, 'approve', { comment: 'ছেলে আলাদা সংসার করেন' });
  });
});

describe('a block on the way', () => {
  it('lets an application already waiting for its approval be approved after the person is blocked', async () => {
    await clearQueue();
    await setQuotas([{ level: 'union', locationId: world.dhaka.union, target: 50 }]);
    const id = await reviewed('widow');
    const rpm = await as(world.users.rpmDhaka);
    const person = (await read(rpm, id)).body.data.beneficiaryId as string;
    const blocked = await at(rpm, 'post', `/beneficiaries/${person}/block`).send({
      reason: 'যাচাই চলছে',
    });
    expect(blocked.status, JSON.stringify(blocked.body)).toBe(201);
    await moved(rpm, id, 'approve');
    expect((await read(rpm, id)).body.data.status).not.toBe('reviewed');
  });
});

describe('the waitlist', () => {
  it('pulls the highest-scored waitlisted of the union, never one person twice, and asks a comment out of order', async () => {
    await clearQueue();
    await setQuotas([{ level: 'union', locationId: world.dhaka.union, target: 50 }]);
    const rpm = await as(world.users.rpmDhaka);
    const mid = await reviewed('elderly');
    const top = await reviewed('widow');
    const low = await reviewed('other');
    for (const id of [low, mid, top])
      await moved(rpm, id, 'waitlist', { reason: 'মালামাল কম', comment: 'সবাই অপেক্ষায়' });
    // a pull of one that is not next asks a comment
    expect((await act(rpm, low, 'pull_from_waitlist')).body.error.details).toEqual([
      expect.objectContaining({ path: 'against_score' }),
    ]);
    const [a, b] = await Promise.all([
      pullNext(rpm, { areaId: world.dhaka.union }),
      pullNext(rpm, { areaId: world.dhaka.union }),
    ]);
    expect(a.status, JSON.stringify(a.body)).toBe(200);
    expect(b.status, JSON.stringify(b.body)).toBe(200);
    expect(new Set([a.body.data.id, b.body.data.id])).toEqual(new Set([top, mid]));
    // a repeat of a key answers the same pull
    const key = randomUUID();
    const once = await pullNext(rpm, { areaId: world.dhaka.union }, key);
    const again = await pullNext(rpm, { areaId: world.dhaka.union }, key);
    expect(once.body.data.id).toBe(low);
    expect(again.body.data.id).toBe(low);
    expect(again.headers['idempotent-replay']).toBe('true');
    const empty = await pullNext(rpm, { areaId: world.dhaka.union });
    expect(empty.status).toBe(409);
    expect(empty.body.error.code).toBe('workflow.waitlist_empty');
  });

  it('tells the volunteer of the waitlisting and of the pull, never the office reason', async () => {
    await clearQueue();
    await setQuotas([{ level: 'union', locationId: world.dhaka.union, target: 50 }]);
    const rpm = await as(world.users.rpmDhaka);
    const id = await reviewed('widow');
    await moved(rpm, id, 'waitlist', { reason: 'গোপন কারণ' });
    await pullNext(rpm, { areaId: world.dhaka.union });
    const waitlisted = await notificationsOf(h.db, 'application_waitlisted', world.users.general);
    const approved = await notificationsOf(h.db, 'application_approved', world.users.general);
    expect(waitlisted.length).toBeGreaterThan(0);
    expect(approved.length).toBeGreaterThan(0);
    expect(JSON.stringify([...waitlisted, ...approved])).not.toContain('গোপন কারণ');
  });

  it('refuses the pull to a volunteer, to an official of another region and for an area outside the quotas', async () => {
    await clearQueue();
    await setQuotas([{ level: 'union', locationId: world.dhaka.union, target: 50 }]);
    expect(
      (await pullNext(await as(world.users.general), { areaId: world.dhaka.union })).status,
    ).toBe(403);
    const rangpur = await pullNext(await as(world.users.rpmRangpur), {
      areaId: world.dhaka.union,
    });
    expect(rangpur.status).toBe(404);
    // the project weighs by union, so a district is not an area of it
    const outside = await pullNext(await as(world.users.rpmDhaka), {
      areaId: world.dhaka.district,
    });
    expect(outside.status).toBe(422);
  });

  it('pulls from a union that has no target of its own when the project weighs by union', async () => {
    await clearQueue();
    await setQuotas([{ level: 'union', locationId: world.dhaka.union, target: 50 }]);
    const rpm = await as(world.users.rpmDhaka);
    const waiting = await reviewed('widow', otherUnion);
    await moved(rpm, waiting, 'waitlist', { reason: 'মালামাল কম' });
    const pulled = await pullNext(rpm, { areaId: otherUnion });
    expect(pulled.status, JSON.stringify(pulled.body)).toBe(200);
    expect(pulled.body.data.id).toBe(waiting);
  });

  it('is an approval: an official who may waitlist but not approve cannot pull', async () => {
    await clearQueue();
    await setQuotas([]);
    const rpm = await as(world.users.rpmDhaka);
    const waiting = await reviewed('widow');
    await moved(rpm, waiting, 'waitlist', { reason: 'মালামাল কম' });
    await h.db.query(
      `INSERT INTO project_staff (id, project_id, user_id, role_key, area_location_id, extra_permissions, granted_by)
       VALUES ($1, $2, $3, 'project_executive', $4, '{application.waitlist}', $5)`,
      [randomUUID(), project, world.users.executive, world.dhaka.division, world.users.rpmDhaka],
    );
    // without the approval on this project the application is out of the approver's reach,
    // so the pull approves nobody and the person keeps waiting
    const refused = await pullNext(await as(world.users.executive), {});
    expect(refused.status, JSON.stringify(refused.body)).toBe(404);
    const row = await h.db.query<{ status: string }>(
      'SELECT status FROM applications WHERE id = $1',
      [waiting],
    );
    expect(row.rows[0]!.status).toBe('waitlisted');
    // granted the approval here as well, the same official pulls
    await h.db.query(
      `UPDATE project_staff SET extra_permissions = '{application.waitlist,application.approve}'
        WHERE project_id = $1 AND user_id = $2`,
      [project, world.users.executive],
    );
    const pulled = await pullNext(await as(world.users.executive), {});
    expect(pulled.status, JSON.stringify(pulled.body)).toBe(200);
    expect(pulled.body.data.id).toBe(waiting);
  });
});

describe('a bulk approval', () => {
  it('fails the row that needs a comment and passes the others', async () => {
    await clearQueue();
    await setQuotas([{ level: 'union', locationId: world.dhaka.union, target: 50 }]);
    const high = await reviewed('widow');
    const low = await reviewed('other');
    const rpm = await as(world.users.rpmDhaka);
    const rows = await Promise.all(
      [low, high].map(async (id) => ({
        clientUuid: randomUUID(),
        applicationId: id,
        ifMatch: (await read(rpm, id)).headers.etag as string,
      })),
    );
    const res = await at(rpm, 'post', `/projects/${project}/bulk/review`)
      .set('Idempotency-Key', randomUUID())
      .send({ action: 'approve', rows });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const byId = Object.fromEntries(
      res.body.data.results.map(
        (r: { clientUuid: string; result: string; code: string | null }) => [
          rows.find((x) => x.clientUuid === r.clientUuid)!.applicationId,
          r,
        ],
      ),
    );
    // the low row came first, while the high one still waited
    expect(byId[low]).toMatchObject({ result: 'failed', code: 'workflow.comment_required' });
    expect(byId[high]).toMatchObject({ result: 'done' });
  });
});
