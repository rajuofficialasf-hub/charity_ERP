import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UPLOAD_RULES } from '@css/shared/files';
import { jpeg } from '../support/images.js';
import { accessWorld } from './support/access-fixtures.js';
import {
  account,
  auditRows,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  type Session,
} from './support/auth-app.js';
import * as f from './support/fixtures.js';

// Chunked uploads through the API: the session, its parts, the resume, finalize with its checks,
// the record scope at both ends, and the nightly sweep.
const PART = UPLOAD_RULES.partSize;
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
let generalVolunteer: string;
let dhakaApplication: string;
let rangpurApplication: string;
const sessions: Record<string, Session> = {};

/** A time this many minutes from the test clock's now. */
const minutesFromNow = (minutes: number) =>
  new Date(h.clock.now().getTime() + minutes * 60_000).toISOString();
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
/** A JPEG of three parts: its first bytes are a real JPEG, the rest is padding. */
const photo = (fill = 1, size = PART * 2 + 1000) =>
  Buffer.concat([
    jpeg({ metadata: false }),
    Buffer.alloc(size - jpeg({ metadata: false }).length, fill),
  ]);
const partsOf = (bytes: Buffer) =>
  Array.from({ length: Math.ceil(bytes.length / PART) }, (_, i) =>
    bytes.subarray(i * PART, (i + 1) * PART),
  );

beforeAll(async () => {
  h = await authHarness();
  world = await accessWorld(h.db, {
    staff: async (role) => (await account(h.db, { kind: 'staff', role })).id,
    volunteerUser: async (role) => (await account(h.db, { kind: 'volunteer', role })).id,
  });
  await h.db.query(`UPDATE projects SET status = 'active'`);
  generalVolunteer = (
    await h.db.query('SELECT id FROM volunteers WHERE user_id = $1', [world.users.general])
  ).rows[0].id as string;
  dhakaApplication = await f.application(
    h.db,
    { project: world.a1, loc: world.dhaka },
    {
      owner_volunteer_id: generalVolunteer,
      beneficiary_id: await f.beneficiary(h.db, world.dhaka),
    },
  );
  rangpurApplication = await f.application(
    h.db,
    { project: world.a1, loc: world.rangpur },
    { beneficiary_id: await f.beneficiary(h.db, world.rangpur) },
  );
  for (const [name, id] of Object.entries(world.users)) {
    const row = (await h.db.query('SELECT email, mobile FROM users WHERE id = $1', [id])).rows[0];
    sessions[name] = await login(h, row.email ?? row.mobile);
  }
});
afterAll(async () => h.close());

const as = (who: string) => bearer(sessions[who]!);

function start(who: string, bytes: Buffer, over: Record<string, unknown> = {}) {
  return request(h.server())
    .post('/api/v1/upload-sessions')
    .set(as(who))
    .send({
      clientUuid: randomUUID(),
      kind: 'distribution_proof',
      entityType: 'application',
      entityId: dhakaApplication,
      slot: 'distribution_proof',
      mime: 'image/jpeg',
      sizeBytes: bytes.length,
      sha256: sha256(bytes),
      capturedAt: minutesFromNow(-40),
      recordCreatedAt: minutesFromNow(-10),
      source: 'camera',
      ...over,
    });
}

const put = (who: string, id: string, n: number, bytes: Buffer) =>
  request(h.server())
    .put(`/api/v1/upload-sessions/${id}/parts/${n}`)
    .set(as(who))
    .set('Content-Type', 'application/octet-stream')
    .send(bytes);
const status = (who: string, id: string) =>
  request(h.server()).get(`/api/v1/upload-sessions/${id}`).set(as(who));
const finalize = (who: string, id: string) =>
  request(h.server()).post(`/api/v1/upload-sessions/${id}/finalize`).set(as(who));

async function upload(who: string, bytes: Buffer, over: Record<string, unknown> = {}) {
  const created = await start(who, bytes, over);
  expect(created.status).toBe(201);
  const id = created.body.data.id as string;
  for (const [i, part] of partsOf(bytes).entries())
    expect((await put(who, id, i + 1, part)).status).toBe(200);
  return { id, done: await finalize(who, id) };
}

