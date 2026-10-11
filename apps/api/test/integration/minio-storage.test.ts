import { randomUUID } from 'node:crypto';
import { Client } from 'minio';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MinioStorage } from '../../src/storage/minio-storage';

// MinioStorage against the real MinIO container (ADR-005, O-58): docker compose locally, a service
// container in CI. Test objects live under a random prefix in the exports bucket and are removed.
const options = {
  endPoint: process.env.MINIO_TEST_ENDPOINT ?? '127.0.0.1',
  port: Number(process.env.MINIO_TEST_PORT ?? 9000),
  useSSL: false,
  accessKey: process.env.MINIO_TEST_ACCESS_KEY ?? 'css_dev_only',
  secretKey: process.env.MINIO_TEST_SECRET_KEY ?? 'css_dev_only_secret',
};
const admin = new Client(options);
const prefix = `t16-${randomUUID()}`;
const storage = new MinioStorage({ ...options, buckets: ['exports'] });

beforeAll(async () => {
  if (!(await admin.bucketExists('exports'))) await admin.makeBucket('exports');
});

afterAll(async () => {
  const keys: string[] = [];
  for await (const item of admin.listObjectsV2('exports', prefix, true))
    if (item.name) keys.push(item.name);
  if (keys.length) await admin.removeObjects('exports', keys);
});

describe('MinioStorage (ADR-005)', () => {
  it('stores and describes an object and reports readiness', async () => {
    await storage.put('exports', `${prefix}/report.csv`, Buffer.from('a,b\n1,2\n'), {
      contentType: 'text/csv',
    });
    expect(await storage.stat('exports', `${prefix}/report.csv`)).toEqual({
      size: 8,
      contentType: 'text/csv',
    });
    expect(await storage.stat('exports', `${prefix}/missing.csv`)).toBeNull();
    expect(await storage.ping()).toBe(true);
    expect(await new MinioStorage({ ...options, buckets: ['no-such-bucket'] }).ping()).toBe(false);
  });

  it('serves a presigned GET until it expires', async () => {
    await storage.put('exports', `${prefix}/signed.txt`, Buffer.from('hello'), {
      contentType: 'text/plain',
    });
    const { url, expiresAt } = await storage.presignGet('exports', `${prefix}/signed.txt`, 2);
    expect(expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(2000);
    const ok = await fetch(url);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('hello');
    await new Promise((r) => setTimeout(r, 3500));
    expect((await fetch(url)).status).toBe(403);
  });

  it('accepts an upload through a presigned PUT and refuses lifetimes above 15 minutes', async () => {
    const { url } = await storage.presignPut('exports', `${prefix}/upload.bin`, 60);
    expect((await fetch(url, { method: 'PUT', body: 'bytes' })).status).toBe(200);
    expect((await storage.stat('exports', `${prefix}/upload.bin`))?.size).toBe(5);
    await expect(storage.presignGet('exports', `${prefix}/upload.bin`, 3600)).rejects.toThrow(
      /NFR-28/,
    );
  });
});
