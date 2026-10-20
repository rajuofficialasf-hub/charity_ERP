import { createHash, randomUUID } from 'node:crypto';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UPLOAD_RULES } from '@css/shared/files';
import { FileProcessor } from '../../src/jobs/file-process';
import { skippingScanner } from '../../src/files/scanner';
import { oversizedPng, photoWithExif, picture } from '../support/photos';
import { accessWorld } from './support/access-fixtures';
import { account, type AuthHarness, authHarness, login } from './support/auth-app';
import * as f from './support/fixtures';

// The processing of an uploaded file: the scan, the photo's own metadata, the thumbnails, the
// near duplicates of a project, and the files it refuses to decode.
const PART = UPLOAD_RULES.partSize;
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
let token: string;
const applications: Record<'a1' | 'a1b' | 'a2', string> = { a1: '', a1b: '', a2: '' };

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

beforeAll(async () => {
  h = await authHarness();
  world = await accessWorld(h.db, {
    staff: async (role) => (await account(h.db, { kind: 'staff', role })).id,
    volunteerUser: async (role) => (await account(h.db, { kind: 'volunteer', role })).id,
  });
  await h.db.query(`UPDATE projects SET status = 'active'`);
  const volunteer = (
    await h.db.query('SELECT id FROM volunteers WHERE user_id = $1', [world.users.general])
  ).rows[0].id as string;
  const make = async (project: typeof world.a1) =>
    f.application(
      h.db,
      { project, loc: world.dhaka },
      { owner_volunteer_id: volunteer, beneficiary_id: await f.beneficiary(h.db, world.dhaka) },
    );
  applications.a1 = await make(world.a1);
  applications.a1b = await make(world.a1);
  applications.a2 = await make(world.a2);
  const row = (await h.db.query('SELECT mobile FROM users WHERE id = $1', [world.users.general]))
    .rows[0];
  token = (await login(h, row.mobile)).accessToken;
});
afterAll(async () => h.close());

