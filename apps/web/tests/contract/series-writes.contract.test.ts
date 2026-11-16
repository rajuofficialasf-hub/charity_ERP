import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  programCardSchema,
  projectSchema,
  projectSeriesCardSchema,
  projectSeriesRecordSchema,
  projectSeriesSchema,
  uploadedFileSchema,
  uploadSessionSchema,
} from '../../src/api/schemas';
import { expectContract, expectEnvelope, expectStatus } from './support/expect';
import { type Caller, call, contractBase, signIn } from './support/session';
import { HEAD, PM_HUM, PNG } from './support/world';

// The writes of a program's and a project's pages: a new project series, its edit with its
// version, a new session of a series under an idempotency key, and a cover photo of a program and
// of a series (refused while the scan has not cleared the photo, as on the E2E API, which runs no
// photo worker).

/** A code of this run's own: P and three random capital letters. */
const code = () =>
  `P${Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('')}`;

/** A cover photo uploaded for a record, still waiting for its scan. */
async function coverUpload(caller: Caller, entityType: string, entityId: string): Promise<string> {
  const session = expectContract(
    await call(caller, 'POST', '/upload-sessions', {
      clientUuid: randomUUID(),
      kind: 'cover_photo',
      entityType,
      entityId,
      slot: 'cover_upload',
      mime: 'image/png',
      sizeBytes: PNG.length,
      sha256: createHash('sha256').update(PNG).digest('hex'),
      source: 'gallery',
    }),
    201,
    uploadSessionSchema,
  );
  expectContract(
    await call(caller, 'PUT', `/upload-sessions/${session.id}/parts/1`, PNG, {
      'Content-Type': 'application/octet-stream',
    }),
    200,
    uploadSessionSchema,
  );
  return expectContract(
    await call(caller, 'POST', `/upload-sessions/${session.id}/finalize`),
    201,
    uploadedFileSchema,
  ).id;
}

describe.skipIf(!contractBase())('the writes of the program and project pages', () => {
  it('makes a project series, edits it with its version and refuses a cover not yet scanned', async () => {
    const pm = await signIn(PM_HUM);
    const programs = expectContract(
      await call(pm, 'GET', '/program-cards'),
      200,
      z.array(programCardSchema),
    );
    const hum = programs.find((p) => p.code === 'HUM' && p.canCreate);
    expect(hum, 'the PM creates in the program HUM').toBeDefined();
    const made = expectContract(
      await call(pm, 'POST', '/project-series', {
        programId: hum!.id,
        code: code(),
        name: { bn: 'চুক্তির প্রকল্প', en: 'Contract project' },
        description: { bn: 'ছোট কথা', en: 'Short' },
      }),
      201,
      projectSeriesSchema,
    );
    expect(made.sessions).toEqual([]);
    const record = expectEnvelope(
      await call(pm, 'GET', `/project-series/${made.id}`),
      200,
      projectSeriesRecordSchema,
    );
    const edited = expectContract(
      await call(
        pm,
        'PATCH',
        `/project-series/${made.id}`,
        { description: { bn: 'নতুন কথা', en: 'New' } },
        { 'If-Match': record.meta.etag ?? '' },
      ),
      200,
      projectSeriesSchema,
    );
    expect(edited.description).toEqual({ bn: 'নতুন কথা', en: 'New' });
    const fileId = await coverUpload(pm, 'project_series', made.id);
    expectStatus(await call(pm, 'PUT', `/project-series/${made.id}/cover`, { fileId }), 422);
  });

  it('starts a session of a series from its newest session under an idempotency key', async () => {
    const pm = await signIn(PM_HUM);
    const series = expectContract(
      await call(pm, 'GET', '/project-series'),
      200,
      z.array(projectSeriesCardSchema),
    ).find((s) => s.canCreate && s.current !== null);
    expect(series, 'a demo series the PM may start a session of').toBeDefined();
    // a far year of its own, so the run never meets a session it made before
    const year = 2040 + Math.floor(Math.random() * 50);
    const key = randomUUID();
    const body = { periodFrom: `${year}-06`, periodTo: `${year + 1}-05` };
    const session = expectContract(
      await call(pm, 'POST', `/project-series/${series!.id}/sessions`, body, {
        'Idempotency-Key': key,
      }),
      201,
      projectSchema,
    );
    expect(session.sessionLabel).toBe(`${year}-${String(year + 1).slice(2)}`);
    // the same request again is the same session
    const again = await call(pm, 'POST', `/project-series/${series!.id}/sessions`, body, {
      'Idempotency-Key': key,
    });
    expect(again.status).toBe(200);
    expect((again.body as { data: { id: string } }).data.id).toBe(session.id);
  });

  it('refuses a program’s cover the scan has not cleared', async () => {
    const head = await signIn(HEAD);
    const [program] = expectContract(
      await call(head, 'GET', '/program-cards'),
      200,
      z.array(programCardSchema),
    );
    const fileId = await coverUpload(head, 'program', program!.id);
    expectStatus(await call(head, 'PUT', `/programs/${program!.id}/cover`, { fileId }), 422);
  });
});
