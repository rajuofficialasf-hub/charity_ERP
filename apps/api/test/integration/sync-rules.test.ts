import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { etagOf } from '../../src/core/etag.js';
import { auditRows, type AuthHarness, authHarness, bearer } from './support/auth-app.js';
import * as f from './support/fixtures.js';
import { syncWorld } from './support/sync.js';

// What the server does with a record that arrived late, on a stale form, with a known number under
// another name, or against a change made meanwhile (docs/architecture/OFFLINE_SYNC.md "Conflict
// rules at sync"): held for the office, linked, or decided by the time of the change, every outcome
// on record.
let h: AuthHarness;
let w: Awaited<ReturnType<typeof syncWorld>>;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

beforeAll(async () => {
  h = await authHarness();
  w = await syncWorld(
    h,
    { fields: [{ ...question('q_landmark') }] },
    { genderCodes: ['retired_code'] },
  );
});
afterAll(async () => h.close());

/** A question of the fixture's shape. */
function question(fieldKey: string) {
  return {
    fieldKey,
    libraryFieldKey: null,
    type: 'short_text',
    label: { bn: 'প্রশ্ন', en: 'Question' },
    required: false,
    standardColumn: null,
    settings: {},
    options: [],
  };
}

const dhakaDay = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(d);
const row = async (id: string) =>
  (
    await h.db.query<{
      status: string;
      flags: string[];
      beneficiary_id: string | null;
      candidate_beneficiary_id: string | null;
      client_created_at: Date | null;
      applicant_name: string | null;
    }>(
      'SELECT status, flags, beneficiary_id, candidate_beneficiary_id, client_created_at, applicant_name FROM applications WHERE id = $1',
      [id],
    )
  ).rows[0]!;

