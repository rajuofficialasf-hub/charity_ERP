import { createHash, randomUUID } from 'node:crypto';
import { UPLOAD_RULES } from '@css/shared/files';
import { BATCH_MAX_BYTES, pendingPhotoAnswer } from '@css/shared/sync';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SeedContext } from '../../seed/context';
import { seedReferenceLists } from '../../seed/sets/base/reference-lists';
import { seedWorkflows } from '../../seed/sets/base/workflows';
import { jpeg } from '../support/images';
import { requestHashOf } from '../../src/sync/sync.service';
import { accessWorld } from './support/access-fixtures';
import { applicationProject, IDENTITY_ANSWERS, principalOf } from './support/applications';
import {
  account,
  type Account,
  auditRows,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  type Session,
} from './support/auth-app';
import * as f from './support/fixtures';
import { fakeMobile, fakeNid } from './support/fixtures';
import { question } from './support/forms';

// The batch a phone sends when the network returns (docs/architecture/OFFLINE_SYNC.md "Batch sync
// endpoint"): every record through the ordinary application service as the volunteer, one result
// per record, the batch once per key, and a photo that still waits on the phone kept as a slot the
// upload fills later.
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
let rangpurVolunteer: string;

const PART = UPLOAD_RULES.partSize;
const toAnswers = (record: Record<string, unknown>) =>
  Object.entries(record).map(([fieldKey, value]) => ({ fieldKey, value }));
const identity = (nid = fakeNid(), mobile = fakeMobile()) => [
  ...toAnswers(IDENTITY_ANSWERS(nid, mobile, world.dhaka)),
  // the photo of the record is still on the phone, as it usually is when a record syncs
  pendingPhotoAnswer('q_proof'),
];
const minutesAgo = (minutes: number) =>
  new Date(h.clock.now().getTime() - minutes * 60_000).toISOString();

type Kind = 'application_draft' | 'application_update' | 'application_submit' | 'field_update';
interface Rec {
  clientUuid: string;
  kind: Kind;
  target?: string | null;
  projectId: string;
  formVersionId: string;
  baseVersion?: string | null;
  payload: Record<string, unknown>;
  clientCreatedAt: string;
  clientUpdatedAt: string;
  dependencies?: string[];
}
/** A row result as the tests read it; a failed one has no server id at runtime. */
interface Outcome {
  clientUuid: string;
  result: string;
  code: string;
  serverId: string;
  status: string;
  pendingPhotos: number;
}
const record = (over: Partial<Rec> & { kind: Kind; payload: Record<string, unknown> }): Rec => ({
  clientUuid: randomUUID(),
  projectId: project,
  formVersionId: versionId,
  clientCreatedAt: minutesAgo(30),
  clientUpdatedAt: minutesAgo(5),
  ...over,
});
const draft = (answers = identity(), over: Partial<Rec> = {}) =>
  record({ kind: 'application_draft', payload: { answers }, ...over });
const batch = (
  s: Session,
  records: Rec[],
  key = randomUUID(),
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) =>
  at(s, 'post', '/sync/batch')
    .set('Idempotency-Key', key)
    .set(headers)
    .send({ deviceTime: h.clock.now().toISOString(), records, ...extra });
const resultOf = (res: request.Response, clientUuid: string): Outcome =>
  (res.body.data.results as Outcome[]).find((r) => r.clientUuid === clientUuid)!;

/** The device session a token names. */
const sessionIdOf = (session: Session): string =>
  (
    JSON.parse(Buffer.from(session.accessToken.split('.')[1]!, 'base64url').toString()) as {
      sid: string;
    }
  ).sid;
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const photo = (fill = 1, size = PART + 500) =>
  Buffer.concat([
    jpeg({ metadata: false }),
    Buffer.alloc(size - jpeg({ metadata: false }).length, fill),
  ]);
const partsOf = (bytes: Buffer) =>
  Array.from({ length: Math.ceil(bytes.length / PART) }, (_, i) =>
    bytes.subarray(i * PART, (i + 1) * PART),
  );
