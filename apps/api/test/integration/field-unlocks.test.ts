import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SeedContext } from '../../seed/context';
import { seedReferenceLists } from '../../seed/sets/base/reference-lists';
import { seedWorkflows } from '../../seed/sets/base/workflows';
import { accessWorld } from './support/access-fixtures';
import { applicationProject, applicationRow, IDENTITY_ANSWERS } from './support/applications';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  type Session,
} from './support/auth-app';
import { option, question } from './support/forms';
import { fakeMobile, fakeNid } from './support/fixtures';
import { notificationsOf } from './support/notifications';

// The field unlock of an approved application: an official opens one answer with a reason, the
// volunteer who owns the application enters the new value (an official when there is no
// volunteer, or for the official section), and an official other than the one who entered accepts
// it or sends it back with a reason. Every step is logged; the identity, photos and files never
// open; one unlock per answer waits at a time; nothing moves on a closed project.
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

const EXTRA = {
  fields: [
    question('q_kind', 'radio', { options: [option('widow'), option('elderly')] }),
    question('q_count', 'number', { settings: { validation: { min: 0, max: 20 } } }),
  ],
};

const toAnswers = (record: Record<string, unknown>) =>
  Object.entries(record).map(([fieldKey, value]) => ({ fieldKey, value }));
const read = (s: Session, id: string) => at(s, 'get', `/applications/${id}`);
const act = async (s: Session, id: string, action: string, body: Record<string, unknown> = {}) => {
  const before = await read(s, id);
  const res = await at(s, 'post', `/applications/${id}/actions/${action}`)
    .set('If-Match', before.headers.etag as string)
    .send(body);
  expect(res.status, `${action}: ${JSON.stringify(res.body)}`).toBe(200);
};
const answerOf = async (s: Session, id: string, key: string) =>
  ((await read(s, id)).body.data.answers as { fieldKey: string; value: unknown }[]).find(
    (a) => a.fieldKey === key,
  )?.value;

