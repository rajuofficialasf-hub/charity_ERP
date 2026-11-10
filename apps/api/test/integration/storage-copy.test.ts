import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import { uuidv7 } from '@css/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { AuditWriter } from '../../src/audit/audit-writer';
import { PrismaService } from '../../src/core/prisma.service';
import { type CopyOptions, copyFiles } from '../../src/storage/copy';
import { createNasDriver } from '../../src/storage/drivers/nas';
import type { StorageDriver } from '../../src/storage';
import { testEnv } from '../support/env';
import { cloneTemplate, dropDatabase } from './support/db';

// The copy of stored files from one driver to another before the app switches to the NAS: two
// folder drivers stand in for MinIO and the NAS, so the copy goes through the driver interface only.
let drop: () => Promise<void>;
let prisma: PrismaService;
let source: StorageDriver;
let target: StorageDriver;
const audit = new AuditWriter();

const folder = () => createNasDriver(mkdtempSync(join(tmpdir(), 'css-copy-')));
const bytes = (s: string) => Readable.from([Buffer.from(s)]);
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

async function storedFile(
  key: string,
  content: string,
  options: { thumbnails?: boolean; driver?: 'nas' | 's3'; scan?: string } = {},
): Promise<string> {
  const id = uuidv7();
  await source.put('photos', key, bytes(content), { contentType: 'image/jpeg' });
  if (options.thumbnails) {
    await source.put('photos', `${key}.s.jpg`, bytes('small'), { contentType: 'image/jpeg' });
    await source.put('photos', `${key}.m.jpg`, bytes('medium'), { contentType: 'image/jpeg' });
  }
  await prisma.$executeRaw`
    INSERT INTO files (id, bucket, object_key, kind, mime, size_bytes, sha256, source, storage_driver,
                       virus_scan, thumbnail_small_key, thumbnail_medium_key)
    VALUES (${id}::uuid, 'photos', ${key}, 'profile_photo', 'image/jpeg', ${content.length},
            ${sha256(content)}, 'gallery', ${options.driver ?? 's3'}, ${options.scan ?? 'clean'},
            ${options.thumbnails ? `${key}.s.jpg` : null}, ${options.thumbnails ? `${key}.m.jpg` : null})`;
  return id;
}

const driverOf = async (id: string) =>
  (
    await prisma.$queryRaw<
      { d: string }[]
    >`SELECT storage_driver AS d FROM files WHERE id = ${id}::uuid`
  )[0]!.d;

const copy = (options: Partial<CopyOptions> = {}) =>
  copyFiles({ prisma, audit, from: source, fromName: 's3', to: target, toName: 'nas', ...options });

/** The target driver with its write replaced, to make a copy go wrong. */
const targetWith = (put: StorageDriver['put']): StorageDriver => ({ ...target, put });

const copiedEntries = () =>
  prisma.$queryRaw<{ new: unknown }[]>`
    SELECT new FROM audit_log WHERE action = 'storage.copied' ORDER BY id`;

beforeAll(async () => {
  const clone = await cloneTemplate(inject('templateDb'));
  await clone.client.end();
  drop = () => dropDatabase(clone.name);
  prisma = new PrismaService(testEnv({ DATABASE_URL: clone.url }));
});

afterAll(async () => {
  await prisma.$disconnect();
  await drop();
});

beforeEach(async () => {
  source = folder();
  target = folder();
  await prisma.$executeRaw`DELETE FROM files`;
});

