import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COVER_SLOT, COVER_UPLOAD_SLOT, UPLOAD_RULES } from '@css/shared/files';
import { picture } from '../support/photos.js';
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

// The cover photos of programs and project series: who uploads one, who sets it, which file may
// become a cover, what happens to the cover it replaces, and who reads it.
const PART = UPLOAD_RULES.partSize;
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const sessions: Record<string, Session> = {};
/** The PM's program with two of its series, and another program with one. */
let own: { program: string; series: string; second: string };
let other: { program: string; series: string };

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
let made = 0;
/** A real photo, another one each time. */
const photo = () => picture({ variant: (made += 1), width: 480 + made });

beforeAll(async () => {
  h = await authHarness();
  world = await accessWorld(h.db, {
    staff: async (role) => (await account(h.db, { kind: 'staff', role })).id,
    volunteerUser: async (role) => (await account(h.db, { kind: 'volunteer', role })).id,
  });
  for (const [name, id] of Object.entries(world.users)) {
    const row = (await h.db.query('SELECT email, mobile FROM users WHERE id = $1', [id])).rows[0];
    sessions[name] = await login(h, row.email ?? row.mobile);
  }
  sessions.finance = await login(h, await account(h.db, { role: 'finance_team' }));
  const seriesOf = async (projectId: string) =>
    (await h.db.query('SELECT series_id FROM projects WHERE id = $1', [projectId])).rows[0]
      .series_id as string;
  own = {
    program: world.a1.program,
    series: await seriesOf(world.a1.id),
    second: await seriesOf(world.a2.id),
  };
  other = { program: world.b1.program, series: await seriesOf(world.b1.id) };
});
afterAll(async () => h.close());

const as = (who: string) => bearer(sessions[who]!);
type Covered = 'program' | 'project_series';

const start = (
  who: string,
  entityType: string,
  entityId: string,
  bytes: Buffer,
  over: Record<string, unknown> = {},
) =>
  request(h.server())
    .post('/api/v1/upload-sessions')
    .set(as(who))
    .send({
      clientUuid: randomUUID(),
      kind: 'cover_photo',
      entityType,
      entityId,
      slot: COVER_UPLOAD_SLOT,
      mime: 'image/jpeg',
      sizeBytes: bytes.length,
      sha256: sha256(bytes),
      source: 'gallery',
      ...over,
    });
const sendParts = async (who: string, sessionId: string, bytes: Buffer) => {
  for (let n = 0; n * PART < bytes.length; n += 1)
    await request(h.server())
      .put(`/api/v1/upload-sessions/${sessionId}/parts/${n + 1}`)
      .set(as(who))
      .set('Content-Type', 'application/octet-stream')
      .send(bytes.subarray(n * PART, (n + 1) * PART));
};
const finalize = (who: string, sessionId: string) =>
  request(h.server()).post(`/api/v1/upload-sessions/${sessionId}/finalize`).set(as(who));

/** Uploads a cover photo for a record as `who` and answers the new file's id. */
async function upload(who: string, type: Covered, id: string, bytes?: Buffer): Promise<string> {
  const body = bytes ?? (await photo());
  const created = await start(who, type, id, body);
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  await sendParts(who, created.body.data.id as string, body);
  const done = await finalize(who, created.body.data.id as string);
  expect(done.status, JSON.stringify(done.body)).toBe(201);
  expect(done.body.data).toMatchObject({ kind: 'cover_photo', flags: [] });
  return done.body.data.id as string;
}

const path = (type: Covered, id: string) =>
  `/api/v1/${type === 'program' ? 'programs' : 'project-series'}/${id}/cover`;
const setCover = (who: string, type: Covered, id: string, fileId: string) =>
  request(h.server()).put(path(type, id)).set(as(who)).send({ fileId });
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
const links = async (type: Covered, id: string) =>
  (
    await h.db.query<{ file_id: string; slot: string }>(
      `SELECT file_id, slot FROM file_links WHERE entity_type = $1 AND entity_id = $2
        ORDER BY created_at, id`,
      [type, id],
    )
  ).rows;
const coverOf = async (type: Covered, id: string) =>
  (await links(type, id)).filter((l) => l.slot === COVER_SLOT).map((l) => l.file_id);
const auditOf = async (action: string, id: string) =>
  (await auditRows(h.db, action))
    .filter((r) => r.entity_id === id)
    .map((r) => ({ actor: r.actor_user_id, type: r.entity_type, old: r.old, new: r.new }));

