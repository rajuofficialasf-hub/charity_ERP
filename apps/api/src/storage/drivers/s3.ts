// TEMP: the S3 driver, pointed at MinIO (ADR-005, D-074) until the NAS driver exists (storage.md).
// The only file that imports the AWS SDK (NS-42). The buckets are private (NS-40, bootstrap.sh)
// and no signed or bucket URL reaches the browser (NS-41).
import type { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { assertKey, BUCKETS, NotFoundError, type StorageDriver } from '../types';

export interface S3Options {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  /** Buckets the readiness check expects (default: all of FILES_AND_DOCUMENTS 8). */
  buckets?: readonly string[];
}

// Outbound timeouts (NE-ERR-03, NS-44): a connection that isn't up in this long fails, and so does
// a request whose socket stays idle this long. Idle, not total, so a large file can still stream.
const CONNECTION_TIMEOUT_MS = 5_000;
const SOCKET_IDLE_TIMEOUT_MS = 30_000;
/** MinIO ignores the region but the SDK requires one. */
const REGION = 'us-east-1';

function isMissing(error: unknown): boolean {
  return (
    error instanceof NoSuchKey ||
    error instanceof NotFound ||
    (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404)
  );
}

export function createS3Driver(options: S3Options): StorageDriver {
  const buckets = options.buckets ?? BUCKETS;
  const client = new S3Client({
    region: REGION,
    endpoint: `${options.useSSL ? 'https' : 'http'}://${options.endPoint}:${options.port}`,
    // MinIO takes the bucket in the path and needs checksums only where S3 requires them.
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: { accessKeyId: options.accessKey, secretAccessKey: options.secretKey },
    requestHandler: {
      connectionTimeout: CONNECTION_TIMEOUT_MS,
      requestTimeout: SOCKET_IDLE_TIMEOUT_MS,
    },
  });

  return {
    name: 's3',

    // Upload streams the body in 5 MiB parts, so a large file never sits whole in memory (NS-04).
    async put(bucket, key, body, meta) {
      assertKey(key);
      await new Upload({
        client,
        params: {
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: meta.contentType,
          ContentLength: meta.size,
        },
      }).done();
    },

    async get(bucket, key) {
      assertKey(key);
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        // In Node the body is the response stream.
        return result.Body as Readable;
      } catch (error) {
        if (isMissing(error)) throw new NotFoundError(bucket, key);
        throw error;
      }
    },

    async stat(bucket, key) {
      assertKey(key);
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { size: head.ContentLength ?? 0, contentType: head.ContentType };
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },

    // S3 answers a delete of a missing key with success.
    async remove(bucket, key) {
      assertKey(key);
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    async ping() {
      try {
        await Promise.all(buckets.map((Bucket) => client.send(new HeadBucketCommand({ Bucket }))));
        return true;
      } catch {
        return false;
      }
    },
  };
}
