import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buffer } from 'node:stream/consumers';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../i18n/api-error';
import { createFilesystemDriver } from '../storage/drivers/filesystem';
import {
  dropParts,
  firstBytes,
  joinParts,
  PART_SIZE,
  partCount,
  partKey,
  storePart,
} from './parts';

// The parts of a chunked upload (D-108), on the filesystem driver the tests use.
const fresh = () => createFilesystemDriver(mkdtempSync(join(tmpdir(), 'css-parts-')));
const code = (error: unknown) => (error instanceof ApiError ? error.code : String(error));

describe('the parts of a chunked upload', () => {
  it('counts the parts a size needs', () => {
    expect(partCount(1)).toBe(1);
    expect(partCount(PART_SIZE)).toBe(1);
    expect(partCount(PART_SIZE + 1)).toBe(2);
    expect(partCount(20 * 1024 * 1024)).toBe(80);
  });

  it('builds a part key only from a session id and an integer in range', () => {
    const id = randomUUID();
    expect(partKey(id, 3)).toBe(`${id}/3`);
    for (const [session, part] of [
      [id, 0],
      [id, 81],
      [id, 1.5],
      ['../../etc', 1],
      [`${id}/..`, 1],
    ] as const)
      expect(() => partKey(session, part)).toThrow(ApiError);
  });

  it('joins three parts in order into the object with its size and SHA-256, and drops them after', async () => {
    const storage = fresh();
    const session = randomUUID();
    const parts = [Buffer.alloc(PART_SIZE, 1), Buffer.alloc(PART_SIZE, 2), Buffer.from('end')];
    // sent out of order, and the second one twice
    await storePart(storage, session, 3, parts[2]!);
    await storePart(storage, session, 1, parts[0]!);
    await storePart(storage, session, 2, parts[1]!);
    await storePart(storage, session, 2, parts[1]!);
    const whole = Buffer.concat(parts);
    const joined = await joinParts(storage, {
      sessionId: session,
      count: 3,
      bucket: 'photos',
      key: 'p/a/photo/f.jpg',
      contentType: 'image/jpeg',
    });
    expect(joined).toEqual({
      size: whole.length,
      sha256: createHash('sha256').update(whole).digest('hex'),
    });
    expect((await buffer(await storage.get('photos', 'p/a/photo/f.jpg'))).equals(whole)).toBe(true);
    expect((await firstBytes(storage, session, 4)).equals(parts[0]!.subarray(0, 4))).toBe(true);
    await dropParts(storage, session, 3);
    expect(await storage.stat('uploads', `${session}/1`)).toBeNull();
    // dropping again is fine
    await expect(dropParts(storage, session, 3)).resolves.toBeUndefined();
  });

  it('refuses a missing part, leaving no object, and a part over 256 KB or empty', async () => {
    const storage = fresh();
    const session = randomUUID();
    await storePart(storage, session, 1, Buffer.from('one'));
    const missing = await joinParts(storage, {
      sessionId: session,
      count: 2,
      bucket: 'photos',
      key: 'p/a/photo/g.jpg',
      contentType: 'image/jpeg',
    }).catch(code);
    expect(missing).toBe('file.parts_missing');
    expect(await storage.stat('photos', 'p/a/photo/g.jpg')).toBeNull();
    expect(await storePart(storage, session, 2, Buffer.alloc(PART_SIZE + 1)).catch(code)).toBe(
      'file.too_large',
    );
    expect(await storePart(storage, session, 2, Buffer.alloc(0)).catch(code)).toBe(
      'file.too_large',
    );
  });
});
