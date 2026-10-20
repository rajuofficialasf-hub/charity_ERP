import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gif, jpeg, METADATA_MARKER, png } from '../support/images';
import { account, authHarness, type AuthHarness, bearer, login } from './support/auth-app';
import * as f from './support/fixtures';
import { TOKEN_HEADER, verifiedDraft } from './support/registration';

// Registration photos and the photo stream (DECISION_LOG D-087; plan
// docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md, unit U5).
let h: AuthHarness;
let loc: Awaited<ReturnType<typeof f.locationTree>>;

beforeAll(async () => {
  h = await authHarness();
  for (const role of ['finance_team', 'official_daee'])
    await h.db.query(
      `INSERT INTO roles (key, name_bn, name_en, kind, global_scope) VALUES ($1, $1, $1, 'official', false) ON CONFLICT DO NOTHING`,
      [role],
    );
  loc = await f.locationTree(h.db);
});
afterAll(async () => h.close());

type Draft = Awaited<ReturnType<typeof verifiedDraft>>;

function upload(
  draft: Pick<Draft, 'registrationId'> & { token?: string },
  slot: string,
  bytes: Buffer,
  type = 'image/jpeg',
) {
  const req = request(h.server())
    .post(
      `/api/v1/auth/register/photos/${slot}?registrationId=${draft.registrationId}&source=camera`,
    )
    .set('Content-Type', type);
  if (draft.token) req.set(TOKEN_HEADER, draft.token);
  return req.send(bytes);
}

const fileRow = async (id: string) =>
  (await h.db.query('SELECT * FROM files WHERE id = $1', [id])).rows[0] as
    Record<string, unknown> | undefined;

const stored = (key: string) => h.container.storage.stat('profiles', key);

async function readStored(key: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of await h.container.storage.get('profiles', key)) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