/** Uploads through the API and answers the new file's id. */
async function upload(
  bytes: Buffer,
  over: Record<string, unknown> = {},
  application = applications.a1,
): Promise<string> {
  const auth = { Authorization: `Bearer ${token}` };
  const created = await request(h.server())
    .post('/api/v1/upload-sessions')
    .set(auth)
    .send({
      clientUuid: randomUUID(),
      kind: 'distribution_proof',
      entityType: 'application',
      entityId: application,
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
      .set(auth)
      .set('Content-Type', 'application/octet-stream')
      .send(bytes.subarray(n * PART, (n + 1) * PART));
  const done = await request(h.server()).post(`/api/v1/upload-sessions/${id}/finalize`).set(auth);
  expect(done.status).toBe(201);
  return done.body.data.id as string;
}

const fileRow = async (id: string) =>
  (await h.db.query('SELECT * FROM files WHERE id = $1', [id])).rows[0];
const processFile = (id: string) => h.container.fileProcessor.process(id);

describe('the processing job', () => {
  it('is queued at finalize, and clears a photo with thumbnails, its capture time and position', async () => {
    const id = await upload(await photoWithExif());
    const queued = await h.db.query(
      `SELECT count(*)::int AS n FROM pgboss.job WHERE name = 'photos' AND data->>'fileId' = $1`,
      [id],
    );
    expect(queued.rows[0].n).toBe(1);
    expect((await fileRow(id)).virus_scan).toBe('pending');
    expect(await processFile(id)).toEqual({ virusScan: 'skipped' });
    const row = await fileRow(id);
    expect(row.captured_at.toISOString()).toBe('2026-10-20T08:05:00.000Z');
    expect(Number(row.latitude)).toBeCloseTo(23.8103, 3);
    expect(row.flags).not.toContain('no_capture_time');
    expect(row.flags).not.toContain('no_gps');
    expect(row.phash).not.toBeNull();
    for (const key of [row.thumbnail_small_key, row.thumbnail_medium_key]) {
      expect(key).toMatch(new RegExp(`/thumb/${id}-[sm]\\.jpg$`));
      expect(await h.container.storage.stat('photos', key)).not.toBeNull();
    }
  });

  it('flags a photo without a capture time or a position anywhere', async () => {
    const id = await upload(await picture({ variant: 7 }));
    await processFile(id);
    expect((await fileRow(id)).flags).toEqual(['no_capture_time', 'no_gps']);
  });

  it('keeps what the phone declared over the photo metadata', async () => {
    const id = await upload(await photoWithExif('2026:10:19 10:00:00'), {
      capturedAt: '2026-10-19T03:59:00.000Z',
      gps: { lat: 22.5, lng: 91.8 },
    });
    await processFile(id);
    const row = await fileRow(id);
    expect(row.captured_at.toISOString()).toBe('2026-10-19T03:59:00.000Z');
    expect(Number(row.latitude)).toBeCloseTo(22.5, 3);
  });

  it('flags near duplicates in the same project on both files, and not across projects', async () => {
    const first = await upload(await picture({ width: 1200, variant: 3 }));
    await processFile(first);
    const elsewhere = await upload(
      await picture({ width: 800, variant: 3, quality: 70 }),
      {},
      applications.a2,
    );
    await processFile(elsewhere);
    expect((await fileRow(first)).flags).not.toContain('duplicate_suspect');
    expect((await fileRow(elsewhere)).flags).not.toContain('duplicate_suspect');
    const second = await upload(
      await picture({ width: 600, variant: 3, quality: 60 }),
      {},
      applications.a1b,
    );
    await processFile(second);
    expect((await fileRow(second)).flags).toContain('duplicate_suspect');
    expect((await fileRow(first)).flags).toContain('duplicate_suspect');
  });

  it('leaves the file failed, never clean, when the scanner fails, and processes it on a retry', async () => {
    const id = await upload(await picture({ variant: 8 }));
    const failing = new FileProcessor(
      h.container.prisma,
      h.container.storage,
      { name: 'broken', scan: () => Promise.reject(new Error('scanner down')) },
      pino({ level: 'silent' }),
    );
    await expect(failing.process(id)).rejects.toThrow('scanner down');
    expect((await fileRow(id)).virus_scan).toBe('failed');
    const working = new FileProcessor(
      h.container.prisma,
      h.container.storage,
      skippingScanner,
      pino({ level: 'silent' }),
    );
    expect(await working.process(id)).toEqual({ virusScan: 'skipped' });
  });

  it('blocks an infected file for good', async () => {
    const id = await upload(await picture({ variant: 9 }));
    const infected = new FileProcessor(
      h.container.prisma,
      h.container.storage,
      { name: 'eicar', scan: () => Promise.resolve('infected') },
      pino({ level: 'silent' }),
    );
    expect(await infected.process(id)).toEqual({ virusScan: 'infected' });
    expect(await processFile(id)).toEqual({ virusScan: 'infected' });
    expect((await fileRow(id)).thumbnail_small_key).toBeNull();
  });

  it("flags a gallery photo where the project's photo rule asks for the camera", async () => {
    const setSource = (source: unknown) =>
      h.db.query(
        `INSERT INTO project_components (id, project_id, component_key, enabled, settings)
         VALUES ($1, $2, 'distribution', true, $3)
         ON CONFLICT (project_id, component_key) DO UPDATE SET settings = EXCLUDED.settings`,
        [randomUUID(), world.a1.id, JSON.stringify({ rule: 'individual', source })],
      );
    await setSource({ distribution_proof: 'camera_only' });
    const flagged = await upload(await picture({ variant: 11 }), { source: 'gallery' });
    await processFile(flagged);
    expect((await fileRow(flagged)).flags).toContain('gallery_under_camera_only');
    await setSource({ distribution_proof: 'camera_or_gallery' });
    const allowed = await upload(await picture({ variant: 12 }), { source: 'gallery' });
    await processFile(allowed);
    expect((await fileRow(allowed)).flags).not.toContain('gallery_under_camera_only');
    // a setting that is not a photo source falls back to the camera for proof photos
    await setSource({ distribution_proof: 'anything' });
    const fallback = await upload(await picture({ variant: 13 }), { source: 'gallery' });
    await processFile(fallback);
    expect((await fileRow(fallback)).flags).toContain('gallery_under_camera_only');
  });

  it('ends an image over 40 megapixels failed without decoding it', async () => {
    const id = await upload(oversizedPng(), { mime: 'image/png' });
    expect(await processFile(id)).toEqual({ virusScan: 'failed' });
    const row = await fileRow(id);
    expect(row.thumbnail_small_key).toBeNull();
    expect(row.phash).toBeNull();
  });

  it('changes nothing when it runs twice', async () => {
    const id = await upload(await picture({ variant: 10 }));
    await processFile(id);
    const before = await fileRow(id);
    expect(await processFile(id)).toEqual({ virusScan: 'skipped' });
    expect(await fileRow(id)).toEqual(before);
  });
});
