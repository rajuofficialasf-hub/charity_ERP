import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { account, authHarness, type AuthHarness, bearer, login } from './support/auth-app.js';
import * as f from './support/fixtures.js';

// An official's own profile and the photos of officials wherever a person is shown
// (docs/DECISION_LOG.md, the official's own profile of 2026-11-02; docs/BUSINESS_RULES.md).
let h: AuthHarness;
const api = () => request(h.server());

beforeAll(async () => {
  h = await authHarness();
  for (const role of ['project_executive'])
    await h.db.query(
      `INSERT INTO roles (key, name_bn, name_en, kind, global_scope) VALUES ($1, $1, $1, 'official', false) ON CONFLICT DO NOTHING`,
      [role],
    );
});
afterAll(async () => h.close());

/** A stored, scanned photo linked to the user like the self-registration stores it. */
async function staffPhoto(userId: string) {
  const id = randomUUID();
  const key = `staff/${id}.jpg`;
  await h.container.storage.put('profiles', key, Readable.from(Buffer.from('jpeg')), {
    contentType: 'image/jpeg',
  });
  await f.insert(h.db, 'files', {
    id,
    bucket: 'profiles',
    object_key: key,
    kind: 'profile_photo',
    mime: 'image/jpeg',
    size_bytes: 4,
    sha256: createHash('sha256').update(id).digest('hex'),
    source: 'camera',
    virus_scan: 'clean',
  });
  await f.insert(h.db, 'file_links', {
    id: randomUUID(),
    file_id: id,
    entity_type: 'user',
    entity_id: userId,
    slot: 'photo',
  });
  return id;
}

describe('GET /me/profile', () => {
  it('gives an official their own details with the program, supervisor and photo, and no area', async () => {
    const tree = await f.locationTree(h.db);
    const { program } = await f.project(h.db);
    const supervisor = await account(h.db, { role: 'program_manager' });
    const me = await account(h.db, { role: 'regional_program_manager' });
    await h.db.query(
      `UPDATE users SET designation = 'আঞ্চলিক ব্যবস্থাপক', job_id = 'CSS-0042', affiliation = 'department',
         home_program_id = $2, home_division_id = $3, supervisor_user_id = $4 WHERE id = $1`,
      // a division stored on the account is not read: an official's area comes from the projects
      [me.id, program, tree.division, supervisor.id],
    );
    const photo = await staffPhoto(me.id);
    const res = await api()
      .get('/api/v1/me/profile')
      .set(bearer(await login(h, me)));
    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty('division');
    expect(res.body.data).toMatchObject({
      id: me.id,
      jobId: 'CSS-0042',
      designation: 'আঞ্চলিক ব্যবস্থাপক',
      roles: [
        {
          key: 'regional_program_manager',
          name: { bn: 'regional_program_manager', en: 'regional_program_manager' },
        },
      ],
      affiliation: 'department',
      program: { id: program, name: { bn: 'প্রোগ্রাম', en: 'Program' } },
      supervisor: { id: supervisor.id, name: expect.any(String) },
      email: me.email,
      mobile: me.mobile,
      state: 'active',
      photoFileId: photo,
    });
  });

  it('answers an official without a program, supervisor or photo with empty values', async () => {
    const me = await account(h.db, { role: 'project_executive' });
    const res = await api()
      .get('/api/v1/me/profile')
      .set(bearer(await login(h, me)));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      program: null,
      supervisor: null,
      photoFileId: null,
    });
  });

  it('is not a volunteer page: a volunteer gets 404, and nobody signed out gets in', async () => {
    const volunteer = await account(h.db, { kind: 'volunteer' });
    const res = await api()
      .get('/api/v1/me/profile')
      .set(bearer(await login(h, volunteer)));
    expect(res.status).toBe(404);
    expect((await api().get('/api/v1/me/profile')).status).toBe(401);
  });
});

describe('the photo of a person', () => {
  it('comes with the signed-in person: an official from the file link, a volunteer from the profile', async () => {
    const official = await account(h.db, { role: 'project_executive' });
    const photo = await staffPhoto(official.id);
    const me = await api()
      .get('/api/v1/auth/me')
      .set(bearer(await login(h, official)));
    expect(me.body.data.photoFileId).toBe(photo);

    const volunteer = await account(h.db, { kind: 'volunteer' });
    const file = await f.insert(h.db, 'files', {
      id: randomUUID(),
      bucket: 'profiles',
      object_key: `volunteers/${randomUUID()}.jpg`,
      kind: 'profile_photo',
      mime: 'image/jpeg',
      size_bytes: 4,
      sha256: randomUUID().replace(/-/g, '').padEnd(64, '0'),
      source: 'camera',
    });
    await f.volunteer(h.db, await f.locationTree(h.db), volunteer.id, { photo_file_id: file });
    const own = await api()
      .get('/api/v1/auth/me')
      .set(bearer(await login(h, volunteer)));
    expect(own.body.data.photoFileId).toBe(file);

    const without = await account(h.db, { role: 'project_executive' });
    const none = await api()
      .get('/api/v1/auth/me')
      .set(bearer(await login(h, without)));
    expect(none.body.data.photoFileId).toBeNull();
  });

  it("stands in the staff list and an official's detail", async () => {
    const official = await account(h.db, { role: 'project_executive' });
    const photo = await staffPhoto(official.id);
    const head = await login(h, await account(h.db, { role: 'department_head' }));
    const list = await api().get('/api/v1/users').query({ q: official.email! }).set(bearer(head));
    expect(list.status).toBe(200);
    expect(list.body.data).toEqual([
      expect.objectContaining({ id: official.id, photoFileId: photo }),
    ]);
    const detail = await api().get(`/api/v1/users/${official.id}`).set(bearer(head));
    expect(detail.body.data.photoFileId).toBe(photo);
  });

  it('is streamed to the person, the staff list and every other official, never to a volunteer', async () => {
    const official = await account(h.db, { role: 'project_executive' });
    const photo = await staffPhoto(official.id);
    const content = async (who: Parameters<typeof login>[1]) =>
      api()
        .get(`/api/v1/files/${photo}/content`)
        .set(bearer(await login(h, who)));
    expect((await content(official)).status).toBe(200);
    expect((await content(await account(h.db, { role: 'admin' }))).status).toBe(200);
    expect((await content(await account(h.db, { role: 'project_executive' }))).status).toBe(200);
    expect((await content(await account(h.db, { kind: 'volunteer' }))).status).toBe(404);
  });
});
