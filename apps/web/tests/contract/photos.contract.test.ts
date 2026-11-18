import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  fileDetailsSchema,
  programCardSchema,
  uploadedFileSchema,
  uploadSessionSchema,
} from '../../src/api/schemas';
import { expectContract, expectStatus } from './support/expect';
import { call, contractBase, signIn } from './support/session';
import { HEAD, PNG } from './support/world';

// The photo viewer's reads: the details of a photo and its download, on a program's cover photo
// the Department Head uploads (a program's cover is the global roles' to change), read by the
// Head as its uploader once the E2E API's worker has scanned it.

describe.skipIf(!contractBase())("the photo viewer's reads", () => {
  it('reads the details of a photo and downloads it once scanned', async () => {
    const head = await signIn(HEAD);
    const programs = expectContract(
      await call(head, 'GET', '/program-cards'),
      200,
      z.array(programCardSchema),
    );
    const hum = programs.find((p) => p.code === 'HUM');
    expect(hum, 'the Head sees the program HUM').toBeDefined();
    const session = expectContract(
      await call(head, 'POST', '/upload-sessions', {
        clientUuid: randomUUID(),
        kind: 'cover_photo',
        entityType: 'program',
        entityId: hum!.id,
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
      await call(head, 'PUT', `/upload-sessions/${session.id}/parts/1`, PNG, {
        'Content-Type': 'application/octet-stream',
      }),
      200,
      uploadSessionSchema,
    );
    const file = expectContract(
      await call(head, 'POST', `/upload-sessions/${session.id}/finalize`),
      201,
      uploadedFileSchema,
    );
    // the worker scans the photo a moment after its upload
    let details = expectContract(
      await call(head, 'GET', `/files/${file.id}`),
      200,
      fileDetailsSchema,
    );
    for (let tries = 0; details.virusScan === 'pending' && tries < 60; tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      details = expectContract(
        await call(head, 'GET', `/files/${file.id}`),
        200,
        fileDetailsSchema,
      );
    }
    expect(details.uploadedBy?.name, 'the uploader reads their own name').toBeTruthy();
    expectStatus(await call(head, 'GET', `/files/${file.id}/download`), 200);
  });
});