describe('a record that arrives after the deadline', () => {
  it('is held for the office when it was made before the deadline, refused when made after, with the device clock corrected', async () => {
    const s = await w.as(w.world.users.general);
    const yesterday = new Date(h.clock.now().getTime() - DAY);
    await h.db.query('UPDATE projects SET apply_to = $2 WHERE id = $1', [
      w.project,
      dhakaDay(yesterday),
    ]);
    try {
      const early = w.draft(w.identity(), {
        clientCreatedAt: new Date(h.clock.now().getTime() - 2 * DAY).toISOString(),
      });
      const late = w.draft(w.identity(), { clientCreatedAt: h.clock.now().toISOString() });
      const res = await w.batch(s, [early, late]).expect(200);
      expect(w.resultOf(res, early.clientUuid)).toMatchObject({
        result: 'needs_verification',
        code: 'late_sync',
        status: 'needs_verification',
      });
      expect(w.resultOf(res, late.clientUuid)).toMatchObject({
        result: 'failed',
        code: 'sync.deadline_passed',
      });
      const held = await row(w.resultOf(res, early.clientUuid).serverId);
      expect(held.flags).toContain('late_sync');
      expect(held.client_created_at).not.toBeNull();
      // a phone two hours ahead: its "just now" is before the deadline only when the server's clock says so
      const ahead = new Date(h.clock.now().getTime() + 2 * HOUR);
      const justNowOnDevice = w.draft(w.identity(), { clientCreatedAt: ahead.toISOString() });
      const lastNightOnDevice = w.draft(w.identity(), {
        clientCreatedAt: yesterday.toISOString(),
      });
      const corrected = await w
        .batch(s, [justNowOnDevice, lastNightOnDevice], { deviceTime: ahead.toISOString() })
        .expect(200);
      expect(w.resultOf(corrected, justNowOnDevice.clientUuid).code).toBe('sync.deadline_passed');
      expect(w.resultOf(corrected, lastNightOnDevice.clientUuid).result).toBe('needs_verification');
      // the office verifies the held record as it does a public entry, and it goes on
      const rpm = await w.as(w.world.users.rpmDhaka);
      const verified = await w.act(
        rpm,
        w.resultOf(res, early.clientUuid).serverId,
        'verify_create',
        {
          ownerVolunteerId: w.generalVolunteer,
        },
      );
      expect(verified.status, JSON.stringify(verified.body)).toBe(200);
      expect(verified.body.data.status).toBe('submitted');
    } finally {
      await h.db.query('UPDATE projects SET apply_to = $2 WHERE id = $1', [
        w.project,
        '2099-12-31',
      ]);
    }
  });

  it('names the question of an answer no longer in its list when a send from the phone is refused', async () => {
    const s = await w.as(w.world.users.general);
    const first = w.draft(
      w.identity(undefined, undefined, { q_gender: { t: 'single_select', v: 'retired_code' } }),
    );
    const made = await w.batch(s, [first]).expect(200);
    const id = w.resultOf(made, first.clientUuid).serverId;
    // the list loses the code, as an older form version's own codes were never in it
    await h.db.query(
      `DELETE FROM reference_lists WHERE list_key = 'gender' AND code = 'retired_code'`,
    );
    const send = w.record({ kind: 'application_submit', target: id, payload: {} });
    const refused = await w.batch(s, [send]).expect(200);
    expect(w.resultOf(refused, send.clientUuid)).toMatchObject({
      result: 'failed',
      code: 'application.answer_not_in_list',
      params: { question: 'প্রশ্ন' },
    });
  });

  it('holds a submit made before the deadline and refuses one made after', async () => {
    const s = await w.as(w.world.users.general);
    const first = w.draft();
    const made = await w.batch(s, [first]).expect(200);
    const id = w.resultOf(made, first.clientUuid).serverId;
    const yesterday = new Date(h.clock.now().getTime() - DAY);
    await h.db.query('UPDATE projects SET apply_to = $2 WHERE id = $1', [
      w.project,
      dhakaDay(yesterday),
    ]);
    try {
      const tooLate = w.record({
        kind: 'application_submit',
        target: id,
        payload: {},
        clientCreatedAt: h.clock.now().toISOString(),
      });
      const refused = await w.batch(s, [tooLate]).expect(200);
      expect(w.resultOf(refused, tooLate.clientUuid).code).toBe('sync.deadline_passed');
      const inTime = w.record({
        kind: 'application_submit',
        target: id,
        payload: {},
        clientCreatedAt: new Date(yesterday.getTime() - HOUR).toISOString(),
      });
      const held = await w.batch(s, [inTime]).expect(200);
      expect(w.resultOf(held, inTime.clientUuid)).toMatchObject({
        result: 'needs_verification',
        code: 'late_sync',
      });
      // held at its send: the lists name it by the typed name until the office links it
      expect(await row(id)).toMatchObject({
        status: 'needs_verification',
        applicant_name: 'নমুনা আবেদনকারী',
      });
    } finally {
      await h.db.query('UPDATE projects SET apply_to = $2 WHERE id = $1', [
        w.project,
        '2099-12-31',
      ]);
    }
  });

  it('holds a draft made online that is sent late, lets the office verify it, and refuses an incomplete one', async () => {
    const s = await w.as(w.world.users.general);
    const online = await w.at(s, 'post', `/projects/${w.project}/applications`).send({
      clientUuid: randomUUID(),
      projectId: w.project,
      formVersionId: w.versionId,
      answers: w.identity(),
    });
    expect(online.status, JSON.stringify(online.body)).toBe(201);
    const id = online.body.data.id as string;
    const incomplete = w.draft(w.identity().filter((a) => a.fieldKey !== 'q_village'));
    const madeIncomplete = await w.batch(s, [incomplete]).expect(200);
    const incompleteId = w.resultOf(madeIncomplete, incomplete.clientUuid).serverId;
    const yesterday = new Date(h.clock.now().getTime() - DAY);
    await h.db.query('UPDATE projects SET apply_to = $2 WHERE id = $1', [
      w.project,
      dhakaDay(yesterday),
    ]);
    try {
      const inTime = (target: string) =>
        w.record({
          kind: 'application_submit',
          target,
          payload: {},
          clientCreatedAt: new Date(yesterday.getTime() - HOUR).toISOString(),
        });
      const sendOnline = inTime(id);
      const sendIncomplete = inTime(incompleteId);
      const res = await w.batch(s, [sendOnline, sendIncomplete]).expect(200);
      expect(w.resultOf(res, sendOnline.clientUuid)).toMatchObject({
        result: 'needs_verification',
        code: 'late_sync',
      });
      expect((await row(id)).client_created_at).not.toBeNull();
      // the send runs every check of a submit but the window: a missing answer refuses it
      expect(w.resultOf(res, sendIncomplete.clientUuid)).toMatchObject({
        result: 'failed',
        code: 'workflow.guard.mandatory_fields_present',
      });
      expect((await row(incompleteId)).status).toBe('draft');
      // an edit of the held record from the phone is told the office holds it
      const edit = w.record({
        kind: 'application_update',
        target: id,
        payload: { answers: w.identity() },
      });
      const edited = await w.batch(s, [edit]).expect(200);
      expect(w.resultOf(edited, edit.clientUuid)).toMatchObject({
        result: 'failed',
        code: 'sync.held_for_verification',
      });
      const rpm = await w.as(w.world.users.rpmDhaka);
      const verified = await w.act(rpm, id, 'verify_create', {
        ownerVolunteerId: w.generalVolunteer,
      });
      expect(verified.status, JSON.stringify(verified.body)).toBe(200);
      expect(verified.body.data.status).toBe('submitted');
    } finally {
      await h.db.query('UPDATE projects SET apply_to = $2 WHERE id = $1', [
        w.project,
        '2099-12-31',
      ]);
    }
  });
});