describe('a chunked upload', () => {
  it('finalizes three parts into a file linked to its record, audited and quarantined', async () => {
    const bytes = photo(1);
    const { done } = await upload('general', bytes);
    expect(done.status).toBe(201);
    const file = done.body.data;
    expect(file).toMatchObject({
      kind: 'distribution_proof',
      mime: 'image/jpeg',
      sizeBytes: bytes.length,
      virusScan: 'pending',
      flags: ['no_gps', 'stale_capture'],
    });
    const row = (await h.db.query('SELECT * FROM files WHERE id = $1', [file.id])).rows[0];
    // the row names the driver that holds the file (the tests store on the NAS driver)
    expect(row).toMatchObject({
      bucket: 'photos',
      storage_driver: 'nas',
      sha256: sha256(bytes),
      project_id: world.a1.id,
    });
    expect(row.object_key).toMatch(
      new RegExp(`^${'[A-Z]{3,4}'}/${dhakaApplication}/distribution_proof/${file.id}\\.jpg$`),
    );
    const link = (
      await h.db.query('SELECT entity_type, entity_id, slot FROM file_links WHERE file_id = $1', [
        file.id,
      ])
    ).rows;
    expect(link).toEqual([
      { entity_type: 'application', entity_id: dhakaApplication, slot: 'distribution_proof' },
    ]);
    const stored = await h.container.storage.get('photos', row.object_key);
    const chunks: Buffer[] = [];
    for await (const c of stored) chunks.push(c as Buffer);
    expect(Buffer.concat(chunks).equals(bytes)).toBe(true);
    const audit = (await auditRows(h.db, 'file.uploaded')).find((a) => a.entity_id === file.id);
    expect(audit?.new).toMatchObject({ entityId: dhakaApplication, size: bytes.length });
    expect(JSON.stringify(audit)).not.toContain('lat');
  });

  it('accepts a resent part once, lists the held parts after a drop and resumes from there', async () => {
    const bytes = photo(2);
    const parts = partsOf(bytes);
    // taken five minutes after the record was made, with a position: no flag
    const created = await start('general', bytes, {
      gps: { lat: 23.81, lng: 90.41 },
      recordCreatedAt: minutesFromNow(-45),
    });
    const id = created.body.data.id as string;
    expect(created.body.data).toMatchObject({ chunkSize: PART, partCount: 3, partsReceived: [] });
    await put('general', id, 1, parts[0]!);
    const again = await put('general', id, 1, parts[0]!);
    expect(again.status).toBe(200);
    expect(again.body.data).toMatchObject({ partsReceived: [1], bytesReceived: PART });
    // the connection drops after part 3; the phone asks what the server holds
    await put('general', id, 3, parts[2]!);
    const held = await status('general', id);
    expect(held.body.data.partsReceived).toEqual([1, 3]);
    await put('general', id, 2, parts[1]!);
    const done = await finalize('general', id);
    expect(done.status).toBe(201);
    expect(done.body.data.flags).toEqual([]);
    // a second finalize answers the same file, and the session names it
    const twice = await finalize('general', id);
    expect(twice.status).toBe(200);
    expect(twice.headers['idempotent-replay']).toBe('true');
    expect(twice.body.data.id).toBe(done.body.data.id);
    expect((await status('general', id)).body.data.fileId).toBe(done.body.data.id);
    // a resent create with the same client id answers the same session
    const resent = await start('general', bytes, {
      clientUuid: (await sessionRow(id)).client_uuid,
    });
    expect(resent.body.data.id).toBe(id);
  });

  it('refuses a wrong SHA-256, a wrong type, sizes over the limits and missing parts', async () => {
    const bytes = photo(3);
    const parts = partsOf(bytes);
    // the joined bytes differ from the declaration
    const wrongHash = await start('general', bytes, { sha256: sha256(Buffer.from('other')) });
    for (const [i, part] of parts.entries())
      await put('general', wrongHash.body.data.id, i + 1, part);
    expect((await finalize('general', wrongHash.body.data.id)).body.error.code).toBe(
      'file.checksum_mismatch',
    );
    // an HTML page declared as a JPEG
    const page = Buffer.from('<!DOCTYPE html><html><script>alert(1)</script></html>');
    const html = await start('general', page);
    await put('general', html.body.data.id, 1, page);
    const refused = await finalize('general', html.body.data.id);
    expect(refused.status).toBe(415);
    expect(refused.body.error.code).toBe('file.type_not_allowed');
    // a declared size over the kind's limit, and a type the kind does not take
    expect((await start('general', bytes, { sizeBytes: 5 * 1024 * 1024 + 1 })).status).toBe(413);
    expect((await start('general', bytes, { mime: 'image/svg+xml' })).status).toBe(415);
    // a phone's HEIC is turned into JPEG by the app; the server does not decode it
    expect((await start('general', bytes, { mime: 'image/heic' })).status).toBe(415);
    expect((await start('general', bytes, { kind: 'issue_photo' })).body.error.code).toBe(
      'file.kind_not_allowed',
    );
    // a part over 256 KB, a last part past the declared size, a part number out of range
    const open = await start('general', bytes);
    const id = open.body.data.id as string;
    expect((await put('general', id, 1, Buffer.alloc(PART + 1))).status).toBe(413);
    expect((await put('general', id, 3, Buffer.alloc(parts[2]!.length + 1))).status).toBe(413);
    const outOfRange = await put('general', id, 4, Buffer.alloc(10));
    expect(outOfRange.status).toBe(422);
    expect(outOfRange.body.error.code).toBe('file.part_out_of_range');
    expect((await put('general', id, 81, Buffer.alloc(10))).status).toBe(422);
    // finalize before every part arrived
    await put('general', id, 1, parts[0]!);
    const early = await finalize('general', id);
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('file.parts_missing');
  });

  it('refuses the same bytes twice in a project, naming the other file only to a caller who reaches it', async () => {
    const bytes = photo(4);
    const first = await upload('general', bytes);
    expect(first.done.status).toBe(201);
    const again = await upload('rpmDhaka', bytes);
    expect(again.done.status).toBe(409);
    expect(again.done.body.error.code).toBe('file.duplicate');
    expect(again.done.body.error.params).toEqual({ fileId: first.done.body.data.id });
    const elsewhere = await upload('rpmRangpur', bytes, { entityId: rangpurApplication });
    expect(elsewhere.done.status).toBe(409);
    expect(JSON.stringify(elsewhere.done.body)).not.toContain(first.done.body.data.id);
  });
});

