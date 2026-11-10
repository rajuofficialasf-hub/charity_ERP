import type { Readable } from 'node:stream';
import { ApiError } from '../i18n/api-error';

/**
 * The buckets (docs/architecture/FILES_AND_DOCUMENTS.md, "Storage layout (buckets and keys)"),
 * created by infra/minio/bootstrap.sh, never by the app; `uploads` holds the 256 KB parts of an upload in
 * progress, unversioned and emptied after two days.
 */
export const BUCKETS = [
  'documents',
  'photos',
  'vouchers',
  'profiles',
  'media',
  'exports',
  'uploads',
] as const;
export type Bucket = (typeof BUCKETS)[number];

/** A bucket name read from the database, or an error for a name the storage does not know. */
export function knownBucket(name: string): Bucket {
  const bucket = BUCKETS.find((b) => b === name);
  if (!bucket) throw new Error(`unknown bucket ${name}`);
  return bucket;
}

export interface ObjectInfo {
  size: number;
  contentType: string | undefined;
}

/**
 * The one interface every storage driver implements, with streams in and out so no file sits
 * whole in memory. Only the API reads and writes files: no bucket is public and the browser never
 * receives a storage address; the routes stream the bytes after their access check. Object keys
 * carry entity ids, never personal data.
 */
export interface StorageDriver {
  /** TEMP: `s3` (MinIO) goes once the app runs on the NAS only. */
  readonly name: 'nas' | 's3';
  put(
    bucket: Bucket,
    key: string,
    body: Readable,
    meta: { contentType: string; size?: number },
  ): Promise<void>;
  /** Throws NotFoundError if the key is missing. */
  get(bucket: Bucket, key: string): Promise<Readable>;
  /** Object facts, or null when it does not exist. */
  stat(bucket: Bucket, key: string): Promise<ObjectInfo | null>;
  /** Succeeds if the key is already gone. */
  remove(bucket: Bucket, key: string): Promise<void>;
  /** Readiness: the store answers (S3: the buckets exist; NAS: the root is readable and writable). */
  ping(): Promise<boolean>;
}

/** The stored file isn't there. A route maps this to its own 404 after checking access. */
export class NotFoundError extends Error {
  constructor(
    readonly bucket: Bucket,
    readonly key: string,
  ) {
    super('Stored file not found');
    this.name = 'NotFoundError';
  }
}

const KEY = /^[A-Za-z0-9][A-Za-z0-9/_.-]{0,511}$/;

/** Rejects keys that could escape a bucket or folder. */
export function assertKey(key: string): void {
  if (!KEY.test(key) || key.includes('..') || key.includes('//'))
    throw new ApiError('validation.failed', 422, undefined, [
      { path: 'key', code: 'validation.failed' },
    ]);
}
