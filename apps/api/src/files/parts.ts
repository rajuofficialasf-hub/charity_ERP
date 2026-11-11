import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { UPLOAD_RULES } from '@css/shared/files';
import { ApiError } from '../i18n/api-error.js';
import { type Bucket, NotFoundError, type StorageDriver } from '../storage/index.js';

export const PART_SIZE = UPLOAD_RULES.partSize;
export const MAX_PARTS = UPLOAD_RULES.maxParts;
/** The bucket that holds the parts of uploads in progress (unversioned, emptied after two days). */
const PARTS_BUCKET: Bucket = 'uploads';
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** How many parts a file of this size needs; an empty file or one over 20 MB is refused. */
export function partCount(size: number): number {
  const count = Math.ceil(size / PART_SIZE);
  if (!Number.isInteger(size) || count < 1 || count > MAX_PARTS)
    throw new ApiError('file.too_large', 413);
  return count;
}

function checkSession(sessionId: string): void {
  if (!SESSION_ID.test(sessionId)) throw new ApiError('file.part_out_of_range', 422);
}

/**
 * The key of one part, built only from the server's session id and an integer part number, so
 * nothing a client sends reaches a storage path.
 */
export function partKey(sessionId: string, part: number): string {
  checkSession(sessionId);
  if (!Number.isInteger(part) || part < 1 || part > MAX_PARTS)
    throw new ApiError('file.part_out_of_range', 422);
  return `${sessionId}/${part}`;
}

/** The joined whole of a session, kept beside its parts until it has been checked. */
function joinedKey(sessionId: string): string {
  checkSession(sessionId);
  return `${sessionId}/joined`;
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

const missingPart = (error: unknown): never => {
  if (error instanceof NotFoundError) throw new ApiError('file.parts_missing', 409);
  throw error;
};

/**
 * Joins parts 1 to `count` in order, streaming, and writes the target object only when the whole
 * has the declared size and SHA-256 and `accept` takes its first bytes (it answers the content type
 * or throws). The whole is first written beside the parts, so bytes that fail a check never reach a
 * target bucket (some keep every version), and the type is read from the same checked bytes that
 * are stored. A part that is gone answers `file.parts_missing`, a whole that differs from the
 * declaration `file.checksum_mismatch`. Returns the content type.
 */
export async function joinParts(
  storage: StorageDriver,
  input: {
    sessionId: string;
    count: number;
    size: number;
    sha256: string;
    bucket: Bucket;
    key: string;
    headLength: number;
    accept: (head: Buffer) => string;
  },
): Promise<string> {
  if (!Number.isInteger(input.count) || input.count < 1)
    throw new ApiError('file.part_out_of_range', 422);
  const keys = Array.from({ length: input.count }, (_, i) => partKey(input.sessionId, i + 1));
  const joined = joinedKey(input.sessionId);
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
    await storage
      .put(PARTS_BUCKET, joined, Readable.from(bytes()), {
        contentType: 'application/octet-stream',
      })
      .catch(missingPart);
    if (size !== input.size || hash.digest('hex') !== input.sha256.toLowerCase())
      throw new ApiError('file.checksum_mismatch', 422);
    const contentType = input.accept(
      await headOf(await storage.get(PARTS_BUCKET, joined), input.headLength),
    );
    await storage.put(input.bucket, input.key, await storage.get(PARTS_BUCKET, joined), {
      contentType,
      size,
    });
    return contentType;
  } finally {
    await storage.remove(PARTS_BUCKET, joined);
  }
}

/** The first bytes of a stream, which is then closed. */
async function headOf(stream: Readable, length: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    chunks.push(chunk);
    total += chunk.length;
    if (total >= length) break;
  }
  stream.destroy();
  return Buffer.concat(chunks).subarray(0, length);
}

/** Removes every part a session may hold; parts already gone are fine. */
export async function dropParts(storage: StorageDriver, sessionId: string): Promise<void> {
  const keys = Array.from({ length: MAX_PARTS }, (_, i) => partKey(sessionId, i + 1));
  await Promise.all(
    [...keys, joinedKey(sessionId)].map((key) => storage.remove(PARTS_BUCKET, key)),
  );
}