describe('a record whose number already has a profile', () => {
  it('links when the typed names match the profile’s, and waits for the office when they differ', async () => {
    const s = await w.as(w.world.users.general);
    const known = await f.beneficiary(h.db, w.world.dhaka, {
      name: 'আব্দুল করিম',
      father_or_husband_name: 'রহিম মিয়া',
    });
    const nid = (
      await h.db.query<{ nid: string }>('SELECT nid FROM beneficiaries WHERE id = $1', [known])
    ).rows[0]!.nid;
    const same = w.draft(
      w.identity(nid, f.fakeMobile(), {
        q_name: { t: 'short_text', v: ' আব্দুল  করিম। ' },
        q_father: { t: 'short_text', v: 'রহিম মিয়া' },
      }),
    );
    const other = w.draft(
      w.identity(nid, f.fakeMobile(), { q_name: { t: 'short_text', v: 'আব্দুল রহিম' } }),
    );
    const res = await w.batch(s, [same]).expect(200);
    expect(w.resultOf(res, same.clientUuid)).toMatchObject({ result: 'synced', status: 'draft' });
    const linked = await row(w.resultOf(res, same.clientUuid).serverId);
    expect(linked.beneficiary_id).toBe(known);
    const answers = (
      await w.at(s, 'get', `/applications/${w.resultOf(res, same.clientUuid).serverId}`)
    ).body.data.answers as { fieldKey: string; value: { v: string } }[];
    expect(answers.find((a) => a.fieldKey === 'q_name')?.value.v).toBe('আব্দুল করিম');
    // the same person cannot apply twice in the project, so the mismatch is tried on a fresh profile
    const another = await f.beneficiary(h.db, w.world.dhaka, { name: 'আব্দুল করিম' });
    const nid2 = (
      await h.db.query<{ nid: string }>('SELECT nid FROM beneficiaries WHERE id = $1', [another])
    ).rows[0]!.nid;
    const mismatch = w.draft(
      w.identity(nid2, f.fakeMobile(), { q_name: { t: 'short_text', v: 'আব্দুল রহিম' } }),
    );
    const held = await w.batch(s, [mismatch, other]).expect(200);
    expect(w.resultOf(held, mismatch.clientUuid)).toMatchObject({
      result: 'needs_verification',
      code: 'existing_identity',
    });
    const waiting = await row(w.resultOf(held, mismatch.clientUuid).serverId);
    expect(waiting.beneficiary_id).toBeNull();
    expect(waiting.candidate_beneficiary_id).toBe(another);
    expect(waiting.flags).toContain('existing_identity');
    const record = (
      await w.at(s, 'get', `/applications/${w.resultOf(held, mismatch.clientUuid).serverId}`)
    ).body.data as {
      beneficiaryName: string | null;
      answers: { fieldKey: string; value: { v: string } }[];
    };
    expect(record.answers.find((a) => a.fieldKey === 'q_name')?.value.v).toBe('আব্দুল রহিম');
    // the record is named by the typed name while it waits
    expect(record.beneficiaryName).toBe('আব্দুল রহিম');
    // the office links it to the profile, and the application goes on as a submitted one
    const rpm = await w.as(w.world.users.rpmDhaka);
    const verified = await w.act(
      rpm,
      w.resultOf(held, mismatch.clientUuid).serverId,
      'verify_link',
      {
        linkBeneficiaryId: another,
        ownerVolunteerId: w.generalVolunteer,
      },
    );
    expect(verified.status, JSON.stringify(verified.body)).toBe(200);
    expect(verified.body.data.status).toBe('submitted');
    // once linked, the profile's name stands
    expect(verified.body.data.beneficiaryName).toBe('আব্দুল করিম');
  });
});

