import { createHash, randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UPLOAD_RULES } from '@css/shared/files';
import { picture } from '../support/photos';
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
  it('shows the position to the uploader and an official with the class, never to the Media Team', async () => {
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
    const media = await info('media', id);
    expect(media.status).toBe(200);
    expect(media.body.data).not.toHaveProperty('gps');
    expect(media.body.data.capturedAt).not.toBeNull();
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
});