describe('who may upload to a record', () => {
  it('refuses a holder of the upload permission on a record outside its scope (404)', async () => {
    const bytes = photo(5);
    expect((await start('rpmRangpur', bytes)).status).toBe(404);
    expect((await start('rangpurVolunteer', bytes)).status).toBe(404);
    // another volunteer on the same project does not reach someone else's application
    expect((await start('daee', bytes)).status).toBe(404);
    expect((await start('general', bytes, { entityId: randomUUID() })).status).toBe(404);
    expect((await start('rpmDhaka', bytes)).status).toBe(201);
  });

  it('takes a payment copy from an official only, never from the volunteer of the application', async () => {
    const bytes = photo(5);
    const asPayment = { kind: 'payment_copy', slot: 'payment_copy' };
    expect((await start('general', bytes, asPayment)).status).toBe(403);
    expect((await start('rpmDhaka', bytes, asPayment)).status).toBe(201);
  });

  it('refuses a caller without the upload permission (403)', async () => {
    const finance = await account(h.db, { role: 'finance_team' });
    const res = await request(h.server())
      .post('/api/v1/upload-sessions')
      .set(bearer(await login(h, finance)))
      .send({
        clientUuid: randomUUID(),
        kind: 'evidence',
        entityType: 'application',
        entityId: dhakaApplication,
        slot: 'evidence',
        mime: 'image/jpeg',
        sizeBytes: 10,
        sha256: sha256(Buffer.from('x')),
        source: 'camera',
      });
    expect(res.status).toBe(403);
  });

  it('checks the record again at finalize: a volunteer whose assignment ended is refused', async () => {
    const bytes = photo(6);
    const created = await start('general', bytes);
    const id = created.body.data.id as string;
    for (const [i, part] of partsOf(bytes).entries()) await put('general', id, i + 1, part);
    await h.db.query(
      `UPDATE project_volunteers SET ended_at = now() WHERE volunteer_id = $1 AND project_id = $2`,
      [generalVolunteer, world.a1.id],
    );
    try {
      expect((await finalize('general', id)).status).toBe(404);
    } finally {
      await h.db.query(
        `UPDATE project_volunteers SET ended_at = NULL WHERE volunteer_id = $1 AND project_id = $2`,
        [generalVolunteer, world.a1.id],
      );
    }
  });

  it("answers 404 for another user's session and 410 once a session expired", async () => {
    const bytes = photo(7);
    const created = await start('general', bytes);
    const id = created.body.data.id as string;
    expect((await status('rpmDhaka', id)).status).toBe(404);
    expect((await put('rpmDhaka', id, 1, partsOf(bytes)[0]!)).status).toBe(404);
    expect((await finalize('rpmDhaka', id)).status).toBe(404);
    await h.db.query('UPDATE upload_sessions SET expires_at = $2 WHERE id = $1', [
      id,
      new Date(h.clock.now().getTime() - 1000),
    ]);
    const expired = await status('general', id);
    expect(expired.status).toBe(410);
    expect(expired.body.error.code).toBe('file.session_expired');
    expect((await put('general', id, 1, partsOf(bytes)[0]!)).status).toBe(410);
    expect((await finalize('general', id)).status).toBe(410);
  });

  it('refuses the 21st open session of a user (429)', async () => {
    const pm = await account(h.db, { role: 'program_manager' });
    await h.db.query('UPDATE programs SET pm_user_id = $1 WHERE id = $2', [
      pm.id,
      world.a1.program,
    ]);
    const pmSession = await login(h, pm);
    const open = (n: number) =>
      request(h.server())
        .post('/api/v1/upload-sessions')
        .set(bearer(pmSession))
        .send({
          clientUuid: randomUUID(),
          kind: 'evidence',
          entityType: 'application',
          entityId: dhakaApplication,
          slot: 'evidence',
          mime: 'image/jpeg',
          sizeBytes: 100 + n,
          sha256: sha256(Buffer.from(String(n))),
          source: 'gallery',
        });
    for (let n = 0; n < UPLOAD_RULES.openSessions; n += 1) expect((await open(n)).status).toBe(201);
    const over = await open(99);
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe('file.sessions_limit');
  });
});