describe('a change that meets another change', () => {
  it('is refused on an approved application, with the server’s word kept and the attempt on record', async () => {
    const s = await w.as(w.world.users.general);
    const first = w.draft();
    const send = w.record({
      kind: 'application_submit',
      dependencies: [first.clientUuid],
      payload: {},
    });
    const made = await w.batch(s, [first, send]).expect(200);
    const id = w.resultOf(made, first.clientUuid).serverId;
    const base = (await w.at(s, 'get', `/applications/${id}`)).headers.etag as string;
    const rpm = await w.as(w.world.users.rpmDhaka);
    for (const step of ['review', 'send_for_approval', 'approve'])
      expect((await w.act(rpm, id, step)).status, step).toBe(200);
    const late = w.record({
      kind: 'application_update',
      target: id,
      payload: {
        answers: [
          ...w.identity(),
          { fieldKey: 'q_landmark', value: { t: 'short_text', v: 'পরে' } },
        ],
      },
    });
    const res = await w.batch(s, [late]).expect(200);
    expect(w.resultOf(res, late.clientUuid)).toMatchObject({
      result: 'failed',
      code: 'conflict.locked_on_server',
      conflict: { kept: 'server' },
    });
    expect(await auditRows(h.db, 'sync.conflict_server_won')).toEqual(
      expect.arrayContaining([expect.objectContaining({ entity_id: id })]),
    );
    // the phone edited before the office approved and sends the base it saw: locked all the same
    const beforeApproval = w.record({
      kind: 'application_update',
      target: id,
      baseVersion: base,
      clientUpdatedAt: w.minutesAgo(20),
      payload: {
        answers: [
          ...w.identity(),
          { fieldKey: 'q_landmark', value: { t: 'short_text', v: 'আগে' } },
        ],
      },
    });
    const stale = await w.batch(s, [beforeApproval]).expect(200);
    const outcome = w.resultOf(stale, beforeApproval.clientUuid);
    expect(outcome).toMatchObject({
      result: 'failed',
      code: 'conflict.locked_on_server',
      conflict: { kept: 'server' },
    });
    expect(outcome.conflict?.serverValue).toEqual(expect.any(Array));
    const won = (await auditRows(h.db, 'sync.conflict_server_won')).filter(
      (r) => r.entity_id === id,
    );
    expect(won).toHaveLength(2);
    // the distribution workflow moves an approved application on to implementation by itself
    expect(won[1]?.new).toMatchObject({
      status: 'implementation',
      serverAnswers: expect.any(Array),
      clientAnswers: expect.any(Array),
    });
    expect(
      (await auditRows(h.db, 'sync.conflict_last_write')).filter((r) => r.entity_id === id),
    ).toEqual([]);
  });

  it('lets the later write win on a draft edited on both sides, and keeps the losing one on record', async () => {
    const s = await w.as(w.world.users.general);
    const first = w.draft();
    const made = await w.batch(s, [first]).expect(200);
    const id = w.resultOf(made, first.clientUuid).serverId;
    const base = (await w.at(s, 'get', `/applications/${id}`)).headers.etag as string;
    // the office edits meanwhile (the volunteer on another device would do the same)
    h.clock.advance(60_000);
    const onServer = await w
      .at(s, 'patch', `/applications/${id}`)
      .set('If-Match', base)
      .send({
        answers: [
          ...w.identity(),
          { fieldKey: 'q_landmark', value: { t: 'short_text', v: 'সার্ভারে' } },
        ],
      });
    expect(onServer.status, JSON.stringify(onServer.body)).toBe(200);
    const serverAt = new Date(
      (
        await h.db.query<{ updated_at: Date }>(
          'SELECT updated_at FROM applications WHERE id = $1',
          [id],
        )
      ).rows[0]!.updated_at,
    );
    // the phone's edit from the old base, made later than the server's: it wins
    const laterOnPhone = w.record({
      kind: 'application_update',
      target: id,
      baseVersion: base,
      clientUpdatedAt: new Date(serverAt.getTime() + 60_000).toISOString(),
      payload: {
        answers: [
          ...w.identity(),
          { fieldKey: 'q_landmark', value: { t: 'short_text', v: 'ফোনে পরে' } },
        ],
      },
    });
    const won = await w.batch(s, [laterOnPhone]).expect(200);
    expect(w.resultOf(won, laterOnPhone.clientUuid)).toMatchObject({ result: 'synced' });
    const answers = async () =>
      (
        (await w.at(s, 'get', `/applications/${id}`)).body.data.answers as {
          fieldKey: string;
          value: { v: string };
        }[]
      ).find((a) => a.fieldKey === 'q_landmark')?.value.v;
    expect(await answers()).toBe('ফোনে পরে');
    const audits = await auditRows(h.db, 'sync.conflict_last_write');
    expect(audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity_id: id,
          new: expect.objectContaining({ kept: 'client' }),
        }),
      ]),
    );
    // the phone's edit from the old base, made earlier than the server's: the server's stands
    const current = etagOf(
      new Date(
        (
          await h.db.query<{ updated_at: Date }>(
            'SELECT updated_at FROM applications WHERE id = $1',
            [id],
          )
        ).rows[0]!.updated_at,
      ),
    );
    const earlierOnPhone = w.record({
      kind: 'application_update',
      target: id,
      baseVersion: base,
      clientUpdatedAt: new Date(serverAt.getTime() - 60_000).toISOString(),
      payload: {
        answers: [
          ...w.identity(),
          { fieldKey: 'q_landmark', value: { t: 'short_text', v: 'ফোনে আগে' } },
        ],
      },
    });
    const lost = await w.batch(s, [earlierOnPhone]).expect(200);
    expect(w.resultOf(lost, earlierOnPhone.clientUuid)).toMatchObject({
      result: 'synced',
      conflict: { kept: 'server' },
    });
    expect(await answers()).toBe('ফোনে পরে');
    expect((await w.at(s, 'get', `/applications/${id}`)).headers.etag).toBe(current);
    expect(await auditRows(h.db, 'sync.conflict_last_write')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity_id: id,
          new: expect.objectContaining({ kept: 'server' }),
        }),
      ]),
    );
  });

  it('shows the office that the record came through sync, with the device time', async () => {
    const s = await w.as(w.world.users.general);
    const first = w.draft(w.identity(), { clientCreatedAt: w.minutesAgo(90) });
    const made = await w.batch(s, [first]).expect(200);
    const id = w.resultOf(made, first.clientUuid).serverId;
    const read = await w
      .at(await w.as(w.world.users.rpmDhaka), 'get', `/applications/${id}`)
      .expect(200);
    expect(read.body.data.clientCreatedAt).toEqual(expect.any(String));
    expect(new Date(read.body.data.clientCreatedAt).getTime()).toBeLessThan(
      h.clock.now().getTime() - 80 * 60_000,
    );
    // nothing of the batch itself reaches another volunteer
    const other = await w.at(
      await w.as(w.world.users.rangpurVolunteer),
      'get',
      `/applications/${id}`,
    );
    expect(other.status).toBe(404);
    expect(randomUUID()).toBeTruthy();
    expect(bearer).toBeDefined();
  });
});