async function upload(
  s: Session,
  applicationId: string,
  slot: string,
  over: Record<string, unknown> = {},
  bytes = photo(),
) {
  const created = await at(s, 'post', '/upload-sessions').send({
    clientUuid: randomUUID(),
    kind: 'form_photo',
    entityType: 'application',
    entityId: applicationId,
    slot,
    mime: 'image/jpeg',
    sizeBytes: bytes.length,
    sha256: sha256(bytes),
    capturedAt: minutesAgo(40),
    source: 'camera',
    ...over,
  });
  if (created.status !== 201) return created;
  const id = created.body.data.id as string;
  for (const [i, part] of partsOf(bytes).entries())
    expect(
      (
        await at(s, 'put', `/upload-sessions/${id}/parts/${i + 1}`)
          .set('Content-Type', 'application/octet-stream')
          .send(part)
      ).status,
    ).toBe(200);
  return at(s, 'post', `/upload-sessions/${id}/finalize`);
}
const answerOf = async (s: Session, id: string, key: string) =>
  (
    (await at(s, 'get', `/applications/${id}`)).body.data.answers as {
      fieldKey: string;
      value: unknown;
    }[]
  ).find((a) => a.fieldKey === key)?.value;

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
    code: 'SYNC',
    year: 2026,
    name: { bn: 'সিঙ্ক', en: 'Sync' },
    source: { kind: 'workflow', workflowKey: 'distribution' },
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  project = made.body.data.id as string;
  ({ versionId } = await applicationProject(h, await as(world.users.monitoring), project, {
    form: {
      fields: [
        question('q_proof', 'photo', { required: true }),
        question('q_landmark', 'short_text'),
      ],
    },
  }));
  const volunteers = await h.db.query<{ id: string; user_id: string }>(
    'SELECT id, user_id FROM volunteers WHERE user_id = ANY($1::uuid[])',
    [[world.users.general, world.users.rangpurVolunteer]],
  );
  const volunteerOf = (userId: string) => volunteers.rows.find((v) => v.user_id === userId)!.id;
  generalVolunteer = volunteerOf(world.users.general);
  rangpurVolunteer = volunteerOf(world.users.rangpurVolunteer);
  await h.db.query(
    `INSERT INTO project_areas (id, project_id, location_id, rpm_user_id) VALUES ($1, $2, $3, $4)`,
    [randomUUID(), project, world.dhaka.division, world.users.rpmDhaka],
  );
  for (const [volunteerId, region] of [
    [generalVolunteer, world.dhaka.division],
    [rangpurVolunteer, world.rangpur.division],
  ] as const)
    await h.db.query(
      `INSERT INTO project_volunteers (id, project_id, volunteer_id, region_location_id, permission_set, extra_permissions, assigned_by, consent_status)
       VALUES ($1, $2, $3, $4, 'application_distribution', '{}', $5, 'accepted')`,
      [randomUUID(), project, volunteerId, region, world.users.rpmDhaka],
    );
});
afterAll(async () => h.close());

