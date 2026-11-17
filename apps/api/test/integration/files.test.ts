import { createHash, randomUUID } from 'node:crypto';
import { Readable, Writable } from 'node:stream';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UPLOAD_RULES } from '@css/shared/files';
import { readPhotoMetadata } from '../../src/files/exif.js';
import { FilesService } from '../../src/services/files.js';
import { picture } from '../support/photos.js';
import { accessWorld } from './support/access-fixtures.js';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  type Session,
} from './support/auth-app.js';
import * as f from './support/fixtures.js';

// Reading the files linked to a record: who may stream a file and its thumbnails, the quarantine,
// the metadata with its position, and the near duplicate named only to who reaches it.
const PART = UPLOAD_RULES.partSize;
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const sessions: Record<string, Session> = {};
let dhakaApplication: string;
let rangpurApplication: string;
const logLines: Record<string, unknown>[] = [];
const logStream = new Writable({
  write(chunk, _enc, done) {
    for (const line of String(chunk).split('\n'))
      if (line.trim()) logLines.push(JSON.parse(line) as Record<string, unknown>);
    done();
  },
});

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

beforeAll(async () => {
  h = await authHarness({ logStream });
  world = await accessWorld(h.db, {
    staff: async (role) => (await account(h.db, { kind: 'staff', role })).id,
    volunteerUser: async (role) => (await account(h.db, { kind: 'volunteer', role })).id,
  });
  await h.db.query(`UPDATE projects SET status = 'active'`);
  const volunteer = (
    await h.db.query('SELECT id FROM volunteers WHERE user_id = $1', [world.users.general])
  ).rows[0].id as string;
  dhakaApplication = await f.application(
    h.db,
    { project: world.a1, loc: world.dhaka },
    { owner_volunteer_id: volunteer, beneficiary_id: await f.beneficiary(h.db, world.dhaka) },
  );
  rangpurApplication = await f.application(
    h.db,
    { project: world.a1, loc: world.rangpur },
    { beneficiary_id: await f.beneficiary(h.db, world.rangpur) },
  );
  for (const name of ['general', 'rpmDhaka', 'rpmRangpur', 'daee'] as const) {
    const row = (
      await h.db.query('SELECT email, mobile FROM users WHERE id = $1', [world.users[name]])
    ).rows[0];
    sessions[name] = await login(h, row.email ?? row.mobile);
  }
  const media: Account = await account(h.db, { role: 'media_team' });
  sessions.media = await login(h, media);
});
afterAll(async () => h.close());

const as = (who: string) => bearer(sessions[who]!);

/** Uploads through the API as `who` and answers the new file's id. */
async function upload(
  who: string,
  bytes: Buffer,
  over: Record<string, unknown> = {},
): Promise<string> {
  const created = await request(h.server())
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
      source: 'camera',
      ...over,
    });
  expect(created.status).toBe(201);
  const id = created.body.data.id as string;
  for (let n = 0; n * PART < bytes.length; n += 1)
    await request(h.server())
      .put(`/api/v1/upload-sessions/${id}/parts/${n + 1}`)
      .set(as(who))
      .set('Content-Type', 'application/octet-stream')
      .send(bytes.subarray(n * PART, (n + 1) * PART));
  const done = await request(h.server())
    .post(`/api/v1/upload-sessions/${id}/finalize`)
    .set(as(who));
  expect(done.status).toBe(201);
  return done.body.data.id as string;
}

const content = (who: string, fileId: string, variant?: string) =>
  request(h.server())
    .get(`/api/v1/files/${fileId}/content${variant ? `?variant=${variant}` : ''}`)
    .set(as(who))
    .buffer(true)
    .parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    });
const download = (who: string, fileId: string) =>
  request(h.server())
    .get(`/api/v1/files/${fileId}/download`)
    .set(as(who))
    .buffer(true)
    .parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    });
const downloads = async (fileId: string) =>
  (
    await h.db.query(
      `SELECT actor_user_id, new FROM audit_log WHERE action = 'file.downloaded' AND entity_id = $1`,
      [fileId],
    )
  ).rows as { actor_user_id: string; new: Record<string, unknown> }[];