// last in the file: a retired version never returns to published, so the world's form changes for good
describe('a record on a form version republished meanwhile', () => {
  it('is kept under the old version, and held for the office only when it was made after the new one came', async () => {
    const monitoring = await w.as(w.world.users.monitoring);
    const oldVersion = w.versionId;
    // the project's form is a placed copy: its ready form gets the new version, the project takes it
    const readyFormId = (
      await h.db.query<{ source_form_id: string }>(
        'SELECT source_form_id FROM forms WHERE id = $1',
        [w.formId],
      )
    ).rows[0]!.source_form_id;
    const draftV2 = await w.at(monitoring, 'post', `/forms/${readyFormId}/versions`);
    expect(draftV2.status, JSON.stringify(draftV2.body)).toBe(201);
    const readyV2 = draftV2.body.data.id as string;
    const etag = (await w.at(monitoring, 'get', `/form-versions/${readyV2}`)).headers
      .etag as string;
    const published = await w
      .at(monitoring, 'post', `/form-versions/${readyV2}/publish`)
      .set('If-Match', etag);
    expect(published.status, JSON.stringify(published.body)).toBe(200);
    const taken = await w.at(monitoring, 'post', `/forms/${w.formId}/take-version`);
    expect(taken.status, JSON.stringify(taken.body)).toBe(200);
    const v2 = taken.body.data.publishedVersionId as string;
    expect(v2).not.toBe(oldVersion);
    const s = await w.as(w.world.users.general);
    const before = w.draft(w.identity(), {
      formVersionId: oldVersion,
      clientCreatedAt: new Date(h.clock.now().getTime() - HOUR).toISOString(),
    });
    const after = w.draft(w.identity(), {
      formVersionId: oldVersion,
      clientCreatedAt: new Date(h.clock.now().getTime() + 60_000).toISOString(),
    });
    const res = await w
      .batch(s, [before, after], {
        deviceTime: new Date(h.clock.now().getTime() + 60_000).toISOString(),
      })
      .expect(200);
    expect(w.resultOf(res, before.clientUuid)).toMatchObject({
      result: 'synced',
      status: 'draft',
    });
    const kept = await h.db.query('SELECT form_version_id, flags FROM applications WHERE id = $1', [
      w.resultOf(res, before.clientUuid).serverId,
    ]);
    expect(kept.rows[0]).toMatchObject({ form_version_id: oldVersion, flags: [] });
    expect(w.resultOf(res, after.clientUuid)).toMatchObject({
      result: 'needs_verification',
      code: 'stale_form_version',
    });
    const stale = await row(w.resultOf(res, after.clientUuid).serverId);
    expect(stale.flags).toContain('stale_form_version');
  });
});
