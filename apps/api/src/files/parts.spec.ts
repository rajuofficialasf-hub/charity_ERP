import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buffer } from 'node:stream/consumers';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../i18n/api-error.js';
import { createNasDriver } from '../storage/drivers/nas.js';
import {
  dropParts,
  joinParts,
  MAX_PARTS,
  PART_SIZE,
  partCount,
  partKey,
  storePart,
} from './parts.js';

// The parts of a chunked upload, on the NAS driver over a temporary folder.
const fresh = () => createNasDriver(mkdtempSync(join(tmpdir(), 'css-parts-')));
const code = (error: unknown) => (error instanceof ApiError ? error.code : String(error));
const codeOf = (run: () => unknown) => {
  try {
    run();
    return 'no error';
  } catch (error) {
    return code(error);
  }
};
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

describe('the parts of a chunked upload', () => {
  it('counts the parts a size needs, refusing an empty file and one over 20 MB', () => {
    expect(partCount(1)).toBe(1);
    expect(partCount(PART_SIZE)).toBe(1);
    expect(partCount(PART_SIZE + 1)).toBe(2);
    expect(partCount(MAX_PARTS * PART_SIZE)).toBe(MAX_PARTS);
    for (const size of [0, -1, 1.5, MAX_PARTS * PART_SIZE + 1])
      expect(codeOf(() => partCount(size))).toBe('file.too_large');
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
      expect(codeOf(() => partKey(session, part))).toBe('file.part_out_of_range');
  });

  it('joins three parts in order into the object when the whole matches, and drops them after', async () => {
    const storage = fresh();
    const session = randomUUID();
    const parts = [Buffer.alloc(PART_SIZE, 1), Buffer.alloc(PART_SIZE, 2), Buffer.from('end')];
    // sent out of order, and the second one twice
    await storePart(storage, session, 3, parts[2]!);
    await storePart(storage, session, 1, parts[0]!);
    await storePart(storage, session, 2, parts[1]!);
    await storePart(storage, session, 2, parts[1]!);
    const whole = Buffer.concat(parts);
    const heads: Buffer[] = [];
    const type = await joinParts(storage, {
      sessionId: session,
      count: 3,
      size: whole.length,
      sha256: sha256(whole).toUpperCase(),
      bucket: 'photos',
      key: 'p/a/photo/f.jpg',
      headLength: 4,
      accept: (head) => {
        heads.push(head);
        return 'image/jpeg';
      },
    });
    expect(type).toBe('image/jpeg');
    // the type is read from the joined, checked bytes
    expect(heads).toEqual([parts[0]!.subarray(0, 4)]);
    expect((await buffer(await storage.get('photos', 'p/a/photo/f.jpg'))).equals(whole)).toBe(true);
    expect(await storage.stat('uploads', `${session}/joined`)).toBeNull();
    await dropParts(storage, session);
    expect(await storage.stat('uploads', `${session}/1`)).toBeNull();
    // dropping again is fine
    await expect(dropParts(storage, session)).resolves.toBeUndefined();
  });

  it('writes nothing to the target when the size or SHA-256 differs from the declaration', async () => {
    const storage = fresh();
    const session = randomUUID();
    const bytes = Buffer.from('declared');
    await storePart(storage, session, 1, bytes);
    const target = {
      sessionId: session,
      count: 1,
      bucket: 'photos' as const,
      key: 'p/a/photo/h.jpg',
      headLength: 4,
      accept: () => 'image/jpeg',
    };
    for (const declared of [
      { size: bytes.length, sha256: sha256(Buffer.from('another')) },
      { size: bytes.length + 1, sha256: sha256(bytes) },
    ])
      expect(await joinParts(storage, { ...target, ...declared }).catch(code)).toBe(
        'file.checksum_mismatch',
      );
    // bytes whose type is refused never reach the target either
    const refused = await joinParts(storage, {
      ...target,
      size: bytes.length,
      sha256: sha256(bytes),
      accept: () => {
        throw new ApiError('file.type_not_allowed', 415);
      },
    }).catch(code);
    expect(refused).toBe('file.type_not_allowed');
    expect(await storage.stat('photos', target.key)).toBeNull();
    expect(await storage.stat('uploads', `${session}/joined`)).toBeNull();
  });

  it('answers parts missing for a missing part, leaving no object, and refuses odd parts', async () => {
    const storage = fresh();
    const session = randomUUID();
    await storePart(storage, session, 1, Buffer.from('one'));
    const missing = await joinParts(storage, {
      sessionId: session,
      count: 2,
      size: 6,
      sha256: sha256(Buffer.from('one')),
      bucket: 'photos',
      key: 'p/a/photo/g.jpg',
      headLength: 4,
      accept: () => 'image/jpeg',
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
