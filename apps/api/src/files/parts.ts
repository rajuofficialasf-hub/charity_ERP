import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { ApiError } from '../i18n/api-error';
import { type Bucket, NotFoundError, type StorageDriver } from '../storage';

/** One part of a chunked upload: 256 KB, small enough for a 2G connection (O-29, D-108). */
export const PART_SIZE = 262_144;
/** The most parts a session may have: the largest kind, a 20 MB document. */
export const MAX_PARTS = 80;
/** The bucket that holds the parts of uploads in progress (unversioned, emptied after two days). */
const PARTS_BUCKET: Bucket = 'uploads';
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** How many parts a file of this size needs. */
export const partCount = (size: number): number => Math.ceil(size / PART_SIZE);

/**
 * The key of one part, built only from the server's session id and an integer part number, so
 * nothing a client sends reaches a storage path (NE-SEC-07).
 */
export function partKey(sessionId: string, part: number): string {
  if (!SESSION_ID.test(sessionId) || !Number.isInteger(part) || part < 1 || part > MAX_PARTS)
    throw new ApiError('file.part_out_of_range', 422);
  return `${sessionId}/${part}`;
}

/** Stores one part; sending the same part again replaces it with the same bytes. */
export async function storePart(
  storage: StorageDriver,
  sessionId: string,
  part: number,
  bytes: Buffer,
): Promise<void> {
  if (bytes.length === 0 || bytes.length > PART_SIZE) throw new ApiError('file.too_large', 413);
  await storage.put(PARTS_BUCKET, partKey(sessionId, part), Readable.from([bytes]), {
    contentType: 'application/octet-stream',
    size: bytes.length,
  });
}

/**
 * Joins parts 1 to `count` in order into the target object, streaming (NS-04), and returns the
 * size and SHA-256 of what was written; a part that is gone answers `file.parts_missing`.
 */
export async function joinParts(
  storage: StorageDriver,
  input: { sessionId: string; count: number; bucket: Bucket; key: string; contentType: string },
): Promise<{ size: number; sha256: string }> {
  const keys = Array.from({ length: input.count }, (_, i) => partKey(input.sessionId, i + 1));
  const hash = createHash('sha256');
  let size = 0;
  async function* bytes() {
    for (const key of keys) {
      const part = await storage.get(PARTS_BUCKET, key);
      for await (const chunk of part as AsyncIterable<Buffer>) {
        hash.update(chunk);
        size += chunk.length;
        yield chunk;
      }
    }
  }
  try {
    await storage.put(input.bucket, input.key, Readable.from(bytes()), {
      contentType: input.contentType,
    });
  } catch (error) {
    if (error instanceof NotFoundError) throw new ApiError('file.parts_missing', 409);
    throw error;
  }
  return { size, sha256: hash.digest('hex') };
}

/** Reads the start of part 1, enough to tell the type by its magic bytes. */
export async function firstBytes(
  storage: StorageDriver,
  sessionId: string,
  length: number,
): Promise<Buffer> {
  const part = await storage.get(PARTS_BUCKET, partKey(sessionId, 1));
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of part as AsyncIterable<Buffer>) {
    chunks.push(chunk);
    total += chunk.length;
    if (total >= length) break;
  }
  part.destroy();
  return Buffer.concat(chunks).subarray(0, length);
}

/** Removes the stored parts of a session; parts already gone are fine. */
export async function dropParts(
  storage: StorageDriver,
  sessionId: string,
  count: number,
): Promise<void> {
  for (let part = 1; part <= count; part += 1)
    await storage.remove(PARTS_BUCKET, partKey(sessionId, part));
}