describe('the cover of a program', () => {
  it('is set by the Department Head from the own upload, audited with the earlier and the new file, and refused to a PM', async () => {
    const first = await upload('head', 'program', own.program);
    // an uploaded photo is no cover until it is set
    expect(await coverOf('program', own.program)).toEqual([]);
    const set = await setCover('head', 'program', own.program, first);
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    expect(set.body.data).toEqual({ coverFileId: first });
    expect(await coverOf('program', own.program)).toEqual([first]);
    const second = await upload('head', 'program', own.program);
    expect((await setCover('head', 'program', own.program, second)).status).toBe(200);
    expect(await auditOf('program.cover_changed', own.program)).toEqual([
      {
        actor: world.users.head,
        type: 'program',
        old: { coverFileId: null },
        new: { coverFileId: first },
      },
      {
        actor: world.users.head,
        type: 'program',
        old: { coverFileId: first },
        new: { coverFileId: second },
      },
    ]);
    // the card of the program names its cover, and a program without one names none
    const cards = await request(h.server()).get('/api/v1/program-cards').set(as('rpmDhaka'));
    expect(cards.status).toBe(200);
    const card = (id: string) =>
      (cards.body.data as { id: string; coverFileId: string | null }[]).find((p) => p.id === id);
    expect(card(own.program)?.coverFileId).toBe(second);
    expect(card(other.program)?.coverFileId).toBeNull();
    // the PM of the program does not change the program
    const pm = await setCover('pm', 'program', own.program, second);
    expect(pm.status).toBe(403);
    expect((await setCover('head', 'program', randomUUID(), second)).status).toBe(404);
    expect((await setCover('head', 'program', own.program, 'no-id')).status).toBe(422);
    expect(
      (await request(h.server()).put(path('program', own.program)).send({ fileId: second })).status,
    ).toBe(401);
    expect(await coverOf('program', own.program)).toEqual([second]);
  });

  it('keeps the file of a cover that was replaced, with the link it was uploaded under', async () => {
    const first = await upload('monitoring', 'program', other.program);
    expect((await setCover('monitoring', 'program', other.program, first)).status).toBe(200);
    const second = await upload('monitoring', 'program', other.program);
    expect((await setCover('monitoring', 'program', other.program, second)).status).toBe(200);
    // one cover link, moved to the new photo; both uploads keep their own link
    expect(await links('program', other.program)).toEqual([
      { file_id: first, slot: COVER_UPLOAD_SLOT },
      { file_id: second, slot: COVER_SLOT },
      { file_id: second, slot: COVER_UPLOAD_SLOT },
    ]);
    const { rows } = await h.db.query<{ object_key: string; deleted_at: Date | null }>(
      'SELECT object_key, deleted_at FROM files WHERE id = $1',
      [first],
    );
    expect(rows[0]!.deleted_at).toBeNull();
    expect(rows[0]!.object_key).toMatch(
      new RegExp(`^covers/program/${other.program}/${first}\\.jpg$`),
    );
    expect(await h.container.storage.stat('photos', rows[0]!.object_key)).not.toBeNull();
    // it is no cover any more: its uploader still reads it, a reader of the cards does not
    await h.container.fileProcessor.process(first);
    expect((await content('monitoring', first)).status).toBe(200);
    expect((await content('rpmDhaka', first)).status).toBe(404);
    // and it may be set again by the person who uploaded it
    expect((await setCover('monitoring', 'program', other.program, first)).status).toBe(200);
    expect(await coverOf('program', other.program)).toEqual([first]);
  });
});

describe('the cover of a project series', () => {
  it('is set by the PM on a series of the own program, audited, and a series of another program is not found', async () => {
    const file = await upload('pm', 'project_series', own.series);
    const set = await setCover('pm', 'project_series', own.series, file);
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    expect(set.body.data).toEqual({ coverFileId: file });
    expect(await auditOf('project_series.cover_changed', own.series)).toEqual([
      {
        actor: world.users.pm,
        type: 'project_series',
        old: { coverFileId: null },
        new: { coverFileId: file },
      },
    ]);
    // the series' card and the series itself name the cover
    const cards = await request(h.server())
      .get('/api/v1/project-series')
      .query({ programId: own.program })
      .set(as('executive'));
    const card = (id: string) =>
      (cards.body.data as { id: string; coverFileId: string | null }[]).find((s) => s.id === id);
    expect(card(own.series)?.coverFileId).toBe(file);
    expect(card(own.second)?.coverFileId).toBeNull();
    const one = await request(h.server()).get(`/api/v1/project-series/${own.series}`).set(as('pm'));
    expect(one.body.data.coverFileId).toBe(file);
    // the program is the one the series is stored with: another program's series is not found
    const foreign = await setCover('pm', 'project_series', other.series, file);
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe('permission.not_found');
    expect((await setCover('pm', 'project_series', randomUUID(), file)).status).toBe(404);
    expect(await coverOf('project_series', other.series)).toEqual([]);
    // whoever may not create a project is refused
    for (const who of ['rpmDhaka', 'executive', 'general', 'finance'])
      expect((await setCover(who, 'project_series', own.series, file)).status, who).toBe(403);
    // the two global roles set it in any program
    const byHead = await upload('head', 'project_series', other.series);
    expect((await setCover('head', 'project_series', other.series, byHead)).status).toBe(200);
  });
});