describe('copying stored files to another driver', () => {
  it('copies each object with its thumbnails, moves the row and keeps the source', async () => {
    const id = await storedFile('p/1.jpg', 'photo bytes', { thumbnails: true });
    const report = await copy();
    expect(report).toMatchObject({ copied: 1, remaining: 0, missing: [], failed: [] });
    expect(await driverOf(id)).toBe('nas');
    expect(await text(await target.get('photos', 'p/1.jpg'))).toBe('photo bytes');
    expect(await text(await target.get('photos', 'p/1.jpg.s.jpg'))).toBe('small');
    expect(await text(await target.get('photos', 'p/1.jpg.m.jpg'))).toBe('medium');
    expect(await target.stat('photos', 'p/1.jpg')).toMatchObject({ contentType: 'image/jpeg' });
    expect(await source.stat('photos', 'p/1.jpg')).not.toBeNull();
  });

  it('copies nothing on a second run', async () => {
    await storedFile('p/1.jpg', 'photo bytes');
    await copy();
    expect(await copy()).toMatchObject({ copied: 0, remaining: 0, missing: [], failed: [] });
  });

  it('leaves files already on the target driver alone', async () => {
    const id = await storedFile('p/2.jpg', 'photo bytes', { driver: 'nas' });
    expect(await copy()).toMatchObject({ copied: 0 });
    expect(await target.stat('photos', 'p/2.jpg')).toBeNull();
    expect(await driverOf(id)).toBe('nas');
  });

  it('counts the rows and copies nothing in a dry run', async () => {
    const id = await storedFile('p/1.jpg', 'photo bytes');
    expect(await copy({ dryRun: true })).toMatchObject({ copied: 0, pending: 1, remaining: 1 });
    expect(await target.stat('photos', 'p/1.jpg')).toBeNull();
    expect(await driverOf(id)).toBe('s3');
  });

  it('reports a row whose object is missing and leaves it on the source driver', async () => {
    const id = await storedFile('p/1.jpg', 'photo bytes');
    await source.remove('photos', 'p/1.jpg');
    expect(await copy()).toMatchObject({ copied: 0, missing: [id], remaining: 1 });
    expect(await driverOf(id)).toBe('s3');
  });

  it('leaves the row on the source when the copy does not arrive whole', async () => {
    const id = await storedFile('p/1.jpg', 'photo bytes');
    const short = targetWith(async (bucket, key, body, meta) => {
      const all = await text(body);
      await target.put(bucket, key, bytes(all.slice(0, 3)), meta);
    });
    expect(await copy({ to: short })).toMatchObject({ copied: 0, failed: [id] });
    expect(await driverOf(id)).toBe('s3');
  });

  it('leaves the row on the source when the copy has the same length but other bytes', async () => {
    const id = await storedFile('p/1.jpg', 'photo bytes');
    const flipped = targetWith(async (bucket, key, body, meta) => {
      const all = await text(body);
      await target.put(bucket, key, bytes(all.toUpperCase()), meta);
    });
    expect(await copy({ to: flipped })).toMatchObject({ copied: 0, failed: [id] });
    expect(await driverOf(id)).toBe('s3');
  });

  it('leaves the row on the source when the target refuses the write', async () => {
    const id = await storedFile('p/1.jpg', 'photo bytes');
    const refusing = targetWith(async () => {
      throw new Error('share not writable');
    });
    expect(await copy({ to: refusing })).toMatchObject({ copied: 0, failed: [id] });
    expect(await driverOf(id)).toBe('s3');
  });

  it('leaves the row on the source when a thumbnail does not copy', async () => {
    const id = await storedFile('p/1.jpg', 'photo bytes', { thumbnails: true });
    const noThumbnails = targetWith(async (bucket, key, body, meta) => {
      if (key.endsWith('.s.jpg')) throw new Error('disk full');
      await target.put(bucket, key, body, meta);
    });
    expect(await copy({ to: noThumbnails })).toMatchObject({ copied: 0, failed: [id] });
    expect(await driverOf(id)).toBe('s3');
  });

  it('moves a photo whose thumbnail the source never had, and says so', async () => {
    const id = await storedFile('p/1.jpg', 'photo bytes', { thumbnails: true });
    await source.remove('photos', 'p/1.jpg.s.jpg');
    expect(await copy()).toMatchObject({ copied: 1, thumbnailsMissing: [id] });
    expect(await driverOf(id)).toBe('nas');
  });

  it('waits with an upload still being processed, whose thumbnails may come later', async () => {
    const id = await storedFile('p/1.jpg', 'photo bytes', { scan: 'pending' });
    expect(await copy()).toMatchObject({ copied: 0, unprocessed: [id], remaining: 1 });
    expect(await target.stat('photos', 'p/1.jpg')).toBeNull();
    expect(await driverOf(id)).toBe('s3');
  });

  it('reads the rows in batches, with one audit entry for each', async () => {
    await storedFile('p/1.jpg', 'one');
    await storedFile('p/2.jpg', 'two');
    await storedFile('p/3.jpg', 'three');
    // the audit log is append-only, so only the entries this run adds are counted
    const before = (await copiedEntries()).length;
    expect(await copy({ batchSize: 2 })).toMatchObject({ copied: 3, remaining: 0 });
    const added = (await copiedEntries()).slice(before);
    expect(added.map((e) => e.new)).toEqual([
      { from: 's3', to: 'nas', copied: 2, rows: 2 },
      { from: 's3', to: 'nas', copied: 1, rows: 1 },
    ]);
  });

  it('stops after the limit and leaves the rest for the next run', async () => {
    await storedFile('p/1.jpg', 'one');
    await storedFile('p/2.jpg', 'two');
    expect(await copy({ limit: 1 })).toMatchObject({ copied: 1, remaining: 1 });
    expect(await copy()).toMatchObject({ copied: 1, remaining: 0 });
  });

  it('counts a row written by an older version without the driver as one of MinIO', async () => {
    const id = uuidv7();
    await prisma.$executeRaw`
      INSERT INTO files (id, bucket, object_key, kind, mime, size_bytes, sha256, source)
      VALUES (${id}::uuid, 'photos', 'p/x.jpg', 'profile_photo', 'image/jpeg', 1,
              ${'b'.repeat(64)}, 'gallery')`;
    expect(await driverOf(id)).toBe('s3');
  });

  it('refuses a copy onto the same driver', async () => {
    await expect(copy({ to: source, toName: 's3' })).rejects.toThrow(/different drivers/);
  });
});