describe('POST /auth/register/photos/{slot}', () => {
  it('stores a JPEG and a PNG without metadata and links them to the verified draft', async () => {
    const d = await verifiedDraft(h);
    const photo = await upload(d, 'photo', jpeg());
    expect(photo.status).toBe(201);
    const nidPhoto = await upload(d, 'nid_photo', png(), 'image/png');
    expect(nidPhoto.status).toBe(201);
    // the second page of the NID card has its own slot (UX-18)
    const nidBack = await upload(d, 'nid_photo_back', jpeg());
    expect(nidBack.status).toBe(201);
    const draft = (
      await h.db.query(
        'SELECT photo_file_id, nid_photo_file_id, nid_photo_back_file_id FROM registration_drafts WHERE id = $1',
        [d.registrationId],
      )
    ).rows[0];
    expect(draft).toEqual({
      photo_file_id: photo.body.data.fileId,
      nid_photo_file_id: nidPhoto.body.data.fileId,
      nid_photo_back_file_id: nidBack.body.data.fileId,
    });
    expect((await fileRow(nidBack.body.data.fileId))!.kind).toBe('nid_photo');
    const row = (await fileRow(photo.body.data.fileId))!;
    expect(row).toMatchObject({
      bucket: 'profiles',
      kind: 'profile_photo',
      mime: 'image/jpeg',
      source: 'camera',
      virus_scan: 'pending',
      uploaded_by: null,
      project_id: null,
    });
    expect(String(row.object_key)).toContain(d.registrationId);
    expect(String(row.object_key)).not.toContain(d.mobile);
    const bytes = await readStored(String(row.object_key));
    expect(bytes.includes(METADATA_MARKER)).toBe(false);
    expect(Number(row.size_bytes)).toBe(bytes.length);
    expect((await fileRow(nidPhoto.body.data.fileId))!.kind).toBe('nid_photo');
    const audit = await h.db.query(
      `SELECT count(*)::int AS n FROM audit_log WHERE action = 'file.uploaded' AND entity_id = ANY($1)`,
      [[photo.body.data.fileId, nidPhoto.body.data.fileId]],
    );
    expect(audit.rows[0].n).toBe(2);
  });

  it('refuses a GIF, a renamed text file (415) and a file over 2 MB (413)', async () => {
    const d = await verifiedDraft(h);
    const g = await upload(d, 'photo', gif(), 'image/gif');
    expect(g.status).toBe(415);
    expect(g.body.error.code).toBe('file.type_not_allowed');
    expect((await upload(d, 'photo', Buffer.from('plain text'), 'image/jpeg')).status).toBe(415);
    const big = await upload(d, 'photo', jpeg({ pad: 3 * 1024 * 1024 }));
    expect(big.status).toBe(413);
    expect(big.body.error.code).toBe('file.too_large');
    expect((await upload(d, 'photo', jpeg({ pad: 1024 * 1024 }))).status).toBe(201);
  });

  it('refuses a missing or foreign token, an unverified and an expired draft', async () => {
    const a = await verifiedDraft(h);
    const b = await verifiedDraft(h);
    expect((await upload({ registrationId: a.registrationId }, 'photo', jpeg())).status).toBe(401);
    expect((await upload({ ...a, token: b.token }, 'photo', jpeg())).status).toBe(401);
    const unverified = await request(h.server())
      .post('/api/v1/auth/register/start')
      .send({ kind: 'volunteer' });
    expect(
      (
        await upload(
          { registrationId: unverified.body.data.registrationId, token: a.token },
          'photo',
          jpeg(),
        )
      ).status,
    ).toBe(401);
    await h.db.query(
      `UPDATE registration_drafts SET expires_at = now() - interval '1 minute' WHERE id = $1`,
      [a.registrationId],
    );
    expect((await upload(a, 'photo', jpeg())).status).toBe(410);
    expect((await upload(b, 'passport', jpeg())).status).toBe(422);
  });

  it('a second upload to a slot removes the first object and row', async () => {
    const d = await verifiedDraft(h);
    const first = (await upload(d, 'photo', jpeg())).body.data.fileId as string;
    const firstKey = String((await fileRow(first))!.object_key);
    const second = (await upload(d, 'photo', png(), 'image/png')).body.data.fileId as string;
    expect(second).not.toBe(first);
    expect(await fileRow(first)).toBeUndefined();
    expect(await stored(firstKey)).toBeNull();
    const draft = await h.db.query('SELECT photo_file_id FROM registration_drafts WHERE id = $1', [
      d.registrationId,
    ]);
    expect(draft.rows[0].photo_file_id).toBe(second);
  });

  it('two uploads to one slot at the same time leave exactly one photo', async () => {
    const d = await verifiedDraft(h);
    const results = await Promise.all([
      upload(d, 'photo', jpeg()),
      upload(d, 'photo', png(), 'image/png'),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    const rows = await h.db.query(`SELECT id FROM files WHERE object_key LIKE $1`, [
      `registration/${d.registrationId}/%`,
    ]);
    const draft = await h.db.query('SELECT photo_file_id FROM registration_drafts WHERE id = $1', [
      d.registrationId,
    ]);
    expect(rows.rows.map((r) => r.id)).toEqual([draft.rows[0].photo_file_id]);
  });

  it('removes the stored object when the files row cannot be written', async () => {
    const d = await verifiedDraft(h);
    await h.db.query(`CREATE FUNCTION test_fail_files() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'files insert refused by the test'; END $$`);
    await h.db.query(
      'CREATE TRIGGER test_fail_files BEFORE INSERT ON files FOR EACH ROW EXECUTE FUNCTION test_fail_files()',
    );
    try {
      expect((await upload(d, 'photo', jpeg())).status).toBe(500);
    } finally {
      await h.db.query('DROP TRIGGER test_fail_files ON files');
      await h.db.query('DROP FUNCTION test_fail_files()');
    }
    const dir = join(
      h.container.env.STORAGE_FS_ROOT!,
      'profiles',
      'registration',
      d.registrationId,
    );
    // the upload wrote into the draft's folder, and the object is gone again
    expect(existsSync(dir)).toBe(true);
    const left = readdirSync(dir);
    expect(left).toEqual([]);
  });
});

describe('GET /files/{fileId}/content', () => {
  /** A volunteer whose profile holds the photo and the NID photo uploaded through a draft. */
  async function volunteerWithPhotos() {
    const d = await verifiedDraft(h);
    const photo = (await upload(d, 'photo', jpeg())).body.data.fileId as string;
    const nidPhoto = (await upload(d, 'nid_photo', png(), 'image/png')).body.data.fileId as string;
    const owner = await account(h.db, { kind: 'volunteer' });
    await f.volunteer(h.db, loc, owner.id, { photo_file_id: photo, nid_photo_file_id: nidPhoto });
    return { owner, photo, nidPhoto };
  }

  /** An RPM whose region is the division of a location tree (a project area). */
  async function rpmOf(tree: Awaited<ReturnType<typeof f.locationTree>>) {
    const rpm = await account(h.db, { role: 'regional_program_manager' });
    const p = await f.project(h.db);
    await h.db.query(
      'INSERT INTO project_areas (id, project_id, location_id, rpm_user_id) VALUES ($1, $2, $3, $4)',
      [randomUUID(), p.id, tree.division, rpm.id],
    );
    return rpm;
  }

  const content = (fileId: string, session?: Awaited<ReturnType<typeof login>>) => {
    const req = request(h.server()).get(`/api/v1/files/${fileId}/content`);
    if (session) req.set(bearer(session));
    return req.buffer(true).parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    });
  };

  it('streams the photo to its owner with no-store and nosniff', async () => {
    const { owner, photo, nidPhoto } = await volunteerWithPhotos();
    const s = await login(h, owner);
    const res = await content(photo, s);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(
      (res.body as Buffer).equals(await readStored(String((await fileRow(photo))!.object_key))),
    ).toBe(true);
    // the own NID photo too (DECISION_LOG D-081)
    expect((await content(nidPhoto, s)).status).toBe(200);
  });

  it('streams both photos to the RPM of the region; Finance and another volunteer get 404', async () => {
    const { photo, nidPhoto } = await volunteerWithPhotos();
    const rpm = await login(h, await rpmOf(loc));
    expect((await content(photo, rpm)).status).toBe(200);
    expect((await content(nidPhoto, rpm)).status).toBe(200);
    const finance = await login(h, await account(h.db, { role: 'finance_team' }));
    expect((await content(nidPhoto, finance)).status).toBe(404);
    const other = await account(h.db, { kind: 'volunteer' });
    await f.volunteer(h.db, loc, other.id);
    const otherSession = await login(h, other);
    expect((await content(photo, otherSession)).status).toBe(404);
    expect((await content(nidPhoto, otherSession)).status).toBe(404);
    expect((await content(randomUUID(), rpm)).status).toBe(404);
    expect((await content(photo)).status).toBe(401);
  });

  it('keeps the NID photo from an official who reaches the volunteer without the identity class', async () => {
    const { photo, nidPhoto } = await volunteerWithPhotos();
    const daee = await login(h, await account(h.db, { role: 'official_daee' }));
    expect((await content(photo, daee)).status).toBe(200);
    expect((await content(nidPhoto, daee)).status).toBe(404);
  });

  it('keeps the NID photo from an RPM of another region, who still sees the photo', async () => {
    const { photo, nidPhoto } = await volunteerWithPhotos();
    const elsewhere = await login(h, await rpmOf(await f.locationTree(h.db)));
    expect((await content(photo, elsewhere)).status).toBe(200);
    expect((await content(nidPhoto, elsewhere)).status).toBe(404);
    // an RPM with no region at all sees no NID photo either
    const none = await login(h, await account(h.db, { role: 'regional_program_manager' }));
    expect((await content(nidPhoto, none)).status).toBe(404);
  });

  it("audits an official's view of an NID photo, not the owner's", async () => {
    const { owner, nidPhoto } = await volunteerWithPhotos();
    const views = async () =>
      (
        await h.db.query(
          `SELECT new FROM audit_log WHERE action = 'file.nid_viewed' AND entity_id = $1`,
          [nidPhoto],
        )
      ).rows;
    await content(nidPhoto, await login(h, owner));
    expect(await views()).toEqual([]);
    const rpm = await rpmOf(loc);
    await content(nidPhoto, await login(h, rpm));
    expect(await views()).toEqual([{ new: { ownerUserId: owner.id } }]);
  });

  it('serves no photo of an unsubmitted draft', async () => {
    const d = await verifiedDraft(h);
    const photo = (await upload(d, 'photo', jpeg())).body.data.fileId as string;
    const rpm = await login(h, await account(h.db, { role: 'regional_program_manager' }));
    expect((await content(photo, rpm)).status).toBe(404);
  });
});