const fileRowScan = async (id: string) =>
  (await h.db.query('SELECT virus_scan FROM files WHERE id = $1', [id])).rows[0];
const info = (who: string, fileId: string) =>
  request(h.server()).get(`/api/v1/files/${fileId}`).set(as(who));

describe('streaming a file linked to a record', () => {
  it('streams a cleared photo and its thumbnails to an official who reaches the record', async () => {
    const bytes = await picture({ variant: 1, width: 800 });
    const id = await upload('general', bytes);
    await h.container.fileProcessor.process(id);
    const whole = await content('rpmDhaka', id);
    expect(whole.status).toBe(200);
    expect(whole.headers).toMatchObject({
      'content-type': 'image/jpeg',
      'content-disposition': 'inline',
      // every kind but a cover photo is kept by no cache
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    expect((whole.body as Buffer).equals(bytes)).toBe(true);
    for (const variant of ['small', 'medium']) {
      const thumb = await content('rpmDhaka', id, variant);
      expect(thumb.status).toBe(200);
      expect(thumb.headers['content-type']).toBe('image/jpeg');
      expect((thumb.body as Buffer).length).toBeLessThan(bytes.length);
    }
    // the uploader sees the own file
    expect((await content('general', id)).status).toBe(200);
    // no response carries a storage address
    expect(JSON.stringify((await info('rpmDhaka', id)).body)).not.toMatch(/https?:\/\//);
  });

  it('streams a voucher PDF inline, but never to the Media Team', async () => {
    const pdf = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');
    const id = await upload('general', pdf, {
      kind: 'voucher',
      slot: 'voucher',
      mime: 'application/pdf',
      source: 'gallery',
    });
    await h.container.fileProcessor.process(id);
    const res = await content('rpmDhaka', id);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe('inline');
    expect((await content('media', id)).status).toBe(404);
  });

  it("refuses another region's official and a volunteer not on the record with 404, logged", async () => {
    const id = await upload('general', await picture({ variant: 2 }));
    await h.container.fileProcessor.process(id);
    const before = logLines.length;
    expect((await content('rpmRangpur', id)).status).toBe(404);
    expect((await content('daee', id)).status).toBe(404);
    expect((await info('daee', id)).status).toBe(404);
    expect((await content('rpmDhaka', randomUUID())).status).toBe(404);
    const denied = logLines.slice(before).filter((l) => l.event === 'permission_denied');
    expect(denied.length).toBeGreaterThanOrEqual(3);
  });

  it('answers 423 while the scan has not cleared a file and 410 once infected, to who may see it', async () => {
    const id = await upload('general', await picture({ variant: 3 }));
    const pending = await content('rpmDhaka', id);
    expect(pending.status).toBe(423);
    expect(JSON.parse(pending.body.toString()).error.code).toBe('file.quarantined');
    expect((await content('rpmRangpur', id)).status).toBe(404);
    expect((await info('rpmDhaka', id)).body.data.virusScan).toBe('pending');
    await h.db.query(`UPDATE files SET virus_scan = 'infected' WHERE id = $1`, [id]);
    const infected = await content('rpmDhaka', id);
    expect(infected.status).toBe(410);
    expect(JSON.parse(infected.body.toString()).error.code).toBe('file.infected');
    expect((await info('rpmDhaka', id)).body.data.virusScan).toBe('infected');
  });

  it('keeps a file without a scanner from production, while development may view it', async () => {
    const id = await upload('general', await picture({ variant: 6 }));
    await h.container.fileProcessor.process(id);
    expect((await fileRowScan(id)).virus_scan).toBe('skipped');
    const production = new FilesService(
      { NODE_ENV: 'production', CURSOR_SECRET: 'c'.repeat(32) },
      h.container.prisma,
      h.container.storage,
      h.container.access,
      h.container.audit,
    );
    const refused = await production
      .streamContent({ userId: world.users.general } as never, id, {} as never)
      .catch((error: { code?: string }) => error.code);
    expect(refused).toBe('file.quarantined');
    expect((await content('general', id)).status).toBe(200);
  });

  it('keeps a photo of an official-only question from the volunteer of the application', async () => {
    // a question of an official-only section on the application's form, and its photo
    const version = (
      await h.db.query('SELECT form_version_id FROM applications WHERE id = $1', [dhakaApplication])
    ).rows[0].form_version_id as string;
    const section = randomUUID();
    await h.db.query(
      `INSERT INTO form_sections (id, form_version_id, key, title_bn, title_en, sort_order, visibility)
       VALUES ($1, $2, 'office_part', 'অফিস', 'Office', 99, 'official_only')`,
      [section, version],
    );
    await h.db.query(
      `INSERT INTO form_fields (id, form_section_id, form_version_id, field_key, type, label_bn, label_en, sort_order)
       VALUES ($1, $2, $3, 'q_office_photo', 'photo', 'ছবি', 'Photo', 1)`,
      [randomUUID(), section, version],
    );
    const fileId = await upload('rpmDhaka', await picture({ variant: 7, width: 400 }), {
      kind: 'form_photo',
      slot: 'q_office_photo',
    });
    await h.container.fileProcessor.process(fileId);
    expect((await content('rpmDhaka', fileId)).status).toBe(200);
    expect((await content('general', fileId)).status).toBe(404);
    const listed = await request(h.server())
      .get(`/api/v1/files?entityType=application&entityId=${dhakaApplication}`)
      .set(as('general'));
    expect(JSON.stringify(listed.body)).not.toContain(fileId);
  });

  it('keeps a payment copy the office attached from the volunteer of the application', async () => {
    const fileId = await upload('rpmDhaka', await picture({ variant: 8, width: 400 }), {
      kind: 'payment_copy',
      slot: 'payment_copy',
    });
    await h.container.fileProcessor.process(fileId);
    expect((await content('rpmDhaka', fileId)).status).toBe(200);
    expect((await content('general', fileId)).status).toBe(404);
  });

  it('answers 404 for a thumbnail a file does not have', async () => {
    const pdf = Buffer.from('%PDF-1.4\n%%EOF\n');
    const id = await upload('general', pdf, {
      kind: 'voucher',
      slot: 'voucher',
      mime: 'application/pdf',
    });
    await h.container.fileProcessor.process(id);
    expect((await content('rpmDhaka', id, 'small')).status).toBe(404);
    expect((await content('rpmDhaka', id, 'large')).status).toBe(422);
  });
});

describe('the metadata of a file', () => {
  it('shows the position to the uploader and an official with the class, and nothing to the Media Team', async () => {
    const id = await upload('general', await picture({ variant: 4 }), {
      capturedAt: new Date(h.clock.now().getTime() - 60_000).toISOString(),
      gps: { lat: 23.81, lng: 90.41, accuracyM: 12 },
    });
    await h.container.fileProcessor.process(id);
    const own = await info('general', id);
    expect(own.status).toBe(200);
    expect(own.body.data.gps).toEqual({ lat: 23.81, lng: 90.41, accuracyM: 12 });
    expect((await info('rpmDhaka', id)).body.data.gps).toEqual({
      lat: 23.81,
      lng: 90.41,
      accuracyM: 12,
    });
    // the Media Team reads an application only through the work of its referral
    expect((await info('media', id)).status).toBe(404);
  });

  it('names a near duplicate only to a caller who reaches it', async () => {
    const first = await upload('rpmRangpur', await picture({ variant: 5, width: 1200 }), {
      entityId: rangpurApplication,
    });
    await h.container.fileProcessor.process(first);
    const second = await upload('general', await picture({ variant: 5, width: 600, quality: 60 }));
    await h.container.fileProcessor.process(second);
    const own = await info('general', second);
    expect(own.body.data.flags).toContain('duplicate_suspect');
    // the volunteer does not reach the Rangpur application
    expect(own.body.data.duplicateOf).toBeNull();
    const pm = await account(h.db, { role: 'program_manager' });
    await h.db.query('UPDATE programs SET pm_user_id = $1 WHERE id = $2', [
      pm.id,
      world.a1.program,
    ]);
    const pmInfo = await request(h.server())
      .get(`/api/v1/files/${second}`)
      .set(bearer(await login(h, pm)));
    expect(pmInfo.body.data.duplicateOf).toBe(first);
  });

  it('gives an official the size, the uploader and the record, and the uploader their own name', async () => {
    const id = await upload('general', await picture({ variant: 8, width: 320 }), {
      gps: { lat: 23.81, lng: 90.41, accuracyM: 9 },
    });
    await h.container.fileProcessor.process(id);
    const name = (
      await h.db.query('SELECT display_name FROM users WHERE id = $1', [world.users.general])
    ).rows[0].display_name as string;
    const official = (await info('rpmDhaka', id)).body.data;
    expect(official).toMatchObject({
      width: 320,
      height: 240,
      uploadedBy: { name },
      records: [{ entityType: 'application', entityId: dhakaApplication }],
      gps: { lat: 23.81, lng: 90.41, accuracyM: 9 },
    });
    const own = (await info('general', id)).body.data;
    expect(own.uploadedBy).toEqual({ name });
    expect(own.records).toEqual([{ entityType: 'application', entityId: dhakaApplication }]);
  });

  it("tells a volunteer neither another person's name nor the position of a photo on their application", async () => {
    const id = await upload('rpmDhaka', await picture({ variant: 9 }), {
      gps: { lat: 23.8, lng: 90.4, accuracyM: 5 },
    });
    await h.container.fileProcessor.process(id);
    const owner = await info('general', id);
    expect(owner.status).toBe(200);
    expect(owner.body.data.uploadedBy).toBeNull();
    expect(owner.body.data.gps).toBeUndefined();
    expect(owner.body.data.records).toEqual([
      { entityType: 'application', entityId: dhakaApplication },
    ]);
    // the Rangpur official does not reach the Dhaka application
    expect((await info('rpmRangpur', id)).status).toBe(404);
  });

  it('names no size for a file processed before its size was kept', async () => {
    const id = await upload('general', await picture({ variant: 11 }));
    await h.container.fileProcessor.process(id);
    await h.db.query('UPDATE files SET width = NULL, height = NULL WHERE id = $1', [id]);
    const res = await info('rpmDhaka', id);
    expect(res.body.data).toMatchObject({ width: null, height: null });
  });
});

describe('the download of a photo', () => {
  const TAKEN = '2026-11-02T04:30:15.000Z';

  it('saves the photo with its time and place for an official, audited once', async () => {
    const id = await upload('general', await picture({ variant: 12 }), {
      capturedAt: TAKEN,
      gps: { lat: 23.81, lng: 90.41, accuracyM: 8 },
    });
    await h.container.fileProcessor.process(id);
    const res = await download('rpmDhaka', id);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="photo-20261102-103015-${id.slice(0, 8)}.jpg"`,
    );
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(await readPhotoMetadata(res.body as Buffer)).toEqual({
      capturedAt: new Date(TAKEN),
      gps: { lat: expect.closeTo(23.81, 6), lng: expect.closeTo(90.41, 6) },
    });
    expect(await downloads(id)).toEqual([
      {
        actor_user_id: world.users.rpmDhaka,
        new: {
          kind: 'distribution_proof',
          record: { entityType: 'application', entityId: dhakaApplication },
          position: true,
        },
      },
    ]);
  });

  it('gives the uploader the place, and another reader of the record the time alone', async () => {
    const own = await upload('general', await picture({ variant: 13 }), {
      capturedAt: TAKEN,
      gps: { lat: 23.7, lng: 90.3, accuracyM: 5 },
    });
    await h.container.fileProcessor.process(own);
    expect((await readPhotoMetadata((await download('general', own)).body as Buffer)).gps).toEqual({
      lat: expect.closeTo(23.7, 6),
      lng: expect.closeTo(90.3, 6),
    });
    const office = await upload('rpmDhaka', await picture({ variant: 14 }), {
      capturedAt: TAKEN,
      gps: { lat: 23.7, lng: 90.3, accuracyM: 5 },
    });
    await h.container.fileProcessor.process(office);
    const res = await download('general', office);
    expect(res.status).toBe(200);
    expect(await readPhotoMetadata(res.body as Buffer)).toEqual({
      capturedAt: new Date(TAKEN),
      gps: null,
    });
    expect((await downloads(office))[0]!.new).toMatchObject({ position: false });
  });

  it('refuses who may not see it, a photo not yet cleared, and a caller without a session', async () => {
    const id = await upload('general', await picture({ variant: 15 }));
    expect((await download('rpmDhaka', id)).status).toBe(423);
    await h.container.fileProcessor.process(id);
    expect((await download('rpmRangpur', id)).status).toBe(404);
    expect((await download('media', id)).status).toBe(404);
    expect((await request(h.server()).get(`/api/v1/files/${id}/download`)).status).toBe(401);
    expect(await downloads(id)).toEqual([]);
  });

  it('answers 404 for a file that is not a photo, which keeps its own route', async () => {
    // bytes of its own, so the project's identical-file check does not refuse the upload
    const pdf = Buffer.from(`%PDF-1.7\n% ${randomUUID()}\n1 0 obj << >> endobj\n%%EOF\n`);
    const id = await upload('general', pdf, {
      kind: 'voucher',
      slot: 'voucher',
      mime: 'application/pdf',
      source: 'gallery',
    });
    await h.container.fileProcessor.process(id);
    expect((await download('rpmDhaka', id)).status).toBe(404);
  });

  it('writes no audit for a stored photo that is gone or damaged', async () => {
    const gone = await upload('general', await picture({ variant: 16 }));
    await h.container.fileProcessor.process(gone);
    const goneRow = (await h.db.query('SELECT bucket, object_key FROM files WHERE id = $1', [gone]))
      .rows[0];
    await h.container.storage.remove(goneRow.bucket, goneRow.object_key);
    expect((await download('rpmDhaka', gone)).status).toBe(404);
    expect(await downloads(gone)).toEqual([]);

    const damaged = await upload('general', await picture({ variant: 17 }));
    await h.container.fileProcessor.process(damaged);
    const row = (await h.db.query('SELECT bucket, object_key FROM files WHERE id = $1', [damaged]))
      .rows[0];
    const garbage = Buffer.from('not a photo at all');
    await h.container.storage.put(row.bucket, row.object_key, Readable.from([garbage]), {
      contentType: 'image/jpeg',
      size: garbage.length,
    });
    const res = await download('rpmDhaka', damaged);
    expect(res.status).toBe(422);
    expect(JSON.parse((res.body as Buffer).toString()).error.code).toBe('file.unreadable');
    expect(await downloads(damaged)).toEqual([]);
  });
});

describe('the files of a record', () => {
  const list = (who: string, query: Record<string, string>) =>
    request(h.server())
      .get('/api/v1/files')
      .query({ entityType: 'application', entityId: listApplication, ...query })
      .set(as(who));
  let listApplication: string;
  let photo: string;
  let voucher: string;
  let photoSize: number;

  beforeAll(async () => {
    const volunteer = (
      await h.db.query('SELECT id FROM volunteers WHERE user_id = $1', [world.users.general])
    ).rows[0].id as string;
    listApplication = await f.application(
      h.db,
      { project: world.a1, loc: world.dhaka },
      { owner_volunteer_id: volunteer, beneficiary_id: await f.beneficiary(h.db, world.dhaka) },
    );
    const photoBytes = await picture({ variant: 20 });
    photoSize = photoBytes.length;
    photo = await upload('general', photoBytes, {
      entityId: listApplication,
      capturedAt: new Date(h.clock.now().getTime() - 60_000).toISOString(),
      gps: { lat: 23.75, lng: 90.39 },
    });
    voucher = await upload('rpmDhaka', Buffer.from('%PDF-1.7\n%%EOF\n'), {
      entityId: listApplication,
      kind: 'voucher',
      slot: 'voucher',
      mime: 'application/pdf',
      source: 'gallery',
    });
  });

  it('lists kind, size, capture time, flags and scan state, newest first, never a key or an address', async () => {
    const res = await list('rpmDhaka', {});
    expect(res.status).toBe(200);
    expect(res.body.data.map((r: { id: string }) => r.id)).toEqual([voucher, photo]);
    expect(res.body.data[0]).toMatchObject({ kind: 'voucher', mime: 'application/pdf', flags: [] });
    expect(res.body.data[1]).toMatchObject({
      sizeBytes: photoSize,
      flags: [],
      kind: 'distribution_proof',
      slot: 'distribution_proof',
      mime: 'image/jpeg',
      virusScan: 'pending',
      gps: { lat: 23.75, lng: 90.39 },
    });
    expect(res.body.data[1].capturedAt).not.toBeNull();
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/https?:\/\//);
    expect(text).not.toContain('objectKey');
    expect(text).not.toContain(listApplication + '/');
    // pages by cursor
    const first = await list('rpmDhaka', { limit: '1' });
    expect(first.body.data).toHaveLength(1);
    const next = await list('rpmDhaka', { limit: '1', cursor: first.body.meta.nextCursor });
    expect(next.body.data[0].id).toBe(photo);
  });

  it('lists nothing to the Media Team, and shows the position to the uploader', async () => {
    expect((await list('media', {})).status).toBe(404);
    const own = await list('general', {});
    expect(own.body.data.find((r: { id: string }) => r.id === photo).gps).toEqual({
      lat: 23.75,
      lng: 90.39,
      accuracyM: null,
    });
  });

  it('refuses a caller who does not see the record, and a record type without files (404)', async () => {
    expect((await list('rpmRangpur', {})).status).toBe(404);
    expect((await list('daee', {})).status).toBe(404);
    expect((await list('rpmDhaka', { entityType: 'beneficiary' })).status).toBe(404);
    expect((await list('rpmDhaka', { entityId: randomUUID() })).status).toBe(404);
  });

  it('exports the same rows as CSV, audited for every export', async () => {
    const res = await list('rpmDhaka', { format: 'csv' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="files-${listApplication}.csv"`,
    );
    const lines = res.text.trim().split('\r\n');
    expect(lines[0]).toBe(
      'id,kind,slot,mime,size_bytes,captured_at,uploaded_at,virus_scan,flags,latitude,longitude',
    );
    expect(lines).toHaveLength(3);
    expect(lines[2]).toMatch(
      new RegExp(`^${photo},distribution_proof,distribution_proof,image/jpeg,`),
    );
    expect(lines[2]).toMatch(/,23\.75,90\.39$/);
    expect((await list('media', { format: 'csv' })).status).toBe(404);
    const audits = await h.db.query(
      `SELECT new FROM audit_log WHERE action = 'file.list_exported' AND entity_id = $1 ORDER BY created_at, id`,
      [listApplication],
    );
    expect(audits.rows).toHaveLength(1);
    expect(audits.rows[0].new).toMatchObject({ rows: 2, format: 'csv' });
  });

  it('refuses a bad query (422) and a caller without a token (401)', async () => {
    for (const query of [
      { format: 'xml' },
      { entityId: 'not-a-uuid' },
      { entityType: 'x'.repeat(41) },
      { limit: '101' },
    ] as Record<string, string>[])
      expect((await list('rpmDhaka', query)).status).toBe(422);
    const anonymous = await request(h.server())
      .get('/api/v1/files')
      .query({ entityType: 'application', entityId: listApplication });
    expect(anonymous.status).toBe(401);
  });

  it('caps the CSV at 5,000 rows', async () => {
    const many = await f.application(
      h.db,
      { project: world.a1, loc: world.dhaka },
      { beneficiary_id: await f.beneficiary(h.db, world.dhaka) },
    );
    await h.db.query(
      `WITH made AS (
         INSERT INTO files (id, bucket, storage_driver, object_key, kind, mime, size_bytes, sha256, project_id, uploaded_by, source, virus_scan)
         SELECT gen_random_uuid(), 'photos', 'nas', 'cap/' || n || '.jpg', 'evidence', 'image/jpeg', 10,
                md5('cap' || n) || md5('cap-' || n), $1, $2, 'camera', 'skipped'
           FROM generate_series(1, 5001) AS n
         RETURNING id)
       INSERT INTO file_links (id, file_id, entity_type, entity_id, slot)
       SELECT gen_random_uuid(), id, 'application', $3, 'evidence' FROM made`,
      [world.a1.id, world.users.rpmDhaka, many],
    );
    const res = await request(h.server())
      .get('/api/v1/files')
      .query({ entityType: 'application', entityId: many, format: 'csv' })
      .set(as('rpmDhaka'));
    expect(res.status).toBe(200);
    expect(res.text.trim().split('\r\n')).toHaveLength(5001);
  });

  it('audits a list that holds NID photos as their view', async () => {
    const nid = randomUUID();
    await h.db.query(
      `INSERT INTO files (id, bucket, storage_driver, object_key, kind, mime, size_bytes, sha256, project_id, uploaded_by, source, virus_scan)
       VALUES ($1, 'profiles', 'nas', $2, 'nid_photo', 'image/jpeg', 10, $3, $4, $5, 'camera', 'skipped')`,
      [nid, `beneficiaries/${nid}.jpg`, sha256(Buffer.from(nid)), world.a1.id, world.users.general],
    );
    await h.db.query(
      `INSERT INTO file_links (id, file_id, entity_type, entity_id, slot) VALUES ($1, $2, 'application', $3, 'nid_photo')`,
      [randomUUID(), nid, listApplication],
    );
    const res = await list('general', {});
    expect(res.body.data.map((r: { id: string }) => r.id)).toContain(nid);
    const audits = await h.db.query(
      `SELECT new FROM audit_log WHERE action = 'file.nid_viewed' AND entity_id = $1`,
      [listApplication],
    );
    expect(audits.rows[0].new).toMatchObject({ fileIds: [nid], format: 'list' });
    await list('general', { format: 'csv' });
    const both = await h.db.query(
      `SELECT new FROM audit_log WHERE action = 'file.nid_viewed' AND entity_id = $1 ORDER BY created_at, id`,
      [listApplication],
    );
    expect(both.rows[1].new).toMatchObject({ fileIds: [nid], format: 'csv' });
    // an official who did not upload it lists the record without the NID photo, and leaves no
    // trace of its view
    const before = await h.db.query(
      `SELECT count(*)::int AS n FROM audit_log WHERE action = 'file.nid_viewed' AND entity_id = $1`,
      [listApplication],
    );
    const office = await list('rpmDhaka', {});
    expect(office.status).toBe(200);
    expect(office.body.data.map((r: { id: string }) => r.id)).not.toContain(nid);
    const after = await h.db.query(
      `SELECT count(*)::int AS n FROM audit_log WHERE action = 'file.nid_viewed' AND entity_id = $1`,
      [listApplication],
    );
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it('shows the slot of the link to the record listed when a file links to two records', async () => {
    const activity = randomUUID();
    await h.db.query(
      `INSERT INTO file_links (id, file_id, entity_type, entity_id, slot) VALUES ($1, $2, 'activity', $3, 'final_photo')`,
      [randomUUID(), photo, activity],
    );
    const res = await list('rpmDhaka', {});
    expect(res.body.data.find((r: { id: string }) => r.id === photo).slot).toBe(
      'distribution_proof',
    );
  });
});

describe('the download limit', () => {
  let limited: AuthHarness;
  beforeAll(async () => {
    limited = await authHarness({ realRateLimits: true });
  });
  afterAll(async () => limited.close());

  it('stops a person after 120 downloads in an hour', async () => {
    const rpm = await account(limited.db, { role: 'regional_program_manager' });
    const s = await login(limited, rpm);
    const call = () =>
      request(limited.server()).get(`/api/v1/files/${randomUUID()}/download`).set(bearer(s));
    for (let i = 0; i < 120; i += 1) expect((await call()).status).toBe(404);
    expect((await call()).status).toBe(429);
  });
});
