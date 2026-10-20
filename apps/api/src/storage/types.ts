import type { Readable } from 'node:stream';
import { ApiError } from '../i18n/api-error';

/**
 * Buckets of FILES_AND_DOCUMENTS 8 (created by infra/minio/bootstrap.sh, never by the app); `uploads`
 * holds the 256 KB parts of an upload in progress, unversioned and emptied after two days (D-108).
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

export interface ObjectInfo {
  size: number;
  contentType: string | undefined;
}

/**
 * The one interface every storage driver implements (NS-31), with streams in and out (NS-04).
 * Only the API reads and writes files: no bucket is public and the browser never receives a
 * storage URL (NS-41); authorized routes stream the bytes (NS-10; the file routes come with the
 * files task of docs/PLAN.md, T2.1). Object keys carry
 * entity ids, never personal data.
 */
export interface StorageDriver {
  /** TEMP: `s3` (MinIO, D-074) is the first driver; the NAS driver arrives with the NAS. */
  readonly name: 's3' | 'filesystem';
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
  /** Readiness: the store answers and the buckets exist (SYSTEM_ARCHITECTURE 10). */
  ping(): Promise<boolean>;
}

/** The stored file isn't there. A route maps this to its own 404 after checking access (NS-10). */
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

/** Rejects keys that could escape a bucket or folder (NE-SEC-07). */
export function assertKey(key: string): void {
  if (!KEY.test(key) || key.includes('..') || key.includes('//'))
    throw new ApiError('validation.failed', 422, undefined, [
      { path: 'key', code: 'validation.failed' },
    ]);
}
