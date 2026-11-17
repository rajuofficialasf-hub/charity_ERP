import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SeedContext } from '../../seed/context.js';
import { seedFormTemplates } from '../../seed/sets/base/forms.js';
import { seedReferenceLists } from '../../seed/sets/base/reference-lists.js';
import { seedWorkflows } from '../../seed/sets/base/workflows.js';
import { gif, jpeg, METADATA_MARKER } from '../support/images.js';
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
import { fakeMobile, fakeNid, locationTree } from './support/fixtures.js';
import { draftProject } from './support/projects.js';

// The photos of a public application: uploaded one by one against the link before the submission,
// bound to the applicant's client id, claimed by the submission, swept when nothing claims them
// (docs/plans/2026-10-21-1135-feat-form-engine-plan.md, "Public photos").
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
let loc: Awaited<ReturnType<typeof locationTree>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
const at = (s: Session, method: 'get' | 'post' | 'patch', path: string) =>
  api()[method](`/api/v1${path}`).set(bearer(s));

beforeAll(async () => {
  h = await authHarness();
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
  loc = await locationTree(h.db);
  const ctx = new SeedContext(h.container.prisma);
  await seedWorkflows(ctx);
  await seedReferenceLists(ctx);
  await seedFormTemplates(ctx);
});
afterAll(async () => h.close());

let n = 0;
const code = () => {
  n += 1;
  const letter = (v: number) => String.fromCharCode(65 + (Math.floor(v) % 26));
  return `Q${letter(n / 676)}${letter(n / 26)}${letter(n)}`;
};