describe('replays and races', () => {
  it('answers two finalizes at once with one file, and only one file.uploaded entry', async () => {
    const bytes = photo(10);
    const created = await start('general', bytes);
    const id = created.body.data.id as string;
    for (const [i, part] of partsOf(bytes).entries()) await put('general', id, i + 1, part);
    const [a, b] = await Promise.all([finalize('general', id), finalize('general', id)]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.data.id).toBe(b.body.data.id);
    const entries = (await auditRows(h.db, 'file.uploaded')).filter(
      (row) => row.entity_id === a.body.data.id,
    );
    expect(entries).toHaveLength(1);
  });

  it('joins the parts outside a transaction and leaves no stored object when the rows fail', async () => {
    const bytes = photo(15);
    const created = await start('general', bytes);
    const id = created.body.data.id as string;
    for (const [i, part] of partsOf(bytes).entries()) await put('general', id, i + 1, part);
    const session = await sessionRow(id);
    // a file row that already holds the declared id: the finalize's own row write fails
    await h.db.query(
      `INSERT INTO files (id, bucket, storage_driver, object_key, kind, mime, size_bytes, sha256, source)
       VALUES ($1, 'photos', 'nas', 'other/key.jpg', 'form_photo', 'image/jpeg', 1, $2, 'gallery')`,
      [session.declared.fileId, 'b'.repeat(64)],
    );
    const res = await finalize('general', id);
    expect(res.status).toBe(409);
    expect(await h.container.storage.stat(session.bucket, session.object_key)).toBeNull();
    const after = await sessionRow(id);
    expect(after.finalized_file_id).toBeNull();
    // the lease is given back, so the next finalize need not wait for it to run out
    expect(after.finalizing_until).toBeNull();
  });

  it('takes over a session whose finalize died, once its lease ran out', async () => {
    const bytes = photo(16);
    const created = await start('general', bytes);
    const id = created.body.data.id as string;
    for (const [i, part] of partsOf(bytes).entries()) await put('general', id, i + 1, part);
    await h.db.query(`UPDATE upload_sessions SET finalizing_until = $2 WHERE id = $1`, [
      id,
      new Date(h.clock.now().getTime() - 1000),
    ]);
    const res = await finalize('general', id);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect((await sessionRow(id)).finalizing_until).toBeNull();
  });

  it('refuses a resent create once its session expired, and one that describes another file', async () => {
    const bytes = photo(11);
    const clientUuid = randomUUID();
    const created = await start('general', bytes, { clientUuid });
    expect(created.status).toBe(201);
    const other = await start('general', photo(12), { clientUuid });
    expect(other.status).toBe(409);
    expect(other.body.error.code).toBe('file.session_mismatch');
    await h.db.query('UPDATE upload_sessions SET expires_at = $2 WHERE id = $1', [
      created.body.data.id,
      new Date(h.clock.now().getTime() - 1000),
    ]);
    const late = await start('general', bytes, { clientUuid });
    expect(late.status).toBe(410);
    expect(late.body.error.code).toBe('file.session_expired');
  });

  it('flags a capture time later than the server clock as stale', async () => {
    const future = new Date(h.clock.now().getTime() + 60 * 60_000).toISOString();
    const { done } = await upload('general', photo(13), {
      capturedAt: future,
      recordCreatedAt: future,
      gps: { lat: 23.81, lng: 90.41 },
    });
    expect(done.status).toBe(201);
    expect(done.body.data.flags).toEqual(['stale_capture']);
  });

  it('refuses an upload to a project that no longer takes files (409)', async () => {
    await h.db.query(`UPDATE projects SET status = 'closed' WHERE id = $1`, [world.a1.id]);
    try {
      const res = await start('general', photo(14));
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('project.read_only');
    } finally {
      await h.db.query(`UPDATE projects SET status = 'active' WHERE id = $1`, [world.a1.id]);
    }
  });
});

