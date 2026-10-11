import type { Readable } from 'node:stream';
import { ApiError } from '../i18n/api-error';

/** Buckets of FILES_AND_DOCUMENTS 8 (created by infra/minio/bootstrap.sh, never by the app). */
export const BUCKETS = ['documents', 'photos', 'vouchers', 'profiles', 'media', 'exports'] as const;
export type Bucket = (typeof BUCKETS)[number];

/** Signed URLs live at most 15 minutes (NFR-28, ADR-005). */
export const MAX_URL_TTL_SECONDS = 900;

export interface SignedUrl {
  url: string;
  expiresAt: Date;
}

export interface ObjectInfo {
  size: number;
  contentType: string | undefined;
}

/**
 * Object storage behind one interface (ADR-005): MinioStorage in development, staging and
 * production; FilesystemStorage in automated tests. Object keys carry entity ids, never personal
 * data; no bucket is public, files are reached only through signed, expiring URLs.
 */
export interface StorageAdapter {
  put(
    bucket: Bucket,
    key: string,
    body: Buffer | Readable,
    options: { contentType: string; size?: number },
  ): Promise<void>;
  get(bucket: Bucket, key: string): Promise<Readable>;
  /** Object facts, or null when it does not exist. */
  stat(bucket: Bucket, key: string): Promise<ObjectInfo | null>;
  presignGet(bucket: Bucket, key: string, ttlSeconds?: number): Promise<SignedUrl>;
  presignPut(bucket: Bucket, key: string, ttlSeconds?: number): Promise<SignedUrl>;
  /** Readiness: the store answers and the buckets exist (SYSTEM_ARCHITECTURE 10). */
  ping(): Promise<boolean>;
}

/** Injection token of the configured adapter. */
export const STORAGE = Symbol('STORAGE');

const KEY = /^[A-Za-z0-9][A-Za-z0-9/_.-]{0,511}$/;

/** Rejects keys that could escape a bucket or folder. */
export function assertKey(key: string): void {
  if (!KEY.test(key) || key.includes('..') || key.includes('//'))
    throw new ApiError('validation.failed', 422, undefined, [
      { path: 'key', code: 'validation.failed' },
    ]);
}

/** A URL lifetime within the NFR-28 limit; longer lifetimes are a programming error. */
export function urlTtl(ttlSeconds = MAX_URL_TTL_SECONDS): number {
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > MAX_URL_TTL_SECONDS)
    throw new Error(`signed URL lifetime must be 1..${MAX_URL_TTL_SECONDS} seconds (NFR-28)`);
  return ttlSeconds;
}