/** An active project with a published distribution form that also holds a photo field, and its open link. */
async function linkedProject() {
  const pm = await as(world.users.pm);
  const created = await draftProject(h, pm, {
    programId: world.a1.program,
    code: code(),
    year: 2026,
    name: { bn: 'শীতবস্ত্র', en: 'Winter' },
    source: { kind: 'workflow', workflowKey: 'distribution' },
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const projectId = created.body.data.id as string;
  const builder = await as(world.users.monitoring);
  const made = await at(builder, 'post', `/projects/${projectId}/forms`).send({
    key: 'default',
    title: { bn: 'আবেদন', en: 'Application' },
    source: { kind: 'template', templateKey: 'form_distribution' },
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const versionId = made.body.data.draftVersionId as string;
  await h.db.query(
    `INSERT INTO form_fields (id, form_version_id, form_section_id, field_key, type, label_bn, label_en, sort_order, required, settings)
     SELECT gen_random_uuid(), $1, s.id, 'house_photo', 'photo', 'ঘরের ছবি', 'House photo', 99, false, '{}'
     FROM form_sections s WHERE s.form_version_id = $1 AND s.key = 'address'`,
    [versionId],
  );
  const current = await at(builder, 'get', `/form-versions/${versionId}`);
  const published = await at(builder, 'post', `/form-versions/${versionId}/publish`).set(
    'If-Match',
    current.headers.etag as string,
  );
  expect(published.status, JSON.stringify(published.body)).toBe(200);
  await h.db.query(`UPDATE projects SET status = 'active', apply_to = '2099-12-31' WHERE id = $1`, [
    projectId,
  ]);
  const link = await at(pm, 'patch', `/projects/${projectId}/public-link`).send({
    enabled: true,
    formId: made.body.data.id,
  });
  expect(link.status, JSON.stringify(link.body)).toBe(200);
  const url = link.body.data.url as string;
  return { projectId, token: url.slice(url.lastIndexOf('/') + 1) };
}

const upload = (
  token: string,
  clientUuid: string,
  bytes: Buffer,
  options: { fieldKey?: string; type?: string; forwardedFor?: string } = {},
) => {
  const call = api()
    .post(`/api/v1/public/forms/${token}/photos`)
    .query({ clientUuid, fieldKey: options.fieldKey ?? 'house_photo' })
    .set('Content-Type', options.type ?? 'image/jpeg');
  // the test app trusts the loopback proxy, as the server trusts its own reverse proxy
  if (options.forwardedFor) call.set('X-Forwarded-For', options.forwardedFor);
  return call.send(bytes);
};

const answer = (fieldKey: string, value: unknown) => ({ fieldKey, value });
function answers(photoIds: string[] = []) {
  return [
    answer('nid_or_birth_reg', { t: 'short_text', v: fakeNid() }),
    answer('mobile', { t: 'phone', v: fakeMobile() }),
    answer('name', { t: 'short_text', v: 'নমুনা আবেদনকারী' }),
    answer('gender', { t: 'single_select', v: 'male' }),
    answer('father_or_husband_name', { t: 'short_text', v: 'নমুনা পিতা' }),
    answer('address', {
      t: 'bd_address',
      division_id: loc.division,
      district_id: loc.district,
      upazila_id: loc.upazila,
      union_id: loc.union,
    }),
    answer('village', { t: 'short_text', v: 'নমুনা গ্রাম' }),
    ...(photoIds.length ? [answer('house_photo', { t: 'photo', v: photoIds })] : []),
  ];
}
const submit = (token: string, clientUuid: string, photoIds: string[] = []) =>
  api()
    .post(`/api/v1/public/forms/${token}/applications`)
    .send({ clientUuid, answers: answers(photoIds) });

async function fileRow(id: string) {
  const res = await h.db.query(
    `SELECT f.object_key, f.storage_driver, f.virus_scan, f.deleted_at, f.uploaded_by, f.project_id, l.entity_type, l.entity_id, l.slot
       FROM files f LEFT JOIN file_links l ON l.file_id = f.id WHERE f.id = $1`,
    [id],
  );
  return res.rows[0] as {
    object_key: string;
    storage_driver: string;
    virus_scan: string;
    deleted_at: Date | null;
    uploaded_by: string | null;
    project_id: string;
    entity_type: string;
    entity_id: string;
    slot: string;
  };
}
async function stored(key: string): Promise<Buffer | null> {
  if (!(await h.container.storage.stat('photos', key))) return null;
  const chunks: Buffer[] = [];
  for await (const c of await h.container.storage.get('photos', key)) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}
/** Unclaimed rows planted directly under the link's folder, to fill the link without 200 uploads. */
async function plantUnclaimed(projectId: string, folder: string, count: number, bytesEach = 1000) {
  for (let i = 0; i < count; i += 1) {
    const id = randomUUID();
    const client = randomUUID();
    await h.db.query(
      `INSERT INTO files (id, bucket, storage_driver, object_key, kind, mime, size_bytes, sha256, project_id, source)
       VALUES ($1, 'photos', 'nas', $2, 'form_photo', 'image/jpeg', $3, $4, $5, 'gallery')`,
      [
        id,
        `${folder}/${client}/${id}.jpg`,
        bytesEach,
        randomUUID().replace(/-/g, '').repeat(2),
        projectId,
      ],
    );
    await h.db.query(
      `INSERT INTO file_links (id, file_id, entity_type, entity_id, slot) VALUES ($1, $2, 'public_submission', $3, 'house_photo')`,
      [randomUUID(), id, client],
    );
  }
}
const content = (s: Session, fileId: string) =>
  api()
    .get(`/api/v1/files/${fileId}/content`)
    .set(bearer(s))
    .buffer(true)
    .parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    });

describe('uploading', () => {
  it('stores a JPEG without its metadata, bound to the client id and queued for the scan', async () => {
    const { projectId, token } = await linkedProject();
    const client = randomUUID();
    const res = await upload(token, client, jpeg({ metadata: true }));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const fileId = res.body.data.fileId as string;
    expect(JSON.stringify(res.body)).not.toContain(projectId);
    const row = await fileRow(fileId);
    expect(row).toMatchObject({
      storage_driver: 'nas',
      virus_scan: 'pending',
      uploaded_by: null,
      project_id: projectId,
      entity_type: 'public_submission',
      entity_id: client,
      slot: 'house_photo',
    });
    expect(row.object_key).toMatch(
      /^public\/[0-9a-f]{32}\/[0-9a-f]{32}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/,
    );
    expect(row.object_key).not.toContain(token);
    const bytes = await stored(row.object_key);
    expect(bytes).not.toBeNull();
    expect(bytes!.includes(METADATA_MARKER)).toBe(false);
    const audit = await h.db.query(
      `SELECT new FROM audit_log WHERE entity_id = $1 AND action = 'file.uploaded'`,
      [fileId],
    );
    expect(audit.rows).toHaveLength(1);
    expect(JSON.stringify(audit.rows[0].new)).not.toContain(token);
  });

  it('refuses a GIF, a PDF, an oversized image, a field that is not a photo field and a sixth photo', async () => {
    const { token } = await linkedProject();
    const client = randomUUID();
    expect((await upload(token, client, gif())).status).toBe(415);
    const pdf = await upload(token, client, Buffer.from('%PDF-1.4'), { type: 'application/pdf' });
    expect(pdf.status).toBe(415);
    const big = await upload(token, client, Buffer.concat([jpeg(), Buffer.alloc(6 * 1024 * 1024)]));
    expect(big.status).toBe(413);
    expect(big.body.error.code).toBe('file.too_large');
    const notPhoto = await upload(token, client, jpeg(), { fieldKey: 'village' });
    expect(notPhoto.status).toBe(422);
    expect(notPhoto.body.error.details).toEqual([
      expect.objectContaining({ path: 'village', code: 'form.unknown_field' }),
    ]);
    for (let i = 1; i <= 5; i += 1)
      expect((await upload(token, client, jpeg({ pad: i }))).status, `photo ${i}`).toBe(201);
    const sixth = await upload(token, client, jpeg({ pad: 6 }));
    expect(sixth.status).toBe(429);
    expect(sixth.body.error.code).toBe('public.photo_limit');
    expect(Number(sixth.headers['retry-after'])).toBeGreaterThan(0);
    // another applicant on the same link still has room
    expect((await upload(token, randomUUID(), jpeg({ pad: 7 }))).status).toBe(201);
  });

  it('stores the same bytes twice on one project, telling the applicant nothing', async () => {
    const { token } = await linkedProject();
    const first = await upload(token, randomUUID(), jpeg({ pad: 3 }));
    expect(first.status).toBe(201);
    const again = await upload(token, randomUUID(), jpeg({ pad: 3 }));
    expect(again.status).toBe(201);
    expect(again.body.data.fileId).not.toBe(first.body.data.fileId);
  });

  it('refuses a submission naming more photos than one application may hold', async () => {
    const { token } = await linkedProject();
    const client = randomUUID();
    const ids: string[] = [];
    for (let i = 1; i <= 5; i += 1)
      ids.push((await upload(token, client, jpeg({ pad: 40 + i }))).body.data.fileId as string);
    const tooMany = await submit(token, client, [...ids, ids[0]!]);
    expect(tooMany.status).toBe(422);
    expect(tooMany.body.error.details).toEqual([
      expect.objectContaining({ path: 'house_photo', code: 'public.photo_limit' }),
    ]);
  });

  it('holds at most 200 unclaimed photos per link until a submission claims one', async () => {
    const { projectId, token } = await linkedProject();
    const first = await upload(token, randomUUID(), jpeg({ pad: 11 }));
    expect(first.status).toBe(201);
    const folder = (await fileRow(first.body.data.fileId)).object_key.split('/', 2).join('/');
    await plantUnclaimed(projectId, folder, 199);
    const full = await upload(token, randomUUID(), jpeg({ pad: 12 }));
    expect(full.status).toBe(429);
    expect(full.body.error.code).toBe('public.link_full');
    // the first applicant submits, claiming the photo, which frees one place
    const client = randomUUID();
    await h.db.query(`UPDATE file_links SET entity_id = $2 WHERE file_id = $1`, [
      first.body.data.fileId,
      client,
    ]);
    const submitted = await submit(token, client, [first.body.data.fileId]);
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(201);
    expect((await upload(token, randomUUID(), jpeg({ pad: 13 }))).status).toBe(201);
  });

  it('holds at most 500 MB of unclaimed photos per link', async () => {
    const { projectId, token } = await linkedProject();
    const first = await upload(token, randomUUID(), jpeg({ pad: 14 }));
    expect(first.status).toBe(201);
    const folder = (await fileRow(first.body.data.fileId)).object_key.split('/', 2).join('/');
    await plantUnclaimed(projectId, folder, 5, 100 * 1024 * 1024);
    const full = await upload(token, randomUUID(), jpeg({ pad: 15 }));
    expect(full.status).toBe(429);
    expect(full.body.error.code).toBe('public.link_full');
  });

  it('holds at most 20 unclaimed photos per sender, while another sender can still add', async () => {
    const { projectId, token } = await linkedProject();
    const sender = '203.0.113.5';
    const first = await upload(token, randomUUID(), jpeg({ pad: 16 }), { forwardedFor: sender });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    // the sender's own folder under the link's folder
    const folder = (await fileRow(first.body.data.fileId)).object_key.split('/', 3).join('/');
    await plantUnclaimed(projectId, folder, 19);
    const full = await upload(token, randomUUID(), jpeg({ pad: 17 }), { forwardedFor: sender });
    expect(full.status).toBe(429);
    expect(full.body.error.code).toBe('public.sender_full');
    expect(full.headers['retry-after']).toBeDefined();
    // an address the applicant wrote in front of the proxy's own entry does not make a new sender
    const spoofed = await upload(token, randomUUID(), jpeg({ pad: 18 }), {
      forwardedFor: `198.51.100.1, ${sender}`,
    });
    expect(spoofed.status).toBe(429);
    expect(spoofed.body.error.code).toBe('public.sender_full');
    const other = await upload(token, randomUUID(), jpeg({ pad: 19 }), {
      forwardedFor: '203.0.113.6',
    });
    expect(other.status, JSON.stringify(other.body)).toBe(201);
  });

  it('counts the addresses of one IPv6 network as one sender', async () => {
    const { projectId, token } = await linkedProject();
    const first = await upload(token, randomUUID(), jpeg({ pad: 23 }), {
      forwardedFor: '2001:db8:5:5::1',
    });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    const folder = (await fileRow(first.body.data.fileId)).object_key.split('/', 3).join('/');
    await plantUnclaimed(projectId, folder, 19);
    const sameNetwork = await upload(token, randomUUID(), jpeg({ pad: 24 }), {
      forwardedFor: '2001:db8:5:5:abcd::9',
    });
    expect(sameNetwork.status).toBe(429);
    expect(sameNetwork.body.error.code).toBe('public.sender_full');
    const otherNetwork = await upload(token, randomUUID(), jpeg({ pad: 25 }), {
      forwardedFor: '2001:db8:6:6::1',
    });
    expect(otherNetwork.status, JSON.stringify(otherNetwork.body)).toBe(201);
  });

  it('holds at most 50 MB of unclaimed photos per sender', async () => {
    const { projectId, token } = await linkedProject();
    const sender = '203.0.113.7';
    const first = await upload(token, randomUUID(), jpeg({ pad: 20 }), { forwardedFor: sender });
    expect(first.status).toBe(201);
    const folder = (await fileRow(first.body.data.fileId)).object_key.split('/', 3).join('/');
    await plantUnclaimed(projectId, folder, 1, 50 * 1024 * 1024);
    const full = await upload(token, randomUUID(), jpeg({ pad: 21 }), { forwardedFor: sender });
    expect(full.status).toBe(429);
    expect(full.body.error.code).toBe('public.sender_full');
  });

  it('keeps the sender address out of the stored key', async () => {
    const { token } = await linkedProject();
    const made = await upload(token, randomUUID(), jpeg({ pad: 22 }), {
      forwardedFor: '203.0.113.8',
    });
    expect(made.status).toBe(201);
    const key = (await fileRow(made.body.data.fileId)).object_key;
    expect(key).not.toContain('203.0.113.8');
    expect(key.split('/')).toHaveLength(5);
  });

  it('answers the closed-link 404 on a draft project', async () => {
    const { projectId, token } = await linkedProject();
    await h.db.query(`UPDATE projects SET status = 'draft' WHERE id = $1`, [projectId]);
    expect((await upload(token, randomUUID(), jpeg())).status).toBe(404);
  });
});

describe('claiming at submission', () => {
  it('links the named photos to the application and refuses a photo of another client id or link', async () => {
    const { token } = await linkedProject();
    const other = await linkedProject();
    const client = randomUUID();
    const mine = (await upload(token, client, jpeg({ pad: 21 }))).body.data.fileId as string;
    const someoneElses = (await upload(token, randomUUID(), jpeg({ pad: 22 }))).body.data
      .fileId as string;
    const onAnotherLink = (await upload(other.token, client, jpeg({ pad: 23 }))).body.data
      .fileId as string;
    for (const foreign of [someoneElses, onAnotherLink, randomUUID()]) {
      const refused = await submit(token, randomUUID(), [foreign]);
      expect(refused.status).toBe(422);
      expect(refused.body.error.details).toEqual([
        expect.objectContaining({ path: 'house_photo', code: 'public.photo_unknown' }),
      ]);
    }
    const ok = await submit(token, client, [mine]);
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    const row = await fileRow(mine);
    expect(row.entity_type).toBe('application');
    expect(row.entity_id).toBe(ok.body.data.id);
    expect(row.slot).toBe('house_photo');
    const stored = await h.db.query(
      `SELECT a.value FROM application_answers a JOIN form_fields f ON f.id = a.field_id
        WHERE a.application_id = $1 AND f.field_key = 'house_photo'`,
      [ok.body.data.id],
    );
    expect(stored.rows[0].value).toEqual({ t: 'photo', v: [mine] });
  });

  it('streams the claimed photo to an official of the project and refuses a volunteer of another project', async () => {
    const { token } = await linkedProject();
    const client = randomUUID();
    const fileId = (await upload(token, client, await picture({ variant: 3 }))).body.data
      .fileId as string;
    expect((await submit(token, client, [fileId])).status).toBe(201);
    await h.container.fileProcessor.process(fileId);
    const official = await content(await as(world.users.pm), fileId);
    expect(official.status).toBe(200);
    expect(official.headers['content-type']).toBe('image/jpeg');
    const volunteer = await content(await as(world.users.general), fileId);
    expect(volunteer.status).toBe(404);
  });

  it('never streams an unclaimed photo, to anyone', async () => {
    const { token } = await linkedProject();
    const fileId = (await upload(token, randomUUID(), await picture({ variant: 4 }))).body.data
      .fileId as string;
    await h.container.fileProcessor.process(fileId);
    expect((await content(await as(world.users.pm), fileId)).status).toBe(404);
    expect((await content(await as(world.users.head), fileId)).status).toBe(404);
  });
});

describe('the nightly sweep', () => {
  it('removes an unclaimed photo older than a day and keeps a claimed and a fresh one', async () => {
    const { token } = await linkedProject();
    const client = randomUUID();
    const stale = (await upload(token, randomUUID(), jpeg({ pad: 31 }))).body.data.fileId as string;
    const claimed = (await upload(token, client, jpeg({ pad: 32 }))).body.data.fileId as string;
    const fresh = (await upload(token, randomUUID(), jpeg({ pad: 33 }))).body.data.fileId as string;
    expect((await submit(token, client, [claimed])).status).toBe(201);
    await h.db.query(
      `UPDATE files SET created_at = now() - interval '25 hours' WHERE id = ANY($1::uuid[])`,
      [[stale, claimed]],
    );
    const staleKey = (await fileRow(stale)).object_key;
    expect(await stored(staleKey)).not.toBeNull();
    const result = await h.container.uploadSweep.run();
    expect(result.publicPhotos).toBeGreaterThanOrEqual(1);
    // an unclaimed photo was never business data: its row goes, like an expired upload session
    expect(await fileRow(stale)).toBeUndefined();
    expect(await stored(staleKey)).toBeNull();
    expect((await fileRow(claimed)).entity_type).toBe('application');
    expect((await fileRow(fresh)).entity_type).toBe('public_submission');
    expect(await stored((await fileRow(fresh)).object_key)).not.toBeNull();
    // a second run finds nothing more of these
    const again = await h.container.uploadSweep.run();
    expect((await fileRow(claimed)).entity_type).toBe('application');
    expect(again.publicPhotos).toBe(0);
  });
});