/** A volunteer's application approved by the region's RPM; answers its id. */
async function approved(mobile = fakeMobile()): Promise<string> {
  const s = await as(world.users.general);
  const made = await at(s, 'post', `/projects/${project}/applications`).send({
    clientUuid: randomUUID(),
    projectId: project,
    formVersionId: versionId,
    answers: toAnswers({
      ...IDENTITY_ANSWERS(fakeNid(), mobile, world.dhaka),
      q_kind: { t: 'radio', v: 'widow' },
      q_count: { t: 'number', v: 3 },
    }),
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const id = made.body.data.id as string;
  await act(s, id, 'submit');
  const rpm = await as(world.users.rpmDhaka);
  await act(rpm, id, 'review');
  await act(rpm, id, 'send_for_approval');
  await act(rpm, id, 'approve');
  return id;
}
const open = (s: Session, id: string, fieldKey: string, reason = 'ভুল তথ্য এসেছে') =>
  at(s, 'post', `/applications/${id}/unlocks`).send({ fieldKey, reason });
const fill = (s: Session, unlockId: string, value: unknown) =>
  at(s, 'put', `/application-unlocks/${unlockId}/value`).send({ value });
const decide = (s: Session, unlockId: string, body: Record<string, unknown>) =>
  at(s, 'post', `/application-unlocks/${unlockId}/decision`).send(body);
const cancel = (s: Session, unlockId: string, reason = 'আর দরকার নেই') =>
  at(s, 'post', `/application-unlocks/${unlockId}/cancel`).send({ reason });
const opened = async (s: Session, id: string, fieldKey: string) => {
  const res = await open(s, id, fieldKey);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data.id as string;
};
const auditActions = async (id: string) =>
  (
    await h.db.query<{ action: string }>(
      `SELECT action FROM audit_log WHERE entity_id = $1 AND action LIKE 'application.unlock_%' ORDER BY created_at`,
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
  const ctx = new SeedContext(h.db);
  await seedWorkflows(ctx);
  await seedReferenceLists(ctx);
  const made = await at(await as(world.users.pm), 'post', '/projects').send({
    programId: world.a1.program,
    code: 'UNL',
    year: 2026,
    name: { bn: 'আনলক', en: 'Unlock' },
    source: { kind: 'workflow', workflowKey: 'distribution' },
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  project = made.body.data.id as string;
  ({ versionId } = await applicationProject(h, await as(world.users.monitoring), project, {
    form: EXTRA,
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
  await h.db.query(
    `INSERT INTO project_staff (id, project_id, user_id, role_key, area_location_id, extra_permissions, granted_by)
     VALUES ($1, $2, $3, 'project_executive', $4, '{}', $5)`,
    [randomUUID(), project, world.users.executive, world.dhaka.division, world.users.rpmDhaka],
  );
});
afterAll(async () => h.close());

describe('an unlock from opening to the decision', () => {
  it('is opened by the RPM, filled by the owner volunteer and accepted by another official, every step logged', async () => {
    const id = await approved();
    const rpm = await as(world.users.rpmDhaka);
    const volunteer = await as(world.users.general);
    const executive = await as(world.users.executive);
    const res = await open(rpm, id, 'q_village', 'গ্রামের নাম ভুল');
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({
      fieldKey: 'q_village',
      state: 'open',
      oldValue: { t: 'short_text', v: 'নমুনা গ্রাম' },
      reason: 'গ্রামের নাম ভুল',
      openedBy: world.users.rpmDhaka,
    });
    const unlockId = res.body.data.id as string;
    // the volunteer sees the open answer and may fill it, never the office's reason
    const mine = await read(volunteer, id);
    expect(mine.body.data.unlocks).toEqual([
      expect.objectContaining({ id: unlockId, state: 'open', reason: null, mayFill: true }),
    ]);
    expect(mine.body.data.mayUnlock).toBe(false);
    const told = await notificationsOf(h.db, 'field_unlocked', world.users.general);
    expect(told).toHaveLength(1);
    expect(told[0]!.params).toMatchObject({ applicationId: id });
    expect(JSON.stringify(told)).not.toContain('গ্রামের নাম ভুল');
    const home = await at(volunteer, 'get', '/me/attention');
    expect(home.body.data).toContainEqual({
      kind: 'unlocks_to_fill',
      count: 1,
      href: '/my-applications',
    });
    const filled = await fill(volunteer, unlockId, { t: 'short_text', v: 'নতুন গ্রাম' });
    expect(filled.status, JSON.stringify(filled.body)).toBe(200);
    expect(filled.body.data).toMatchObject({ state: 'updated', enteredBy: world.users.general });
    expect(await notificationsOf(h.db, 'field_updated', world.users.rpmDhaka)).toHaveLength(1);
    // the office sees the entered value waiting for it
    const waiting = await at(executive, 'get', '/me/attention');
    expect(waiting.body.data).toContainEqual({
      kind: 'unlocks_to_verify',
      count: 1,
      href: `/admin/applications/${id}`,
    });
    const record = await read(executive, id);
    expect(record.body.data.unlocks).toEqual([
      expect.objectContaining({
        newValue: { t: 'short_text', v: 'নতুন গ্রাম' },
        mayDecide: true,
        mayCancel: true,
      }),
    ]);
    // the volunteer decides nothing
    expect((await decide(volunteer, unlockId, { decision: 'accept' })).status).toBe(403);
    const accepted = await decide(executive, unlockId, { decision: 'accept' });
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
    expect(accepted.body.data).toMatchObject({
      state: 'relocked',
      decision: 'accepted',
      decidedBy: world.users.executive,
    });
    expect(await answerOf(executive, id, 'q_village')).toEqual({
      t: 'short_text',
      v: 'নতুন গ্রাম',
    });
    expect((await read(executive, id)).body.data.unlocks).toEqual([]);
    const log = await at(executive, 'get', `/applications/${id}/changes`);
    expect(log.body.data).toContainEqual(
      expect.objectContaining({
        field: 'q_village',
        kind: 'unlock',
        unlockState: 'relocked',
        oldValue: { t: 'short_text', v: 'নমুনা গ্রাম' },
        newValue: { t: 'short_text', v: 'নতুন গ্রাম' },
        reason: 'গ্রামের নাম ভুল',
        requestedBy: world.users.rpmDhaka,
        enteredBy: world.users.general,
        decidedBy: world.users.executive,
        decision: 'accepted',
      }),
    );
    expect(await auditActions(id)).toEqual([
      'application.unlock_opened',
      'application.unlock_entered',
      'application.unlock_decided',
    ]);
  });

  it('keeps the old value when the new one is sent back, which needs a reason', async () => {
    const id = await approved();
    const rpm = await as(world.users.rpmDhaka);
    const unlockId = await opened(rpm, id, 'q_count');
    await fill(await as(world.users.general), unlockId, { t: 'number', v: 9 });
    expect((await decide(rpm, unlockId, { decision: 'refuse' })).status).toBe(422);
    const refused = await decide(rpm, unlockId, { decision: 'refuse', reason: 'সংখ্যা মেলেনি' });
    expect(refused.status, JSON.stringify(refused.body)).toBe(200);
    expect(refused.body.data).toMatchObject({
      decision: 'refused',
      decisionReason: 'সংখ্যা মেলেনি',
    });
    expect(await answerOf(rpm, id, 'q_count')).toEqual({ t: 'number', v: 3 });
    // a decided unlock takes no further step
    expect((await decide(rpm, unlockId, { decision: 'accept' })).body.error.code).toBe(
      'application.unlock_not_open',
    );
  });

  it('writes an accepted mobile to the profile through the contact service', async () => {
    const id = await approved();
    const rpm = await as(world.users.rpmDhaka);
    const unlockId = await opened(rpm, id, 'q_mobile');
    const mobile = fakeMobile();
    expect(
      (await fill(await as(world.users.general), unlockId, { t: 'phone', v: mobile })).status,
    ).toBe(200);
    expect(
      (await decide(await as(world.users.executive), unlockId, { decision: 'accept' })).status,
    ).toBe(200);
    const person = await h.db.query<{ id: string; mobile: string }>(
      'SELECT b.id, b.mobile FROM beneficiaries b JOIN applications a ON a.beneficiary_id = b.id WHERE a.id = $1',
      [id],
    );
    expect(person.rows[0]!.mobile).toBe(mobile);
    const contact = await h.db.query(
      `SELECT 1 FROM field_changes WHERE entity_type = 'beneficiary' AND entity_id = $1 AND kind = 'contact_update' AND field = 'mobile'`,
      [person.rows[0]!.id],
    );
    expect(contact.rowCount).toBe(1);
  });
});

describe('what an unlock refuses', () => {
  it('never opens the identity, a photo or an unknown answer, nor one already waiting, nor before the approval', async () => {
    const id = await approved();
    const rpm = await as(world.users.rpmDhaka);
    for (const key of ['q_id', 'q_name', 'q_father']) {
      const refused = await open(rpm, id, key);
      expect(refused.status).toBe(422);
      expect(refused.body.error.details).toEqual([
        expect.objectContaining({ path: 'fieldKey', code: 'application.unlock_identity' }),
      ]);
    }
    const photo = await open(rpm, id, 'q_photo');
    expect(photo.body.error.details).toEqual([
      expect.objectContaining({ code: 'application.unlock_type' }),
    ]);
    expect((await open(rpm, id, 'q_unknown')).status).toBe(422);
    // two opens of one answer at once leave one
    const both = await Promise.all([open(rpm, id, 'q_note'), open(rpm, id, 'q_note')]);
    expect(both.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(both.find((r) => r.status === 409)!.body.error.code).toBe('application.unlock_open');
    // an application still under review is edited by its review, not unlocked
    const s = await as(world.users.general);
    const made = await at(s, 'post', `/projects/${project}/applications`).send({
      clientUuid: randomUUID(),
      projectId: project,
      formVersionId: versionId,
      answers: toAnswers(IDENTITY_ANSWERS(fakeNid(), fakeMobile(), world.dhaka)),
    });
    const early = await open(rpm, made.body.data.id as string, 'q_village');
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('application.not_unlockable');
  });

  it('checks the new value like any answer of its question', async () => {
    const id = await approved();
    const rpm = await as(world.users.rpmDhaka);
    const volunteer = await as(world.users.general);
    const kind = await opened(rpm, id, 'q_kind');
    expect((await fill(volunteer, kind, { t: 'radio', v: 'nobody' })).status).toBe(422);
    const count = await opened(rpm, id, 'q_count');
    expect((await fill(volunteer, count, { t: 'number', v: 99 })).status).toBe(422);
    const same = await fill(volunteer, count, { t: 'number', v: 3 });
    expect(same.status).toBe(422);
    expect(same.body.error.details).toEqual([
      expect.objectContaining({ code: 'application.unlock_unchanged' }),
    ]);
    expect((await fill(volunteer, kind, { t: 'radio', v: 'elderly' })).status).toBe(200);
  });

  it('is refused to a volunteer opening, another volunteer filling and an official of another region', async () => {
    const id = await approved();
    const unlockId = await opened(await as(world.users.rpmDhaka), id, 'q_note');
    expect((await open(await as(world.users.general), id, 'q_village')).status).toBe(403);
    const rangpur = await as(world.users.rpmRangpur);
    expect((await open(rangpur, id, 'q_village')).status).toBe(404);
    expect(
      (await fill(await as(world.users.rangpurVolunteer), unlockId, { t: 'long_text', v: 'অন্য' }))
        .status,
    ).toBe(404);
    expect((await cancel(rangpur, unlockId)).status).toBe(404);
    // the owner volunteer fills; an official of the region does not fill it in their place
    expect(
      (await fill(await as(world.users.executive), unlockId, { t: 'long_text', v: 'অফিসের' }))
        .status,
    ).toBe(403);
  });
});

describe('the office fills', () => {
  it('an application without a volunteer: one official enters, another decides', async () => {
    const id = await applicationRow(h.db, {
      projectId: project,
      versionId,
      loc: world.dhaka,
      status: 'approved',
      createdByUserId: world.users.rpmDhaka,
      answers: IDENTITY_ANSWERS(fakeNid(), fakeMobile(), world.dhaka),
      over: { approved_at: new Date().toISOString(), approved_by: world.users.rpmDhaka },
    });
    const rpm = await as(world.users.rpmDhaka);
    const executive = await as(world.users.executive);
    const unlockId = await opened(rpm, id, 'q_village');
    const entered = await fill(executive, unlockId, { t: 'short_text', v: 'অফিসের গ্রাম' });
    expect(entered.status, JSON.stringify(entered.body)).toBe(200);
    // the one who entered does not verify
    const own = await decide(executive, unlockId, { decision: 'accept' });
    expect(own.status).toBe(403);
    expect(own.body.error.code).toBe('application.unlock_own_entry');
    expect((await decide(rpm, unlockId, { decision: 'accept' })).status).toBe(200);
    expect(await answerOf(rpm, id, 'q_village')).toEqual({ t: 'short_text', v: 'অফিসের গ্রাম' });
  });

  it('an answer of the official section, never shown to the volunteer', async () => {
    const id = await approved();
    const rpm = await as(world.users.rpmDhaka);
    const volunteer = await as(world.users.general);
    const unlockId = await opened(rpm, id, 'q_official');
    expect(await notificationsOf(h.db, 'field_unlocked', world.users.general)).not.toContainEqual(
      expect.objectContaining({ params: expect.objectContaining({ applicationId: id }) }),
    );
    expect((await read(volunteer, id)).body.data.unlocks).toEqual([]);
    expect((await fill(volunteer, unlockId, { t: 'short_text', v: 'স্বেচ্ছাসেবকের' })).status).toBe(
      404,
    );
    expect(
      (await fill(await as(world.users.executive), unlockId, { t: 'short_text', v: 'যাচাই শেষ' }))
        .status,
    ).toBe(200);
  });
});

describe('the end of an unlock', () => {
  it('is cancelled by the office with a reason, keeping the old value', async () => {
    const id = await approved();
    const rpm = await as(world.users.rpmDhaka);
    const unlockId = await opened(rpm, id, 'q_village');
    expect((await cancel(rpm, unlockId, '')).status).toBe(422);
    const cancelled = await cancel(rpm, unlockId, 'ভুল করে খোলা');
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
    expect(cancelled.body.data).toMatchObject({ state: 'relocked', decision: 'cancelled' });
    expect(
      (await fill(await as(world.users.general), unlockId, { t: 'short_text', v: 'দেরিতে' }))
        .status,
    ).toBe(409);
    expect(await answerOf(rpm, id, 'q_village')).toEqual({ t: 'short_text', v: 'নমুনা গ্রাম' });
    // a new unlock of the same answer can open again
    expect((await open(rpm, id, 'q_village')).status).toBe(201);
  });

  it('cannot be filled by a blocked volunteer', async () => {
    const id = await approved();
    const unlockId = await opened(await as(world.users.rpmDhaka), id, 'q_note');
    const volunteer = await as(world.users.general);
    const block = randomUUID();
    await h.db.query(
      `INSERT INTO blocklist (id, subject_type, subject_id, reason, blocked_by) VALUES ($1, 'volunteer', $2, 'test', $3)`,
      [block, generalVolunteer, world.users.rpmDhaka],
    );
    try {
      const refused = await fill(volunteer, unlockId, { t: 'long_text', v: 'অবরুদ্ধ' });
      expect([401, 403, 404]).toContain(refused.status);
      const state = await h.db.query<{ unlock_state: string }>(
        'SELECT unlock_state FROM field_changes WHERE id = $1',
        [unlockId],
      );
      expect(state.rows[0]!.unlock_state).toBe('open');
    } finally {
      await h.db.query(
        `UPDATE blocklist SET active = false, released_by = $2, released_at = now(), release_reason = 'test' WHERE id = $1`,
        [block, world.users.rpmDhaka],
      );
    }
  });

  it('takes no step on a closed project', async () => {
    const id = await approved();
    const rpm = await as(world.users.rpmDhaka);
    const waiting = await opened(rpm, id, 'q_note');
    const entered = await opened(rpm, id, 'q_count');
    expect((await fill(await as(world.users.general), entered, { t: 'number', v: 4 })).status).toBe(
      200,
    );
    await h.db.query(`UPDATE projects SET status = 'closed' WHERE id = $1`, [project]);
    try {
      expect(
        (await decide(await as(world.users.executive), entered, { decision: 'accept' })).status,
      ).toBe(409);
      expect((await open(rpm, id, 'q_village')).status).toBe(409);
      expect(
        (await fill(await as(world.users.general), waiting, { t: 'long_text', v: 'বন্ধ' })).status,
      ).toBe(409);
      expect((await cancel(rpm, waiting)).status).toBe(409);
    } finally {
      await h.db.query(`UPDATE projects SET status = 'active' WHERE id = $1`, [project]);
    }
  });
});