describe('the nightly sweep', () => {
  it('removes an expired session and its stored parts, and keeps the open and finalized ones', async () => {
    const bytes = photo(8);
    const created = await start('general', bytes);
    const id = created.body.data.id as string;
    await put('general', id, 1, partsOf(bytes)[0]!);
    const kept = await start('general', photo(9));
    await h.db.query(
      `UPDATE upload_sessions SET expires_at = now() - interval '1 minute' WHERE id = $1`,
      [id],
    );
    expect(await h.container.storage.stat('uploads', `${id}/1`)).not.toBeNull();
    const result = await h.container.uploadSweep.run();
    expect(result.sessions).toBeGreaterThanOrEqual(1);
    expect(await sessionRowOrNull(id)).toBeNull();
    expect(await h.container.storage.stat('uploads', `${id}/1`)).toBeNull();
    expect(await sessionRowOrNull(kept.body.data.id)).not.toBeNull();
  });

  it('leaves an expired session alone while a finalize holds it', async () => {
    const created = await start('general', photo(17));
    const id = created.body.data.id as string;
    await h.db.query(
      `UPDATE upload_sessions SET expires_at = now() - interval '1 minute',
              finalizing_until = now() + interval '1 minute' WHERE id = $1`,
      [id],
    );
    await h.container.uploadSweep.run();
    expect(await sessionRowOrNull(id)).not.toBeNull();
  });
});

async function sessionRowOrNull(id: string) {
  return (await h.db.query('SELECT * FROM upload_sessions WHERE id = $1', [id])).rows[0] ?? null;
}
async function sessionRow(id: string) {
  return (await sessionRowOrNull(id))!;
}
