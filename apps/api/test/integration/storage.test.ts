import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dropParts, joinParts, PART_SIZE, storePart } from '../../src/files/parts';
import { type Bucket, BUCKETS, createStorage, NotFoundError } from '../../src/storage';
import { testEnv } from '../support/env';

// The S3 driver against the real MinIO container: docker compose locally, a
// service container in CI. It goes through the entry point, so the driver map is covered too. Test
// objects live under a random prefix in the exports bucket and are removed at the end.
const minio = {
  endPoint: process.env.MINIO_TEST_ENDPOINT ?? '127.0.0.1',
  port: Number(process.env.MINIO_TEST_PORT ?? 9000),
  accessKey: process.env.MINIO_TEST_ACCESS_KEY ?? 'css_dev_only',
  secretKey: process.env.MINIO_TEST_SECRET_KEY ?? 'css_dev_only_secret',
};
const env = testEnv({
  STORAGE_DRIVER: 's3',
  MINIO_ENDPOINT: minio.endPoint,
  MINIO_PORT: String(minio.port),
  MINIO_ACCESS_KEY: minio.accessKey,
  MINIO_SECRET_KEY: minio.secretKey,
});
const storage = createStorage(env);
const admin = new S3Client({
  region: 'us-east-1',
  endpoint: `http://${minio.endPoint}:${minio.port}`,
  forcePathStyle: true,
  credentials: { accessKeyId: minio.accessKey, secretAccessKey: minio.secretKey },
});
const prefix = `u5-${randomUUID()}`;
const key = (name: string) => `${prefix}/${name}`;
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/** Yields `total` bytes in 64 KiB chunks without holding them all, like an upload stream. */
function generatedStream(total: number): { stream: Readable; digest: () => string } {
  const hash = createHash('sha256');
  let sent = 0;
  const stream = Readable.from(
    (function* () {
      while (sent < total) {
        const chunk = Buffer.alloc(Math.min(64 * 1024, total - sent), sent % 251);
        chunk.writeUInt32BE(sent, 0);
        hash.update(chunk);
        sent += chunk.length;
        yield chunk;
      }
    })(),
  );
  return { stream, digest: () => hash.digest('hex') };
}

// Locally infra/minio/bootstrap.sh creates the buckets; the CI MinIO starts empty.
beforeAll(async () => {
  for (const Bucket of BUCKETS) {
    try {
      await admin.send(new HeadBucketCommand({ Bucket }));
    } catch {
      await admin.send(new CreateBucketCommand({ Bucket }));
    }
  }
});

afterAll(async () => {
  const listed = await admin.send(new ListObjectsV2Command({ Bucket: 'exports', Prefix: prefix }));
  const objects = (listed.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
  if (objects.length)
    await admin.send(new DeleteObjectsCommand({ Bucket: 'exports', Delete: { Objects: objects } }));
  admin.destroy();
});

describe('S3 storage driver on MinIO', () => {
  it('is the driver STORAGE_DRIVER picks', () => {
    expect(storage.name).toBe('s3');
  });

  it('stores, describes, reads back and removes a small object, and reports readiness', async () => {
    const bytes = Buffer.from('a,b\n1,2\n');
    await storage.put('exports', key('report.csv'), Readable.from([bytes]), {
      contentType: 'text/csv',
      size: bytes.length,
    });
    expect(await storage.stat('exports', key('report.csv'))).toEqual({
      size: 8,
      contentType: 'text/csv',
    });
    expect((await buffer(await storage.get('exports', key('report.csv')))).equals(bytes)).toBe(
      true,
    );
    await storage.remove('exports', key('report.csv'));
    expect(await storage.stat('exports', key('report.csv'))).toBeNull();
    await expect(storage.remove('exports', key('report.csv'))).resolves.toBeUndefined();
    expect(await storage.ping()).toBe(true);
    expect(
      await createStorage({ ...env, MINIO_ACCESS_KEY: 'wrong', MINIO_SECRET_KEY: 'wrong' }).ping(),
    ).toBe(false);
  });

  it('streams a 6 MiB object in parts and gets back the same bytes', async () => {
    const size = 6 * 1024 * 1024;
    const { stream, digest } = generatedStream(size);
    await storage.put('exports', key('large.bin'), stream, {
      contentType: 'application/octet-stream',
    });
    const back = await buffer(await storage.get('exports', key('large.bin')));
    expect(back.length).toBe(size);
    expect(sha256(back)).toBe(digest());
  }, 30_000);

  it('joins the 256 KB parts of an upload into one object and drops the parts', async () => {
    const session = randomUUID();
    const parts = [Buffer.alloc(PART_SIZE, 7), Buffer.alloc(PART_SIZE, 8), Buffer.from('tail')];
    for (const [i, part] of parts.entries()) await storePart(storage, session, i + 1, part);
    const whole = Buffer.concat(parts);
    const target = {
      sessionId: session,
      count: parts.length,
      size: whole.length,
      bucket: 'exports' as const,
      headLength: 4,
      accept: () => 'application/octet-stream',
    };
    // a whole that differs from the declaration never reaches the target bucket
    expect(
      await joinParts(storage, {
        ...target,
        sha256: sha256(Buffer.from('other')),
        key: key('bad.bin'),
      })
        .then(() => 'joined')
        .catch((error: unknown) => (error as { code?: string }).code),
    ).toBe('file.checksum_mismatch');
    expect(await storage.stat('exports', key('bad.bin'))).toBeNull();
    await joinParts(storage, { ...target, sha256: sha256(whole), key: key('joined.bin') });
    expect((await buffer(await storage.get('exports', key('joined.bin')))).equals(whole)).toBe(
      true,
    );
    expect(await storage.stat('uploads', `${session}/joined`)).toBeNull();
    await dropParts(storage, session);
    expect(await storage.stat('uploads', `${session}/1`)).toBeNull();
  });

  it('throws NotFoundError for a missing key', async () => {
    await expect(storage.get('exports', key('missing.bin'))).rejects.toBeInstanceOf(NotFoundError);
  });

  it('reports a missing bucket as a fault, not as a missing file', async () => {
    const bucket = 'no-such-bucket' as Bucket;
    await expect(storage.get(bucket, key('x.bin'))).rejects.toMatchObject({ name: 'NoSuchBucket' });
    // HEAD carries no error code, so stat answers null for a missing bucket as for a missing key.
    expect(await storage.stat(bucket, key('x.bin'))).toBeNull();
  });

  it('keeps the bucket private: an unauthenticated GET of an object URL is refused', async () => {
    await storage.put('exports', key('private.txt'), Readable.from([Buffer.from('secret')]), {
      contentType: 'text/plain',
    });
    const res = await fetch(`http://${minio.endPoint}:${minio.port}/exports/${key('private.txt')}`);
    expect(res.status).toBe(403);
  });
});