describe('POST /sync/batch', () => {
  it('syncs a draft, its update and its submit in order, answers the number, and replays the batch and the record', async () => {
    const s = await as(world.users.general);
    const first = draft();
    const edit = record({
      kind: 'application_update',
      dependencies: [first.clientUuid],
      payload: {
        answers: [
          ...identity(),
          { fieldKey: 'q_landmark', value: { t: 'short_text', v: 'মসজিদের পাশে' } },
        ],
      },
    });
    const send = record({
      kind: 'application_submit',
      dependencies: [first.clientUuid],
      payload: {},
    });
    const key = randomUUID();
    const res = await batch(s, [first, edit, send], key).expect(200);
    expect(res.body.data.serverTime).toEqual(expect.any(String));
    const made = resultOf(res, first.clientUuid) as {
      result: string;
      serverId: string;
      status: string;
    };
    expect(made).toMatchObject({ result: 'synced', status: 'draft' });
    expect(resultOf(res, edit.clientUuid)).toMatchObject({
      result: 'synced',
      serverId: made.serverId,
    });
    expect(resultOf(res, send.clientUuid)).toMatchObject({
      result: 'synced',
      serverId: made.serverId,
      status: 'submitted',
    });
    expect(await answerOf(s, made.serverId, 'q_landmark')).toEqual({
      t: 'short_text',
      v: 'মসজিদের পাশে',
    });
    // the application carries the device time of its making
    const row = await h.db.query('SELECT client_created_at FROM applications WHERE id = $1', [
      made.serverId,
    ]);
    expect(row.rows[0].client_created_at).not.toBeNull();
    // the same batch again: the stored results, marked as a replay
    const again = await batch(s, [first, edit, send], key).expect(200);
    expect(again.headers['idempotent-replay']).toBe('true');
    expect(again.body.data.results).toEqual(res.body.data.results);
    // the same record in a new batch makes no second application
    const once = await batch(s, [first]).expect(200);
    expect(resultOf(once, first.clientUuid)).toMatchObject({
      result: 'synced',
      serverId: made.serverId,
    });
    expect(
      (
        await h.db.query('SELECT count(*)::int AS n FROM applications WHERE client_uuid = $1', [
          first.clientUuid,
        ])
      ).rows[0].n,
    ).toBe(1);
    expect(await auditRows(h.db, 'sync.batch')).toEqual(
      expect.arrayContaining([expect.objectContaining({ actor_user_id: world.users.general })]),
    );
  });

  it('answers a replay of a batch still in progress with 409 and a wait', async () => {
    const s = await as(world.users.general);
    const key = randomUUID();
    const first = draft();
    const body = { deviceTime: h.clock.now().toISOString(), records: [first] };
    const session = await h.db.query<{ id: string }>(
      `SELECT ds.id FROM device_sessions ds JOIN users u ON u.id = ds.user_id WHERE u.id = $1 ORDER BY ds.created_at DESC LIMIT 1`,
      [world.users.general],
    );
    await h.db.query(
      `INSERT INTO sync_batches (id, user_id, device_session_id, idempotency_key, record_count, results, request_hash)
       VALUES ($1, $2, $3, $4, 1, 'null'::jsonb, $5)`,
      [randomUUID(), world.users.general, session.rows[0]!.id, key, requestHashOf(body)],
    );
    const busy = await at(s, 'post', '/sync/batch').set('Idempotency-Key', key).send(body);
    expect(busy.status).toBe(409);
    expect(busy.body.error.code).toBe('sync.batch_in_progress');
    expect(busy.headers['retry-after']).toBeDefined();
  });

  it('refuses a record aimed at someone else’s work, and reveals nothing, while the rest of the batch goes through', async () => {
    const a = await as(world.users.general);
    const b = await as(world.users.rangpurVolunteer);
    const mine = draft();
    const made = await batch(a, [mine]).expect(200);
    const mineId = resultOf(made, mine.clientUuid).serverId;
    const forged = draft(identity(), { clientUuid: mine.clientUuid });
    const update = record({
      kind: 'application_update',
      target: mineId,
      payload: { answers: identity() },
    });
    const submit = record({ kind: 'application_submit', target: mineId, payload: {} });
    const fill = record({
      kind: 'field_update',
      payload: { unlockId: randomUUID(), value: { t: 'short_text', v: 'x' } },
    });
    const own = draft();
    const res = await batch(b, [forged, update, submit, fill, own]).expect(200);
    for (const r of [forged, update, submit, fill])
      expect(resultOf(res, r.clientUuid)).toEqual(
        expect.objectContaining({ result: 'failed', code: 'sync.not_permitted' }),
      );
    expect(JSON.stringify(res.body)).not.toContain(mineId);
    expect(resultOf(res, own.clientUuid)).toMatchObject({ result: 'synced' });
    // a key another user used is refused, never answered from the store
    const key = randomUUID();
    await batch(a, [draft()], key).expect(200);
    await batch(b, [draft()], key).expect(422);
  });

  it('refuses a team member’s record for a lead whose team they left', async () => {
    const teamUser = await account(h.db, { kind: 'volunteer', role: 'volunteer_team_member' });
    accounts.set(teamUser.id, teamUser);
    await f.volunteer(h.db, world.dhaka, teamUser.id, { type: 'team_member' });
    await h.db.query(
      `INSERT INTO volunteer_teams (id, project_id, lead_volunteer_id, member_volunteer_id, consent_status, consent_at, removed_at, created_by)
       VALUES ($1, $2, $3, (SELECT id FROM volunteers WHERE user_id = $4), 'accepted', now(), now(), $5)`,
      [randomUUID(), project, generalVolunteer, teamUser.id, world.users.general],
    );
    const res = await batch(await login(h, teamUser), [draft()]).expect(200);
    expect(res.body.data.results[0]).toMatchObject({
      result: 'failed',
      code: 'sync.not_permitted',
    });
  });

  it('keeps a limit, a window and a closed project as the service rules them', async () => {
    const s = await as(world.users.general);
    const full = await account(h.db, { kind: 'volunteer', role: 'volunteer_general' });
    accounts.set(full.id, full);
    const volunteerId = await f.volunteer(h.db, world.dhaka, full.id);
    await h.db.query(
      `INSERT INTO project_volunteers (id, project_id, volunteer_id, region_location_id, permission_set, extra_permissions, assigned_by, consent_status)
       VALUES ($1, $2, $3, $4, 'application_distribution', '{}', $5, 'accepted')`,
      [randomUUID(), project, volunteerId, world.dhaka.division, world.users.rpmDhaka],
    );
    const fs = await login(h, full);
    await h.db.query(`UPDATE projects SET per_volunteer_limit = 3 WHERE id = $1`, [project]);
    try {
      const drafts = [draft(), draft(), draft(), draft()];
      const res = await batch(fs, drafts).expect(200);
      expect(
        res.body.data.results.map((r: { result: string; code?: string }) => r.code ?? r.result),
      ).toEqual(['synced', 'synced', 'synced', 'sync.limit_exceeded']);
    } finally {
      await h.db.query(`UPDATE projects SET per_volunteer_limit = 50 WHERE id = $1`, [project]);
    }
    await h.db.query(`UPDATE projects SET status = 'closed' WHERE id = $1`, [project]);
    try {
      const closed = await batch(s, [draft()]).expect(200);
      expect(closed.body.data.results[0]).toMatchObject({
        result: 'failed',
        code: 'sync.project_closed',
      });
    } finally {
      await h.db.query(`UPDATE projects SET status = 'active' WHERE id = $1`, [project]);
    }
  });

  it('refuses 51 records and a body over the limit, and takes a full batch with its envelope', async () => {
    const s = await as(world.users.general);
    await batch(
      s,
      Array.from({ length: 51 }, () => draft()),
    ).expect(422);
    const heavy = (bytes: number) =>
      record({
        kind: 'application_update',
        target: randomUUID(),
        payload: {
          answers: [{ fieldKey: 'q_landmark', value: { t: 'short_text', v: 'x'.repeat(bytes) } }],
        },
      });
    const over = await batch(
      s,
      Array.from({ length: 12 }, () => heavy(100_000)),
    );
    expect(over.status).toBe(413);
    const full = await batch(
      s,
      Array.from({ length: 10 }, () => heavy(Math.floor(BATCH_MAX_BYTES / 10) - 400)),
    );
    expect(full.status, JSON.stringify(full.body).slice(0, 300)).toBe(200);
  });

  it('keeps a photo that waits on the phone as a slot the upload fills, and a submit goes through meanwhile', async () => {
    const s = await as(world.users.general);
    const first = draft([
      ...identity().filter((a) => a.fieldKey !== 'q_proof'),
      pendingPhotoAnswer('q_proof'),
    ]);
    const send = record({
      kind: 'application_submit',
      dependencies: [first.clientUuid],
      payload: {},
    });
    const res = await batch(s, [first, send], randomUUID(), { pendingAfter: 4 }).expect(200);
    const made = resultOf(res, first.clientUuid);
    expect(made).toMatchObject({ result: 'synced', pendingPhotos: 1 });
    expect(resultOf(res, send.clientUuid)).toMatchObject({ result: 'synced', status: 'submitted' });
    const read = await at(s, 'get', `/applications/${made.serverId}`).expect(200);
    expect(read.body.data.pendingPhotos).toBe(1);
    // the device said what it still holds
    const session = await h.db.query<{ pending_count: number }>(
      'SELECT pending_count FROM device_sessions WHERE id = $1',
      [sessionIdOf(s)],
    );
    expect(session.rows[0]!.pending_count).toBe(4);
    // another volunteer cannot fill the slot
    const theirs = await upload(await as(world.users.rangpurVolunteer), made.serverId, 'q_proof');
    expect(theirs.status).toBe(404);
    // a form photo carries no camera-only rule (that rule is the proof photos' of the distribution
    // and construction steps), so a gallery picture may fill the slot
    // the owner's photo fills the answer and clears the slot
    const done = await upload(s, made.serverId, 'q_proof', { source: 'gallery' }, photo(3));
    expect(done.status, JSON.stringify(done.body)).toBe(201);
    const fileId = done.body.data.id as string;
    expect(await answerOf(s, made.serverId, 'q_proof')).toEqual({ t: 'photo', v: [fileId] });
    expect((await at(s, 'get', `/applications/${made.serverId}`)).body.data.pendingPhotos).toBe(0);
    // an approved application takes no late photo through a slot
    const rpm = await as(world.users.rpmDhaka);
    const act = async (id: string, action: string) => {
      const current = await at(rpm, 'get', `/applications/${id}`);
      return at(rpm, 'post', `/applications/${id}/actions/${action}`)
        .set('If-Match', current.headers.etag as string)
        .send({});
    };
    for (const step of ['review', 'send_for_approval', 'approve'])
      expect((await act(made.serverId, step)).status, step).toBe(200);
    await h.db.query(
      `UPDATE applications SET pending_photos = '["q_proof"]'::jsonb WHERE id = $1`,
      [made.serverId],
    );
    const late = await upload(s, made.serverId, 'q_proof', {}, photo(4));
    // the file is kept, the slot stays, and the record says why the answer was not filled
    expect(late.status, JSON.stringify(late.body)).toBe(201);
    expect((await at(s, 'get', `/applications/${made.serverId}`)).body.data.pendingPhotos).toBe(1);
    expect(await auditRows(h.db, 'application.photo_not_attached')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity_id: made.serverId,
          new: expect.objectContaining({ reason: 'locked_on_server' }),
        }),
      ]),
    );
  });

  it('refuses a photo slot that is not a photo question the volunteer sees', async () => {
    const s = await as(world.users.general);
    const text = draft([
      ...identity().filter((a) => a.fieldKey !== 'q_landmark'),
      { fieldKey: 'q_landmark', value: { pendingPhoto: true, slot: 'q_landmark' } },
    ]);
    const official = draft([
      ...identity(),
      { fieldKey: 'q_official', value: { pendingPhoto: true, slot: 'q_official' } },
    ]);
    const res = await batch(s, [text, official]).expect(200);
    for (const r of [text, official])
      expect(resultOf(res, r.clientUuid)).toMatchObject({
        result: 'failed',
        code: 'validation.failed',
      });
  });

  it('keeps an earlier photo slot through an edit that does not answer it', async () => {
    const s = await as(world.users.general);
    const first = draft();
    const made = await batch(s, [first]).expect(200);
    const id = resultOf(made, first.clientUuid).serverId;
    expect(resultOf(made, first.clientUuid).pendingPhotos).toBe(1);
    const edit = record({
      kind: 'application_update',
      target: id,
      payload: {
        answers: [
          ...identity().filter((a) => a.fieldKey !== 'q_proof'),
          { fieldKey: 'q_landmark', value: { t: 'short_text', v: 'নদীর ধারে' } },
        ],
      },
    });
    const edited = await batch(s, [edit]).expect(200);
    expect(resultOf(edited, edit.clientUuid)).toMatchObject({ result: 'synced', pendingPhotos: 1 });
  });

  it('takes over a batch whose earlier run died, after its lease', async () => {
    const s = await as(world.users.general);
    const key = randomUUID();
    const first = draft();
    const body = { deviceTime: h.clock.now().toISOString(), records: [first] };
    await h.db.query(
      `INSERT INTO sync_batches (id, user_id, device_session_id, idempotency_key, record_count, results, request_hash, received_at)
       VALUES ($1, $2, $3, $4, 1, 'null'::jsonb, $5, $6)`,
      [
        randomUUID(),
        world.users.general,
        sessionIdOf(s),
        key,
        requestHashOf(body),
        new Date(h.clock.now().getTime() - 3 * 60_000),
      ],
    );
    const res = await at(s, 'post', '/sync/batch')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(200);
    expect(resultOf(res, first.clientUuid)).toMatchObject({ result: 'synced' });
  });

  it('fills an answer the office opened through a field update', async () => {
    const s = await as(world.users.general);
    const first = draft();
    const send = record({
      kind: 'application_submit',
      dependencies: [first.clientUuid],
      payload: {},
    });
    const made = await batch(s, [first, send]).expect(200);
    const id = resultOf(made, first.clientUuid).serverId;
    const rpm = await as(world.users.rpmDhaka);
    const act = async (action: string) => {
      const current = await at(rpm, 'get', `/applications/${id}`);
      return at(rpm, 'post', `/applications/${id}/actions/${action}`)
        .set('If-Match', current.headers.etag as string)
        .send({});
    };
    for (const step of ['review', 'send_for_approval', 'approve']) {
      const stepRes = await act(step);
      expect(stepRes.status, step + ' ' + JSON.stringify(stepRes.body)).toBe(200);
    }
    const opened = await at(rpm, 'post', `/applications/${id}/unlocks`).send({
      fieldKey: 'q_landmark',
      reason: 'ভুল তথ্য এসেছে',
    });
    expect(opened.status, JSON.stringify(opened.body)).toBe(201);
    const unlockId = opened.body.data.id as string;
    const fill = record({
      kind: 'field_update',
      target: id,
      payload: { unlockId, value: { t: 'short_text', v: 'স্কুলের পাশে' } },
    });
    const res = await batch(s, [fill]).expect(200);
    expect(res.body.data.results[0]).toMatchObject({ result: 'synced', serverId: id });
    const unlock = await h.db.query<{ unlock_state: string }>(
      'SELECT unlock_state FROM field_changes WHERE id = $1',
      [unlockId],
    );
    expect(unlock.rows[0]!.unlock_state).toBe('updated');
    // a second answer from a phone that was away: the answer is no longer open, the server's
    // value wins, and the attempt is on record
    const late = record({
      kind: 'field_update',
      target: id,
      payload: { unlockId, value: { t: 'short_text', v: 'বাজারের পাশে' } },
    });
    const lateRes = await batch(s, [late]).expect(200);
    expect(lateRes.body.data.results[0]).toMatchObject({ result: 'failed' });
    const onRecord = await h.db.query(
      `SELECT 1 FROM audit_log WHERE entity_id = $1 AND action = 'sync.conflict_server_won'`,
      [id],
    );
    expect(onRecord.rowCount).toBe(1);
  });

  it('fails a record whose dependency failed, without touching the rest', async () => {
    const s = await as(world.users.general);
    const bad = draft([{ fieldKey: 'q_landmark', value: { t: 'short_text', v: 'no identity' } }]);
    const send = record({
      kind: 'application_submit',
      dependencies: [bad.clientUuid],
      payload: {},
    });
    const fine = draft();
    const res = await batch(s, [bad, send, fine]).expect(200);
    expect(resultOf(res, bad.clientUuid)).toMatchObject({ result: 'failed' });
    expect(resultOf(res, send.clientUuid)).toMatchObject({
      result: 'failed',
      code: 'sync.dependency_failed',
    });
    expect(resultOf(res, fine.clientUuid)).toMatchObject({ result: 'synced' });
  });

  it('refuses an official without a volunteer profile per record, and one without the permission at the door', async () => {
    const rpm = await batch(await as(world.users.rpmDhaka), [draft()]).expect(200);
    expect(rpm.body.data.results[0]).toMatchObject({
      result: 'failed',
      code: 'sync.not_permitted',
    });
    const finance = await account(h.db, { kind: 'staff', role: 'finance_team' });
    await batch(await login(h, finance), [draft()]).expect(403);
    await api()
      .post('/api/v1/sync/batch')
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(401);
  });

  it('gives a blocked volunteer nothing but refusals', async () => {
    const principal = await principalOf(h.db, world.users.rangpurVolunteer);
    // the batch is recorded under the device session, so the principal names a real one
    principal.sessionId = (
      await h.db.query<{ id: string }>(
        'SELECT id FROM device_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [world.users.rangpurVolunteer],
      )
    ).rows[0]!.id;
    const block = randomUUID();
    await h.db.query(
      `INSERT INTO blocklist (id, subject_type, subject_id, reason, blocked_by) VALUES ($1, 'volunteer', $2, 'test', $3)`,
      [block, rangpurVolunteer, world.users.rpmDhaka],
    );
    try {
      const out = await h.container.sync.submit(principal, new Set(), randomUUID(), {
        deviceTime: h.clock.now().toISOString(),
        records: [draft()],
      });
      expect(out.response.results[0]).toMatchObject({
        result: 'failed',
        code: 'sync.not_permitted',
      });
    } finally {
      await h.db.query(`DELETE FROM blocklist WHERE id = $1`, [block]);
    }
  });

  it('fails an update that names no record it could act on', async () => {
    const s = await as(world.users.general);
    const orphan = record({ kind: 'application_update', payload: { answers: identity() } });
    const res = await batch(s, [orphan]).expect(200);
    expect(resultOf(res, orphan.clientUuid)).toMatchObject({
      result: 'failed',
      code: 'sync.target_unknown',
    });
  });
});