describe('reading a cover', () => {
  it('streams the cover and its thumbnails to an RPM and an Executive, and never to a volunteer or the Finance Team', async () => {
    const bytes = await photo();
    const file = await upload('pm', 'project_series', own.second, bytes);
    await h.container.fileProcessor.process(file);
    // before it is set, it is its uploader's alone
    expect((await content('pm', file)).status).toBe(200);
    expect((await content('rpmDhaka', file)).status).toBe(404);
    expect((await setCover('pm', 'project_series', own.second, file)).status).toBe(200);
    for (const who of ['rpmDhaka', 'rpmRangpur', 'executive', 'outsider', 'head']) {
      const whole = await content(who, file);
      expect(whole.status, who).toBe(200);
      expect(whole.headers).toMatchObject({
        'content-type': 'image/jpeg',
        'content-disposition': 'inline',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      expect((whole.body as Buffer).equals(bytes)).toBe(true);
      for (const variant of ['small', 'medium']) {
        const thumb = await content(who, file, variant);
        expect(thumb.status, `${who} ${variant}`).toBe(200);
        expect(thumb.headers['content-type']).toBe('image/jpeg');
      }
    }
    // no overview, no cover: the file routes answer as for a file that does not exist
    for (const who of ['general', 'daee', 'finance']) {
      expect((await content(who, file)).status, who).toBe(404);
      expect((await content(who, file, 'small')).status, who).toBe(404);
      expect(
        (await request(h.server()).get(`/api/v1/files/${file}`).set(as(who))).status,
        who,
      ).toBe(404);
    }
    expect((await request(h.server()).get(`/api/v1/files/${file}/content`)).status).toBe(401);
    // a record's file list is not offered for a cover's record
    const list = await request(h.server())
      .get('/api/v1/files')
      .query({ entityType: 'project_series', entityId: own.second })
      .set(as('head'));
    expect(list.status).toBe(404);
  });

  it('keeps a cover that the scan has not cleared from every reader', async () => {
    const file = await upload('head', 'program', own.program);
    expect((await setCover('head', 'program', own.program, file)).status).toBe(200);
    // the processing job has not run yet
    await h.db.query(`UPDATE files SET virus_scan = 'pending' WHERE id = $1`, [file]);
    expect((await content('rpmDhaka', file)).status).toBe(423);
    await h.db.query(`UPDATE files SET virus_scan = 'infected' WHERE id = $1`, [file]);
    expect((await content('rpmDhaka', file)).status).toBe(410);
  });
});

describe('which file may become a cover', () => {
  it('refuses a file of another kind', async () => {
    // a file of another kind, the caller's own and linked to the program
    const file = await f.insert(h.db, 'files', {
      id: randomUUID(),
      bucket: 'photos',
      storage_driver: 'nas',
      object_key: `covers/program/${own.program}/${randomUUID()}.jpg`,
      kind: 'evidence',
      mime: 'image/jpeg',
      size_bytes: 10,
      sha256: 'e'.repeat(64),
      uploaded_by: world.users.head,
      source: 'gallery',
    });
    await f.insert(h.db, 'file_links', {
      id: randomUUID(),
      file_id: file,
      entity_type: 'program',
      entity_id: own.program,
      slot: COVER_UPLOAD_SLOT,
    });
    const before = await coverOf('program', own.program);
    const res = await setCover('head', 'program', own.program, file);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('file.cover_invalid');
    expect(await coverOf('program', own.program)).toEqual(before);
  });

  it('refuses a file another user uploaded, an unfinished upload and a file uploaded for another record', async () => {
    const before = await coverOf('project_series', own.series);
    const audited = (await auditOf('project_series.cover_changed', own.series)).length;
    const refused = async (fileId: string) => {
      const res = await setCover('pm', 'project_series', own.series, fileId);
      expect(res.status, JSON.stringify(res.body)).toBe(422);
      expect(res.body.error.code).toBe('file.cover_invalid');
    };
    // another person's upload for the same series
    await refused(await upload('monitoring', 'project_series', own.series));
    // an upload that never finished: the file id its session was given names no file
    const bytes = await photo();
    const open = await start('pm', 'project_series', own.series, bytes);
    expect(open.status).toBe(201);
    const declared = (
      await h.db.query(`SELECT declared->>'fileId' AS id FROM upload_sessions WHERE id = $1`, [
        open.body.data.id,
      ])
    ).rows[0].id as string;
    await refused(declared);
    await refused(randomUUID());
    // the PM's own upload for another series of the program, and for no cover at all
    await refused(await upload('pm', 'project_series', own.second));
    expect(await coverOf('project_series', own.series)).toEqual(before);
    expect(await auditOf('project_series.cover_changed', own.series)).toHaveLength(audited);
    // the upload that was open finishes, and then it may be set
    await sendParts('pm', open.body.data.id as string, bytes);
    const done = await finalize('pm', open.body.data.id as string);
    expect(done.status).toBe(201);
    expect(done.body.data.id).toBe(declared);
    expect((await setCover('pm', 'project_series', own.series, declared)).status).toBe(200);
  });
});

describe('who may upload a cover', () => {
  it('refuses a volunteer, an RPM, an Executive and the Finance Team for a program and for a series', async () => {
    const bytes = await photo();
    for (const who of ['general', 'rpmDhaka', 'executive', 'finance'])
      for (const [type, id] of [
        ['program', own.program],
        ['project_series', own.series],
      ] as const) {
        const res = await start(who, type, id, bytes);
        expect(res.status, `${who} ${type}`).toBe(403);
      }
    expect(
      await h.db.query(
        `SELECT count(*)::int AS n FROM upload_sessions WHERE declared->>'sha256' = $1`,
        [sha256(bytes)],
      ),
    ).toMatchObject({ rows: [{ n: 0 }] });
  });

  it('lets a PM upload for a series of the own program only: another program is not found, a program is refused', async () => {
    const bytes = await photo();
    const foreign = await start('pm', 'project_series', other.series, bytes);
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe('permission.not_found');
    expect((await start('pm', 'project_series', randomUUID(), bytes)).status).toBe(404);
    // a program's cover belongs to those who change the program
    expect((await start('pm', 'program', own.program, bytes)).status).toBe(403);
    expect((await start('pm', 'project_series', own.series, bytes)).status).toBe(201);
    expect((await start('head', 'program', randomUUID(), bytes)).status).toBe(404);
    expect((await start('head', 'program', other.program, bytes)).status).toBe(201);
    expect((await start('monitoring', 'project_series', other.series, bytes)).status).toBe(201);
  });

  it('checks the right again when the upload is finished', async () => {
    const pm = await account(h.db, { role: 'program_manager' });
    sessions.leaving = await login(h, pm);
    const program = await f.insert(h.db, 'programs', {
      id: randomUUID(),
      code: 'PLV',
      name_bn: 'প্রোগ্রাম',
      name_en: 'Program',
      pm_user_id: pm.id,
    });
    const series = await f.insert(h.db, 'project_series', {
      id: randomUUID(),
      program_id: program,
      code: 'LEAVE',
      name_bn: 'প্রকল্প',
      name_en: 'Project',
    });
    const bytes = await photo();
    const open = await start('leaving', 'project_series', series, bytes);
    expect(open.status).toBe(201);
    await sendParts('leaving', open.body.data.id as string, bytes);
    // the program gets another PM before the upload is finished
    await h.db.query('UPDATE programs SET pm_user_id = NULL WHERE id = $1', [program]);
    expect((await finalize('leaving', open.body.data.id as string)).status).toBe(404);
    expect(await links('project_series', series)).toEqual([]);
  });

  it('takes a JPEG, PNG or WebP photo under the cover upload slot only, and reads the type from the bytes', async () => {
    const bytes = await photo();
    const at = ['project_series', own.series] as const;
    const pdf = await start('pm', ...at, bytes, { mime: 'application/pdf' });
    expect(pdf.status).toBe(415);
    const big = await start('pm', ...at, bytes, { sizeBytes: 5 * 1024 * 1024 + 1 });
    expect(big.status).toBe(413);
    // the cover's own slot is written by the route that sets a cover, never by an upload
    const slot = await start('pm', ...at, bytes, { slot: COVER_SLOT });
    expect(slot.status).toBe(422);
    // a cover belongs to a program or a series, and they take no other kind
    const onApplication = await start('pm', 'application', randomUUID(), bytes);
    expect(onApplication.status).toBe(422);
    expect(onApplication.body.error.code).toBe('file.kind_not_allowed');
    const evidence = await start('pm', ...at, bytes, { kind: 'evidence' });
    expect(evidence.body.error.code).toBe('file.kind_not_allowed');
    // a PDF sent as a JPEG is told apart by its first bytes
    const fake = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(2000, 1)]);
    const lying = await start('pm', ...at, fake);
    expect(lying.status).toBe(201);
    await sendParts('pm', lying.body.data.id as string, fake);
    expect((await finalize('pm', lying.body.data.id as string)).status).toBe(415);
    expect(
      (await h.db.query(`SELECT count(*)::int AS n FROM files WHERE sha256 = $1`, [sha256(fake)]))
        .rows,
    ).toEqual([{ n: 0 }]);
  });
});