describe('POST /me/photos/{slot}', () => {
  async function volunteerWithRequest(field = 'photo') {
    const user = await account(h.db, { kind: 'volunteer', state: 'pending' });
    const volunteerId = await f.volunteer(h.db, loc, user.id);
    const requestId = await f.insert(h.db, 'volunteer_change_requests', {
      id: randomUUID(),
      volunteer_id: volunteerId,
      kind: 'registration_correction',
      field,
      requested_by: user.id,
    });
    return { user, requestId, session: await login(h, user) };
  }

  const ownUpload = (s: Awaited<ReturnType<typeof login>>, slot: string, requestId: string) =>
    request(h.server())
      .post(`/api/v1/me/photos/${slot}?requestId=${requestId}&source=gallery`)
      .set(bearer(s))
      .set('Content-Type', 'image/jpeg')
      .send(jpeg());

  it('stores a photo for an open own request that names the photo field', async () => {
    const { user, requestId, session } = await volunteerWithRequest();
    const res = await ownUpload(session, 'photo', requestId);
    expect(res.status).toBe(201);
    const row = (await fileRow(res.body.data.fileId))!;
    expect(row).toMatchObject({ kind: 'profile_photo', uploaded_by: user.id, source: 'gallery' });
    // the uploader can see their own upload
    const seen = await request(h.server())
      .get(`/api/v1/files/${res.body.data.fileId}/content`)
      .set(bearer(session));
    expect(seen.status).toBe(200);
  });

  it('keeps one upload per request: a second upload replaces the first', async () => {
    const { requestId, session } = await volunteerWithRequest();
    const first = (await ownUpload(session, 'photo', requestId)).body.data.fileId as string;
    const second = (await ownUpload(session, 'photo', requestId)).body.data.fileId as string;
    expect(await fileRow(first)).toBeUndefined();
    const req = await h.db.query('SELECT new_value FROM volunteer_change_requests WHERE id = $1', [
      requestId,
    ]);
    expect(req.rows[0].new_value).toBe(second);
  });

  it("refuses another volunteer's request and a request for another field (404)", async () => {
    const a = await volunteerWithRequest();
    const b = await volunteerWithRequest();
    expect((await ownUpload(b.session, 'photo', a.requestId)).status).toBe(404);
    expect((await ownUpload(a.session, 'nid_photo', a.requestId)).status).toBe(404);
  });
});
